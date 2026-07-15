import express from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Server, type Socket } from 'socket.io'
import { PLAYERS, slotOrder } from '../src/game/players.js'
import { createRng } from '../src/game/draft.js'
import { countCards, consumeCard, addCard, stealPlayer, swapPlayer } from '../src/game/cards.js'
import { simulateMatch } from '../src/game/simulation.js'
import type { BoxOffer, CardType, Formation, Player, Position, SquadSetup, Tactic } from '../src/game/types.js'
import type { ClientToServerEvents, OnlinePhase, OnlineSnapshot, ServerToClientEvents } from '../src/online/protocol.js'

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>
type Seat = { token: string; socketId: string | null; name: string; squad: Player[]; cards: CardType[]; setup?: SquadSetup; disconnectedAt?: number }
type Match = {
  id: string; version: number; phase: OnlinePhase; seats: [Seat, Seat]; starter: 0 | 1; active: 0 | 1; turnIndex: number
  offers: BoxOffer[][]; currentOffers: BoxOffer[]; revealedId?: string; mandatory: boolean; cardDone: [boolean, boolean]
  deadline?: number; timer?: NodeJS.Timeout; rng: () => number; result?: ReturnType<typeof simulateMatch>; message?: string
}

const app = express()
const httpServer = createServer(app)
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean)
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, { cors: { origin: allowedOrigins.length ? allowedOrigins : true, credentials: true } })
const waiting: Array<{ token: string; socketId: string; name: string }> = []
const matches = new Map<string, Match>()
const tokenToMatch = new Map<string, { matchId: string; seat: 0 | 1 }>()
const TURN_MS = Number(process.env.TURN_MS ?? 30_000)
const RECONNECT_MS = Number(process.env.RECONNECT_MS ?? 45_000)

app.set('trust proxy', 1)
app.use(helmet({ contentSecurityPolicy: { directives: { "connect-src": ["'self'", ...(allowedOrigins.length ? allowedOrigins : [])] } } }))
app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false }))
app.get('/health', (_req, res) => res.json({ ok: true, waiting: waiting.length, matches: matches.size }))
app.use(express.static('dist'))
app.use((_req, res) => res.sendFile('index.html', { root: 'dist' }))

function precommitOffers(rng: () => number): BoxOffer[][] {
  const pools = new Map<Position, Player[]>()
  const bonusCards: CardType[] = [null, null, null, null, null, 'حماية', 'سرقة', 'كشف', 'تبديل']
  for (const position of ['GK', 'DEF', 'MID', 'FWD'] as Position[]) {
    const pool = PLAYERS.filter((player) => player.position === position)
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const target = Math.floor(rng() * (index + 1)); [pool[index], pool[target]] = [pool[target], pool[index]]
    }
    pools.set(position, pool)
  }
  return Array.from({ length: 14 }, (_, turn) => {
    const position = slotOrder[Math.floor(turn / 2)]
    return pools.get(position)!.splice(0, 4).map((player) => ({
      id: randomUUID(),
      player: { ...player },
      bonusCard: bonusCards[Math.floor(rng() * bonusCards.length)],
      opened: false,
      rejected: false,
    }))
  })
}

