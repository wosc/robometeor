function getUsername(user) {
    return user.emails[0].address.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ').replace(/ +/g, ' ');
};


Meteor.methods({
  createGame: async function(postAttributes) {
    var user = await Meteor.userAsync();

    // ensure the user is logged in
    if (!user)
      throw new Meteor.Error(401, "You need to login to create a game");
    if (!postAttributes.name || postAttributes.name === '') {
      throw new Meteor.Error(303, 'Name cannot be empty.');
    }
    var author = getUsername(user);
    // pick out the whitelisted keys

    var game = _.extend(_.pick(postAttributes, 'name'), {
      userId: user._id,
      author: author,
      submitted: new Date().getTime(),
      started: false,
      gamePhase: GameState.PHASE.IDLE,
      playPhase: GameState.PLAY_PHASE.IDLE,
      respawnPhase: GameState.RESPAWN_PHASE.CHOOSE_POSITION,
      playPhaseCount: 0,
      boardId: 0,
      waitingForRespawn: [],
      announce: false,
      cardsToPlay: []
    });
    var board_id = BoardBox.getBoardId(game.name);
    if (board_id >= 0)
      game.boardId=board_id;

    game.min_player = BoardBox.getBoard(board_id).min_player;
    game.max_player = BoardBox.getBoard(board_id).max_player;
    var gameId = await Games.insertAsync(game);

    await Chat.insertAsync({
      gameId: gameId,
      message: 'Game created',
      submitted: new Date().getTime()
    });
    await Meteor.callAsync('joinGame', gameId, GameLogic.ON);

    return gameId;
  },
  joinGame: async function(gameId, powerState) {
    var user = await Meteor.userAsync();

    if (!user)
      throw new Meteor.Error(401, "You need to login to join a game");
    var game = await Games.findOneAsync(gameId);
    if (!game)
      throw new Meteor.Error(401, "Game id not found!");

    var author = getUsername(user);
    var playerId;
    if (!await Players.findOneAsync({gameId: gameId, userId: user._id})) {
      playerId = await Players.insertAsync({
        gameId: gameId,
        userId: user._id,
        name: author,
        lives: 3,
        damage: 0,
        visited_checkpoints: 0,
        needsRespawn: false,
        powerState: powerState,
        optionalInstantPowerDown: false,
        position: {x: -1, y: -1},
        chosenCardsCnt: 0,
        optionCards: {},
        cards: Array.apply(null, new Array(GameLogic.CARD_SLOTS)).map(function (x, i) { return CardLogic.EMPTY; })
      });
      await Cards.insertAsync({
        gameId: gameId,
        playerId: playerId,
        userId: user._id,
        chosenCards: Array.apply(null, new Array(GameLogic.CARD_SLOTS)).map(function (x, i) { return CardLogic.EMPTY; }),
        handCards: []
      });

      if (powerState === GameLogic.OFF) {
          // XXX copy&paste from startGame(), but only for the joined player
          var players = await Players.find({gameId: gameId}).fetchAsync();
          for (var i in players) {
              var player = players[i];
              if (player._id != playerId) continue;
              var start = game.board().startpoints[i];
              player.position.x = start.x;
              player.position.y = start.y;
              player.direction = start.direction;
              player.robotId = i;
              player.start = start;
              await Players.updateAsync(player._id, player);
          }
      }
    }
    game.chat(author + ' joined the game', gameId);
    return true;
  },

  leaveGame: async function(gameId, user) {
    if (user === undefined) {
        user = await Meteor.userAsync();
    } else {
        user = await Meteor.users.findOneAsync(user);
    }
    if (!user)
      throw new Meteor.Error(401, "You need to login to leave a game");
    var game = await Games.findOneAsync(gameId);
    if (!game)
      throw new Meteor.Error(401, "Game id not found!");

    var author = getUsername(user);
    console.log('User ' + author + ' leaving game ' + gameId);


    await Players.removeAsync({gameId: game._id, userId: user._id});
    if (game.started) {
      var players = await Players.find({gameId: game._id}).fetchAsync();
      if (players.length === 1) {
        await Games.updateAsync(game._id, {$set: {gamePhase: GameState.PHASE.ENDED, winner: players[0].name, stopped: new Date().getTime()}});
      } else if (players.length === 0) {
        console.log("Nobody left in the game.");
        await Games.updateAsync(game._id, {$set: {gamePhase: GameState.PHASE.ENDED, winner: "Nobody", stopped: new Date().getTime()}});
      }
    }
    game.chat(author + ' left the game');
  },

  selectBoard: async function(boardName, gameId) {
    var user = await Meteor.userAsync();
    var game = await Games.findOneAsync(gameId);
    if (!game)
      throw new Meteor.Error(401, "Game id not found!");

    var board_id = BoardBox.getBoardId(boardName);
    if (board_id < 0)
      throw new Meteor.Error(401, "Board " + boardName + " not found!" );

    var min = BoardBox.getBoard(board_id).min_player;
    var max = BoardBox.getBoard(board_id).max_player;
    await Games.updateAsync(game._id, {$set: {boardId: board_id, min_player: min, max_player: max}});

    var author = getUsername(user);
    game.chat(author + ' selected board ' + boardName, 'for game' + gameId);
  },

  startGame: async function(gameId) {
    var players = await Players.find({gameId: gameId}).fetchAsync();
    var game = await Games.findOneAsync(gameId);
    if (players.length > game.max_player) {
      throw new Meteor.Error(401, "Too many players.");
    }

    for (var i in players) {
      var start = game.board().startpoints[i];
      var player = players[i];
      player.position.x = start.x;
      player.position.y = start.y;
      player.direction = start.direction;
      player.robotId = i;
      player.start = start;
      await Players.updateAsync(player._id, player);
    }
    game.chat('Game started');
    await GameState.nextGamePhase(gameId);
  },

  playCards: async function(gameId) {
    var player = await Players.findOneAsync({gameId: gameId, userId: Meteor.userId()});
    if (!player)
      throw new Meteor.Error(401, 'Game/Player not found! ' + attributes.gameId);

    if (!player.submitted) {
      await CardLogic.submitCards(player);
      player.chat('submitted cards');
    } else {
      console.log("Player already submitted his cards.");
    }
  },

  selectRespawnPosition: async function(gameId, x, y) {
    var game = await Games.findOneAsync(gameId);
    var player = await Players.findOneAsync({gameId: gameId, userId: Meteor.userId()});
    await GameLogic.respawnPlayerAtPos(player, Number(x), Number(y));
    player.chat('chose position',  '(' +x+ ',' +y+ ')');
    await game.nextRespawnPhase(GameState.RESPAWN_PHASE.CHOOSE_DIRECTION);
  },
  selectRespawnDirection: async function(gameId, direction) {
    var game = await Games.findOneAsync(gameId);
    var player = await Players.findOneAsync({gameId: gameId, userId: Meteor.userId()});
    await GameLogic.respawnPlayerWithDir(player, Number(direction));
    player.chat('reentered the race', direction);
    await GameState.nextGamePhase(game);
  },
  togglePowerDown: async function(gameId) {
     var player = await Players.findOneAsync({gameId: gameId, userId: Meteor.userId()});
     return await player.togglePowerDown();
  },
  addMessage: async function(postAttributes) {
    var user = await Meteor.userAsync();

    // ensure the user is logged in
    if (!user)
      throw new Meteor.Error(401, "You need to login to post messages");

    var author = getUsername(user);
    // pick out the whitelisted keys
    var message = _.extend(_.pick(postAttributes, 'message', 'gameId'), {
      userId: user._id,
      author: author,
      submitted: new Date().getTime()
    });
    await Chat.insertAsync(message);
  },
  setAudio: async function(value) {
    var user = Meteor.userId();
    if (!user)
      throw new Meteor.Error(401, "You need to login to change audio settings");
    await Meteor.users.updateAsync(user, {$set: {'audio': value}});
  },
  selectCard: async function(gameId, card, index) {
    var player = await Players.findOneAsync({gameId: gameId, userId: Meteor.userId()});
    if (index < player.notLockedCnt())
      await player.chooseCard(card,index);
    return await player.getChosenCards();
  },
  deselectCard: async function(gameId, index) {
    var player = await Players.findOneAsync({gameId: gameId, userId: Meteor.userId()});
    if (index < player.notLockedCnt())
      await player.unchooseCard(index);
    return await player.getChosenCards();
  },
  deselectAllCards: async function(gameId) {
    var player = await Players.findOneAsync({gameId: gameId, userId: Meteor.userId()});
    for (i=0;i<player.notLockedCnt();i++)
      await player.unchooseCard(i);
  },
});
