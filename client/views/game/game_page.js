Template.gamePageActions.helpers({
  ownGame: function() {
    return this.userId == Meteor.userId();
  },
  inGame: function() {
    return Players.findOne({gameId: this._id, userId: Meteor.userId()});
  },
  gameReady: function() {
    return Players.find().fetch().length >= this.min_player;
  },
  gameFull: function() {
    return Players.find().fetch().length >= 8;
  }
});

Template.gamePageActions.events({
  'click .delete': function(e) {
    e.preventDefault();
    if (confirm("Remove this game?")) {
      Games.remove(this._id);
      Router.go('gamelist.page');
    }
  },
  'click .join': async function(e) {
    e.preventDefault();

    try {
      await Meteor.callAsync('joinGame', this._id, GameLogic.ON);
    } catch (e) {
        alert(e);
    }
  },
  'click .leave': async function(e) {
    e.preventDefault();

    try {
      await Meteor.callAsync('leaveGame', this._id);
    } catch (e) {
        alert(e);
    }
  },

  'click .start': async function(e) {
    e.preventDefault();

    var game = this;
    try {
      await Meteor.callAsync('startGame', this._id);
    } catch (e) {
        alert(e);
    }
  }
});

Template.players.helpers({
  minPlayer: function() {
    if (this.game.min_player > 1) {
      return '' + this.game.min_player + ' players';
    } else {
      return 'One player';
    }
  }
});

Template.selectedBoard.helpers({
  ownGame: function() {
    return this.game.userId == Meteor.userId();
  }
});

Template.selectedBoard.events({
 'click .select': function(e) {
    e.preventDefault();
    Router.go('boardselect.page', {_id: this.game._id});
  }
});
