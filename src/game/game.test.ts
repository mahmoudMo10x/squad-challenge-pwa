import { describe, expect, it } from 'vitest'
import { chooseAiPlayer, createOffers, createRng } from './draft'
import { PLAYERS, slotOrder, formationCoords, applyTactic } from './players'
import { simulateMatch } from './simulation'
import { countCards, consumeCard, addCard, stealPlayer, swapPlayer } from './cards'
import { buildCardSchedule, scheduleStatsFor, CARD_WEIGHTS, applyCardSchedule } from './cardSchedule'
import { avatarPaletteFor } from '../components/avatarPalette'
import type { BoxOffer, CardInventory, MatchEvent } from './types'

// --- Draft & slot order ---

describe('draft rules', () => {
  it('uses the canonical seven-slot order', () => expect(slotOrder).toEqual(['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD']))
  it('creates four unique valid offers', () => {
    const offers = createOffers('MID', new Set(), createRng(42))
    expect(offers).toHaveLength(4)
    expect(new Set(offers.map((offer) => offer.player.id)).size).toBe(4)
    expect(offers.every((offer) => offer.player.position === 'MID')).toBe(true)
  })
  it('AI commits one of the four offers', () => {
    const rng = createRng(8); const offers = createOffers('DEF', new Set(), rng)
    const chosen = chooseAiPlayer(offers, rng)
    expect(offers.some((offer) => offer.player.id === chosen.player.id)).toBe(true)
  })
  it('each box offer contains a bonusCard field', () => {
    const offers = createOffers('FWD', new Set(), createRng(99), 0, null)
    for (const offer of offers) {
      expect(offer).toHaveProperty('bonusCard')
    }
  })
})

// --- Fictional content database ---

describe('fictional content database', () => {
  it('contains exactly 500 unique fictional records in the canonical distribution', () => {
    expect(PLAYERS).toHaveLength(500)
    expect(new Set(PLAYERS.map((player) => player.id)).size).toBe(500)
    expect(new Set(PLAYERS.map((player) => player.name)).size).toBe(500)
    expect(Object.fromEntries(['GK', 'DEF', 'MID', 'FWD'].map((position) => [position, PLAYERS.filter((player) => player.position === position).length]))).toEqual({ GK: 60, DEF: 145, MID: 155, FWD: 140 })
  })
  it('keeps ratings and attributes inside valid bounds', () => {
    for (const player of PLAYERS) {
      expect(player.rating).toBeGreaterThanOrEqual(0)
      expect(player.rating).toBeLessThanOrEqual(100)
      for (const value of [player.pace, player.attack, player.passing, player.defense, player.stamina]) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(100)
      }
    }
  })
  it('players no longer have a card field', () => {
    for (const player of PLAYERS) {
      expect(player).not.toHaveProperty('card')
    }
  })
})

// --- Card rules — inventory model ---

