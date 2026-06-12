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
import { GroupRoomTechnique } from './techniques/GroupRoomTechnique.ts'
import { MurderTechnique } from './techniques/MurderTechnique.ts'
import { CaseSplitTechnique } from './techniques/CaseSplitTechnique.ts'
import { ForcingTechnique } from './techniques/ForcingTechnique.ts'
import { SearchSolver } from './SearchSolver.ts'
import type { Technique } from './techniques/Technique.ts'
import type { SolveContext } from './SolveContext.ts'
import type { DeductionStep } from './DeductionStep.ts'
import type { Puzzle } from '../model/Puzzle.ts'

/** Options for the technique pipeline. `deepSplit: false` drops the nested case
 *  split — used by the generator's candidate RATING, where its exhaustive failure
 *  mode dominates runtime; anything rated forcing-free without it stays
 *  forcing-free with it, so accepted levels are unaffected. */
export interface TechniqueOptions {
  deepSplit?: boolean
}

/**
 * The pure forward-deduction techniques relevant to this puzzle, easiest first.
 * Each only ever forces a placement or eliminates a provably-impossible cell —
 * no guessing. Irrelevant techniques are dropped so they add no per-node cost
 * inside the search. Shared by the hint engine and the search solver.
 */
export function createForwardTechniques(puzzle: Puzzle, opts: TechniqueOptions = {}): Technique[] {
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
    new GroupRoomTechnique(),
    new MurderTechnique(),
  ].filter((technique) => technique.relevant(puzzle))
  // Case splits propagate the transparent base rules a bounded number of steps per
  // case. The shallow split argues with the base rules only; the deep split may nest
  // ONE depth-1 split inside a case (the rulebook's "but then either … or …" — rated
  // harder), so it only runs when the shallow one stalls. Forcing is the expensive,
  // complete fallback: it proves impossible cells WITH a readable consequence chain
  // (exhaustive search for the deep cases), and so goes last — ideally never needed.
  return [
    ...base,
    new CaseSplitTechnique(base, 1),
    ...(opts.deepSplit === false ? [] : [new CaseSplitTechnique(base, 2)]),
    new ForcingTechnique(base, new SearchSolver(puzzle)),
  ]
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
