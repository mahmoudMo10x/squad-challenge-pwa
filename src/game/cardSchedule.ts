import { createRng } from './draft'
import type { BoxOffer, CardSchedule, CardType } from './types'

/** Weighted distribution for scheduled card types per match. */
export const CARD_WEIGHTS: Record<Exclude<CardType, null>, number> = {
  'حماية': 30,
  'كشف': 25,
  'سرقة': 25,
  'تبديل': 20,
}

/** Match-level card appearance budget: 65% / 28% / 7% — never more than two. */
export const CARD_COUNT_WEIGHTS = { 0: 65, 1: 28, 2: 7 } as const

const TOTAL_CARD_WEIGHT = Object.values(CARD_WEIGHTS).reduce((a, b) => a + b, 0)
const TOTAL_COUNT_WEIGHT = CARD_COUNT_WEIGHTS[0] + CARD_COUNT_WEIGHTS[1] + CARD_COUNT_WEIGHTS[2]

function pickCount(rng: () => number): 0 | 1 | 2 {
  const total = TOTAL_COUNT_WEIGHT
  const pick = rng() * total
  let acc = 0
  acc += CARD_COUNT_WEIGHTS[0]
  if (pick < acc) return 0
  acc += CARD_COUNT_WEIGHTS[1]
  if (pick < acc) return 1
  return 2
}

function pickCardType(rng: () => number): Exclude<CardType, null> {
  const pick = rng() * TOTAL_CARD_WEIGHT
  let acc = 0
  for (const [type, weight] of Object.entries(CARD_WEIGHTS) as Array<[Exclude<CardType, null>, number]>) {
    acc += weight
    if (pick < acc) return type
  }
  return 'حماية'
}

/**
 * Deterministically schedule which (turn, box) positions in a 14-turn, 4-box draft
 * receive bonus cards. Total cards per match follow 65/28/7 distribution.
 *
 * Uses the SAME seed as the match simulation so computer + online see the same cards.
 */
export function buildCardSchedule(seed: number): CardSchedule {
  const rng = createRng(seed ^ 0xCA2D5)
  const slots: Record<string, Exclude<CardType, null>> = {}
  const count = pickCount(rng)
  if (count === 0) return { seed, slots, weights: { ...CARD_WEIGHTS } }
  // Pick `count` unique (turn, box) pairs out of 56 possibilities.
  const used = new Set<string>()
  const picks: Array<[number, number]> = []
  while (picks.length < count) {
    const turn = Math.floor(rng() * 14)
    const box = Math.floor(rng() * 4)
    const key = `${turn}-${box}`
    if (used.has(key)) continue
    used.add(key); picks.push([turn, box])
  }
  for (const [turn, box] of picks) {
    slots[`${turn}-${box}`] = pickCardType(rng)
  }
  return { seed, slots, weights: { ...CARD_WEIGHTS } }
}

/** Apply a schedule to a draft offer so it shows the correct bonusCard (or null). */
export function applyCardSchedule(offers: BoxOffer[], turnIndex: number, schedule: CardSchedule): BoxOffer[] {
  return offers.map((offer, boxIndex) => {
    const key = `${turnIndex}-${boxIndex}`
    const bonus = schedule.slots[key] ?? null
    if (offer.bonusCard === bonus) return offer
    return { ...offer, bonusCard: bonus }
  })
}

export function scheduleStatsFor(matches: number): { zero: number; one: number; two: number; over: number } {
  let zero = 0, one = 0, two = 0, over = 0
  for (let seed = 1; seed <= matches; seed += 1) {
    const schedule = buildCardSchedule(seed)
    const total = Object.keys(schedule.slots).length
    if (total === 0) zero += 1
    else if (total === 1) one += 1
    else if (total === 2) two += 1
    else over += 1
  }
  return { zero, one, two, over }
}
