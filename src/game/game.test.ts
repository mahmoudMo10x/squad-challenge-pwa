import { describe, expect, it } from 'vitest'
import { chooseAiPlayer, createOffers, createRng } from './draft'
import { PLAYERS, slotOrder, formationCoords, applyTactic, generateRadarPositions } from './players'
import { simulateMatch } from './simulation'
import { countCards, consumeCard, addCard, stealPlayer, swapPlayer } from './cards'
import type { CardInventory } from './types'

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
    const offers = createOffers('FWD', new Set(), createRng(99))
    for (const offer of offers) {
      expect(offer).toHaveProperty('bonusCard')
    }
  })
})

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

describe('card rules — inventory model', () => {
  it('accepting a box grants its player and attached card', () => {
    const offers = createOffers('DEF', new Set(), createRng(10))
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
    const offers = createOffers('MID', new Set(), createRng(20))
    const firstOffer = offers[0]
    const secondOffer = offers[1]
    const cards: CardInventory = []
    const newCards = addCard(cards, secondOffer.bonusCard)
    expect(newCards).not.toContain(firstOffer.bonusCard)
  })
  it('mandatory second selection grants player and attached card', () => {
    const offers = createOffers('FWD', new Set(), createRng(30))
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
    const offers = createOffers('GK', new Set(), rng)
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
  it('tactical offsets remain inside pitch boundaries (5-95)', () => {
    for (const formation of Object.keys(formationCoords)) {
      for (const tactic of ['هجومي', 'متوازن', 'دفاعي', 'ضغط عالٍ', 'مرتدات']) {
        const adjusted = applyTactic(formationCoords[formation], tactic)
        for (const [x, y] of adjusted) {
          expect(x).toBeGreaterThanOrEqual(5)
          expect(x).toBeLessThanOrEqual(95)
          expect(y).toBeGreaterThanOrEqual(5)
          expect(y).toBeLessThanOrEqual(95)
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

describe('match radar', () => {
  it('generates deterministic movement from the same seed', () => {
    const a = generateRadarPositions('2-2-2', '3-2-1', 'متوازن', 'هجومي', 54321, 100)
    const b = generateRadarPositions('2-2-2', '3-2-1', 'متوازن', 'هجومي', 54321, 100)
    expect(a.home[50]).toEqual(b.home[50])
    expect(a.away[99]).toEqual(b.away[99])
    expect(a.ball[75]).toEqual(b.ball[75])
  })
  it('produces different movement for different seeds', () => {
    const a = generateRadarPositions('2-2-2', '2-2-2', 'متوازن', 'متوازن', 11111, 50)
    const b = generateRadarPositions('2-2-2', '2-2-2', 'متوازن', 'متوازن', 22222, 50)
    expect(a.home[25]).not.toEqual(b.home[25])
  })
  it('generates correct number of frames', () => {
    const positions = generateRadarPositions('2-2-2', '2-2-2', 'متوازن', 'متوازن', 99999, 300)
    expect(positions.home).toHaveLength(300)
    expect(positions.away).toHaveLength(300)
    expect(positions.ball).toHaveLength(300)
  })
  it('each frame has 7 player positions per team', () => {
    const positions = generateRadarPositions('3-2-1', '1-3-2', 'هجومي', 'دفاعي', 77777, 10)
    for (const frame of positions.home) expect(frame).toHaveLength(7)
    for (const frame of positions.away) expect(frame).toHaveLength(7)
  })
  it('all radar positions stay within pitch bounds (0-100)', () => {
    const positions = generateRadarPositions('2-3-1', '2-2-2', 'ضغط عالٍ', 'مرتدات', 33333, 60)
    for (const frame of positions.home) for (const [x, y] of frame) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(100)
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(100)
    }
    for (const frame of positions.away) for (const [x, y] of frame) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(100)
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(100)
    }
    for (const [x, y] of positions.ball) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(100)
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(100)
    }
  })
})

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
})
