import { useEffect, useMemo } from 'react'
import { applyTactic, formationCoords } from '../game/players'
import type { Player } from '../game/types'

export interface FormationPitchProps {
  squad: Player[]
  formation: string
  tactic: string
  /** 'home' = own players at the bottom of the pitch (towards y=0). 'away' = own players at the top. */
  perspective?: 'home' | 'away'
}

const initials = (name: string) => name.split(' ').map((part) => part[0]).join('').slice(0, 2)

/** Reusable formation pitch. Players animate smoothly when formation/tactic changes. */
export function FormationPitch({ squad, formation, tactic, perspective = 'home' }: FormationPitchProps) {
  const coords = useMemo(() => {
    const base = applyTactic(formationCoords[formation] ?? formationCoords['2-2-2'], tactic)
    if (perspective === 'away') {
      // Flip Y so this team's players render near the top (own goal) for the away viewer.
      return base.map(([x, y]) => [x, 100 - y] as [number, number])
    }
    return base
  }, [formation, tactic, perspective])

  // Force re-mount of marker list when formation changes so transitions run from new base.
  useEffect(() => { /* formation-coord dependency drives re-render */ }, [coords])

  return (
    <div className="mini-pitch">
      <div className="mini-pitch-half" />
      {squad.map((player, i) => {
        const [x, y] = coords[i] ?? [50, 50]
        return (
          <span
            key={player.id}
            className="formation-marker"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <b>{player.rating}</b>
            {initials(player.name)}
          </span>
        )
      })}
    </div>
  )
}
