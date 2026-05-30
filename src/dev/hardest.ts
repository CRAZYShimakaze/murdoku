import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateOnce } from '../engine/generator/index.ts'
import { SearchSolver, loadLevel, type LevelJson } from '../engine/index.ts'

// Usage:
//   npm run hardest 6:10000,8:1000,10:100   → per-size attempt counts (size:attempts)
//   npm run hardest 1000 6,8,10             → same count for every size
// For each size it runs that many attempts, keeps the HARDEST (most search nodes)
// and saves it as levels/gen-hard-<n>x<n>.json.
const spec = process.argv[2] ?? '6:10000,8:1000,10:100'
const jobs: { size: number; attempts: number }[] = spec.includes(':')
  ? spec.split(',').map((p) => {
      const [s, a] = p.split(':')
      return { size: Number(s), attempts: Number(a) }
    })
  : (process.argv[3] ?? '6,8,10').split(',').map((s) => ({ size: Number(s), attempts: Number(spec) }))
const baseSeed = 20260531

/** Search-tree nodes needed to prove uniqueness — our hardness proxy. */
function nodesOf(level: LevelJson): number {
  const searcher = new SearchSolver(loadLevel(level))
  searcher.countSolutions(2)
  return searcher.nodes
}

for (const { size, attempts } of jobs) {
  const suspects = size - 1
  const opts = { width: size, height: size, suspects, difficulty: 'hard' as const }
  let best: LevelJson | null = null
  let bestNodes = -1
  let valid = 0
  const t0 = performance.now()

  for (let i = 0; i < attempts; i++) {
    const result = generateOnce(opts, baseSeed + i * 7919)
    if (!result || result.pins !== 0) continue
    valid++
    const nodes = nodesOf(result.level)
    if (nodes > bestNodes) {
      best = result.level
      bestNodes = nodes
    }
    if ((i + 1) % 500 === 0) {
      const secs = ((performance.now() - t0) / 1000).toFixed(0)
      console.log(
        `  ${size}x${size}: ${i + 1}/${attempts} (${valid} gültig, ${secs}s) — härtestes bisher: ${bestNodes} Knoten`,
      )
    }
  }

  if (!best) {
    console.log(`✗ ${size}x${size}: kein Level erzeugt`)
    continue
  }
  best.id = `gen-hard-${size}x${size}`
  best.difficulty = 'hard'
  const path = resolve(process.cwd(), `levels/${best.id}.json`)
  writeFileSync(path, JSON.stringify(best, null, 2) + '\n', 'utf8')
  const secs = ((performance.now() - t0) / 1000).toFixed(0)
  console.log(
    `✓ ${size}x${size}: ${bestNodes} Knoten (härtestes aus ${valid}/${attempts} gültigen, ${secs}s) → levels/${best.id}.json`,
  )
}
