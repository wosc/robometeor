GameLogic = {
  UP: 0,
  RIGHT: 1,
  DOWN: 2,
  LEFT: 3,
  OFF: 4,
  ON: 5,
  CARD_SLOTS: 5
};

(function (scope) {
  _CARD_PLAY_DELAY = 1000;

  scope.playCard = async function(player, card) {
    if (!player.needsRespawn)
      console.log("trying to play next card for player " + player.name);

      if (card != CardLogic.EMPTY) {
        var game = await player.game();
        var cardType = CardLogic.cardType(card, await game.playerCnt());
        console.log('playing card ' + cardType.name + ' for player ' + player.name);

        player.rotate(cardType.direction);

        if (cardType.position === 0)
          await checkRespawnsAndUpdateDb(player);
        else {
          step = Math.min(cardType.position, 1);
          for (j=0;j < Math.abs(cardType.position);j++) {
            timeout = j+1 < Math.abs(cardType.position) ? 0 : _CARD_PLAY_DELAY;
            // don't delay if there is another step to execute
            var players = await Players.find({gameId: player.gameId}).fetchAsync();
            await executeStep(players, player, step);
            if (player.needsRespawn)
              break; // player respawned, don't continue playing out this card.
          }
        }
      } else
        console.log("card is not playable " + card + " player " + player.name);
  };

  scope.executeRollers = async function(players) {
    var roller_moves = [];
    for (var player of players) {
      //check if is on roller
      var tile = await player.tile();
      var moving = (tile.type === Tile.ROLLER);
      if (!player.needsRespawn) {
        roller_moves.push(rollerMove(player, tile, moving));
      }
    }
    await tryToMovePlayersOnRollers(roller_moves);
  };

  // move players 2nd step in roller direction; 1st step is done by executeRollers,
  scope.executeExpressRollers = async function(players) {
    var roller_moves = [];
    for (var player of players) {
      //check if is on roller
      var tile = await player.tile();
      var moving  = (tile.type === Tile.ROLLER && tile.speed === 2);
      if (!player.needsRespawn) {
        roller_moves.push(rollerMove(player, tile, moving));
      }
    }
    await tryToMovePlayersOnRollers(roller_moves);
  };

  scope.executeGears = async function(players) {
    for (var player of players) {
      var tile = await player.tile();
      if (tile.type === Tile.GEAR) {
        player.rotate(tile.rotate);
        await Players.updateAsync(player._id, player);
      }
    }
  };

  scope.executePushers = async function(players) {
    for (var player of players) {
      var tile = await player.tile();
      var game = await player.game();
      if (tile.type === Tile.PUSHER &&  game.playPhaseCount % 2 === tile.pusher_type ) {
        await tryToMovePlayer(players, player, tile.move);
      }
    }
  };

  scope.executeLasers = async function(players) {
    var victims = [];
    for (var player of players) {
      var tile = await player.tile();
      if (tile.damage > 0) {
        await player.addDamage(tile.damage);
        await player.chat('was hit by a laser, total damage: '+ player.damage);
        await checkRespawnsAndUpdateDb(player);
      }
      if (!player.isPoweredDown() && !player.needsRespawn) {
        await scope.shootRobotLaser(players, player, victims);
        if (player.hasOptionCard('rear-firing_laser')) {
          player.rotate(2);
          await scope.shootRobotLaser(players, player, victims);
          player.rotate(2);
        }
        var game = await player.game();
        if (player.hasOptionCard('mini_howitzer') ||
            player.hasOptionCard('fire_control')  ||
            player.hasOptionCard('radio_control') ||
            (player.hasOptionCard('scrambler') && game.playPhaseCount < 5) ||
            player.hasOptionCard('tractor_beam')  ||
            player.hasOptionCard('pressor_beam') ) {
          //todo: there is no game state laser options yet..?
          //game.setPlayPhase(GameState.PLAY_PHASE.LASER_OPTIONS);
        }
      }
    }
    for (var victim of victims) {
      victim.addDamage(1);
      await checkRespawnsAndUpdateDb(victim);
    }
  };

  scope.executeRepairs = async function(players) {
    for (var player of players) {
      var tile = await player.tile();
      if (tile.repair) {
        if (player.damage > 0)
          player.damage--;
        if (tile.option)
          await player.drawOptionCard();
        await Players.updateAsync(player._id, player);
      }
    }
  };

  scope.shootRobotLaser = async function(players, player, victims) {
    var step = {x:0, y:0};
    var board = await player.board();
    switch (player.direction) {
      case GameLogic.UP:
        step.y = -1;
        break;
      case GameLogic.RIGHT:
        step.x = 1;
        break;
      case GameLogic.DOWN:
        step.y = 1;
        break;
      case GameLogic.LEFT:
        step.x = -1;
        break;
    }
    var x = player.position.x;
    var y = player.position.y;
    var shotDistance = 0;
    var highPower = player.hasOptionCard('high-power_laser');
    while (board.onBoard(x+step.x,y+step.y) && (board.canMove(x, y, step) || highPower) ) {
      if (highPower && !board.canMove(x,y,step))
        highPower = false;
      x += step.x;
      y += step.y;
      shotDistance++;
      var victim = isPlayerOnTile(players,x,y);
      if (victim) {
        debug_info = 'Shot: (' + player.position.x +','+player.position.y+') -> ('+x+','+y+')';
        victim.chat('was shot by '+ player.name +', Total damage: '+ (victim.damage+1), debug_info);
        await Players.updateAsync(player._id,{$set: {shotDistance:shotDistance}});
        victims.push(victim);
        if (player.hasOptionCard('double-barreled_laser'))
          victims.push(victim);
        if (!highPower)
          return victims;
        highPower = false;
      }
    }
    await Players.updateAsync(player._id,{$set: {shotDistance:shotDistance}});
  };

  async function executeStep(players, player, direction) {   // direction = 1 for step forward, -1 for step backwards
    var step = { x: 0, y: 0 };
    switch (player.direction) {
      case GameLogic.UP:
        step.y = -1 * direction;
        break;
      case GameLogic.RIGHT:
        step.x = direction;
        break;
      case GameLogic.DOWN:
        step.y = direction;
        break;
      case GameLogic.LEFT:
        step.x = -1 * direction;
        break;
    }
    await tryToMovePlayer(players, player, step);
  }

  async function tryToMovePlayer(players, p, step) {
    var board = await p.board();
    var makeMove = true;
    if (step.x !== 0 || step.y !== 0) {
      console.log("trying to move player "+p.name+" to "+ (p.position.x+step.x)+","+(p.position.y+step.y));

      if (board.canMove(p.position.x, p.position.y, step)) {
        var pushedPlayer = isPlayerOnTile(players, p.position.x + step.x, p.position.y + step.y);
        if (pushedPlayer !== null) {
          console.log("trying to push player "+pushedPlayer.name);
          if (p.hasOptionCard('ramming_gear'))
            await pushedPlayer.addDamage(1);
          makeMove = await tryToMovePlayer(players, pushedPlayer, step);
        }
        if(makeMove) {
          console.log("moving player "+p.name+" to "+ (p.position.x+step.x)+","+(p.position.y+step.y));
          p.move(step);
          await checkRespawnsAndUpdateDb(p);
          return true;
        }
      }
    }
    return false;
  }

  function rollerMove(player, tile, is_moving) {
    if (is_moving) {
      return {
        player: player,
        x: player.position.x+tile.move.x,
        y: player.position.y+tile.move.y,
        rotate: tile.rotate,
        step:tile.move,
        canceled: false
      };
    } else { // to detect conflicts add non-moving players
      return {
        player: player,
        x: player.position.x,
        y: player.position.y,
        canceled: true
      };
    }
  }

  async function tryToMovePlayersOnRollers(moves) {
    var move_canceled = true;
    var max = 0;
    while (move_canceled) {  // if a move was canceled we have to check for other conflicts again
      max++;
      if (max > 100) {
        console.log("Infinite loop detected.. cancelling..");
        break;
      }
      move_canceled = false;
      for (var i=0;i<moves.length;++i) {
        for (var j=i+1;j<moves.length;++j) {
          if (moves[i].x === moves[j].x && moves[i].y === moves[j].y) {
            moves[i].canceled = true;
            moves[j].canceled = true;
            moves[i].x = moves[i].player.position.x;
            moves[j].x = moves[j].player.position.x;
            moves[i].y = moves[i].player.position.y;
            moves[j].y = moves[j].player.position.y;
            move_canceled = true;
          }
        }
      }
    }
    for (var roller_move of moves) {
      if (!roller_move.canceled) {
        //move player 1 step in roller direction and rotate
        roller_move.player.move(roller_move.step);
        roller_move.player.rotate(roller_move.rotate);
        await checkRespawnsAndUpdateDb(roller_move.player);
      }
    }
  }

  function isPlayerOnTile(players, x, y) {
    var found = null;
    for (var player of players) {
      if (player.position.x == x && player.position.y == y && !player.needsRespawn) {
        found = player;
      }
    }
    return found;
  }

  async function checkRespawnsAndUpdateDb(player) {
    var onBoard = await player.isOnBoard();
    var onVoid = await player.isOnVoid();
    console.log(player.name+" Player.position "+player.position.x+","+player.position.y+" "+onBoard+"|"+onVoid);
    if (!player.needsRespawn && (!onBoard || onVoid || player.damage > 9 )) {
      player.damage = 0;
      if (player.powerState !== GameLogic.ON) {
          player.togglePowerDown();
      }
      player.needsRespawn=true;
      player.optionalInstantPowerDown=true;
      player.optionCards = {};
      await Players.updateAsync(player._id, player);
      if (player.lives > 0) {
        var game = await player.game();
        game.waitingForRespawn.push(player._id);
        await Games.updateAsync(game._id, game);
      }
      player.chat('died! (lives: '+ player.lives +', damage: '+ player.damage +')');
      removePlayerWithDelay(player);
    } else {
      console.log("updating position", player.name);
      await Players.updateAsync(player._id, player);
    }
  }

  function removePlayerWithDelay(player) {
    Meteor.setTimeout(async function() {
      player.position.x = player.board().width-1;
      player.position.y = player.board().height;
      player.direction = GameLogic.UP;
      await Players.updateAsync(player._id, player);
      console.log("removing player", player.name);
      await Players.updateAsync(player._id, player);
    }, _CARD_PLAY_DELAY);
  }

  scope.respawnPlayerAtPos = async function(player,x,y) {
    player.position.x = x;
    player.position.y = y;
    console.log("respawning player", player.name,'at', x,',',y);
    await Players.updateAsync(player._id, player);
  };

  scope.respawnPlayerWithDir = async function(player,dir) {
    player.direction = dir;
    player.needsRespawn = false;
    await Players.updateAsync(player._id, player);
  };

})(GameLogic);