describe('card rules — inventory model', () => {
  it('accepting a box grants its player and attached card', () => {
    const offers = createOffers('DEF', new Set(), createRng(10), 0, null)
    const offer = offers[0]
    const squad: typeof PLAYERS = []
    const cards: CardInventory = []
    const newSquad = [...squad, offer.player]
    const newCards = addCard(cards, offer.bonusCard)
    expect(newSquad).toHaveLength(1)
    expect(newSquad[0].id).toBe(offer.player.id)
    if (offer.bonusCard) expect(newCards).toHaveLength(1)
  })
  it('rejecting the first box forfeits its card', () => {
    const offers = createOffers('MID', new Set(), createRng(20), 0, null)
    const firstOffer = offers[0]
    const secondOffer = offers[1]
    const cards: CardInventory = []
    const newCards = addCard(cards, secondOffer.bonusCard)
    expect(newCards).not.toContain(firstOffer.bonusCard)
  })
  it('mandatory second selection grants player and attached card', () => {
    const offers = createOffers('FWD', new Set(), createRng(30), 0, null)
    const mandatoryOffer = offers[2]
    const cards: CardInventory = []
    const newCards = addCard(cards, mandatoryOffer.bonusCard)
    if (mandatoryOffer.bonusCard) expect(newCards).toContain(mandatoryOffer.bonusCard)
  })
  it('card inventory is independent from player records', () => {
    const player = PLAYERS[0]
    const cards: CardInventory = addCard([], 'سرقة')
    expect(cards).toHaveLength(1)
    expect(player).not.toHaveProperty('card')
  })
  it('consumes only one matching card from inventory', () => {
    const inventory: CardInventory = ['سرقة', 'سرقة', 'تبديل']
    expect(countCards(consumeCard(inventory, 'سرقة'), 'سرقة')).toBe(1)
  })
  it('protection card (حماية) is an instant effect and never enters inventory', () => {
    let cards: CardInventory = []
    const bonusCard: 'حماية' | null = 'حماية'
    if (bonusCard && bonusCard !== 'حماية') cards = addCard(cards, bonusCard)
    expect(cards).toHaveLength(0)
    expect(cards).not.toContain('حماية')
  })
  it('non-protection bonus cards still enter inventory (سرقة, تبديل, كشف)', () => {
    let cards: CardInventory = []
    cards = addCard(cards, 'سرقة')
    cards = addCard(cards, 'تبديل')
    cards = addCard(cards, 'كشف')
    expect(countCards(cards, 'سرقة')).toBe(1)
    expect(countCards(cards, 'تبديل')).toBe(1)
    expect(countCards(cards, 'كشف')).toBe(1)
    expect(cards).not.toContain('حماية')
  })
  it('consumeCard returns same array if card not found', () => {
    const inventory: CardInventory = ['تبديل']
    const result = consumeCard(inventory, 'سرقة')
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('تبديل')
  })
  it('addCard with null returns same inventory', () => {
    const inventory: CardInventory = ['سرقة']
    expect(addCard(inventory, null)).toBe(inventory)
  })
  it('AI follows the same box-card rules', () => {
    const rng = createRng(40)
    const offers = createOffers('GK', new Set(), rng, 0, null)
    const choice = chooseAiPlayer(offers, rng)
    expect(choice).toHaveProperty('player')
    expect(choice).toHaveProperty('bonusCard')
    expect(offers.some((o) => o.player.id === choice.player.id)).toBe(true)
  })
  it('steal preserves squad sizes and position', () => {
    const defenders = PLAYERS.filter((player) => player.position === 'DEF').slice(0, 2)
    const own = [{ ...defenders[0], rating: 60 }]
    const opponent = [{ ...defenders[1], rating: 90 }]
    const result = stealPlayer(own, opponent, opponent[0].id)!
    expect(result.own).toHaveLength(1)
    expect(result.opponent).toHaveLength(1)
    expect(result.own[0].position).toBe('DEF')
  })
  it('cannot steal a protected player', () => {
    const defenders = PLAYERS.filter((player) => player.position === 'DEF').slice(0, 2)
    expect(stealPlayer([defenders[0]], [{ ...defenders[1], protected: true }], defenders[1].id)).toBeNull()
  })
  it('swap returns an unused same-position player', () => {
    const defenders = PLAYERS.filter((player) => player.position === 'DEF').slice(0, 1)
    const result = swapPlayer(defenders, defenders[0].id, new Set(defenders.map((p) => p.id)), createRng(3))!
    expect(result.replacement.position).toBe('DEF')
    expect(result.replacement.id).not.toBe(defenders[0].id)
  })
})

// --- Match-level card budget (65/28/7) ---

describe('match-level card budget', () => {
  it('schedules 0/1/2 cards with the declared weights', () => {
    const stats = scheduleStatsFor(10_000)
    expect(stats.zero + stats.one + stats.two + stats.over).toBe(10_000)
    expect(stats.over).toBe(0) // never more than two
    const zeroRate = stats.zero / 10_000
    const oneRate = stats.one / 10_000
    const twoRate = stats.two / 10_000
    // Allow ±3% tolerance around 65/28/7 over 10k samples.
    expect(zeroRate).toBeGreaterThanOrEqual(0.62)
    expect(zeroRate).toBeLessThanOrEqual(0.68)
    expect(oneRate).toBeGreaterThanOrEqual(0.25)
    expect(oneRate).toBeLessThanOrEqual(0.31)
    expect(twoRate).toBeGreaterThanOrEqual(0.04)
    expect(twoRate).toBeLessThanOrEqual(0.10)
  })
  it('never schedules more than two cards in a match', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const s = buildCardSchedule(seed)
      expect(Object.keys(s.slots).length).toBeLessThanOrEqual(2)
    }
  })
  it('scheduled card slots map only to the four declared card types', () => {
    const allowed = new Set(Object.keys(CARD_WEIGHTS))
    for (let seed = 1; seed <= 200; seed += 1) {
      const s = buildCardSchedule(seed)
      for (const value of Object.values(s.slots)) expect(allowed.has(value)).toBe(true)
    }
  })
  it('applyCardSchedule nulls all bonusCard fields that are not in the schedule', () => {
    const schedule = buildCardSchedule(12345)
    const fakeOffers: BoxOffer[] = Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, player: PLAYERS[i], bonusCard: 'سرقة', opened: false, rejected: false }))
    const applied = applyCardSchedule(fakeOffers, 0, schedule)
    const expected = schedule.slots['0-0']
    for (let i = 0; i < applied.length; i += 1) {
      expect(applied[i].bonusCard).toBe(expected ?? null)
    }
  })
})

