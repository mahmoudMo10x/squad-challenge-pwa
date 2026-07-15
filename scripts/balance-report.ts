import { mkdirSync, writeFileSync } from 'node:fs'
import { PLAYERS } from '../src/game/players.js'
import { simulateMatch } from '../src/game/simulation.js'
import type { Player, Tactic } from '../src/game/types.js'

const tactics: Tactic[] = ['متوازن', 'هجومي', 'دفاعي', 'ضغط عالٍ', 'مرتدات']
const counts = { GK: 1, DEF: 2, MID: 2, FWD: 2 } as const
function squad(mode: 'top' | 'middle' | 'bottom', offset = 0): Player[] {
  return (Object.keys(counts) as Array<keyof typeof counts>).flatMap((position) => {
    const pool = PLAYERS.filter((player) => player.position === position).sort((a, b) => b.rating - a.rating)
    const start = mode === 'top' ? offset : mode === 'bottom' ? pool.length - counts[position] - offset : Math.floor(pool.length / 2) + offset
    return pool.slice(start, start + counts[position])
  })
}
function run(home: Player[], away: Player[], homeTactic: Tactic, awayTactic: Tactic, samples: number, seedOffset: number) {
  let homeWins = 0; let regulationDraws = 0; let goals = 0
  for (let index = 0; index < samples; index += 1) {
    const result = simulateMatch(home, away, { formation: '2-2-2', tactic: homeTactic }, { formation: '2-2-2', tactic: awayTactic }, seedOffset + index)
    if (result.winner === 'home') homeWins += 1
    if (result.homeScore === result.awayScore) regulationDraws += 1
    goals += result.homeScore + result.awayScore
  }
  return { samples, homeWinRate: homeWins / samples, regulationDrawRate: regulationDraws / samples, averageGoals: goals / samples }
}

const equalHome = squad('middle', 0)
const equalAway = equalHome.map((player) => ({ ...player, id: `${player.id}-mirror` }))
const report = {
  generatedAt: new Date().toISOString(),
  engineVersion: '0.3.0',
  totalSimulations: 55_000,
  equalTeams: run(equalHome, equalAway, 'متوازن', 'متوازن', 20_000, 1),
  strongVsWeak: run(squad('top'), squad('bottom'), 'متوازن', 'متوازن', 10_000, 50_001),
  tacticMatrix: Object.fromEntries(tactics.flatMap((homeTactic, h) => tactics.map((awayTactic, a) => [`${homeTactic}__${awayTactic}`, run(equalHome, equalAway, homeTactic, awayTactic, 1_000, 100_000 + (h * 5 + a) * 1_000)]))),
}
const sameTacticRates = tactics.map((tactic) => report.tacticMatrix[`${tactic}__${tactic}`].homeWinRate)
const gates = {
  equalSidesFair: report.equalTeams.homeWinRate >= .47 && report.equalTeams.homeWinRate <= .53,
  drawRateHealthy: report.equalTeams.regulationDrawRate >= .20 && report.equalTeams.regulationDrawRate <= .32,
  goalsHealthy: report.equalTeams.averageGoals >= 2.3 && report.equalTeams.averageGoals <= 3.2,
  strengthMatters: report.strongVsWeak.homeWinRate >= .70 && report.strongVsWeak.homeWinRate <= .82,
  noSameTacticSideBias: sameTacticRates.every((rate) => rate >= .45 && rate <= .55),
}
Object.assign(report, { gates, passed: Object.values(gates).every(Boolean) })
mkdirSync('reports', { recursive: true })
writeFileSync('reports/balance-baseline.json', `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ equalTeams: report.equalTeams, strongVsWeak: report.strongVsWeak, output: 'reports/balance-baseline.json' }, null, 2))
if (!Object.values(gates).every(Boolean)) process.exitCode = 1
