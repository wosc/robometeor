Template.chat.helpers({
  inGame: function() {
    return inGame(this.gameId);
  },
  
  timeToStr: function(time)
  {	  
	return moment(new Date(time)).format("L LT");
  },

  audio: function() {
      return Session.get('audio') ? "on" : "off";
  },

  canJoin: function() {
      if (this.gameId == "global") return false;
      if (inGame(this.gameId)) return false;
      var game = Games.findOne(this.gameId);
      if (game.gamePhase == GameState.PHASE.ENDED) return false;
      var players = Players.find({gameId: this.gameId}).fetch();
      return players.length <= game.max_player;
  }
});

function inGame(gameId) {
    return Players.findOne({gameId: gameId, userId: Meteor.userId(), robotId: {$ne:null}});
}

Template.chat.events({
  'submit form': async function(event) {
    event.preventDefault();
    var message = {
      gameId: $(event.target).find('[name=gameId]').val(),
      message: $(event.target).find('[name=message]').val()
    };

    if (message.message.length > 0) {
      await Meteor.callAsync('addMessage', message, function(error) {
        if (error)
          return alert(error.reason);

        $(event.target).find('[name=message]').val('');
      });
    }
  },
  'click .cancel': async function() {
    var game = Games.findOne(this.gameId);
    if (game.gamePhase != GameState.PHASE.ENDED) {
      if (confirm("If you leave, you will forfeit the game, are you sure you want to give up?")) {
        await Meteor.callAsync('leaveGame', game._id, function(error) {
          if (error)
            alert(error.reason);
          Router.go('gamelist.page');
        });
      }
    } else {
      Router.go('gamelist.page');
    }
  },
  'click .audio': async function() {
      var value = !Session.get('audio');
      await Meteor.callAsync('setAudio', value, function(error) {
          if (error) alert(error.reason);
      });
      // could probably update via reactivity, but I don't understand it enough
      Session.set('audio', value);
  },
  'click .join': async function(e) {
      e.preventDefault();
      await Meteor.callAsync('joinGame', this.gameId, GameLogic.OFF, function(error) {
          if (error) {
              alert(error.reason);
          } else {
              window.location.reload();
          }
      });
  }
});

Template.chat.rendered = function() {
  Chat.find().observe({added: function() {
    var $chat     = $('.chat'),
        $printer  = $('.messages', $chat),
        printerH  = $printer.innerHeight();
    if ($printer && $printer[0]) {
      $printer.stop().animate( {scrollTop: $printer[0].scrollHeight - printerH  }, 100);
    }
    $.titleAlert("New chat message!", {
      interval: 1000,
      stopOnFocus: true,
      stopOnMouseMove: true
    });
  }});
};
