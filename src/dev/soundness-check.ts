import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { DeductionEngine, SearchSolver, loadLevel, type LevelJson } from '../engine/index.ts'

// For every bundled level: take the (unique) reference solution and replay the pure
// deduction. A technique is UNSOUND if any step ever eliminates a person's true cell.
const dir = resolve(process.cwd(), 'levels')
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()

let unsound = 0
let checked = 0
for (const file of files) {
  const json = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as LevelJson
  const puzzle = loadLevel(json)
  const solution = new SearchSolver(puzzle).firstSolution()
  if (!solution) continue
  checked++
  const truth = new Map<string, number>()
  for (const [id, cell] of solution.entries()) truth.set(id, cell)

  const result = new DeductionEngine(puzzle).solve()
  for (const step of result.steps) {
    for (const elim of step.eliminated ?? []) {
      const trueCell = truth.get(elim.personId)
      if (trueCell !== undefined && elim.cells.includes(trueCell)) {
        unsound++
        console.log(`✗ UNSOUND ${file}: "${step.technique}" removed ${elim.personId}'s true cell ${trueCell}`)
      }
    }
    if (step.personId !== undefined && step.placedCell !== undefined) {
      const trueCell = truth.get(step.personId)
      if (trueCell !== undefined && step.placedCell !== trueCell) {
        unsound++
        console.log(`✗ UNSOUND ${file}: "${step.technique}" placed ${step.personId} on ${step.placedCell} ≠ true ${trueCell}`)
      }
    }
  }
}
console.log(`\n${checked} Level geprüft · ${unsound} unsound`)
