import { describe, expect, it } from 'vitest'
import { chooseAiPlayer, createOffers, createRng } from './draft'
import { PLAYERS, slotOrder } from './players'
import { simulateMatch } from './simulation'
import { activeCardCount, consumeCard, stealPlayer, swapPlayer } from './cards'

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
    expect(offers.some((offer) => offer.player.id === chosen.id)).toBe(true)
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
})

describe('card rules', () => {
  const defenders = PLAYERS.filter((player) => player.position === 'DEF').slice(0, 4)
  it('consumes only one matching card', () => {
    const squad = defenders.slice(0, 2).map((player) => ({ ...player, card: 'سرقة' as const }))
    expect(activeCardCount(consumeCard(squad, 'سرقة'), 'سرقة')).toBe(1)
  })
  it('steal preserves squad sizes and position', () => {
    const own = [{ ...defenders[0], rating: 60 }]
    const opponent = [{ ...defenders[1], rating: 90 }]
    const result = stealPlayer(own, opponent, opponent[0].id)!
    expect(result.own).toHaveLength(1)
    expect(result.opponent).toHaveLength(1)
    expect(result.own[0].position).toBe('DEF')
  })
  it('cannot steal a protected player', () => {
    expect(stealPlayer([defenders[0]], [{ ...defenders[1], protected: true }], defenders[1].id)).toBeNull()
  })
  it('swap returns an unused same-position player without a chained card', () => {
    const squad = [defenders[0]]
    const result = swapPlayer(squad, defenders[0].id, new Set(squad.map((p) => p.id)), createRng(3))!
    expect(result.replacement.position).toBe('DEF')
    expect(result.replacement.id).not.toBe(defenders[0].id)
    expect(result.replacement.card).toBeNull()
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
