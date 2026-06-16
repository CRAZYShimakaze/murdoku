import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadLevel, SearchSolver } from '../engine/index.ts'
import type { LevelJson } from '../engine/index.ts'
import { SolveContext } from '../engine/solver/SolveContext.ts'
import { createForwardTechniques } from '../engine/solver/forward.ts'

/** For every level: run the FULL pipeline step by step and assert no step ever removes a
 *  cell that belongs to a real solution (checked against ALL solutions, so a unique level's
 *  answer must always survive). Catches unsound techniques. */
const dir = resolve(process.cwd(), 'levels')
let bad = 0
let checked = 0
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  let level: LevelJson
  try {
    level = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as LevelJson
  } catch {
    continue
  }
  const p = loadLevel(level)
  const sols = new SearchSolver(p).allSolutions(50)
  if (sols.length === 0) continue
  checked++
  const ctx = SolveContext.create(p)
  const occ = ctx.board.occupiableCells()
  for (const person of ctx.people) {
    const d = new Set<number>(occ)
    for (const clue of person.clues) {
      const cells = clue.candidateCells(ctx.board)
      if (cells) for (const c of [...d]) if (!cells.has(c)) d.delete(c)
    }
    ctx.state.setDomain(person.id, d)
  }
  // A step is unsound if it makes EVERY remaining solution impossible (placed wrong, or a
  // person's whole every-solution cell set removed). Conservative per-solution survival:
  const survives = (): boolean =>
    sols.some((s) =>
      [...s.entries()].every(([id, cell]) =>
        ctx.state.placed.has(id) ? ctx.state.placed.get(id) === cell : ctx.state.domain(id).has(cell),
      ),
    )
  const techs = createForwardTechniques(p, { contradiction: true })
  let unsound = ''
  outer: for (let i = 0; i < 3000; i++) {
    for (const t of techs) {
      const step = t.apply(ctx)
      if (step) {
        if (!survives()) {
          unsound = `${step.technique} (${JSON.stringify(step.explanation.key)})`
          break outer
        }
        break
      }
      if (t === techs[techs.length - 1]) break outer // fixpoint
    }
  }
  if (unsound) {
    bad++
    console.log(`UNSOUND  ${file}  → ${unsound}`)
  }
}
console.log(`\n${checked} Level geprüft · ${bad} unsound`)
