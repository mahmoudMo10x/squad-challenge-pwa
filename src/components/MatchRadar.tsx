import { useEffect, useMemo, useRef } from 'react'
import { applyTactic, formationCoords } from '../game/players'
import { createRng } from '../game/draft'
import type { MatchEvent, Player } from '../game/types'
import { PlayerAvatar } from './PlayerAvatar'

const FRAMES = 60 // 1 frame per minute of a 60-minute match.
const GOAL_Y_HOME = 92
const GOAL_Y_AWAY = 8

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export interface MatchRadarProps {
  homeFormation: string
  awayFormation: string
  homeTactic: string
  awayTactic: string
  /** Stable seed from server (online) or local RNG (computer). */
  seed: number
  /** Authoritative timeline. The radar reads event times to drive ball possession. */
  events: MatchEvent[]
  /** 0..60 minute clock. Drives which frame is shown. */
  elapsed: number
  /** Perspective of the viewer. 'home' = your team plays bottom, 'away' = your team plays top. */
  yourSide?: 'home' | 'away'
  /** Optional squad lists so each radar dot shows its player's face. */
  homeSquad?: Player[]
  awaySquad?: Player[]
}

interface RadarFrame {
  home: [number, number][]
  away: [number, number][]
  ball: [number, number]
}

/**
 * Animated football radar. Consumes authoritative MatchEvent timeline to drive ball
 * and player movement. Deterministic from seed + events.
 *
 * Markers are positioned with `left: ${x}%` / `top: ${y}%` (pitch-relative) and
 * `transform: translate(-50%, -50%)` — percentages are relative to the pitch, not the marker.
 */
export function MatchRadar({ homeFormation, awayFormation, homeTactic, awayTactic, seed, events, elapsed, homeSquad, awaySquad }: MatchRadarProps) {
  const homeRefs = useRef<Array<HTMLDivElement | null>>([])
  const awayRefs = useRef<Array<HTMLDivElement | null>>([])
  const ballRef = useRef<HTMLDivElement | null>(null)
  const framesRef = useRef<RadarFrame[] | null>(null)
  const lastSeedRef = useRef<number | null>(null)

  const frames = useMemo(() => {
    if (!framesRef.current || lastSeedRef.current !== seed) {
      framesRef.current = buildFrames(seed, homeFormation, awayFormation, homeTactic, awayTactic, events)
      lastSeedRef.current = seed
    }
    return framesRef.current!
  }, [seed, homeFormation, awayFormation, homeTactic, awayTactic, events])

  // Apply a frame whenever `elapsed` changes — pitch-relative positioning.
  useEffect(() => {
    const minute = clamp(Math.round(elapsed), 0, 60)
    const idx = clamp(minute - 1, 0, FRAMES - 1)
    const frame = frames[idx]
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const apply = (el: HTMLDivElement | null, x: number, y: number) => {
      if (!el) return
      // Pitch-relative coordinates: left/top are percentages of the pitch container;
      // translate(-50%, -50%) centers the marker on that point.
      el.style.left = `${clamp(x, 0, 100)}%`
      el.style.top = `${clamp(y, 0, 100)}%`
      el.style.transform = 'translate(-50%, -50%)'
      if (reduced) el.style.transition = 'none'
    }
    for (let i = 0; i < 7; i += 1) {
      if (frame.home[i]) apply(homeRefs.current[i], frame.home[i][0], frame.home[i][1])
      if (frame.away[i]) apply(awayRefs.current[i], frame.away[i][0], frame.away[i][1])
    }
    apply(ballRef.current, frame.ball[0], frame.ball[1])
  }, [elapsed, frames])

  // Recompute frames when seed or events change (new match).
  useEffect(() => {
    framesRef.current = buildFrames(seed, homeFormation, awayFormation, homeTactic, awayTactic, events)
    lastSeedRef.current = seed
  }, [seed, homeFormation, awayFormation, homeTactic, awayTactic, events])

  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  return (
    <div className="match-pitch" data-testid="match-radar">
      <div className="center-circle" />
      <div className="half-line" />
      <div className="penalty-box top" />
      <div className="penalty-box bottom" />
      <div className="goal top" />
      <div className="goal bottom" />
      <div className="ball-radar" ref={ballRef} style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', transition: reduced ? 'none' : undefined }} />
      {Array.from({ length: 7 }, (_, i) => {
        const player = homeSquad?.[i]
        const isGK = i === 0
        return (
          <div
            key={`h${i}`}
            ref={(el) => { homeRefs.current[i] = el }}
            className={`radar-dot home-dot ${isGK ? 'gk-ring' : ''}`}
            style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', transition: reduced ? 'none' : undefined }}
            data-player-id={player?.id ?? `home-${i}`}
          >
            {player ? <PlayerAvatar id={player.id} size={20} /> : <i>{i + 1}</i>}
          </div>
        )
      })}
      {Array.from({ length: 7 }, (_, i) => {
        const player = awaySquad?.[i]
        const isGK = i === 0
        return (
          <div
            key={`a${i}`}
            ref={(el) => { awayRefs.current[i] = el }}
            className={`radar-dot away-dot ${isGK ? 'gk-ring' : ''}`}
            style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', transition: reduced ? 'none' : undefined }}
            data-player-id={player?.id ?? `away-${i}`}
          >
            {player ? <PlayerAvatar id={player.id} size={20} /> : <i>{i + 1}</i>}
          </div>
        )
      })}
    </div>
  )
}

