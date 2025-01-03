Meteor.users.find({ "status.online": true }).observeAsync({
  added: function(user) {
    console.log(user.emails[0].address + ' came online!');
  },
  removed: function(user) {
    console.log(user.emails[0].address + ' went offline!');
  }
});
