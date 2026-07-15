import type { CardType, Player, Position } from './types'

const firstNames = ['راشد','زياد','ياسر','مروان','سليم','عمر','تامر','نادر','فارس','أكرم','هيثم','مصعب','بدر','رامي','جاد','أنس','سيف','وليد','كنان','مازن','حسام','لؤي','نايف','كريم','مهند']
const lastNames = ['السالمي','النجار','الحربي','كمال','القحطاني','شاهين','فؤاد','عادل','الدوسري','ناصر','جابر','عوض','منصور','خطاب','مراد','شريف','ربيع','شوقي','حمد','خليل']
const cards: CardType[] = [null, null, null, null, null, 'حماية', 'سرقة', 'كشف', 'تبديل']
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
      card: cards[(seed >>> 17) % cards.length],
    }
  }),
)

export const positionLabel: Record<Position, string> = { GK: 'حارس مرمى', DEF: 'مدافع', MID: 'وسط', FWD: 'مهاجم' }
export const slotOrder: Position[] = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD']
