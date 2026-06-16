import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { DeductionEngine, loadLevel, type LevelJson } from '../engine/index.ts'

/** Audit every level: is it solvable by the human engine (forward + convergent, no
 *  contradiction)? If not, what does the FULL (diagnostic) engine need — i.e. WHY is it
 *  not human-solvable? Run: npx tsx src/dev/audit-human.ts [dir] */
const dir = resolve(process.cwd(), process.argv[2] ?? 'levels')
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

const rows: string[] = []
let humanOk = 0
let needsTrial = 0
const trialKinds: Record<string, number> = {}

for (const file of files.sort()) {
  let level: LevelJson
  try {
    level = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as LevelJson
  } catch {
    continue
  }
  const puzzle = loadLevel(level)
  const human = new DeductionEngine(puzzle).solve()
  const declared = (level as { difficulty?: string }).difficulty ?? '?'
  if (human.solved) {
    humanOk++
    rows.push(`OK    ${file.padEnd(34)} ${declared.padEnd(10)} → Rang ${human.maxRank} (${human.difficulty})`)
  } else {
    needsTrial++
    const full = new DeductionEngine(puzzle, { contradiction: true }).solve()
    const trial = Object.entries(full.techniqueCounts)
      .filter(([t]) => ['caseSplit', 'caseSplitDeep', 'forcing', 'satForcing'].includes(t))
      .map(([t, n]) => `${t}×${n}`)
      .join(', ')
    for (const [t, n] of Object.entries(full.techniqueCounts)) {
      if (['caseSplit', 'caseSplitDeep', 'forcing', 'satForcing'].includes(t)) {
        trialKinds[t] = (trialKinds[t] ?? 0) + (n as number)
      }
    }
    const tag = full.solved ? `braucht: ${trial || '?'}` : 'NICHT lösbar (auch voll nicht)'
    rows.push(`TRIAL ${file.padEnd(34)} ${declared.padEnd(10)} → ${tag}`)
  }
}

for (const r of rows) console.log(r)
console.log(`\n${files.length} Level · ${humanOk} menschlich lösbar · ${needsTrial} brauchen Probieren`)
if (needsTrial > 0) console.log('Probier-Techniken gesamt:', JSON.stringify(trialKinds))