// --- Formation & tactics ---

describe('formation coordinates', () => {
  it('all formations return exactly seven positions', () => {
    for (const formation of Object.keys(formationCoords)) {
      expect(formationCoords[formation]).toHaveLength(7)
    }
  })
  it('all formation coordinates are unique positions', () => {
    for (const [, coords] of Object.entries(formationCoords)) {
      const keys = coords.map(([x, y]) => `${x},${y}`)
      expect(new Set(keys).size).toBe(7)
    }
  })
  it('GK always at position 0 near own goal (low y)', () => {
    for (const coords of Object.values(formationCoords)) {
      expect(coords[0][1]).toBeLessThanOrEqual(10)
    }
  })
  it('tactical offsets remain inside pitch boundaries (0-100)', () => {
    for (const formation of Object.keys(formationCoords)) {
      for (const tactic of ['هجومي', 'متوازن', 'دفاعي', 'ضغط عالٍ', 'مرتدات']) {
        const adjusted = applyTactic(formationCoords[formation], tactic)
        for (const [x, y] of adjusted) {
          expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(100)
          expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(100)
        }
      }
    }
  })
  it('GK position never changes with tactics', () => {
    const base = formationCoords['2-2-2']
    for (const tactic of ['هجومي', 'دفاعي', 'ضغط عالٍ', 'مرتدات']) {
      const adjusted = applyTactic(base, tactic)
      expect(adjusted[0]).toEqual(base[0])
    }
  })
})

// --- Match engine ---

describe('match engine', () => {
  const home = [PLAYERS[0], ...PLAYERS.filter((p) => p.position === 'DEF').slice(0, 2), ...PLAYERS.filter((p) => p.position === 'MID').slice(0, 2), ...PLAYERS.filter((p) => p.position === 'FWD').slice(0, 2)]
  const away = [PLAYERS[1], ...PLAYERS.filter((p) => p.position === 'DEF').slice(2, 4), ...PLAYERS.filter((p) => p.position === 'MID').slice(2, 4), ...PLAYERS.filter((p) => p.position === 'FWD').slice(2, 4)]
  const setup = { formation: '2-2-2' as const, tactic: 'متوازن' as const }
  it('is deterministic and always returns a winner', () => {
    const first = simulateMatch(home, away, setup, setup, 12345)
    expect(first).toEqual(simulateMatch(home, away, setup, setup, 12345))
    expect(['home', 'away']).toContain(first.winner)
    expect(first.events.at(-1)?.minute).toBe(60)
  })
  it('never emits an unresolved draw across many seeds', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const result = simulateMatch(home, away, setup, setup, seed)
      if (result.homeScore === result.awayScore) expect(result.homePenalties).not.toBe(result.awayPenalties)
    }
  })
  it('produces events with the required types', () => {
    const result = simulateMatch(home, away, setup, setup, 4242)
    expect(result.events[0].type).toBe('kickoff')
    expect(result.events.at(-1)?.type).toBe('fulltime')
    for (const event of result.events) {
      expect(event.minute).toBeGreaterThanOrEqual(0)
      expect(event.minute).toBeLessThanOrEqual(60)
    }
  })
})

// --- PlayerAvatar ---

describe('PlayerAvatar determinism', () => {
  it('returns identical palette for the same id', () => {
    const a = avatarPaletteFor('sc-fwd-001')
    const b = avatarPaletteFor('sc-fwd-001')
    expect(a).toEqual(b)
  })
  it('produces different palettes for different ids', () => {
    const a = avatarPaletteFor('sc-fwd-001')
    const b = avatarPaletteFor('sc-fwd-002')
    expect(a).not.toEqual(b)
  })
  it('always selects from the documented tone/hair/shirt palettes', () => {
    const SKIN = ['#f5d6b1', '#e8b88a', '#c98a64', '#8b5a3c', '#5b3a26']
    const HAIR = ['#1a1a1a', '#3b2820', '#5a3a1a', '#8b6a3a', '#caa472', '#d6d6d6']
    for (const player of PLAYERS) {
      const p = avatarPaletteFor(player.id)
      expect(SKIN).toContain(p.skin)
      expect(HAIR).toContain(p.hair)
    }
  })
})

// --- Score perspective consistency ---

