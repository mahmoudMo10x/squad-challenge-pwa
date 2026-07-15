export type Position = 'GK' | 'DEF' | 'MID' | 'FWD'
export type Tactic = 'هجومي' | 'متوازن' | 'دفاعي' | 'ضغط عالٍ' | 'مرتدات'
export type Formation = '2-2-2' | '3-2-1' | '2-3-1' | '1-3-2'
export type CardType = 'حماية' | 'سرقة' | 'كشف' | 'تبديل' | null

export interface Player {
  id: string
  name: string
  position: Position
  rating: number
  pace: number
  attack: number
  passing: number
  defense: number
  stamina: number
  card: CardType
  protected?: boolean
}

export interface BoxOffer {
  id: string
  player: Player
  opened: boolean
  rejected: boolean
}

export interface SquadSetup {
  formation: Formation
  tactic: Tactic
}

export interface MatchEvent {
  minute: number
  type: 'kickoff' | 'chance' | 'save' | 'goal' | 'halftime' | 'fulltime' | 'penalty'
  team?: 'home' | 'away'
  text: string
  homeScore: number
  awayScore: number
}

export interface MatchResult {
  events: MatchEvent[]
  homeScore: number
  awayScore: number
  homePenalties?: number
  awayPenalties?: number
  winner: 'home' | 'away'
  homePower: number
  awayPower: number
  reason: string
  mvp: Player
}
