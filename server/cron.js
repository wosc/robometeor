Meteor.startup(function () {
  var everyMinute = new Cron(async function() {
    //runs every minute and cleans up abandoned games.
    var openGames = await Games.find({started: false}).fetchAsync();
    for (var game of openGames) {
      if (!await Meteor.users.findOneAsync(game.userId).status.online) {
        //wait couple of seconds and re-check before deleting the game, to make sure it wasn't a refresh or temporary.
        console.log("Found disconnected owner, waiting couple of seconds: " + game._id);
        Meteor.setTimeout(async function() {
          if (!await Meteor.users.findOneAsync(game.userId).status.online) {
            console.log("Removing game with disconnected owner: " + game._id);
            await Games.removeAsync(game._id);
          }
        }, 5000);
      }
    }

    var liveGames = await Games.find({started: true, winner: {$exists: false}}).fetchAsync();
    for (game of liveGames) {
      var players = await Players.find({gameId: game._id}).fetchAsync();
      var playersOnline = 0;
      var lastManStanding = false;
      var nrOfPlayers = players.length;
      var nrOfPlayersChecked = 0;

      for (var player of players) {
        if (!await Meteor.users.findOneAsync(player.userId).status.online) {
          //wait couple of seconds and re-check before deleting the game, to make sure it wasn't a refresh or temporary.
          console.log("Found disconnected player, waiting couple of seconds: " + game._id);
          Meteor.setTimeout(async function() {
            if (!await Meteor.users.findOneAsync(player.userId).status.online) {
              //really offline
              var debug_info = "Forfeitting game with disconnected player: " + game._id;
              player.chat('disconnected and left the game', debug_info);
              nrOfPlayersChecked++;
            } else {
              //did come online
              lastManStanding = player;
              playersOnline++;
              nrOfPlayersChecked++;
            }
          }, 5000);
        } else {
          lastManStanding = player;
          playersOnline++;
          nrOfPlayersChecked++;
        }
      }
      //this will wait untill all checks are finished.
      var handle = Meteor.setInterval(async function() {
        console.log("waiting for player to come back online..");
        if (nrOfPlayersChecked >= nrOfPlayers) {
          console.log("all players checked, players online: ", playersOnline);
          Meteor.clearInterval(handle);
          if (playersOnline === 0) {
            await Games.updateAsync(game._id, {$set: {gamePhase: GameState.PHASE.ENDED, winner: "Nobody", stopped: new Date().getTime()}});
          } else if (playersOnline == 1 && game.min_player > 1) {
            await Games.updateAsync(game._id, {$set: {gamePhase: GameState.PHASE.ENDED, winner: lastManStanding.name, stopped: new Date().getTime()}});
          }
          //else do nothing, game still in progress..
        }
      }, 1000);
    }

    //cleanup inactive users
    var d = new Date();
    d.setMinutes(d.getMinutes() - 30);
    await Meteor.users.updateAsync({"status.lastActivity": {$lt: d}}, {$set: {"status.online": false}}, {multi: true});

  }, {});
});