function buildFrames(
  seed: number,
  homeFormation: string,
  awayFormation: string,
  homeTactic: string,
  awayTactic: string,
  events: MatchEvent[],
): RadarFrame[] {
  const rng = createRng(seed)
  const homeBase = applyTactic(formationCoords[homeFormation] ?? formationCoords['2-2-2'], homeTactic)
  const awayBase = applyTactic(
    (formationCoords[awayFormation] ?? formationCoords['2-2-2']).map(([x, y]) => [x, 100 - y] as [number, number]),
    awayTactic,
  )

  // Frame 0 (kickoff): home in their formation near own goal (low y), away mirrored, ball at center.
  let homePos = homeBase.map(([x, y]) => [x, y] as [number, number])
  let awayPos = awayBase.map(([x, y]) => [x, y] as [number, number])
  let ballPos: [number, number] = [50, 50]

  const sortedEvents = [...events].sort((a, b) => a.minute - b.minute)
  let possessionTarget: { team: 'home' | 'away'; untilMinute: number } | null = null
  let possession: 'home' | 'away' = 'home'

  const frames: RadarFrame[] = []
  for (let minute = 1; minute <= FRAMES; minute++) {
    const event = [...sortedEvents].reverse().find((e) => e.minute <= minute)
    if (event) {
      if (event.type === 'goal') {
        possession = event.team ?? possession
        possessionTarget = { team: possession, untilMinute: minute + 6 }
      } else if (event.type === 'halftime') {
        possessionTarget = { team: 'home', untilMinute: minute + 4 }
        ballPos = [50, 50]
      } else if (event.type === 'fulltime') {
        ballPos = [50, 50]
        possessionTarget = null
      } else if (event.type === 'chance' || event.type === 'save') {
        possession = event.team ?? possession
        possessionTarget = { team: possession, untilMinute: minute + 4 }
      } else if (event.type === 'kickoff') {
        possession = 'home'
        possessionTarget = { team: 'home', untilMinute: minute + 2 }
        ballPos = [50, 50]
      }
    }
    if (possessionTarget && minute > possessionTarget.untilMinute) {
      possessionTarget = null
    }

    const attTarget: [number, number] = possession === 'home' ? [50, 75] : [50, 25]
    const defTarget: [number, number] = possession === 'home' ? [50, 30] : [50, 70]
    homePos = moveToward(homePos, attTarget, 0.18, rng)
    awayPos = moveToward(awayPos, defTarget, 0.14, rng)
    homePos = homePos.map(([x, y], i) => baseSpring(x, y, homeBase[i][0], homeBase[i][1], 0.85, rng))
    awayPos = awayPos.map(([x, y], i) => baseSpring(x, y, awayBase[i][0], awayBase[i][1], 0.85, rng))
    ballPos = ballForMinute(ballPos, minute, sortedEvents)

    frames.push({
      home: homePos.map(([x, y]) => [clamp(x, 0, 100), clamp(y, 0, 100)] as [number, number]),
      away: awayPos.map(([x, y]) => [clamp(x, 0, 100), clamp(y, 0, 100)] as [number, number]),
      ball: [clamp(ballPos[0], 0, 100), clamp(ballPos[1], 0, 100)],
    })
  }
  return frames
}

function moveToward(
  positions: [number, number][],
  target: [number, number],
  pull: number,
  rng: () => number,
): [number, number][] {
  return positions.map(([x, y]) => [
    x + (target[0] - x) * pull + (rng() - 0.5) * 1.2,
    y + (target[1] - y) * pull + (rng() - 0.5) * 1.2,
  ])
}

function baseSpring(
  x: number,
  y: number,
  baseX: number,
  baseY: number,
  pull: number,
  rng: () => number,
): [number, number] {
  return [
    x + (baseX - x) * pull + (rng() - 0.5) * 1.4,
    y + (baseY - y) * pull + (rng() - 0.5) * 1.4,
  ]
}

function ballForMinute(
  prev: [number, number],
  minute: number,
  events: MatchEvent[],
): [number, number] {
  const ev = [...events].reverse().find((e) => e.minute <= minute)
  if (!ev) return prev
  if (ev.type === 'kickoff') return [50, 50]
  if (ev.type === 'halftime' || ev.type === 'fulltime') {
    return [
      prev[0] + (50 - prev[0]) * 0.2,
      prev[1] + (50 - prev[1]) * 0.2,
    ]
  }
  if (ev.type === 'goal' && ev.team) {
    return ev.team === 'home' ? [50, GOAL_Y_HOME] : [50, GOAL_Y_AWAY]
  }
  if (ev.type === 'save') {
    return ev.team === 'home' ? [50, 10] : [50, 90]
  }
  if (ev.type === 'chance') {
    const targetY = ev.team === 'home' ? 80 : 20
    return [
      prev[0] + (50 - prev[0]) * 0.15,
      prev[1] + (targetY - prev[1]) * 0.18,
    ]
  }
  return prev
}
