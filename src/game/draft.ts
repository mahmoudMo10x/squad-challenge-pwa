import { bonusCards, PLAYERS } from './players'
import type { BoxOffer, Player, Position } from './types'

export { createRng } from './rng'

export function createOffers(position: Position, usedIds: Set<string>, rng: () => number): BoxOffer[] {
  const pool = PLAYERS.filter((player) => player.position === position && !usedIds.has(player.id))
  const fallback = PLAYERS.filter((player) => player.position === position)
  const source = pool.length >= 4 ? pool : fallback
  const shuffled = [...source].sort(() => rng() - 0.5).slice(0, 4)
  return shuffled.map((player, index) => ({
    id: `${position}-${player.id}-${index}`,
    player: { ...player },
    bonusCard: bonusCards[Math.floor(rng() * bonusCards.length)],
    opened: false,
    rejected: false,
  }))
}

export function chooseAiPlayer(offers: BoxOffer[], rng: () => number): { player: Player; bonusCard: BoxOffer['bonusCard'] } {
  const first = offers[Math.floor(rng() * offers.length)]
  const acceptanceThreshold = 76 + Math.floor(rng() * 9)
  if (first.player.rating >= acceptanceThreshold) return { player: { ...first.player }, bonusCard: first.bonusCard }
  const remaining = offers.filter((offer) => offer.id !== first.id)
  const second = remaining[Math.floor(rng() * remaining.length)]
  return { player: { ...second.player }, bonusCard: second.bonusCard }
}
