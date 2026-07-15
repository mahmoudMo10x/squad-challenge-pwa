import type { CardType, Formation, MatchResult, Player, Position, SquadSetup, Tactic } from '../game/types'

export type OnlinePhase = 'queue' | 'draft' | 'cards' | 'setup' | 'simulation' | 'result' | 'abandoned'

export interface PublicBox {
  id: string
  opened: boolean
  rejected: boolean
  player?: Player
  bonusCard?: CardType
}

export interface OnlinePlayer {
  index: 0 | 1
  name: string
  connected: boolean
  squad: Player[]
  cards: CardType[]
  setup?: SquadSetup
}

export interface OnlineSnapshot {
  matchId: string
  version: number
  phase: OnlinePhase
  you: 0 | 1
  players: [OnlinePlayer, OnlinePlayer]
  starter: 0 | 1
  activePlayer?: 0 | 1
  turnIndex: number
  slot?: Position
  boxes: PublicBox[]
  mandatory: boolean
  cardDone: [boolean, boolean]
  deadline?: number
  message?: string
  result?: MatchResult
}

export interface ClientToServerEvents {
  'queue:join': (payload: { token: string; name: string }) => void
  'queue:leave': () => void
  'draft:open': (payload: { matchId: string; version: number; boxId: string }) => void
  'draft:decision': (payload: { matchId: string; version: number; accept: boolean }) => void
  'card:reveal': (payload: { matchId: string; version: number; boxId: string }) => void
  'card:action': (payload: { matchId: string; version: number; type: 'سرقة' | 'تبديل' | 'تخطي'; targetId?: string }) => void
  'setup:lock': (payload: { matchId: string; version: number; formation: Formation; tactic: Tactic }) => void
}

export interface ServerToClientEvents {
  'queue:status': (payload: { position: number; waiting: boolean }) => void
  'match:state': (snapshot: OnlineSnapshot) => void
  'card:peek': (payload: { boxId: string; player: Player }) => void
  'action:error': (payload: { code: string; message: string }) => void
}
