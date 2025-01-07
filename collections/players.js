var player = {
	game: async function() {
		return await Games.findOneAsync(this.gameId);
	},
  board: async function() {
    var game = await this.game();
    return game.board();
  },
  tile: async function() {
    var board = await this.board();
    return board.getTile(this.position.x, this.position.y);
  },
  getHandCards: async function() {
    var c = await Cards.findOneAsync({playerId: this._id});
    return c ? c.handCards : [];
  },
  getChosenCards: async function() {
    var c = await Cards.findOneAsync({playerId: this._id});
    return c ? c.chosenCards : [];
  },
  hasOptionCard: function(optionName) {
    return this.optionCards[optionName];
  },
  updateHandCards: async function(cards) {
    await Cards.upsertAsync({playerId: this._id}, {$set:{handCards:cards}});
  },
  chooseCard: async function(card, index) {
    var cards = await this.getChosenCards();
    var inc = 0;
    if (cards[index] === CardLogic.EMPTY)
      inc = 1;
    cards[index] = card;
    console.log("update chosen cards", index,card);
    await Cards.updateAsync({playerId: this._id}, {
      $set:{chosenCards:cards},
    });
    this.cards[index] = CardLogic.COVERED;
    await Players.updateAsync(this._id, {
      $set:{cards: this.cards},
      $inc:{chosenCardsCnt:inc}
    });
  },
  unchooseCard: async function(index) {
    var cards = await this.getChosenCards();
    if (cards[index] !== CardLogic.EMPTY) {
      cards[index] = CardLogic.EMPTY;
      await Cards.updateAsync({playerId: this._id}, {
        $set:{chosenCards:cards},
      });
      this.cards[index] = CardLogic.EMPTY;
      await Players.updateAsync(this._id, {
        $set:{cards: this.cards},
        $inc:{chosenCardsCnt:-1}
      });
    }
  },
	isOnBoard: async function() {
    var board = await this.board();
		var a = board.onBoard(this.position.x, this.position.y);
    if (!a) {
      console.log("Player fell off the board", this.name);
    }
    return a;
	},
  isOnVoid: async function() {
    var tile = await this.tile();
    var a = tile.type === Tile.VOID;
    if (a) {
      console.log("Player fell into the void", this.name);
    }
    return a;
  },
  updateStartPosition: function() {
    this.start = {x: this.position.x, y:this.position.y};
  },
  move: function(step) {
    this.position.x += step.x;
    this.position.y += step.y;
  },
  rotate: function(rotation) {
    this.direction += rotation + 4;
    this.direction %= 4;
  },
  chat: async function(msg, debug_info) {
    msg = this.name + ' ' + msg;
    await Chat.insertAsync({
      gameId: this.gameId,
      message: msg,
      submitted: new Date().getTime()
    });
    if (debug_info !== undefined)
      msg += ' ' + debug_info;
    console.log(msg);
  },
  togglePowerDown: async function() {
    switch (this.powerState) {
      case GameLogic.DOWN:
        this.powerState = GameLogic.ON;
        break;
      case GameLogic.ON:
        this.powerState = GameLogic.DOWN;
        break;
      case GameLogic.OFF:
        this.powerState = GameLogic.ON;
				break;
    }
    console.log("new power state "+this.powerState);
    await Players.updateAsync(this._id, {$set:{powerState: this.powerState}});
    return this.powerState;
  },
  isPoweredDown: function() {
    return this.powerState === GameLogic.OFF;
  },

  lockedCnt: function() {
    return  Math.max(0, GameLogic.CARD_SLOTS + this.damage - CardLogic._MAX_NUMBER_OF_CARDS);
  },
  notLockedCnt: function() {
    return  GameLogic.CARD_SLOTS - this.lockedCnt();
  },
  notLockedCards: async function() {
    if (this.lockedCnt() == GameLogic.CARD_SLOTS) {
      return [];
    } else {
      var chosen = await this.getChosenCards();
      return chosen.slice(0, this.notLockedCnt());
    }
  },
  playedCards: async function() {
    var chosen = await this.getChosenCards();
    return chosen.slice(0,this.playedCardsCnt);
  },
  isActive: function() {
    return !this.isPoweredDown() && !this.needsRespawn && this.lives > 0;
  },
  addDamage: async function(inc) {
    if (this.hasOptionCard('ablative_coat')) {
      if (!this.ablativeCoat)
        this.ablativeCoat = 0;
      this.ablativeCoat++;
      if (this.ablativeCoat == 3)  {
        this.ablativeCoat = null;
        this.discardOptionCard('ablative_coat');
      }
      await Players.update( this._id, {$set: {
        ablativeCoat: this.ablativeCoat,
        optionCards: this.optionCards
      }});
    } else {
      this.damage += inc;
      if (this.isPoweredDown() && this.lockedCnt() > 0) {
        // powered down robot has no cards so we have to draw from deck to get locked cards
        var game = await this.game();
        var deck = game.getDeck();
        var chosenCards = await this.getChosenCards();
        for (var i=0;i<this.lockedCnt();i++) {
          this.cards[this.notLockedCnt()+i] = deck.cards.shift();
          chosenCards[this.notLockedCnt()+i] = this.cards[this.notLockedCnt()+i];
        }
        await Deck.updateAsync(deck._id, deck);
        await Players.updateAsync( this._id, this);
        await Cards.updateAsync( {playerId: this._id}, { $set: {
              chosenCards: chosenCards
            }});
      }
    }
  },
  drawOptionCard: async function() {
    var game = await this.game();
    var optionCards = await Deck.findOneAsync({gameId: game._id}).optionCards;
    var optionId = optionCards.pop();
    if (optionId === undefined) {  // no more option cards available
      return;
    }
    this.optionCards[CardLogic.getOptionName(optionId)] = true;
    await Deck.updateAsync({gameId: game._id}, {$set: {optionCards: optionCards}});
  },
  discardOptionCard: async function(name) {
    var game = await this.game();
    delete this.optionCards.name;
    var discarded = await Deck.findOneAsync({gameId: game._id}).discardedOptionCards;
    discarded.push(CardLogic.getOptionId(name));
    await Deck.updateAsync({gameId: game._id}, {$set: {discardedOptionCards: discarded}});
  }
};


Players = new Meteor.Collection('players', {
  transform: function (doc) {
    var newInstance = Object.create(player);
    return Object.assign(newInstance, doc);
  }
});

Players.allow({
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
