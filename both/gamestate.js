GameState = {
  PHASE: {
    IDLE: "waiting",
    DEAL: "deal",
    PROGRAM: "program",
    PLAY: "play",
    RESPAWN: "respawn",
    ENDED: "game ended"
  },
  PLAY_PHASE: {
    IDLE: "waiting",
    REVEAL_CARDS: "reveal",
    MOVE_BOTS: "move bots",
    MOVE_BOARD: "move board",
    LASERS: "lasers",
    LASER_OPTIONS: "laser options",
    CHECKPOINTS: "checkpoints",
    REPAIRS: "repairs"
  },
  RESPAWN_PHASE: {
    CHOOSE_POSITION: "choose position",
    CHOOSE_DIRECTION: "choose direction"
  }
};

(function (scope) {
  var _NEXT_PHASE_DELAY = 250;
  var _ANNOUNCE_NEXT_PHASE = 500;
  var _ANNOUNCE_CARD_TIME = 500;
  var _EXECUTE_CARD_TIME = 500;

  // game phases:

  scope.nextGamePhase = async function(gameId) {
    var game = await Games.findOneAsync(gameId);
    Meteor.setTimeout(async function() {
      switch (game.gamePhase) {
        case GameState.PHASE.IDLE:
          await Games.updateAsync(game._id, {$set: {started: true, gamePhase: GameState.PHASE.DEAL}});
          await playDealPhase(game);
          break;
        case GameState.PHASE.DEAL:
          await game.stopAnnounce();
          await playDealPhase(game);
          break;
        case GameState.PHASE.PROGRAM:
          await game.startAnnounce();
          await playProgramCardsSubmitted(game);
          break;
        case GameState.PHASE.PLAY:
          if (game.waitingForRespawn.length > 0) {
            await Games.updateAsync(game._id, {$set: {
              watingForRespawn: game.waitingForRespawn.reverse(),
              gamePhase: GameState.PHASE.RESPAWN
            }});
            await game.nextGamePhase();
          } else {
            await game.nextGamePhase(GameState.PHASE.DEAL);
          }
          break;
        case GameState.PHASE.RESPAWN:
          await playNextRespawn(game);
          break;
      }
    }, _NEXT_PHASE_DELAY);
  };


  async function playDealPhase(game) {
    var players = await game.players();
    for (var player of players) {
      player.playedCardsCnt = 0;
      player.submitted = false;
      if (player.hasOptionCard('circuit_breaker') && player.damage >= 3)
        player.powerState = GameLogic.DOWN;

      if (player.powerState === GameLogic.OFF) {
        // player was powered down last turn
        // -> can choose to stay powered down this turn
        player.optionalInstantPowerDown = true;
      } else if (player.powerState == GameLogic.DOWN) {
        // player announced power down last turn
        player.powerState = GameLogic.OFF;
        if (!player.optionalInstantPowerDown) {
          player.submitted = true;
          player.damage = 0;
        }
      }
      await Players.updateAsync(player._id, player);
    }

    players = await game.players();
    for (player of players) {
        await CardLogic.discardCards(game,player);
    }
    players = await game.players();
    for (player of players) {
        var dealCards = player.lives > 0;
        if (player.powerState == GameLogic.OFF && !player.optionalInstantPowerDown)
            dealCards = false;
        if (dealCards)
          await CardLogic.dealCards(game, player);
  }

    await game.setGamePhase(GameState.PHASE.PROGRAM);
    var notPoweredDownCnt = await Players.find({gameId: game._id, submitted: false}).countAsync();
    if (notPoweredDownCnt === 0)
      await game.nextGamePhase();
  }

  async function playProgramCardsSubmitted(game) {
    await Games.updateAsync(game._id, {$set: {
      gamePhase: GameState.PHASE.PLAY,
      playPhase: GameState.PLAY_PHASE.IDLE,
      playPhaseCount: 1
    }});
    await game.nextPlayPhase();
  }

  async function playNextRespawn(game) {
    if (game.waitingForRespawn.length > 0) {
      var player = await Players.findOneAsync(game.waitingForRespawn.pop());
      var nextPhase;
      var x = player.start.x;
      var y = player.start.y;
      if (game.isPlayerOnTile(x,y)) {
        nextPhase = GameState.RESPAWN_PHASE.CHOOSE_POSITION;
      } else {
        await GameLogic.respawnPlayerAtPos(player,x,y);
        nextPhase = GameState.RESPAWN_PHASE.CHOOSE_DIRECTION;
      }
      await Games.updateAsync(game._id, {$set: {
        respawnPhase: nextPhase,
        respawnPlayerId: player._id,
        waitingForRespawn: game.waitingForRespawn
      }});
      await game.nextRespawnPhase();
    } else {
      await Games.updateAsync(game._id, {$set: {
        gamePhase: GameState.PHASE.DEAL,
        respawnUserId: null,
        respawnPlayerId: null,
        selectOptions: null
      }});
      await game.nextGamePhase();
    }
  }

  // play phases:

  scope.nextPlayPhase = async function(gameId) {
    var game = await Games.findOneAsync(gameId);
    Meteor.setTimeout(async function() {
      switch (game.playPhase) {
        case GameState.PLAY_PHASE.IDLE:
          await game.nextPlayPhase(GameState.PLAY_PHASE.REVEAL_CARDS);
          break;
        case GameState.PLAY_PHASE.REVEAL_CARDS:
          await playRevealCards(game);
          break;
        case GameState.PLAY_PHASE.MOVE_BOTS:
          await playMoveBots(game);
          break;
        case GameState.PLAY_PHASE.MOVE_BOARD:
          await announce(game, playMoveBoard);
          break;
        case GameState.PLAY_PHASE.LASERS:
          await announce(game, playLasers);
          break;
        case GameState.PLAY_PHASE.CHECKPOINTS:
          await playCheckpoints(game);
          //announce(game, playCheckpoints);
          break;
        case GameState.PLAY_PHASE.REPAIRS:
          await announce(game, playRepairs);
          break;
      }
    }, _NEXT_PHASE_DELAY);
  };

  function announce(game, callback) {
    Meteor.setTimeout(async function() {
      await callback(game);
    }, _ANNOUNCE_NEXT_PHASE);
  }

  async function playRevealCards(game) {
    await Games.updateAsync(game._id, {$set: {playPhase: GameState.PLAY_PHASE.MOVE_BOTS}});

    var players = await game.livingPlayers();
    // play 1 card per player
    for (var player of players) {
      if (player.isActive()) {
        var cards = player.cards;
        var cardIndex = player.playedCardsCnt;
        var chosen = await player.getChosenCards();
        console.log("reveal", cardIndex, chosen[cardIndex]);
        cards[cardIndex] = chosen[cardIndex];
        await Players.updateAsync(player._id, {$set: {cards: cards}});
      }
    }
    await GameState.nextPlayPhase(game._id);
  }

  async function playMoveBots(game) {
    var players = await game.activePlayers();
    // play 1 card per player
    game.cardsToPlay = [];

    for (var player of players) {
      var chosen = await player.getChosenCards();
      var card = {cardId: chosen[player.playedCardsCnt]};
      if (card.cardId >= 0) {
        await Players.updateAsync(player._id, {$inc: {playedCardsCnt: 1}});
        card.playerId = player._id;
        game.cardsToPlay.push(card);
      }
    }
    var sortBy = (key) => { return (a, b) => (a[key] > b[key]) ? 1 : ((b[key] > a[key]) ? -1 : 0); };
    // cardId has same order as card priority
    game.cardsToPlay.sort(sortBy('cardId')).reverse();
    await Games.updateAsync(game._id, {$set: {
      cardsToPlay: game.cardsToPlay
    }});
    if (game.cardsToPlay.length > 0)
      await playMoveBot(game);
    else
      await game.nextPlayPhase(GameState.PLAY_PHASE.MOVE_BOARD);
  }

  async function playMoveBot(game) {
    var card = game.cardsToPlay.shift();
    await Games.updateAsync(game._id, {$set: {
          announceCard: card,
          cardsToPlay: game.cardsToPlay
        }});
    var player = await Players.findOneAsync(card.playerId);
    Meteor.setTimeout(async function() {
      await Games.updateAsync(game._id, {$set: {
          announceCard: null,
        }});
      await GameLogic.playCard(player, card.cardId);
      if (game.cardsToPlay.length > 0) {
        Meteor.setTimeout(async function() {
          await playMoveBot(game);
        }, _EXECUTE_CARD_TIME);
      } else
        Meteor.setTimeout(async function() {
          await Games.updateAsync(game._id, {$set: {
              announceCard: null,
            }});
          await game.nextPlayPhase(GameState.PLAY_PHASE.MOVE_BOARD);
        }, _EXECUTE_CARD_TIME);
    }, _ANNOUNCE_CARD_TIME);
  }

  async function playMoveBoard(game) {
    var players = await game.playersOnBoard();
    await GameLogic.executeRollers(players);
    await GameLogic.executeExpressRollers(players);
    await GameLogic.executeGears(players);
    await GameLogic.executePushers(players);
    await game.nextPlayPhase(GameState.PLAY_PHASE.LASERS);
  }

  async function playLasers(game) {
    var players = await game.playersOnBoard();
    await game.setPlayPhase(GameState.PLAY_PHASE.CHECKPOINTS);
    await GameLogic.executeLasers(players);
    await game.nextPlayPhase();
  }

  async function playCheckpoints(game) {
    if (!await checkIfWeHaveAWinner(game)) {
      if (game.playPhaseCount < 5) {
        await Games.updateAsync(game._id,
          { $set: {playPhase: GameState.PLAY_PHASE.REVEAL_CARDS}, $inc: {playPhaseCount: 1} }
        );
        await game.nextPlayPhase();
      } else {
        await game.nextPlayPhase(GameState.PLAY_PHASE.REPAIRS);
      }
    }
  }

  async function playRepairs(game) {
    var players = await game.playersOnBoard();
    await GameLogic.executeRepairs(players);
    await game.nextGamePhase();
  }

  async function checkCheckpoints(player,game) {
    var tile = player.tile();

    if (tile.checkpoint || tile.repair) {
      player.updateStartPosition();
      if (tile.checkpoint && tile.checkpoint === player.visited_checkpoints+1) {
        player.visited_checkpoints++;
      }
      await Players.updateAsync(player._id, player);
    }
  }

  async function checkIfWeHaveAWinner(game) {
    var players = await Players.find({gameId: game._id}).fetchAsync();
    var board = game.board();
    var ended = false;
    var lastManStanding = false;
    var livingPlayers = 0;
    var messages = [];

    for (var player of players) {
      await checkCheckpoints(player,game);
      if (player.lives > 0) {
        livingPlayers++;
        lastManStanding = player;
      } else {
        messages.push('Player ' + player.name + ' ran out of lives');
      }

      if (player.visited_checkpoints === board.checkpoints.length) {
        await Games.updateAsync(game._id, {$set: {gamePhase: GameState.PHASE.ENDED, winner: player.name, stopped: new Date().getTime()}});
        messages.push("Player " + player.name + " won the game!!");
        ended = true;
        break;
      }
    }

    if (livingPlayers === 0) {
      messages.push("All robots are dead");
      await Games.updateAsync(game._id, {$set: {gamePhase: GameState.PHASE.ENDED, winner: "Nobody", stopped: new Date().getTime()}});
      ended = true;
    } else if (livingPlayers === 1 && players.length > 1) {
      messages.push("Player " + lastManStanding.name + " won the game!!");
      await Games.updateAsync(game._id, {$set: {gamePhase: GameState.PHASE.ENDED, winner: lastManStanding.name, stopped: new Date().getTime()}});
      ended = true;
    }
    for (var msg of messages) {
      await game.chat(msg);
    }
    return ended;
  }

  // respawn phases
  scope.nextRespawnPhase = async function(gameId) {
    var game = await Games.findOneAsync(gameId);
    Meteor.setTimeout(async function() {
      switch (game.respawnPhase) {
        case GameState.RESPAWN_PHASE.CHOOSE_POSITION:
          await prepareChooseRespawnPosition(game);
          break;
        case GameState.RESPAWN_PHASE.CHOOSE_DIRECTION:
          await prepareChooseRespawnDirection(game);
          break;
      }
    }, _NEXT_PHASE_DELAY);
  };


  async function prepareChooseRespawnPosition(game) {
    var player = await Players.findOneAsync(game.respawnPlayerId);
    var selectOptions = [];
    var x = player.start.x;
    var y = player.start.y;
    for (var dx = -1; dx<=1; ++dx) {
      for (var dy = -1; dy<=1; dy++)  {
        if (!game.isPlayerOnTile(x+dx,y+dy) && game.board().getTile(x+dx,y+dy).type !== Tile.VOID) {
          selectOptions.push({x:x+dx, y:y+dy});
        }
      }
    }
    await Games.updateAsync(game._id, {$set: {
      selectOptions: selectOptions,
      respawnUserId: player.userId
    }});
  }

  async function prepareChooseRespawnDirection(game) {
    var player = await Players.findOneAsync(game.respawnPlayerId);
    var selectOptions = [];
    var x = player.position.x;
    var y = player.position.y;
    var step;
    if (player.start.x != x && player.start.y != y) {
      for (var i=0; i<4; ++i) {
        step = Board.to_step(i);
        if (noPlayerOnNextThree(x,y,step.x,step.y, game))
          selectOptions.push({x: x+step.x, y:y+step+y, dir: i});
      }
    } else {
      for (var j=0; j<4; ++j) {
        step = Board.to_step(j);
        selectOptions.push({
          x: x+step.x,
          y: y+step.y,
          dir: j
        });
      }
    }
    await Games.updateAsync(game._id, {$set: {
      selectOptions: selectOptions,
      respawnUserId: player.userId
    }});
  }


  function noPlayerOnNextThree(x,y,dx,dy, game) {
    return  !game.isPlayerOnTile(x+dx,y+dy) && !game.isPlayerOnTile(x+2*dx,y+2*dy) && !game.isPlayerOnTile(x+3*dx,y+3*dy);
  }
})(GameState);
