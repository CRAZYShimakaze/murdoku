import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { DeductionEngine, loadLevel, type LevelJson } from '../engine/index.ts'

/**
 * Overview of every bundled level's pure-deduction rating: does it solve without
 * search, how hard does the engine rate it, and — crucially — does it still need
 * proof-by-contradiction (`forcing`/`satForcing`)? The forcing column is the
 * worklist for "make the solver reason constructively, like a human". Run with
 * `npm run ratings`; pass a filename prefix to narrow (e.g. `npm run ratings gen`).
 */
const dir = resolve(process.cwd(), 'levels')
const prefix = process.argv[2] ?? ''
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.json') && f.startsWith(prefix))
  .sort()

let forcingCount = 0
let stuck = 0
for (const file of files) {
  const json = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as LevelJson
  const puzzle = loadLevel(json)
  const r = new DeductionEngine(puzzle).solve()
  const forcing = (r.techniqueCounts['forcing'] ?? 0) + (r.techniqueCounts['satForcing'] ?? 0)
  if (forcing > 0) forcingCount++
  if (!r.solved) stuck++
  console.log(
    `${r.solved ? '✓' : '✗'} ${file.padEnd(36)} label=${String(json.difficulty ?? '?').padEnd(9)} engine=${r.difficulty.padEnd(7)} rank=${r.maxRank}${forcing > 0 ? `  ⚠ forcing×${forcing}` : ''}`,
  )
}
console.log(`\n${files.length} Level · ${stuck} stuck · ${forcingCount} brauchen Widersprüche (forcing)`)
