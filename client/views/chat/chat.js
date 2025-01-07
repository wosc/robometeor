Template.chat.helpers({
  messages: function() {
    return Chat.find();
  },

  inGame: async function() {
    return await inGame(this.gameId);
  },

  timeToStr: function(time) {
    return moment(new Date(time)).format("L LT");
  },

  audio: function() {
      return Session.get('audio') ? "on" : "off";
  },

  canJoin: async function() {
      if (this.gameId == "global") return false;
      if (await inGame(this.gameId)) return false;
      var game = await Games.findOneAsync(this.gameId);
      if (game.gamePhase == GameState.PHASE.ENDED) return false;
      var players = await Players.find({gameId: this.gameId}).countAsync();
      return players <= game.max_player;
  }
});

async function inGame(gameId) {
    return await Players.findOneAsync({gameId: gameId, userId: Meteor.userId(), robotId: {$ne:null}});
}

Template.chat.events({
  'submit form': async function(event) {
    event.preventDefault();
    var message = {
      gameId: $(event.target).find('[name=gameId]').val(),
      message: $(event.target).find('[name=message]').val()
    };

    if (message.message.length > 0) {
      try {
          await Meteor.callAsync('addMessage', message);
      } catch (e) {
          alert(e);
          return;
      }
      $(event.target).find('[name=message]').val('');
    }
  },
  'click .cancel': async function() {
    var game = await Games.findOneAsync(this.gameId);
    if (game.gamePhase != GameState.PHASE.ENDED) {
      if (confirm("If you leave, you will forfeit the game, are you sure you want to give up?")) {
        try {
          await Meteor.callAsync('leaveGame', game._id);
        } catch (e) {
            alert(e);
            return;
        }
        Router.go('gamelist.page');
      }
    } else {
      Router.go('gamelist.page');
    }
  },
  'click .audio': async function() {
      var value = !Session.get('audio');
      try {
        await Meteor.callAsync('setAudio', value);
      } catch (e) {
          alert(e);
          return;
      }
      // could probably update via reactivity, but I don't understand it enough
      Session.set('audio', value);
  },
  'click .join': async function(e) {
      e.preventDefault();
      try {
        await Meteor.callAsync('joinGame', this.gameId, GameLogic.OFF);
      } catch (e) {
          alert(e);
          return;
      }
      window.location.reload();
  }
});

Template.chat.onRendered(async function() {
  await Chat.find().observeAsync({added: function() {
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
});
