import { generateLevel, type GenDifficulty } from '../engine/generator/index.ts'
import { DeductionEngine, loadLevel } from '../engine/index.ts'
import { startCoverage } from '../engine/solver/coverage.ts'

/**
 * Difficulty PROFILE: for each size/difficulty it generates a few levels and reports
 * what actually makes a level hard for the user — how many suspects carry a "hard"
 * relational/social clue (direction-from-person, same-object-as-someone, in-a-room-
 * with-someone), the average per-clue breadth (how many cells stay open), and the
 * needed technique rank. Hard should show MANY more hard clues + broader clues than
 * medium, scaling with board size. Run with `npx tsx src/dev/profile.ts`.
 */
const HARD = new Set([
  'direction', 'besideSameObject', 'roomExists', 'roomCompanion', 'roomAttribute', 'sameRoom', 'insideXor',
])
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function leafTypes(c: any): string[] {
  if (c.type === 'and') return c.clues.flatMap(leafTypes)
  if (c.type === 'not') return leafTypes(c.clue)
  return [c.type]
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hardCount(level: any): number {
  return level.suspects.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: any) => (s.clues ?? []).some((c: any) => leafTypes(c).some((t) => HARD.has(t))),
  ).length
}

const sizes = [4, 6, 9]
const diffs: GenDifficulty[] = ['medium', 'hard']
const N = 5
const budget = { maxAttempts: 80, softMs: 2000, hardMs: 12000 }

for (const size of sizes) {
  const suspects = size - 1
  for (const diff of diffs) {
    let hc = 0, br = 0, rk = 0, ms = 0
    for (let i = 0; i < N; i++) {
      const t0 = performance.now()
      const level = generateLevel({ width: size, height: size, suspects, difficulty: diff, seed: 1000 + i, budget })
      ms += performance.now() - t0
      hc += hardCount(level)
      const p = loadLevel(level)
      br += startCoverage(p).avgBreadth
      rk += new DeductionEngine(p).solve().maxRank
    }
    console.log(
      `${size}x${size} ${diff.padEnd(6)} suspects=${suspects}` +
        `  hardClues=${(hc / N).toFixed(1)}/${suspects}` +
        `  avgBreadth=${((br / N) * 100).toFixed(0)}%` +
        `  maxRank=${(rk / N).toFixed(1)}` +
        `  ${(ms / N).toFixed(0)}ms`,
    )
  }
}
