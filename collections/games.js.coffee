game =
  board: () ->
    BoardBox.getBoard(this.boardId)
  players: () ->
    Players.find({gameId: this._id}).fetchAsync()
  playerCnt: () ->
    await Players.find({gameId: this._id}).countAsync()
  isPlayerOnTile: (x,y) ->
    found = null
    players = await this.players()
    for player of players
      if (player.position.x == x && player.position.y == y)
        found = player
    return found;
  chat: (msg, debug_info) ->
    await Chat.insertAsync
      gameId: this._id,
      message: msg,
      submitted: new Date().getTime()
    if debug_info?
      msg += ' ' + debug_info
    console.log(msg)
  nextPlayPhase: (phase) ->
    if phase?
      await this.setPlayPhase(phase)
    await GameState.nextPlayPhase(this._id)
  nextGamePhase: (phase) ->
    if phase?
      await this.setGamePhase(phase)
    await GameState.nextGamePhase(this._id)
  nextRespawnPhase: (phase) ->
    if phase?
      await this.setRespawnPhase(phase)
    await GameState.nextRespawnPhase(this._id)
  setPlayPhase: (phase) ->
    await Games.updateAsync this._id,
      $set:
        playPhase: phase
  setGamePhase: (phase) ->
    await Games.updateAsync this._id,
      $set:
        gamePhase: phase
  setRespawnPhase: (phase) ->
    await Games.updateAsync this._id,
      $set:
        respawnPhase: phase
  getDeck: () ->
    await Deck.findOneAsync({gameId: this._id}) || this.newDeck()
  newDeck: () ->
    deck = if await this.playerCnt() <= 8
      CardLogic._8_deck
    else
      CardLogic._12_deck

    deckSize = 0
    for cardTypeCnt in deck
      deckSize += cardTypeCnt

    return {
      gameId: this._id,
      cards: [0..deckSize-1]
      optionCards: _.shuffle([0..CardLogic._option_deck.length-1])
      discardedOptionCards: []
    }
  startAnnounce: () ->
    await Games.updateAsync this._id,
      $set:
        announce: true
  stopAnnounce: () ->
    await Games.updateAsync this._id,
      $set:
        announce: false
  activePlayers: () ->
    await Players.find
      gameId: this._id,
      needsRespawn: false,
      lives: {$gt: 0},
      powerState: {$ne:GameLogic.OFF}
    .fetchAsync()
  livingPlayers: () ->
    await Players.find
      gameId: this._id,
      lives: {$gt: 0},
    .fetchAsync()
  playersOnBoard: () ->
    await Players.find
      gameId: this._id,
      needsRespawn: false,
      lives: {$gt: 0},
    .fetchAsync()



@Games = new Meteor.Collection('games',
  transform: (doc) ->
    newInstance = Object.create(game)
    return Object.assign(newInstance, doc)
)

Games.allow
  insert: (userId, doc) ->
    return false
  insertAsync: (userId, doc) ->
    return false
  update: (userId, doc) ->
    return false
  updateAsync: (userId, doc) ->
    return false
  remove: (userId, doc) ->
    return doc.userId == userId
  removeAsync: (userId, doc) ->
    return doc.userId == userId
