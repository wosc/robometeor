Template.cards.helpers({
  otherPlayers: async function() {
    return await Players.findAsync({gameId: this.game._id, userId: {$ne: Meteor.userId()}});
  },
  chosenCards: async function() {
    return await addUIData(await this.player.getChosenCards(), false, this.player.lockedCnt(), true);
  },
  handCards: async function() {
    var cards = await this.player.getHandCards();
    if (cards.length < 9) {
        //add empty cards^
        for (var j = cards.length; j < 9; j++) {
            cards.push(CardLogic.DAMAGE);
        }
    }
    return await addUIData(cards, true, false,false);
  },
  showCards: function() {
    return (this.game.gamePhase == GameState.PHASE.PROGRAM &&
       !this.player.submitted);
  },
  showPlayButton: async function() {
    return !this.player.submitted;
  },
  gameState: async function() {
    switch (this.game.gamePhase) {
      case GameState.PHASE.IDLE:
      case GameState.PHASE.DEAL:
        return "Dealing cards";
      case GameState.PHASE.ENDED:
        return "Game over";
      case GameState.PHASE.PROGRAM:
        if (this.player.isPoweredDown() && !this.player.optionalInstantPowerDown)
          return "Powered down";
        else
          return "Pick your cards";
        break;
      case GameState.PHASE.PLAY:
        switch (this.game.playPhase) {
          case GameState.PLAY_PHASE.IDLE:
          case GameState.PLAY_PHASE.REVEAL_CARDS:
            return "Revealing cards";
          case GameState.PLAY_PHASE.MOVE_BOTS:
            return "Moving bots";
          case GameState.PLAY_PHASE.MOVE_BOARD:
            return "Moving board elements";
          case GameState.PLAY_PHASE.LASERS:
            return "Shooting lasers";
          case GameState.PLAY_PHASE.CHECKPOINTS:
            return "Checkpoints";
          case GameState.PLAY_PHASE.REPAIRS:
            return "Repairing bots";
        }
        break;
      case GameState.PHASE.RESPAWN:
        switch (this.game.respawnPhase) {
          case GameState.RESPAWN_PHASE.CHOOSE_POSITION:
            if (this.game.respawnUserId === Meteor.userId())
              return "Choose position";
            else
              return "Waiting for destroyed bots to reenter";
            break;
          case GameState.RESPAWN_PHASE.CHOOSE_DIRECTION:
            if (this.game.respawnUserId === Meteor.userId())
              return "Choose direction";
            else
              return "Waiting for destroyed bots to reenter";
        }
        break;
    }
    console.log(this.game.gamePhase, this.game.playPhase, this.game.respawnPhase);
    return "Problem?";
  },
  ownPowerStateName: function() {
    switch (this.player.powerState) {
      case GameLogic.OFF:
        return  'cancel power down';
      case GameLogic.DOWN:
        return  'cancel announce power down';
      case GameLogic.ON:
        return  'announce power down';
    }
  },
  ownPowerStateStyle: function() {
    switch (this.player.powerState) {
      case GameLogic.DOWN:
      case GameLogic.OFF:
        return  'btn-danger';
      case GameLogic.ON:
        return  'btn-warning';
    }
  },
  poweredDown: function() {
    return this.player.isPoweredDown();
  }
});

Template.card.helpers({
  emptyCard: function() {
    return this.type === 'empty';
  },
  dmgCard: function() {
    return this.type === 'dmg';
  },
  coveredCard: function() {
    return this.type === 'covered';
  },
  selected: function() {
    return this.slot === getSlotIndex() ? 'selected' : '';
  }
});

