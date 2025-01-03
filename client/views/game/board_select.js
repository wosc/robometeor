Template.boardselect.helpers({
  beginnerBoards: function() {
    var b = [];
    for (var i=0;i<BoardBox.BEGINNER_COURSE_CNT;i++) {
      var board = BoardBox.getBoard(i);
      var css_class = '';
      if (Number(this.game.boardId) === Number(i)) {
        css_class = 'selected';
      }

      b.push( { gameId: this.game._id,
                width: board.width*24+4,
                height: board.height*24+4,
                board: board,
                extra_class: css_class,
                show_start: true
              });
    }
    return b;
  },
  expertBoards: function() {
    var b = [];
    for (var i=BoardBox.BEGINNER_COURSE_CNT;i<BoardBox.CATALOG.length;i++) {
      var board = BoardBox.getBoard(i);
      var css_class = '';
      if (Number(this.game.boardId) === Number(i)) {
        css_class = 'selected';
      }

      b.push( { gameId: this.game._id,
                width: board.width*24+4,
                height: board.height*24+4,
                board: board,
                extra_class: css_class,
                show_start: true
              });
    }
    return b;
  }
});

Template.boardselect.events({
  'click .board-thumbnail': async function(e) {
    e.preventDefault();

    var gameId = this.gameId;

    console.log(gameId);

    try {
      await Meteor.callAsync('selectBoard', this.board.name, gameId);
    } catch (e) {
        alert(e);
    }
    Router.go('game.page', {_id: gameId});
  }
});
