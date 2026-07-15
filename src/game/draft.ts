import { PLAYERS } from './players'
import type { BoxOffer, Player, Position } from './types'

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

export function createOffers(position: Position, usedIds: Set<string>, rng: () => number): BoxOffer[] {
  const pool = PLAYERS.filter((player) => player.position === position && !usedIds.has(player.id))
  const fallback = PLAYERS.filter((player) => player.position === position)
  const source = pool.length >= 4 ? pool : fallback
  const shuffled = [...source].sort(() => rng() - 0.5).slice(0, 4)
  return shuffled.map((player, index) => ({
    id: `${position}-${player.id}-${index}`,
    player: { ...player },
    opened: false,
    rejected: false,
  }))
}

export function chooseAiPlayer(offers: BoxOffer[], rng: () => number): Player {
  const first = offers[Math.floor(rng() * offers.length)]
  const acceptanceThreshold = 76 + Math.floor(rng() * 9)
  if (first.player.rating >= acceptanceThreshold) return { ...first.player, protected: first.player.card === 'حماية' }
  const remaining = offers.filter((offer) => offer.id !== first.id)
  const second = remaining[Math.floor(rng() * remaining.length)]
  return { ...second.player, protected: second.player.card === 'حماية' }
}
