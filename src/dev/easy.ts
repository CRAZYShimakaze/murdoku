import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateOnce } from '../engine/generator/index.ts'
import { DeductionEngine, SearchSolver, loadLevel, type LevelJson } from '../engine/index.ts'

// Usage:
//   npm run easy 6:500,8:1000,9:2000   → per-size attempt budgets (size:attempts)
//   npm run easy 1000 6,8,9            → same budget for every size
// For each size it keeps the EASIEST level: solvable by pure forward deduction with
// the lowest technique rank (naked/hidden singles ⇒ rank ≤1), tie-broken by fewest
// search nodes. Early-exits as soon as a rank ≤1 level turns up. Saves gen-easy-<n>x<n>.json.
const spec = process.argv[2] ?? '6:500,8:1000,9:2000'
const jobs: { size: number; attempts: number }[] = spec.includes(':')
  ? spec.split(',').map((p) => {
      const [s, a] = p.split(':')
      return { size: Number(s), attempts: Number(a) }
    })
  : (process.argv[3] ?? '6,8,9').split(',').map((s) => ({ size: Number(s), attempts: Number(spec) }))
const baseSeed = 20260601

function nodesOf(level: LevelJson): number {
  const searcher = new SearchSolver(loadLevel(level))
  searcher.countSolutions(2)
  return searcher.nodes
}

for (const { size, attempts } of jobs) {
  const suspects = size - 1
  const opts = { width: size, height: size, suspects }
  let best: LevelJson | null = null
  let bestScore = Infinity
  let bestRank = 99
  let bestNodes = 0
  let solvable = 0
  const t0 = performance.now()

  for (let i = 0; i < attempts; i++) {
    const result = generateOnce(opts, baseSeed + i * 7919)
    if (!result || result.pins !== 0) continue
    // Easy ⇒ pure forward deduction must fully solve it (no contradiction/search).
    const deduction = new DeductionEngine(loadLevel(result.level)).solve()
    if (!deduction.solved) continue
    solvable++
    const nodes = nodesOf(result.level)
    const score = deduction.maxRank * 100000 + nodes // rank first, then fewer nodes
    if (score < bestScore) {
      best = result.level
      bestScore = score
      bestRank = deduction.maxRank
      bestNodes = nodes
    }
    if (bestRank <= 1) break // a genuine easy level (only the simplest techniques)
  }

  if (!best) {
    console.log(`✗ ${size}x${size}: kein lösbares Level gefunden`)
    continue
  }
  best.id = `gen-easy-${size}x${size}`
  best.difficulty = 'easy'
  const path = resolve(process.cwd(), `levels/${best.id}.json`)
  writeFileSync(path, JSON.stringify(best, null, 2) + '\n', 'utf8')
  const secs = ((performance.now() - t0) / 1000).toFixed(0)
  console.log(
    `✓ ${size}x${size}: Rang ${bestRank}, ${bestNodes} Knoten (aus ${solvable} forward-lösbaren, ${secs}s) → levels/${best.id}.json`,
  )
}