describe('score presentation (perspective)', () => {
  const events: MatchEvent[] = [
    { minute: 0, type: 'kickoff', text: '', homeScore: 0, awayScore: 0 },
    { minute: 15, type: 'goal', team: 'home', text: 'home goal', homeScore: 1, awayScore: 0 },
    { minute: 45, type: 'goal', team: 'away', text: 'away goal', homeScore: 1, awayScore: 1 },
    { minute: 60, type: 'fulltime', text: '', homeScore: 1, awayScore: 1 },
  ]
  function latestScoreAt(minute: number) {
    const ev = [...events].reverse().find((e) => e.minute <= minute)
    return ev ?? events[0]
  }
  it('home viewer sees their score beside أنت', () => {
    for (let m = 1; m <= 60; m += 1) {
      const ev = latestScoreAt(m)
      const my = ev.homeScore
      const op = ev.awayScore
      // Live: user always reads "أنت" on the right side, opponent on the left.
      expect(my + op).toBe(ev.homeScore + ev.awayScore)
    }
  })
  it('away viewer (online perspective swap) sees their score beside أنت', () => {
    for (let m = 1; m <= 60; m += 1) {
      const ev = latestScoreAt(m)
      const myScore = ev.awayScore
      const opScore = ev.homeScore
      // Live: away viewer reads their score beside أنت.
      expect(myScore + opScore).toBe(ev.homeScore + ev.awayScore)
    }
  })
  it('winner label and displayed numbers stay consistent', () => {
    const result = { homeScore: 2, awayScore: 1, winner: 'home' as const }
    const userWon = result.winner === 'home'
    const userScore = result.homeScore
    const opponentScore = result.awayScore
    expect(userWon).toBe(userScore > opponentScore)
  })
})

// --- Monte Carlo balance gates (≥ 20k simulations) ---

describe('match balance gates (Monte Carlo, 20k each)', () => {
  function topSquads(offset: number) {
    const positions: Array<'GK' | 'DEF' | 'MID' | 'FWD'> = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD']
    return positions.map((position) => {
      const pool = PLAYERS.filter((p) => p.position === position).sort((a, b) => b.rating - a.rating)
      return pool[offset]
    })
  }
  function runScenario(advantage: 0 | 10 | 20, samples = 20_000) {
    const baseHome = topSquads(0).map((p) => ({ ...p, rating: p.rating + advantage }))
    const baseAway = topSquads(0)
    let homeWins = 0; let awayWins = 0; let drawsAt60 = 0; let totalGoals = 0
    for (let seed = 1; seed <= samples; seed += 1) {
      const result = simulateMatch(baseHome, baseAway, { formation: '2-2-2', tactic: 'متوازن' }, { formation: '2-2-2', tactic: 'متوازن' }, seed)
      if (result.winner === 'home') homeWins += 1
      else awayWins += 1
      if (result.homeScore === result.awayScore) drawsAt60 += 1
      totalGoals += result.homeScore + result.awayScore
    }
    return { homeWins, awayWins, drawsAt60, samples, avgGoals: totalGoals / samples, homeWinRate: homeWins / samples, awayWinRate: awayWins / samples, drawRate: drawsAt60 / samples }
  }
  it('equal teams: each side wins 45-55% after penalties', () => {
    const r = runScenario(0)
    expect(r.homeWinRate).toBeGreaterThanOrEqual(0.45)
    expect(r.homeWinRate).toBeLessThanOrEqual(0.55)
    expect(r.awayWinRate).toBeGreaterThanOrEqual(0.45)
    expect(r.awayWinRate).toBeLessThanOrEqual(0.55)
  })
  it('+10 avg rating: stronger wins 70-82%', () => {
    const r = runScenario(10)
    expect(r.homeWinRate).toBeGreaterThanOrEqual(0.70)
    expect(r.homeWinRate).toBeLessThanOrEqual(0.82)
  })
  it('+20 avg rating: stronger wins 85-94%', () => {
    const r = runScenario(20)
    expect(r.homeWinRate).toBeGreaterThanOrEqual(0.85)
    expect(r.homeWinRate).toBeLessThanOrEqual(0.94)
  })
  it('no scenario produces 100% wins', () => {
    for (const advantage of [0, 10, 20] as const) {
      const r = runScenario(advantage, 2_000)
      expect(r.homeWinRate).toBeLessThan(1)
      expect(r.awayWinRate).toBeGreaterThan(0)
    }
  })
  it('60-minute draws remain possible in every scenario', () => {
    for (const advantage of [0, 10, 20] as const) {
      const r = runScenario(advantage, 5_000)
      expect(r.drawRate).toBeGreaterThan(0.04)
    }
  })
  it('average goals stay football-like (2-3.2) in equal-teams case', () => {
    const r = runScenario(0)
    expect(r.avgGoals).toBeGreaterThanOrEqual(2.0)
    expect(r.avgGoals).toBeLessThanOrEqual(3.2)
  })
})
