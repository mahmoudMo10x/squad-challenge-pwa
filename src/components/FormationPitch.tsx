import { useMemo } from 'react'
import { applyTactic, formationCoords } from '../game/players'
import type { Player } from '../game/types'
import { PlayerAvatar } from './PlayerAvatar'

export interface FormationPitchProps {
  squad: Player[]
  formation: string
  tactic: string
  /** 'home' = own players at the bottom of the pitch (towards y=0). 'away' = own players at the top. */
  perspective?: 'home' | 'away'
}

/**
 * Reusable formation pitch. Players animate smoothly when formation/tactic changes.
 * Markers are positioned via pitch-relative `left/top` percentages so a transition
 * slides them cleanly to their new spots.
 */
export function FormationPitch({ squad, formation, tactic, perspective = 'home' }: FormationPitchProps) {
  const coords = useMemo(() => {
    const base = applyTactic(formationCoords[formation] ?? formationCoords['2-2-2'], tactic)
    if (perspective === 'away') {
      return base.map(([x, y]) => [x, 100 - y] as [number, number])
    }
    return base
  }, [formation, tactic, perspective])

  return (
    <div className="mini-pitch">
      <div className="mini-pitch-half" />
      {squad.map((player, i) => {
        const [x, y] = coords[i] ?? [50, 50]
        const isGK = i === 0
        return (
          <span
            key={player.id}
            className={`formation-marker ${isGK ? 'gk-ring' : ''}`}
            style={{ left: `${x}%`, top: `${y}%` }}
            data-player-id={player.id}
          >
            <PlayerAvatar id={player.id} size={26} />
            <b>{player.rating}</b>
          </span>
        )
      })}
    </div>
  )
}
