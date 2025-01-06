Template.gamePageActions.helpers({
  ownGame: function() {
    return this.game.userId == Meteor.userId();
  },
  inGame: function() {
    return Players.findOne({gameId: this.game._id, userId: Meteor.userId()});
  },
  gameReady: function() {
    return Players.find({gameId: this.game._id}).count() >= this.game.min_player;
  },
  gameFull: function() {
    return Players.find({gameId: this.game._id}).count() >= 8;
  }
});

Template.gamePageActions.events({
  'click .delete': function(e) {
    e.preventDefault();
    if (confirm("Remove this game?")) {
      Games.remove(this.game._id);
      Router.go('gamelist.page');
    }
  },
  'click .join': async function(e) {
    e.preventDefault();

    try {
      await Meteor.callAsync('joinGame', this.game._id, GameLogic.ON);
    } catch (e) {
        alert(e);
    }
  },
  'click .leave': async function(e) {
    e.preventDefault();

    try {
      await Meteor.callAsync('leaveGame', this.game._id);
    } catch (e) {
        alert(e);
    }
  },

  'click .start': async function(e) {
    e.preventDefault();

    var game = this;
    try {
      await Meteor.callAsync('startGame', this.game._id);
    } catch (e) {
        alert(e);
    }
  }
});

Template.players.helpers({
  players: function() {
      return Players.find();
  },

  minPlayer: function() {
    if (this.game.min_player > 1) {
      return '' + this.game.min_player + ' players';
    } else {
      return 'One player';
    }
  }
});

Template.selectedBoard.helpers({
  gameBoard: function() {
      var board = this.game.board();
      return [{
          board: board,
          width: board.width*24,
          height: board.height*24,
          extra_css: '',
          show_start: false,
      }];
  },

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