Template.playerStatus.helpers({
  playerName: function() {
    if (this.userId === Meteor.userId())
      return "Your robot";
    else
      return this.name;
  },
  cardsHtml: async function() {
    return await addUIData(this.cards || [], false, this.lockedCnt(), false);
  },
  lives: function() {
    l = [];
    for(var i=0;i<3;i++)
      if (i<this.lives)
        l.push('glyphicon-heart');
      else
        l.push('glyphicon-heart-empty');
    return l;
  },
  dmgPercentage: function() {
    return this.damage * 10;
  },
  power: function() {
    if (this.powerState == GameLogic.OFF)
      return 'powered down';
    else if (this.powerState == GameLogic.DOWN)
      return 'power down played';
  },
  headingForFinish: async function() {
    var board = await this.board();
    return this.visited_checkpoints == board.checkpoints.length-1;
  },
  nextCheckpoint: async function() {
    var board = await this.board();
    return Math.min(board.checkpoints.length, this.visited_checkpoints+1);
  },
  showSubmittedLabel: async function() {
    var game = await this.game();
    return this.submitted && game.gamePhase == GameState.PHASE.PROGRAM;
  },
  showPoweredDownLabel: async function() {
    var game = await this.game();
    return this.powerState == GameLogic.OFF &&
           (game.gamePhase != GameState.PHASE.PROGRAM || this.submitted);
  },
  powerDownPlayed: function() {
    return (this.powerState == GameLogic.DOWN);
  },
  showRemoveButton: async function() {
    var game = await this.game();
    return game.gamePhase != GameState.PHASE.ENDED;
  },
  hasOptionCards: function() {
    return (Object.keys(this.optionCards).length > 0);
  },
  activeOptionCards: function() {
    var r = [];
    Object.keys(this.optionCards).forEach(function(optionKey) {
      r.push({
        name: CardLogic.getOptionTitle(optionKey),
        desc: CardLogic.getOptionDesc(optionKey)
      });
    });
    return r;
  }
});

Template.playerStatus.events({
    'click .remove': async function(e) {
        var data = e.target.dataset;
        if (confirm("Really remove player '" + data.username + "' from the game?")) {
            try {
              await Meteor.callAsync('leaveGame', data.gameid, data.userid);
            } catch (e) {
                alert(e);
            }
        }
    }
});

Template.card.events({
  'click .available': async function(e) {
    var currentSlot = getSlotIndex();
    if ($(e.currentTarget).css("opacity") == 1 && await isEmptySlot(currentSlot)) {
      $(e.currentTarget).css("opacity", "0.3");
      Session.set("selectedSlot", await getNextEmptySlotIndex(currentSlot));

      var player = await getPlayer();
      console.log('Chosen count: ', player.chosenCardsCnt);
      if (!player.submitted) {
        await chooseCard(player.gameId, this.cardId, currentSlot);
        await setEmptySlot(currentSlot, false);
        console.log("choose card ",this.cardId,' for slot ', getSlotIndex());

        if (player.isPoweredDown())
          try {
            await Meteor.callAsync('togglePowerDown', player.gameId);
          } catch (e) {
              alert(e);
              return;
          }
          $(".playBtn").toggleClass("disabled", !await allowSubmit());
       } else {
        $(e.currentTarget).css("opacity", "1");
        Session.set("selectedSlot", currentSlot);
      }
    }

  },
  'click .played': async function(e) {
    if (!await isEmptySlot(this.slot) && this.class.indexOf("locked") == -1) {
      setEmptySlot(this.slot, true);
      var player = await getPlayer();
      if (!player.submitted) {
        await unchooseCard(player.gameId, this.slot);
        $('.available.' + this.cardId).css("opacity", "1");
        Session.set("selectedSlot", this.slot);
      } else {
        setEmptySlot(this.slot, false);
      }
    }
  },
  'click .empty': async function(e) {
    var player = await getPlayer();
    if (!player.submitted) {
      Session.set("selectedSlot", this.slot);
    }
  }
});

