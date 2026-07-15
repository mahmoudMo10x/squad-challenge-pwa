import { useEffect, useRef } from 'react'
import { applyTactic, formationCoords } from '../game/players'
import { createRng } from '../game/draft'
import type { MatchEvent } from '../game/types'

const FRAMES = 60 // 1 second per minute of a 60-minute match.
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
  /** Used for ball side when the team is unknown. */
  yourSide?: 'home' | 'away'
}

/**
 * Animated football radar. Consumes authoritative MatchEvent timeline to drive ball
 * and player movement. Deterministic from seed + events.
 */
export function MatchRadar({ homeFormation, awayFormation, homeTactic, awayTactic, seed, events, elapsed, yourSide = 'home' }: MatchRadarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const homeRefs = useRef<Array<HTMLDivElement | null>>([])
  const awayRefs = useRef<Array<HTMLDivElement | null>>([])
  const ballRef = useRef<HTMLDivElement | null>(null)
  const framesRef = useRef<ReturnType<typeof buildFrames> | null>(null)
  const rafRef = useRef<number | null>(null)

  if (!framesRef.current) {
    framesRef.current = buildFrames(seed, homeFormation, awayFormation, homeTactic, awayTactic, events)
  }

  // Apply a frame whenever `elapsed` changes.
  useEffect(() => {
    const frames = framesRef.current
    if (!frames) return
    const minute = clamp(elapsed, 0, 60)
    const idx = clamp(Math.round(minute) - 1, 0, FRAMES - 1)
    const frame = frames[idx]
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const style = (el: HTMLDivElement | null, x: number, y: number) => {
      if (!el) return
      el.style.transform = `translate3d(${x}%, ${y}%, 0)`
    }
    if (reduced) {
      // Instant jump; no transition.
      homeRefs.current.forEach((el, i) => el && frame.home[i] && style(el, frame.home[i][0], frame.home[i][1]))
      awayRefs.current.forEach((el, i) => el && frame.away[i] && style(el, frame.away[i][0], frame.away[i][1]))
      if (ballRef.current) style(ballRef.current, frame.ball[0], frame.ball[1])
    } else {
      // CSS transition (set in App.css .radar-dot / .ball-radar) handles the rest.
      homeRefs.current.forEach((el, i) => el && frame.home[i] && style(el, frame.home[i][0], frame.home[i][1]))
      awayRefs.current.forEach((el, i) => el && frame.away[i] && style(el, frame.away[i][0], frame.away[i][1]))
      if (ballRef.current) style(ballRef.current, frame.ball[0], frame.ball[1])
    }
  }, [elapsed, yourSide])

  // rAF loop for smoother updates between prop changes (catches up after tab visibility changes).
  useEffect(() => {
    const tick = () => rafRef.current = requestAnimationFrame(tick)
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  // Recompute frames when the seed or events change (new match).
  useEffect(() => {
    framesRef.current = buildFrames(seed, homeFormation, awayFormation, homeTactic, awayTactic, events)
  }, [seed, homeFormation, awayFormation, homeTactic, awayTactic, events])

  return (
    <div className="match-pitch" ref={containerRef}>
      <div className="center-circle" />
      <div className="half-line" />
      <div className="penalty-box top" />
      <div className="penalty-box bottom" />
      <div className="goal top" />
      <div className="goal bottom" />
      <div className="ball-radar" ref={ballRef} style={{ left: '0%', top: '0%' }} />
      {Array.from({ length: 7 }, (_, i) => (
        <div
          key={`h${i}`}
          ref={(el) => { homeRefs.current[i] = el }}
          className="radar-dot home-dot"
          style={{ left: '0%', top: '0%' }}
        >
          <i>{i + 1}</i>
        </div>
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <div
          key={`a${i}`}
          ref={(el) => { awayRefs.current[i] = el }}
          className="radar-dot away-dot"
          style={{ left: '0%', top: '0%' }}
        >
          <i>{i + 1}</i>
        </div>
      ))}
    </div>
  )
}

interface RadarFrame {
  home: [number, number][]
  away: [number, number][]
  ball: [number, number]
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
  // Seed small jitter so the dots look alive at minute 0.
  let homePos = homeBase.map(([x, y]) => [x + (rng() - 0.5) * 4, y + (rng() - 0.5) * 3] as [number, number])
  let awayPos = awayBase.map(([x, y]) => [x + (rng() - 0.5) * 4, y + (rng() - 0.5) * 3] as [number, number])
  let ballPos: [number, number] = [50, 50]

  // Sort events by minute for lookup.
  const sortedEvents = [...events].sort((a, b) => a.minute - b.minute)
  // Track recent possession flips: limit drift.
  let possessionTarget: { team: 'home' | 'away'; untilMinute: number } | null = null
  let possession: 'home' | 'away' = 'home'

  const frames: RadarFrame[] = []
  for (let minute = 1; minute <= FRAMES; minute++) {
    // Find the most recent event at-or-before this minute.
    const event = [...sortedEvents].reverse().find((e) => e.minute <= minute)
    if (event) {
      if (event.type === 'goal') {
        possession = event.team ?? possession
        possessionTarget = { team: possession, untilMinute: minute + 6 }
      } else if (event.type === 'halftime') {
        possessionTarget = { team: 'home', untilMinute: minute + 4 }
      } else if (event.type === 'fulltime') {
        // Settle ball near center
        ballPos = [50, 50]
        possessionTarget = null
      } else if (event.type === 'chance' || event.type === 'save') {
        possession = event.team ?? possession
        possessionTarget = { team: possession, untilMinute: minute + 4 }
      } else if (event.type === 'kickoff') {
        possession = 'home'
        possessionTarget = { team: 'home', untilMinute: minute + 2 }
      }
    }
    // After possession target window, drift back toward a mixed state.
    if (possessionTarget && minute > possessionTarget.untilMinute) {
      possessionTarget = null
    }

    // Player shape: in possession -> team spreads into attacking shape; defending team sits deeper.
    const attTarget: [number, number] = possession === 'home' ? [50, 75] : [50, 25]
    const defTarget: [number, number] = possession === 'home' ? [50, 30] : [50, 70]
    homePos = moveToward(homePos, attTarget, 0.18, rng)
    awayPos = moveToward(awayPos, defTarget, 0.14, rng)
    // Dots hold their tactical shape (applyTactic) most of the time; small noise makes it look alive.
    homePos = homePos.map(([x, y], i) => baseSpring(x, y, homeBase[i][0], homeBase[i][1], 0.85, rng))
    awayPos = awayPos.map(([x, y], i) => baseSpring(x, y, awayBase[i][0], awayBase[i][1], 0.85, rng))

    // Ball position driven by event: kickoff center, goal -> goal, halftime -> center, save/chance -> GK area, between -> follows possession player
    ballPos = ballForMinute(ballPos, minute, sortedEvents)

    frames.push({ home: homePos, away: awayPos, ball: ballPos })
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
    clamp(x + (target[0] - x) * pull + (rng() - 0.5) * 1.2, 5, 95),
    clamp(y + (target[1] - y) * pull + (rng() - 0.5) * 1.2, 5, 95),
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
    clamp(x + (baseX - x) * pull + (rng() - 0.5) * 1.4, 5, 95),
    clamp(y + (baseY - y) * pull + (rng() - 0.5) * 1.4, 5, 95),
  ]
}

function ballForMinute(
  prev: [number, number],
  minute: number,
  events: MatchEvent[],
): [number, number] {
  // Find the most recent event at-or-before this minute.
  const ev = [...events].reverse().find((e) => e.minute <= minute)
  if (!ev) return [50, 50]
  if (ev.type === 'kickoff') return [50, 50]
  if (ev.type === 'halftime' || ev.type === 'fulltime') {
    return [
      prev[0] + (50 - prev[0]) * 0.2,
      prev[1] + (50 - prev[1]) * 0.2,
    ]
  }
  if (ev.type === 'goal' && ev.team) {
    // Snap ball to the goal it's going into.
    return ev.team === 'home' ? [50, GOAL_Y_HOME] : [50, GOAL_Y_AWAY]
  }
  if (ev.type === 'save') {
    // Ball reaches the goalkeeper area (low y for home keeper, high y for away keeper).
    return ev.team === 'home' ? [50, 10] : [50, 90]
  }
  if (ev.type === 'chance') {
    // Ball pushes toward the goal but not all the way.
    const targetY = ev.team === 'home' ? 80 : 20
    return [
      prev[0] + (50 - prev[0]) * 0.15,
      prev[1] + (targetY - prev[1]) * 0.18,
    ]
  }
  return prev
}
