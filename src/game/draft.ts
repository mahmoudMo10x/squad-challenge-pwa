import { PLAYERS } from './players'
import type { BoxOffer, CardSchedule, Player, Position } from './types'

export function createRng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Build the four draft offers for a slot. If `schedule` is provided, the bonusCard
 * fields are filled from the pre-determined match-level schedule. Otherwise each box
 * independently rolls null (no card) — so in legacy callers we never accidentally
 * award too many cards.
 */
export function createOffers(
  position: Position,
  usedIds: Set<string>,
  rng: () => number,
  turnIndex = 0,
  schedule: CardSchedule | null = null,
): BoxOffer[] {
  const pool = PLAYERS.filter((player) => player.position === position && !usedIds.has(player.id))
  const fallback = PLAYERS.filter((player) => player.position === position)
  const source = pool.length >= 4 ? pool : fallback
  const shuffled = [...source].sort(() => rng() - 0.5).slice(0, 4)
  return shuffled.map((player, index) => {
    const key = `${turnIndex}-${index}`
    const scheduled = schedule ? schedule.slots[key] : null
    return {
      id: `${position}-${player.id}-${index}`,
      player: { ...player },
      bonusCard: scheduled ?? null,
      opened: false,
      rejected: false,
    }
  })
}

export function chooseAiPlayer(offers: BoxOffer[], rng: () => number): { player: Player; bonusCard: BoxOffer['bonusCard'] } {
  const first = offers[Math.floor(rng() * offers.length)]
  const acceptanceThreshold = 76 + Math.floor(rng() * 9)
  if (first.player.rating >= acceptanceThreshold) return { player: { ...first.player }, bonusCard: first.bonusCard }
  const remaining = offers.filter((offer) => offer.id !== first.id)
  const second = remaining[Math.floor(rng() * remaining.length)]
  return { player: { ...second.player }, bonusCard: second.bonusCard }
}
