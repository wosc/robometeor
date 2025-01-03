Template.thumbnail.helpers({
	player: function() {
      for (var player of this.players) {
        if (player.userId === Meteor.userId()) {
          return player;
        }
      }
    }
});
