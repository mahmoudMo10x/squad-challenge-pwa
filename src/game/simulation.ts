import { createRng } from './rng'
import type { Formation, MatchEvent, MatchResult, Player, SquadSetup, Tactic } from './types'

const tacticModifier: Record<Tactic, { attack: number; defense: number; stamina: number }> = {
  'هجومي': { attack: 3, defense: -2, stamina: -1 },
  'متوازن': { attack: 0, defense: 0, stamina: 0 },
  'دفاعي': { attack: -2, defense: 3, stamina: 1 },
  'ضغط عالٍ': { attack: 2, defense: 1, stamina: -4 },
  'مرتدات': { attack: 2, defense: 1, stamina: -1 },
}

const formationModifier: Record<Formation, { attack: number; defense: number }> = {
  '2-2-2': { attack: 0, defense: 0 },
  '3-2-1': { attack: -3, defense: 5 },
  '2-3-1': { attack: 1, defense: 2 },
  '1-3-2': { attack: 5, defense: -4 },
}

function squadPower(squad: Player[], setup: SquadSetup) {
  const base = squad.reduce((sum, player) => sum + player.rating, 0) / squad.length
  const attack = squad.reduce((sum, player) => sum + player.attack, 0) / squad.length
  const defense = squad.reduce((sum, player) => sum + player.defense, 0) / squad.length
  const stamina = squad.reduce((sum, player) => sum + player.stamina, 0) / squad.length
  const tactic = tacticModifier[setup.tactic]
  const formation = formationModifier[setup.formation]
  return {
    total: base * 0.55 + attack * 0.2 + defense * 0.18 + stamina * 0.07 + tactic.attack * 0.5 + tactic.defense * 0.5 + tactic.stamina * 0.25 + formation.attack * 0.5 + formation.defense * 0.5,
    attack: attack + tactic.attack + formation.attack,
    defense: defense + tactic.defense + formation.defense,
  }
}

export function simulateMatch(home: Player[], away: Player[], homeSetup: SquadSetup, awaySetup: SquadSetup, seed: number): MatchResult {
  const rng = createRng(seed)
  const hp = squadPower(home, homeSetup)
  const ap = squadPower(away, awaySetup)
  let homeScore = 0
  let awayScore = 0
  const events: MatchEvent[] = [{ minute: 0, type: 'kickoff', text: 'انطلقت المباراة', homeScore, awayScore }]

  for (let minute = 3; minute < 60; minute += 3 + Math.floor(rng() * 5)) {
    if (minute >= 29 && !events.some((event) => event.type === 'halftime')) {
      events.push({ minute: 30, type: 'halftime', text: 'نهاية الشوط الأول', homeScore, awayScore })
    }
    const homeChance = Math.max(0.32, Math.min(0.68, 0.5 + (hp.total - ap.total) / 75))
    const team = rng() < homeChance ? 'home' : 'away'
    const attack = team === 'home' ? hp.attack : ap.attack
    const defense = team === 'home' ? ap.defense : hp.defense
    const goalProbability = Math.max(0.12, Math.min(0.42, 0.24 + (attack - defense) / 180))
    if (rng() < goalProbability) {
      if (team === 'home') homeScore += 1
      else awayScore += 1
      events.push({ minute, type: 'goal', team, text: team === 'home' ? 'هدف رائع لفريقك!' : 'هدف للمنافس', homeScore, awayScore })
    } else {
      const saved = rng() < 0.48
      events.push({ minute, type: saved ? 'save' : 'chance', team, text: saved ? 'تصدي حاسم من الحارس' : 'فرصة خطيرة تمر بجوار المرمى', homeScore, awayScore })
    }
  }

  events.push({ minute: 60, type: 'fulltime', text: 'نهاية الوقت الأصلي', homeScore, awayScore })
  let homePenalties: number | undefined
  let awayPenalties: number | undefined
  if (homeScore === awayScore) {
    homePenalties = 0
    awayPenalties = 0
    for (let kick = 0; kick < 5; kick += 1) {
      if (rng() < Math.max(0.58, Math.min(0.9, 0.74 + (hp.total - ap.total) / 250))) homePenalties += 1
      if (rng() < Math.max(0.58, Math.min(0.9, 0.74 + (ap.total - hp.total) / 250))) awayPenalties += 1
    }
    while (homePenalties === awayPenalties) {
      const h = rng() < 0.74
      const a = rng() < 0.74
      if (h) homePenalties += 1
      if (a) awayPenalties += 1
    }
  }
  const winner = homeScore !== awayScore ? (homeScore > awayScore ? 'home' : 'away') : ((homePenalties ?? 0) > (awayPenalties ?? 0) ? 'home' : 'away')
  const winningSquad = winner === 'home' ? home : away
  const mvp = [...winningSquad].sort((a, b) => b.rating - a.rating)[0]
  const difference = Math.abs(hp.total - ap.total)
  const reason = difference < 2 ? 'حُسمت المباراة بتفاصيل صغيرة وحسن استغلال الفرص.' : winner === (hp.total > ap.total ? 'home' : 'away') ? 'تفوق الفريق الفائز في جودة التشكيلة وتنفيذ التكتيك.' : 'قلب الفريق الفائز التوقعات بفاعلية أكبر أمام المرمى.'
  return { events, homeScore, awayScore, homePenalties, awayPenalties, winner, homePower: hp.total, awayPower: ap.total, reason, mvp }
}
