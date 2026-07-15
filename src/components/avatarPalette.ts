/** Deterministic avatar palette used by PlayerAvatar and any marker that needs
 * to color-coordinate a player's face. Kept separate so the React component file
 * can remain component-only. */

export interface AvatarPalette {
  skin: string
  hair: string
  shirt: string
  hairShape: 'short' | 'round' | 'wavy' | 'bald' | 'spiky' | 'long' | 'cap'
  eyeOffset: number
  mouthCurve: number
  accessory: 'stubble' | 'band' | 'none'
}

const SKIN_TONES = ['#f5d6b1', '#e8b88a', '#c98a64', '#8b5a3c', '#5b3a26']
const HAIR_COLORS = ['#1a1a1a', '#3b2820', '#5a3a1a', '#8b6a3a', '#caa472', '#d6d6d6']
const SHIRT_COLORS = ['#0a6b43', '#1a3d8f', '#a82121', '#5d2391', '#b8590a', '#0e6c8c', '#3a7a2b']
const HAIR_SHAPES: AvatarPalette['hairShape'][] = ['short', 'round', 'wavy', 'bald', 'spiky', 'long', 'cap']

function fnvHash(value: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

export function avatarPaletteFor(id: string): AvatarPalette {
  const h = fnvHash(id)
  const accessories: AvatarPalette['accessory'][] = ['stubble', 'none', 'band']
  return {
    skin: SKIN_TONES[h % SKIN_TONES.length],
    hair: HAIR_COLORS[(h >>> 4) % HAIR_COLORS.length],
    shirt: SHIRT_COLORS[(h >>> 8) % SHIRT_COLORS.length],
    hairShape: HAIR_SHAPES[(h >>> 12) % HAIR_SHAPES.length],
    eyeOffset: ((h >>> 16) % 3) - 1,
    mouthCurve: ((h >>> 18) % 3) - 1,
    accessory: accessories[(h >>> 20) % accessories.length],
  }
}
