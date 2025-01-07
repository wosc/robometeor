class @CardLogic
  @_MAX_NUMBER_OF_CARDS = 9
  @EMPTY   = -1
  @COVERED = -2
  @DAMAGE  = -3
  @RANDOM  = -4

  @_cardTypes =
    0: {direction: 2, position: 0, name: "u-turn"}
    1: {direction: 1, position: 0, name: "turn-right"}
    2: {direction: -1, position: 0, name: "turn-left"}
    3: {direction: 0, position: -1, name: "step-backward"}
    4: {direction: 0, position: 1, name: "step-forward"}
    5: {direction: 0, position: 2, name: "step-forward-2"}
    6: {direction: 0, position: 3, name: "step-forward-3"}

  @_8_deck = [
    6,  # u turn
    18, # right turn
    18, # left turn
    6,  # step back
    18, # step 1
    12, # step 2
    6   # step 3
  ]

  @_12_deck = [
    9,  # u turn
    27, # right turn
    27, # left turn
    9,  # step back
    27, # step 1
    18, # step 2
    9   # step 3
  ]

  @discardCards: (game, player) ->
    deck = await game.getDeck()

    if playerCards = await Cards.findOneAsync({playerId: player._id})
      for unusedCard in playerCards.handCards
        if unusedCard >= 0
          deck.cards.push unusedCard
      chosenCards = playerCards.chosenCards
      for discardCard, i in await player.notLockedCards()
        # Rule note: You don't keep a discard pile. You always use the complete deck
        if discardCard >= 0
          deck.cards.push discardCard
        player.cards[i] = @EMPTY
        chosenCards[i] = @EMPTY

      await Players.updateAsync player._id,
        $set:
          cards: player.cards
          playedCardsCnt: 0,
          chosenCardsCnt: player.lockedCnt()
      await Cards.updateAsync {playerId: player._id},
        $set:
          handCards: [],
          chosenCards: chosenCards

    console.log "Returned cards, new total: "+deck.cards.length
    deck.cards = _.shuffle(deck.cards)
    await Deck.upsertAsync({gameId: game._id}, deck)

  @dealCards: (game, player) ->
    deck = await game.getDeck()
    players = await game.playerCnt()
    handCards = []

    #for every damage you get a card less
    nrOfNewCards = (@_MAX_NUMBER_OF_CARDS - player.damage)
    if player.hasOptionCard('extra_memory')
      nrOfNewCards++
    for attempt in [1..5]
      #grab card from deck, so it can't be handed out twice
      handCards.push deck.cards.pop() for i in [1..nrOfNewCards]
      if haveBothTurnAndStep(handCards, players) || attempt == 5
        break
      console.log('Found only turns/steps, redealing')
      Array.prototype.unshift.apply(deck.cards, handCards)
      handCards = []

    console.log('handCards ' + handCards.length)

    await Cards.updateAsync {playerId: player._id},
      $set:
        handCards: handCards
    await Deck.updateAsync(deck._id, deck)

  haveBothTurnAndStep = (cards, players) ->
    if cards.length < 5  # once you have locked slots, you're out of luck anyway
      return true
    seen = {'turn': 0, 'step': 0}
    for card in cards
      type = CardLogic.cardType(card, players).name.split('-')
      if type[0] == 'u'  # yay special cases
        type[0] = 'turn'
      seen[type[0]] += 1
      if seen['turn'] >= 2 and seen['step'] >= 2
        return true
    return false

  @submitCards: (player) ->
    if (player.isPoweredDown())
      await Players.updateAsync player._id,
        $set:
          submitted: true
          damage: 0
    else
      approvedCards = await verifySubmittedCards(player)

      await Players.updateAsync player._id,
        $set:
          submitted: true,
          optionalInstantPowerDown: false,
          cards: approvedCards

    playerCnt = await Players.find({gameId: player.gameId, lives: {$gt: 0}}).countAsync()
    readyPlayerCnt = await Players.find({gameId: player.gameId, submitted: true, lives: {$gt: 0}}).countAsync()
    if readyPlayerCnt == playerCnt
      await GameState.nextGamePhase(player.gameId)

  verifySubmittedCards = (player) ->
    # check if all played cards are available from original hand...
    # Except locked cards, those are not in the hand.
    availableCards = await player.getHandCards()
    submittedCards = await player.getChosenCards()
    for card, i in await player.notLockedCards()
      found = false
      if card >= 0
        for j in [0..availableCards.length-1]
          if card == availableCards[j]
            availableCards.splice(j, 1)
            found = true
            break
        if !found
          console.log("illegal card detected: "+card+"! (removing card)")
      else
        console.log("Not enough cards submitted")

      if card<0 || !found
        # grab card from hand
        cardIdFromHand = availableCards.splice(Math.floor(Math.random() * (availableCards.length-1)), 1)[0]
        console.log("Handing out random card", cardIdFromHand)
        submittedCards[i] = cardIdFromHand
        player.cards[i] = CardLogic.RANDOM

    await Cards.updateAsync({playerId: player._id}, $set:
      handCards: availableCards
      chosenCards: submittedCards
    )
    player.cards


  @getOptionName: (index) ->
    @_option_deck[index][0]

  @getOptionTitle: (name) ->
    name.replace('/_/g',' ').replace /\w\S*/g, (txt) ->
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()

  @getOptionId: (name) ->
    for option, id in @_option_deck
      if option[0] == name
        return id

  @getOptionDesc: (name) ->
    return @_option_deck[@getOptionId(name)][1]

  @cardType:  (cardId, playerCnt) ->
    deck = if playerCnt <= 8 then @_8_deck else @_12_deck
    cnt  = 0
    for cardTypeCnt, index in deck
      cnt += cardTypeCnt
      if cardId < cnt
        return @_cardTypes[index]

  @priority: (index) ->
    (index+1)*10

  @_option_deck = [
    # [ 'superior_archive',  "When reentering play after beeing destroyed, your robot doesn't receive the normal 20% damage" ]
    # [ 'circuit_breaker',   "If you have 30% or more damage at the end of your turn, your robot will begin the next turn powered down" ]
    [ 'rear-firing_laser', "Your robot has a rear-firing laser in addition to its main laser. This laser follows all the same rules as the main laser" ]
    [ 'extra_memory', "You receive one extra Program card each turn."]
    [ 'high-power_laser', "Your robot's main laser can shoot through one wall or robot to get to a target robot. If you shoot through a robot, that robot also receives full damage. You may use this Option with Fire Control and/or Double-Barreled Laser."]
    [ 'double-barreled_laser', "Whenever your robot fires its main laser, it fires two shots instead of one. You may use this Option with Fire Control and/or High-Power Laser."]
    [ 'ramming_gear', "Whenever your robot pushes or bumps into another robot, that robot receives 10% damage."]
    # [ 'mechanical_arm', "Your robot can touch a flag or repair site from 1 space away (diagonally or orthogonally), as long as there isn't a wall."]
    [ 'ablative_coat', "Absorbs the next 30% damage your robot receives."]
    ####### choose to use
    # 'recompile'
    #[ 'power-down_shield', ""
    # 'abort_switch'
    ###### additional move options
    # 'fourth_gear'
    # 'reverse_gear'
    # 'crab_legs'
    # 'brakes'
    ######## register options
    # 'dual_processor'
    # 'conditional_program'
    # 'flywheel'
    ######## alternative laser
    # 'mini_howitzer'
    # 'fire_control'
    # 'radio_control'
    # [ 'scrambler',    "Whenever you could fire your main laser at a robot, you may instead fire the Scrambler. This replaces the target's robots's next programmed card with the top Program card from the deck. You can't use this Option on the fifth register phase."]
    # [ 'tractor_beam', "Whenever you could fire your main laser at a robot that isn't in an adjacent space, you may instead fire the Tractor Beam. This moves the target robot 1 space toward your robot."]
    # [ 'pressor_beam', "Whenever you could fire your main laser at a robot, you may instead fire the Pressor Beam. This moves the target robot 1 space away from your robot."]
    ##### activate before submit
    # 'gyroscopic_stabilizer'
  ]
