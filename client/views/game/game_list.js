Template.gameList.helpers({
  openGames: function() {
    return Games.find({winner: null, started: false}, {sort: {submitted: -1}});
  },
  activeGames: function() {
    return Games.find({winner: null, started: true}, {sort: {submitted: -1}});
  },
  endedGames: function() {
    return Games.find({winner: {$exists: true}}, {sort: {submitted: -1}});
  },
  formatDate: function(timestamp) {
      return new Date(timestamp).toLocaleString();
  }
});

Template.gameItemPostForm.helpers({
  gameCreated: async function() {
    return await Games.findOneAsync({userId: Meteor.userId(), winner: null});
  }
});

Template.gameItemPostForm.events({
  'submit form': async function(event) {
    event.preventDefault();
    var game = {
      name: $(event.target).find('[name=name]').val()
    };

    try {
      var id = await Meteor.callAsync('createGame', game);
    } catch (e) {
        alert(e);
        return;
    }
    Router.go('game.page', {_id: id});
  }
});
