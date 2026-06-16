import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DeductionEngine, loadLevel, type LevelJson } from '../engine/index.ts'
import { Renderer } from '../i18n/Renderer.ts'
import de from '../i18n/locales/de.json'

/** Throwaway diagnostic: print every hypothetical step (case split / forcing) with
 *  the LENGTH of its consequence chain — the proxy for "can a human follow this?". */
const path = process.argv[2] ?? 'levels/demo-4x4.json'
const json = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as LevelJson
const puzzle = loadLevel(json)
const renderer = new Renderer(de, puzzle)
// Full (diagnostic) pipeline incl. contradiction case splits + forcing — so this tool
// can show the trial-and-error a board would need (i.e. WHY it is not human-solvable).
const result = new DeductionEngine(puzzle, { contradiction: true }).solve()

console.log(`\n${json.id ?? path}  →  Rang ${result.maxRank} (${result.difficulty})`)
const counts: Record<string, number> = {}
for (const step of result.steps) counts[step.technique] = (counts[step.technique] ?? 0) + 1
console.log('Techniken:', JSON.stringify(counts))

for (const step of result.steps) {
  if (!step.chain || step.chain.length === 0) continue
  // chain = [assume, ...consequences, contradiction]; consequence count = len - 2
  const consequences = Math.max(0, step.chain.length - 2)
  console.log(`\n[${step.technique}] Kette: ${step.chain.length} Zeilen (${consequences} Folgeschritte)`)
  for (const e of step.chain) console.log('   · ' + renderer.render(e))
}
