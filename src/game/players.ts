import type { CardType, Player, Position } from './types'
import { createRng } from './rng'

const firstNames = ['راشد','زياد','ياسر','مروان','سليم','عمر','تامر','نادر','فارس','أكرم','هيثم','مصعب','بدر','رامي','جاد','أنس','سيف','وليد','كنان','مازن','حسام','لؤي','نايف','كريم','مهند']
const lastNames = ['السالمي','النجار','الحربي','كمال','القحطاني','شاهين','فؤاد','عادل','الدوسري','ناصر','جابر','عوض','منصور','خطاب','مراد','شريف','ربيع','شوقي','حمد','خليل']
export const bonusCards: CardType[] = [null, null, null, null, null, 'حماية', 'سرقة', 'كشف', 'تبديل']
const distribution: Array<{ position: Position; count: number }> = [
  { position: 'GK', count: 60 }, { position: 'DEF', count: 145 }, { position: 'MID', count: 155 }, { position: 'FWD', count: 140 },
]

const hash = (value: string) => [...value].reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) >>> 0, 2166136261)

export const PLAYERS: Player[] = distribution.flatMap(({ position, count }) =>
  Array.from({ length: count }, (_, index) => {
    const globalNameIndex = distribution.slice(0, distribution.findIndex((item) => item.position === position)).reduce((sum, item) => sum + item.count, 0) + index
    const name = `${firstNames[globalNameIndex % firstNames.length]} ${lastNames[Math.floor(globalNameIndex / firstNames.length) % lastNames.length]}`
    const seed = hash(`${position}-${index}-${name}`)
    const rating = 66 + (seed % 28)
    return {
      id: `sc-${position.toLowerCase()}-${String(index + 1).padStart(3, '0')}`,
      name,
      position,
      rating,
      pace: 50 + ((seed >>> 2) % 47),
      attack: position === 'GK' ? 20 + ((seed >>> 4) % 20) : 50 + ((seed >>> 5) % 47),
      passing: 48 + ((seed >>> 8) % 49),
      defense: position === 'GK' ? 45 + ((seed >>> 9) % 35) : 48 + ((seed >>> 11) % 49),
      stamina: 54 + ((seed >>> 14) % 43),
    }
  }),
)

export const positionLabel: Record<Position, string> = { GK: 'حارس مرمى', DEF: 'مدافع', MID: 'وسط', FWD: 'مهاجم' }
export const slotOrder: Position[] = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD']

/** Normalized [x, y] positions (0–100) for each formation slot. Y: 0=own goal, 100=opponent goal. */
export const formationCoords: Record<string, [number, number][]> = {
  '2-2-2': [[50,5],[25,22],[75,22],[25,48],[75,48],[35,75],[65,75]],
  '3-2-1': [[50,5],[18,22],[50,18],[82,22],[30,48],[70,48],[50,75]],
  '2-3-1': [[50,5],[25,22],[75,22],[20,45],[50,42],[80,45],[50,75]],
  '1-3-2': [[50,5],[50,22],[20,45],[50,42],[80,45],[35,75],[65,75]],
}

/** Apply tactical offset to outfield positions (index 1–6). GK (index 0) stays fixed. */
export function applyTactic(
  coords: [number, number][],
  tactic: string,
): [number, number][] {
  return coords.map(([x, y], i) => {
    if (i === 0) return [x, y] // GK never shifts
    let dx = 0, dy = 0
    if (tactic === 'هجومي') { dy = 6 }
    else if (tactic === 'دفاعي') { dy = -6 }
    else if (tactic === 'ضغط عالٍ') { dy = 4; x = x > 50 ? x + 2 : x - 2 }
    else if (tactic === 'مرتدات') { dy = i >= 4 ? -4 : 3 }
    return [
      Math.max(5, Math.min(95, x + dx)),
      Math.max(5, Math.min(95, y + dy)),
    ]
  })
}

/** Generate deterministic frame-by-frame radar positions for a match. */
export function generateRadarPositions(
  homeFormation: string,
  awayFormation: string,
  homeTactic: string,
  awayTactic: string,
  seed: number,
  totalFrames: number,
): { home: [number, number][][]; away: [number, number][][]; ball: [number, number][] } {
  const rng = createRng(seed)
  const homeBase = applyTactic(formationCoords[homeFormation] ?? formationCoords['2-2-2'], homeTactic)
  const awayBase = applyTactic(
    (formationCoords[awayFormation] ?? formationCoords['2-2-2']).map(([x, y]) => [100 - x, 100 - y] as [number, number]),
    awayTactic,
  )
  const home: [number, number][][] = []
  const away: [number, number][][] = []
  const ball: [number, number][] = []

  let prevHome = homeBase.map(([x, y]) => [x + (rng() - 0.5) * 6, y + (rng() - 0.5) * 4] as [number, number])
  let prevAway = awayBase.map(([x, y]) => [x + (rng() - 0.5) * 6, y + (rng() - 0.5) * 4] as [number, number])
  let prevBall: [number, number] = [50, 50]

  for (let f = 0; f < totalFrames; f++) {
    const possHome = rng() < 0.52
    const frameHome = prevHome.map(([x, y], i) => {
      if (i === 0) return [Math.max(40, Math.min(60, 50 + (rng() - 0.5) * 8)), Math.max(2, Math.min(12, 5 + (rng() - 0.5) * 4))] as [number, number]
      const bx = possHome ? 55 : 45
      const by = possHome ? 60 : 40
      const pullX = (bx - x) * 0.04
      const pullY = (by - y) * 0.03
      const nx = Math.max(5, Math.min(95, x + pullX + (rng() - 0.5) * 3))
      const ny = Math.max(5, Math.min(95, y + pullY + (rng() - 0.5) * 2.5))
      return [nx, ny] as [number, number]
    })
    const frameAway = prevAway.map(([x, y], i) => {
      if (i === 0) return [Math.max(40, Math.min(60, 50 + (rng() - 0.5) * 8)), Math.max(88, Math.min(98, 96 + (rng() - 0.5) * 4))] as [number, number]
      const bx = possHome ? 55 : 45
      const by = possHome ? 60 : 40
      const pullX = (bx - x) * 0.04
      const pullY = (by - y) * 0.03
      const nx = Math.max(5, Math.min(95, x + pullX + (rng() - 0.5) * 3))
      const ny = Math.max(5, Math.min(95, y + pullY + (rng() - 0.5) * 2.5))
      return [nx, ny] as [number, number]
    })
    const targetIdx = Math.floor(rng() * 7)
    const targetPos = possHome ? frameHome[targetIdx] : frameAway[targetIdx]
    const bx = prevBall[0] + (targetPos[0] - prevBall[0]) * 0.25 + (rng() - 0.5) * 3
    const by = prevBall[1] + (targetPos[1] - prevBall[1]) * 0.25 + (rng() - 0.5) * 3
    const newBall: [number, number] = [Math.max(5, Math.min(95, bx)), Math.max(5, Math.min(95, by))]
    home.push(frameHome)
    away.push(frameAway)
    ball.push(newBall)
    prevHome = frameHome
    prevAway = frameAway
    prevBall = newBall
  }
  return { home, away, ball }
}
