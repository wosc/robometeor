Router.route('/', {
  name: 'gamelist.page',

  waitOn: function() {
    return [Meteor.subscribe('games'),
      Meteor.subscribe('chat', "global")];
  },
});

Router.route('/select/:_id', {
  name: 'boardselect.page',

  waitOn: function() {
    return [Meteor.subscribe('games'),
      Meteor.subscribe('players', this.params._id)];
  },

  action: function() {
    var game = Games.findOne(this.params._id);
    if (game === undefined) {
        Router.go('gamelist.page');
    } else if (game.started) {
        console.log('game started, routing to board');
        Router.go('board.page', {_id: this.params._id});
    } else {
        this.render('boardselectPage', {data: {game: game}});
    }
  }
});

Router.route('/games/:_id', {
  name: 'game.page',

  waitOn: function() {
    return [Meteor.subscribe('games'),
      Meteor.subscribe('players', this.params._id),
      Meteor.subscribe('chat', this.params._id)];
  },

  action: function() {
      var game = Games.findOne(this.params._id);
      if (game === undefined) {
          Router.go('gamelist.page');
      } else if (game.started) {
          console.log('game started, routing to board');
          Router.go('board.page', {_id: this.params._id});
      } else {
          this.render('gamePage', {data: {game: game}});
      }
  }
});

Router.route('/board/:_id', {
  name: 'board.page',
  loadingTemplate: 'loading',

  waitOn: function() {
    return [
      Meteor.subscribe('games'),
      Meteor.subscribe('players', this.params._id),
      Meteor.subscribe('chat', this.params._id),
      Meteor.subscribe('cards', this.params._id)
    ];
  },

  action: function() {
      var game = Games.findOne(this.params._id);
      if (game === undefined) {
          Router.go('gamelist.page');
      } else {
          // Should `await` for consistency, but IronRouter does not support that.
          // Luckily on client the sync API still works.
          var player = Players.findOne({userId: Meteor.userId()});
          this.render('boardPage', {data: {game: game, player: player}});
      }
  }
});
