import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadLevel } from '../io/LevelLoader.ts'
import { DeductionEngine } from './DeductionEngine.ts'
import { SearchSolver } from './SearchSolver.ts'
import { findMurderer } from './murderer.ts'
import { SolveContext } from './SolveContext.ts'
import { createForwardTechniques, propagate } from './forward.ts'
import { unsatisfiedClues } from './diagnose.ts'
import type { LevelJson } from '../io/LevelSchema.ts'

/**
 * Regression coverage for the two constructive techniques added for hand-made medium/hard
 * levels: the "no empty room" room split ({@link RoomBijectionTechnique}) and the
 * beside-the-same-object per-cell / partner-forcing refinement of SameObjectTechnique.
 *
 * Data-driven over the bundled `levels/` folder so every Balkon-/Fall-named level (the
 * originals AND any variants) is checked — each must be unique, solve by pure forward
 * deduction, AND genuinely NEED its technique: removing that one technique must leave the
 * pure-forward solver stuck. That last check is what proves the new code actually runs.
 */
const dir = resolve(process.cwd(), 'levels')
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
const readLevel = (f: string): LevelJson => JSON.parse(readFileSync(resolve(dir, f), 'utf8'))

/** Solve by PURE forward deduction (base techniques only — no case split), optionally with
 *  one technique removed. Returns whether it reaches a complete, valid placement. */
function forwardSolves(level: LevelJson, exclude?: string): boolean {
  const puzzle = loadLevel(level)
  const ctx = SolveContext.create(puzzle)
  const occ = ctx.board.occupiableCells()
  for (const person of ctx.people) {
    const d = new Set(occ)
    for (const clue of person.clues) {
      const cells = clue.candidateCells(ctx.board)
      if (cells) for (const c of [...d]) if (!cells.has(c)) d.delete(c)
    }
    ctx.state.setDomain(person.id, d)
  }
  const techs = createForwardTechniques(puzzle, { noCaseSplit: true }).filter(
    (t) => !exclude || t.name !== exclude,
  )
  propagate(ctx, techs)
  return ctx.state.unplaced().length === 0 && unsatisfiedClues(puzzle, ctx.state.placed).length === 0
}

// Match the original base names AND their variants (…_v1.json, …), but nothing else.
for (const [group, prefix, technique] of [
  ['roomBijection', 'Der_gro_e_Balkon', 'roomBijection'],
  ['sameObject (beside-same-object)', 'Der_Fall_zu_Hause', 'sameObject'],
] as const) {
  const group_files = files.filter((f) => f.startsWith(prefix))
  describe(`${group} levels`, () => {
    it(`has at least one ${prefix} level bundled`, () => {
      expect(group_files.length).toBeGreaterThan(0)
    })
    for (const f of group_files) {
      describe(f, () => {
        const level = readLevel(f)
        const puzzle = loadLevel(level)

        it('has exactly one solution', () => {
          expect(new SearchSolver(puzzle).countSolutions(2)).toBe(1)
        })

        it('solves by pure forward deduction and names a murderer', () => {
          const res = new DeductionEngine(puzzle).solve()
          expect(res.solved).toBe(true)
          expect((res.techniqueCounts['forcing'] ?? 0) + (res.techniqueCounts['satForcing'] ?? 0)).toBe(0)
          const murderer = res.steps.find((s) => s.technique === 'murderer')?.personId
          expect(murderer).toBeTruthy()
          const ref = new SearchSolver(puzzle).firstSolution()
          expect(findMurderer(puzzle, ref!).suspectId).toBe(murderer)
        })

        it(`genuinely needs the ${technique} technique (stuck without it)`, () => {
          expect(forwardSolves(level)).toBe(true)
          expect(forwardSolves(level, technique)).toBe(false)
        })
      })
    }
  })
}
