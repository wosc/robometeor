Chat = new Meteor.Collection('chat');

Chat.allow({
  insert: function(userId, doc) {
    return false;
  },
  insertAsync: function(userId, doc) {
    return false;
  },
  update: function(userId, doc) {
    return false;
  },
  updateAsync: function(userId, doc) {
    return false;
  },
  remove: function(userId, doc) {
    return false;
  },
  removeAsync: function(userId, doc) {
    return false;
  }
});
