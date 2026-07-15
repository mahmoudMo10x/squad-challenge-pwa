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
  protected?: boolean
}

export type CardInventory = CardType[]

export interface BoxOffer {
  id: string
  player: Player
  bonusCard: CardType
  opened: boolean
  rejected: boolean
}

/** Pre-scheduled card placements for a whole match: which (turn, box) pairs hold a bonus. */
export interface CardSchedule {
  /** Seed the schedule was derived from — must match the simulation seed. */
  seed: number
  /** Map from "turnIndex-boxIndex" → card type. Unlisted positions get null. */
  slots: Record<string, Exclude<CardType, null>>
  /** Weighted card-type distribution used when generating slots. */
  weights: Record<Exclude<CardType, null>, number>
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