Template.cards.events({
  'click .playBtn': async function(e) {
    await submitCards(this.game);
  },
  'click .powerBtn': async function(e) {
    try {
      var powerState = await Meteor.callAsync('togglePowerDown', this.game._id);
    } catch (e) {
        alert(e);
        return;
    }
    if (powerState == GameLogic.OFF) {
        var player = await getPlayer();
        var cards = await player.getChosenCards();
        for (var item of cards) {
          if (item.type !== 'empty') {
            $('.available.' + item.cardId).show();
          }
      }
      await unchooseAllCards(player);
    }
    $(".playBtn").toggleClass("disabled", !await allowSubmit());
  }
});

async function getPlayer() {
    return await Players.findOneAsync({userId: Meteor.userId()});
}

async function chooseCard(gameId, card, slot) {
  try {
    await Meteor.callAsync('selectCard', gameId, card, slot);
  } catch (e) {
      alert(e);
  }
}

async function unchooseCard(gameId, slot) {
  try {
    await Meteor.callAsync('deselectCard', gameId, slot);
  } catch (e) {
      alert(e);
  }
}

async function unchooseAllCards(player) {
  Session.set("selectedSlot", 0);
  await initEmptySlots();
  try {
    await Meteor.callAsync('deselectAllsCards', player.gameId);
  } catch (e) {
      alert(e);
  }
}

function getSlotIndex() {
  return Session.get("selectedSlot") || 0;
}

async function initEmptySlots() {
  var player = await getPlayer();
  var emptySlots = [];
  var emptyCnt = GameLogic.CARD_SLOTS - player.lockedCnt();
  for(var i=0;i<GameLogic.CARD_SLOTS;i++) {
    emptySlots.push(i < emptyCnt);
  }
  Session.set("emptySlots", emptySlots);
}

async function getEmptySlots() {
  if (!Session.get("emptySlots")) {
    await initEmptySlots();
  }
  return Session.get("emptySlots");
}

async function isEmptySlot(index) {
  var slots = await getEmptySlots();
  return slots[index];
}

async function setEmptySlot(index, value) {
  var slots = await getEmptySlots();
  slots[index] = value;
  Session.set("emptySlots", slots);
}

async function getNextEmptySlotIndex(currentSlot) {
  var emptySlots = await getEmptySlots();
  for (var j=currentSlot+1;j<currentSlot+GameLogic.CARD_SLOTS;j++)
    if (emptySlots[j%GameLogic.CARD_SLOTS])
      return j%GameLogic.CARD_SLOTS;
  return  0;
}

async function allowSubmit() {
  var player = await getPlayer();
  return player.chosenCardsCnt == 5 || player.isPoweredDown();
}

async function submitCards(game) {
  var player = await getPlayer();
  var chosenCards = await player.getChosenCards();
  console.log("submitting cards", chosenCards);
  $(document).find('.col-md-4.well').removeClass('countdown').removeClass('finish');
  try {
    await Meteor.callAsync('playCards',  game._id);
  } catch (e) {
      alert(e);
      return;
  }
  Session.set("selectedSlot", 0);
  Session.set("emptySlots",false);
}

async function addUIData(cards, available, locked, selectable) {
  var player = await getPlayer();
  var game = await player.game();
  var playerCnt = await game.playerCnt();
  var uiCards = [];
  cards.forEach(function(card, i) {
    var cardProp = {
      cardId: card,
    };
    if (selectable)
      cardProp.slot = i;
    switch (card) {
      case CardLogic.RANDOM:
        cardProp.type = 'random';
        break;
      case CardLogic.DAMAGE:
        cardProp.type = 'dmg';
        break;
      case CardLogic.COVERED:
        cardProp.type = 'covered';
        break;
      case CardLogic.EMPTY:
        cardProp.type = 'empty';
        break;
      default:
        if (card !== null) {
          cardProp.class = available ? 'available' : 'played';
          cardProp.priority = CardLogic.priority(card);
          if (locked && i >= GameLogic.CARD_SLOTS - locked) {
            cardProp.class += " locked";
            cardProp.locked = true;
          }
          cardProp.type = CardLogic.cardType(card, playerCnt).name;
        }
    }
    uiCards.push(cardProp);
  });
  return uiCards;
}