function socketFor(seat: Seat) { return seat.socketId ? io.sockets.sockets.get(seat.socketId) : undefined }
function publicSnapshot(match: Match, you: 0 | 1): OnlineSnapshot {
  return {
    matchId: match.id, version: match.version, phase: match.phase, you, starter: match.starter, activePlayer: match.active,
    players: match.seats.map((seat, index) => ({ index: index as 0 | 1, name: seat.name, connected: Boolean(seat.socketId), squad: seat.squad, cards: seat.cards, setup: seat.setup })) as OnlineSnapshot['players'],
    turnIndex: match.turnIndex, slot: match.phase === 'draft' ? slotOrder[Math.floor(match.turnIndex / 2)] : undefined,
    boxes: match.currentOffers.map((offer) => ({ id: offer.id, opened: offer.opened, rejected: offer.rejected, player: offer.opened ? offer.player : undefined, bonusCard: offer.opened ? offer.bonusCard : undefined })),
    mandatory: match.mandatory, cardDone: match.cardDone, deadline: match.deadline, message: match.message, result: match.result,
  }
}
function broadcast(match: Match) {
  match.seats.forEach((seat, index) => socketFor(seat)?.emit('match:state', publicSnapshot(match, index as 0 | 1)))
}
function fail(socket: GameSocket, code: string, message: string) { socket.emit('action:error', { code, message }) }
function seatOf(match: Match, socket: GameSocket) { return match.seats.findIndex((seat) => seat.socketId === socket.id) as -1 | 0 | 1 }
function validated(socket: GameSocket, payload: { matchId: string; version: number }) {
  const match = matches.get(payload.matchId)
  if (!match) { fail(socket, 'MATCH_NOT_FOUND', 'المباراة غير موجودة'); return null }
  if (match.version !== payload.version) { fail(socket, 'STALE_STATE', 'تم تحديث المباراة، أعد المحاولة'); broadcast(match); return null }
  const seat = seatOf(match, socket)
  if (seat < 0) { fail(socket, 'NOT_SEATED', 'لست ضمن هذه المباراة'); return null }
  return { match, seat: seat as 0 | 1 }
}
function clearTimer(match: Match) { if (match.timer) clearTimeout(match.timer); match.timer = undefined }
function armTimer(match: Match) {
  clearTimer(match); match.deadline = Date.now() + TURN_MS
  match.timer = setTimeout(() => autoAct(match), TURN_MS)
}
function advanceDraft(match: Match, player: Player, bonusCard: CardType) {
  const seat = match.seats[match.active]
  seat.squad.push(bonusCard === 'حماية' ? { ...player, protected: true } : { ...player })
  if (bonusCard) seat.cards = addCard(seat.cards, bonusCard)
  match.turnIndex += 1; match.version += 1; match.revealedId = undefined; match.mandatory = false
  if (match.turnIndex >= 14) { clearTimer(match); match.phase = 'cards'; match.active = match.starter; match.deadline = undefined; armTimer(match) }
  else { match.active = match.turnIndex % 2 === 0 ? match.starter : (1 - match.starter) as 0 | 1; match.currentOffers = match.offers[match.turnIndex]; armTimer(match) }
  broadcast(match)
}
function autoAct(match: Match) {
  if (match.phase === 'draft') {
    if (match.revealedId) {
      const offer = match.currentOffers.find((item) => item.id === match.revealedId)!
      advanceDraft(match, offer.player, offer.bonusCard)
    } else {
      const legal = match.currentOffers.filter((item) => !item.rejected && !item.opened)
      const offer = legal[Math.floor(match.rng() * legal.length)]
      offer.opened = true
      if (match.mandatory) advanceDraft(match, offer.player, offer.bonusCard)
      else { match.revealedId = offer.id; match.version += 1; armTimer(match); broadcast(match) }
    }
  } else if (match.phase === 'cards') cardAction(match, match.active, 'تخطي')
  else if (match.phase === 'setup') lockSetup(match, match.active, '2-2-2', 'متوازن')
}
function cardAction(match: Match, seat: 0 | 1, type: 'سرقة' | 'تبديل' | 'تخطي', targetId?: string) {
  if (match.phase !== 'cards' || match.active !== seat || match.cardDone[seat]) return false
  const other = (1 - seat) as 0 | 1
  if (type === 'سرقة') {
    if (!targetId || countCards(match.seats[seat].cards, 'سرقة') < 1) return false
    const result = stealPlayer(match.seats[seat].squad, match.seats[other].squad, targetId)
    if (!result) return false
    match.seats[seat].squad = result.own; match.seats[seat].cards = consumeCard(match.seats[seat].cards, 'سرقة'); match.seats[other].squad = result.opponent
    match.message = `${match.seats[seat].name} استخدم بطاقة السرقة`
  } else if (type === 'تبديل') {
    if (!targetId || countCards(match.seats[seat].cards, 'تبديل') < 1) return false
    const unavailable = new Set(match.seats.flatMap((item) => item.squad.map((player) => player.id)))
    const result = swapPlayer(match.seats[seat].squad, targetId, unavailable, match.rng)
    if (!result) return false
    match.seats[seat].squad = result.squad; match.seats[seat].cards = consumeCard(match.seats[seat].cards, 'تبديل'); match.message = `${match.seats[seat].name} استخدم بطاقة التبديل`
  }
  match.cardDone[seat] = true; match.version += 1
  if (match.cardDone[0] && match.cardDone[1]) { clearTimer(match); match.phase = 'setup'; match.active = match.starter; armTimer(match) }
  else { match.active = other; armTimer(match) }
  broadcast(match); return true
}
function lockSetup(match: Match, seat: 0 | 1, formation: Formation, tactic: Tactic) {
  match.seats[seat].setup = { formation, tactic }; match.version += 1
  const other = (1 - seat) as 0 | 1
  if (match.seats[other].setup) {
    clearTimer(match); match.phase = 'simulation'
    match.result = simulateMatch(match.seats[0].squad, match.seats[1].squad, match.seats[0].setup!, match.seats[1].setup!, Math.floor(match.rng() * 2 ** 31))
    match.deadline = Date.now() + 60_000
    match.timer = setTimeout(() => {
      match.phase = 'result'; match.version += 1; match.deadline = undefined; broadcast(match)
      setTimeout(() => {
        matches.delete(match.id)
        match.seats.forEach((seat) => tokenToMatch.delete(seat.token))
      }, 10 * 60_000)
    }, 60_000)
  } else { match.active = other; armTimer(match) }
  broadcast(match)
}
function createMatch(a: typeof waiting[number], b: typeof waiting[number]) {
  const rng = createRng(Date.now() ^ Math.floor(Math.random() * 2 ** 31)); const starter = (rng() < .5 ? 0 : 1) as 0 | 1
  const match: Match = { id: randomUUID(), version: 1, phase: 'draft', seats: [{ token: a.token, socketId: a.socketId, name: a.name, squad: [], cards: [] }, { token: b.token, socketId: b.socketId, name: b.name, squad: [], cards: [] }], starter, active: starter, turnIndex: 0, offers: [], currentOffers: [], mandatory: false, cardDone: [false, false], rng }
  match.offers = precommitOffers(rng); match.currentOffers = match.offers[0]; matches.set(match.id, match)
  tokenToMatch.set(a.token, { matchId: match.id, seat: 0 }); tokenToMatch.set(b.token, { matchId: match.id, seat: 1 })
  socketFor(match.seats[0])?.join(match.id); socketFor(match.seats[1])?.join(match.id); armTimer(match); broadcast(match)
}

