Meteor.users.find({ "status.online": true }).observeAsync({
  added: function(user) {
    console.log('came online!');
  },
  removed: function(user) {
    console.log(user._id + 'went offline!');
  }
});
