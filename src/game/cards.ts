import { PLAYERS } from './players'
import type { CardInventory, CardType, Player } from './types'

export const countCards = (inventory: CardInventory, type: Exclude<CardType, 'حماية' | null>) =>
  inventory.filter((card) => card === type).length

export function consumeCard(inventory: CardInventory, type: Exclude<CardType, 'حماية' | null>): CardInventory {
  const index = inventory.indexOf(type)
  if (index < 0) return inventory
  return [...inventory.slice(0, index), ...inventory.slice(index + 1)]
}

export function addCard(inventory: CardInventory, card: CardType): CardInventory {
  if (!card) return inventory
  return [...inventory, card]
}

export function stealPlayer(own: Player[], opponent: Player[], targetId: string) {
  const target = opponent.find((player) => player.id === targetId)
  if (!target || target.protected) return null
  const candidates = own.filter((player) => player.position === target.position)
  if (!candidates.length) return null
  const sent = [...candidates].sort((a, b) => a.rating - b.rating)[0]
  return {
    own: own.map((player) => player.id === sent.id ? target : player),
    opponent: opponent.map((player) => player.id === target.id ? sent : player),
    received: target,
    sent,
  }
}

export function swapPlayer(squad: Player[], playerId: string, unavailableIds: Set<string>, rng: () => number) {
  const current = squad.find((player) => player.id === playerId)
  if (!current) return null
  const pool = PLAYERS.filter((player) => player.position === current.position && !unavailableIds.has(player.id))
  if (!pool.length) return null
  const replacement = { ...pool[Math.floor(rng() * pool.length)], protected: false }
  return {
    squad: squad.map((player) => player.id === current.id ? replacement : player),
    removed: current,
    replacement,
  }
}

export function chooseAiCardAction(ai: Player[], aiCards: CardInventory, human: Player[], unavailableIds: Set<string>, rng: () => number) {
  if (countCards(aiCards, 'سرقة') > 0) {
    const legalTargets = human.filter((target) => !target.protected && ai.some((player) => player.position === target.position))
    const target = [...legalTargets].sort((a, b) => b.rating - a.rating)[0]
    if (target) {
      const result = stealPlayer(ai, human, target.id)
      if (result) return { ai: result.own, human: result.opponent, aiCards: consumeCard(aiCards, 'سرقة'), message: `استخدم المنافس السرقة وحصل على ${result.received.name}` }
    }
  }
  if (countCards(aiCards, 'تبديل') > 0) {
    const weakest = [...ai].sort((a, b) => a.rating - b.rating)[0]
    const result = swapPlayer(ai, weakest.id, unavailableIds, rng)
    if (result) return { ai: result.squad, human, aiCards: consumeCard(aiCards, 'تبديل'), message: `استخدم المنافس التبديل وحصل على ${result.replacement.name}` }
  }
  return { ai, human, aiCards, message: 'لم يستخدم المنافس بطاقة فعالة' }
}