io.on('connection', (socket) => {
  const actionTimes: number[] = []
  socket.use((_event, next) => {
    const now = Date.now()
    while (actionTimes.length && now - actionTimes[0] > 1_000) actionTimes.shift()
    if (actionTimes.length >= 20) return next(new Error('RATE_LIMIT'))
    actionTimes.push(now); next()
  })
  socket.on('queue:join', ({ token, name }) => {
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(token)) return fail(socket, 'INVALID_TOKEN', 'رمز الجلسة غير صالح')
    const existing = tokenToMatch.get(token)
    if (existing) {
      const match = matches.get(existing.matchId)
      if (match) { match.seats[existing.seat].socketId = socket.id; match.seats[existing.seat].disconnectedAt = undefined; socket.join(match.id); broadcast(match); return }
    }
    if (!waiting.some((item) => item.token === token)) waiting.push({ token, socketId: socket.id, name: name.trim().slice(0, 24) || 'لاعب' })
    if (waiting.length >= 2) createMatch(waiting.shift()!, waiting.shift()!)
    else socket.emit('queue:status', { waiting: true, position: waiting.length })
  })
  socket.on('queue:leave', () => { const index = waiting.findIndex((item) => item.socketId === socket.id); if (index >= 0) waiting.splice(index, 1) })
  socket.on('draft:open', (payload) => {
    const valid = validated(socket, payload); if (!valid) return
    const { match, seat } = valid; if (match.phase !== 'draft' || match.active !== seat || match.revealedId) return fail(socket, 'ILLEGAL_ACTION', 'ليس مسموحًا فتح هذا الصندوق الآن')
    const offer = match.currentOffers.find((item) => item.id === payload.boxId && !item.opened && !item.rejected); if (!offer) return fail(socket, 'INVALID_BOX', 'الصندوق غير صالح')
    offer.opened = true; match.version += 1
    if (match.mandatory) advanceDraft(match, offer.player, offer.bonusCard)
    else { match.revealedId = offer.id; armTimer(match); broadcast(match) }
  })
  socket.on('draft:decision', (payload) => {
    const valid = validated(socket, payload); if (!valid) return
    const { match, seat } = valid; if (match.phase !== 'draft' || match.active !== seat || !match.revealedId) return fail(socket, 'ILLEGAL_ACTION', 'لا يوجد اختيار ينتظر القرار')
    const offer = match.currentOffers.find((item) => item.id === match.revealedId)!
    if (payload.accept) advanceDraft(match, offer.player, offer.bonusCard)
    else { offer.rejected = true; match.revealedId = undefined; match.mandatory = true; match.version += 1; armTimer(match); broadcast(match) }
  })
  socket.on('card:reveal', (payload) => {
    const valid = validated(socket, payload); if (!valid) return
    const { match, seat } = valid; if (match.phase !== 'draft' || match.active !== seat || match.revealedId || countCards(match.seats[seat].cards, 'كشف') < 1) return fail(socket, 'NO_REVEAL', 'لا توجد بطاقة كشف صالحة')
    const offer = match.currentOffers.find((item) => item.id === payload.boxId && !item.opened && !item.rejected); if (!offer) return fail(socket, 'INVALID_BOX', 'الصندوق غير صالح')
    match.seats[seat].cards = consumeCard(match.seats[seat].cards, 'كشف'); match.version += 1; socket.emit('card:peek', { boxId: offer.id, player: offer.player }); broadcast(match)
  })
  socket.on('card:action', (payload) => { const valid = validated(socket, payload); if (!valid) return; if (!cardAction(valid.match, valid.seat, payload.type, payload.targetId)) fail(socket, 'INVALID_CARD_ACTION', 'تعذر تنفيذ البطاقة') })
  socket.on('setup:lock', (payload) => { const valid = validated(socket, payload); if (!valid) return; if (valid.match.phase !== 'setup' || valid.match.active !== valid.seat) return fail(socket, 'INVALID_SETUP', 'ليس دور تثبيت تشكيلك'); lockSetup(valid.match, valid.seat, payload.formation, payload.tactic) })
  socket.on('disconnect', () => {
    const waitIndex = waiting.findIndex((item) => item.socketId === socket.id); if (waitIndex >= 0) waiting.splice(waitIndex, 1)
    for (const match of matches.values()) {
      const foundSeat = seatOf(match, socket); if (foundSeat < 0) continue
      const seat = foundSeat as 0 | 1
      match.seats[seat].socketId = null; match.seats[seat].disconnectedAt = Date.now(); broadcast(match)
      setTimeout(() => { if (!match.seats[seat].socketId && match.seats[seat].disconnectedAt && Date.now() - match.seats[seat].disconnectedAt! >= RECONNECT_MS) { match.phase = 'abandoned'; match.message = `انسحب ${match.seats[seat].name}`; match.version += 1; clearTimer(match); broadcast(match) } }, RECONNECT_MS + 50)
    }
  })
})

const port = Number(process.env.PORT ?? 3001)
httpServer.listen(port, () => console.log(`Squad Challenge server listening on http://localhost:${port}`))
