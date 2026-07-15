import { PLAYERS } from './players'
import type { CardType, Player } from './types'

export const activeCardCount = (squad: Player[], type: Exclude<CardType, 'حماية' | null>) =>
  squad.filter((player) => player.card === type).length

export function consumeCard(squad: Player[], type: Exclude<CardType, 'حماية' | null>): Player[] {
  let consumed = false
  return squad.map((player) => {
    if (!consumed && player.card === type) {
      consumed = true
      return { ...player, card: null }
    }
    return player
  })
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
  const replacement = { ...pool[Math.floor(rng() * pool.length)], protected: false, card: null as CardType }
  return {
    squad: squad.map((player) => player.id === current.id ? replacement : player),
    removed: current,
    replacement,
  }
}

export function chooseAiCardAction(ai: Player[], human: Player[], unavailableIds: Set<string>, rng: () => number) {
  const hasSteal = activeCardCount(ai, 'سرقة') > 0
  if (hasSteal) {
    const legalTargets = human.filter((target) => !target.protected && ai.some((player) => player.position === target.position))
    const target = [...legalTargets].sort((a, b) => b.rating - a.rating)[0]
    if (target) {
      const result = stealPlayer(ai, human, target.id)
      if (result) return { ai: consumeCard(result.own, 'سرقة'), human: result.opponent, message: `استخدم المنافس السرقة وحصل على ${result.received.name}` }
    }
  }
  if (activeCardCount(ai, 'تبديل') > 0) {
    const weakest = [...ai].sort((a, b) => a.rating - b.rating)[0]
    const result = swapPlayer(ai, weakest.id, unavailableIds, rng)
    if (result) return { ai: consumeCard(result.squad, 'تبديل'), human, message: `استخدم المنافس التبديل وحصل على ${result.replacement.name}` }
  }
  return { ai, human, message: 'لم يستخدم المنافس بطاقة فعالة' }
}
