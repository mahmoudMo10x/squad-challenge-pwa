import { useMemo } from 'react'
import { avatarPaletteFor } from './avatarPalette'

export interface PlayerAvatarProps {
  /** Stable identity — typically the player's id. Same id always returns the same face. */
  id: string
  /** Display size in px. Default 36. */
  size?: number
  /** Optional CSS class for outer wrapper. */
  className?: string
  /** Override the shirt color. */
  shirtColor?: string
  /** Optional secondary ring color for special roles (e.g. goalkeeper). */
  ringColor?: string
}

function Hair({ shape, color }: { shape: string; color: string }) {
  switch (shape) {
    case 'bald':
      return null
    case 'short':
      return <path d="M 12 22 Q 50 4 88 22 L 88 28 Q 50 16 12 28 Z" fill={color} />
    case 'round':
      return <path d="M 14 26 Q 50 2 86 26 Q 78 14 50 12 Q 22 14 14 26 Z" fill={color} />
    case 'wavy':
      return <path d="M 12 26 Q 30 6 50 14 Q 70 6 88 26 Q 70 22 60 28 Q 50 18 40 28 Q 30 22 12 26 Z" fill={color} />
    case 'spiky':
      return <path d="M 14 26 L 26 12 L 36 22 L 50 8 L 64 22 L 74 12 L 86 26 Z" fill={color} />
    case 'long':
      return (
        <>
          <path d="M 12 24 Q 50 4 88 24 L 88 46 Q 78 38 78 28 Q 50 16 22 28 Q 22 38 12 46 Z" fill={color} />
        </>
      )
    case 'cap':
      return (
        <>
          <path d="M 12 24 Q 50 6 88 24 L 88 28 L 12 28 Z" fill={color} />
          <rect x="10" y="26" width="80" height="6" rx="3" fill={color} />
        </>
      )
    default:
      return null
  }
}

function Stubble({ color }: { color: string }) {
  return <ellipse cx="50" cy="78" rx="22" ry="6" fill={color} opacity="0.4" />
}

/**
 * Deterministic, illustrated PlayerAvatar. Pure local SVG/CSS — no network.
 * Same player id → same face across the entire app.
 */
export function PlayerAvatar({ id, size = 36, className = '', shirtColor, ringColor }: PlayerAvatarProps) {
  const palette = useMemo(() => avatarPaletteFor(id), [id])
  const finalShirt = shirtColor ?? palette.shirt
  const ringStyle = ringColor ? { boxShadow: `0 0 0 2px ${ringColor}` } : undefined
  return (
    <span
      className={`player-avatar ${className}`}
      style={{ width: size, height: size, ...ringStyle }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        {/* shirt body */}
        <path
          d="M 10 92 Q 50 64 90 92 L 90 100 L 10 100 Z"
          fill={finalShirt}
        />
        <path
          d="M 38 76 Q 50 72 62 76 L 62 86 L 38 86 Z"
          fill="#ffffff"
          opacity="0.85"
        />
        {/* face */}
        <ellipse cx="50" cy="50" rx="24" ry="26" fill={palette.skin} />
        {/* hair */}
        <Hair shape={palette.hairShape} color={palette.hair} />
        {/* eyes */}
        <circle cx={42 + palette.eyeOffset} cy="52" r="2.4" fill="#1a1a1a" />
        <circle cx={58 + palette.eyeOffset} cy="52" r="2.4" fill="#1a1a1a" />
        {/* eyebrows */}
        <rect x={36 + palette.eyeOffset} y="46" width="8" height="2" rx="1" fill={palette.hair} />
        <rect x={56 + palette.eyeOffset} y="46" width="8" height="2" rx="1" fill={palette.hair} />
        {/* mouth */}
        <path
          d={`M ${42 + palette.mouthCurve * 2} 66 Q 50 ${68 + palette.mouthCurve * 2} ${58 + palette.mouthCurve * 2} 66`}
          stroke="#3a1a1a"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        {/* nose */}
        <path d="M 50 56 L 48 62 L 52 62 Z" fill={palette.skin} stroke="#3a1a1a" strokeWidth="0.5" />
        {/* accessory */}
        {palette.accessory === 'stubble' && <Stubble color={palette.hair} />}
        {palette.accessory === 'band' && (
          <rect x="20" y="62" width="60" height="3" rx="1" fill="#0a0a0a" opacity="0.5" />
        )}
      </svg>
    </span>
  )
}
