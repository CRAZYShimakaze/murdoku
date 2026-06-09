import { NakedSingleTechnique } from './techniques/NakedSingleTechnique.ts'
import { UniqueConstraintTechnique } from './techniques/UniqueConstraintTechnique.ts'
import { HiddenSingleTechnique } from './techniques/HiddenSingleTechnique.ts'
import { RelationalTechnique } from './techniques/RelationalTechnique.ts'
import { SameObjectTechnique } from './techniques/SameObjectTechnique.ts'
import { NakedGroupTechnique } from './techniques/NakedGroupTechnique.ts'
import { RectangleTechnique } from './techniques/RectangleTechnique.ts'
import { InsideXorTechnique } from './techniques/InsideXorTechnique.ts'
import { BoardCountTechnique } from './techniques/BoardCountTechnique.ts'
import { RoomReasoningTechnique } from './techniques/RoomReasoningTechnique.ts'
import { RoomCoverageTechnique } from './techniques/RoomCoverageTechnique.ts'
import { RoomCapacityTechnique } from './techniques/RoomCapacityTechnique.ts'
import { MurderTechnique } from './techniques/MurderTechnique.ts'
import { ForcingTechnique } from './techniques/ForcingTechnique.ts'
import { SearchSolver } from './SearchSolver.ts'
import type { Technique } from './techniques/Technique.ts'
import type { SolveContext } from './SolveContext.ts'
import type { DeductionStep } from './DeductionStep.ts'
import type { Puzzle } from '../model/Puzzle.ts'

/**
 * The pure forward-deduction techniques relevant to this puzzle, easiest first.
 * Each only ever forces a placement or eliminates a provably-impossible cell —
 * no guessing. Irrelevant techniques are dropped so they add no per-node cost
 * inside the search. Shared by the hint engine and the search solver.
 */
export function createForwardTechniques(puzzle: Puzzle): Technique[] {
  const base: Technique[] = [
    new NakedSingleTechnique(),
    new UniqueConstraintTechnique(),
    new HiddenSingleTechnique('row'),
    new HiddenSingleTechnique('col'),
    new RelationalTechnique(),
    new SameObjectTechnique(),
    new NakedGroupTechnique('row'),
    new NakedGroupTechnique('col'),
    new RectangleTechnique(),
    new InsideXorTechnique(),
    new BoardCountTechnique(),
    new RoomReasoningTechnique(),
    new RoomCoverageTechnique(),
    new RoomCapacityTechnique(),
    new MurderTechnique(),
  ].filter((technique) => technique.relevant(puzzle))
  // Forcing is the expensive, complete fallback: it focuses on the person with the
  // fewest options, proves impossible cells WITH a readable consequence chain
  // (transparent where possible, exhaustive search for the deep cases), and so goes last.
  return [...base, new ForcingTechnique(base, new SearchSolver(puzzle))]
}

/** Apply the techniques to a fixpoint, returning the steps taken (in order). */
export function propagate(ctx: SolveContext, techniques: Technique[]): DeductionStep[] {
  const steps: DeductionStep[] = []
  let progress = true
  while (progress && ctx.state.unplaced().length > 0) {
    progress = false
    for (const technique of techniques) {
      const step = technique.apply(ctx)
      if (step) {
        steps.push(step)
        progress = true
        break
      }
    }
  }
  return steps
}
