import type { Cell, Explanation, PersonId } from '../model/types.ts'
import type { Solution } from '../model/Solution.ts'

export type Technique =
  | 'clueCandidates'
  | 'nakedSingle'
  | 'uniqueConstraint'
  | 'hiddenSingleRow'
  | 'hiddenSingleCol'
  | 'relational'
  | 'nakedGroupRows'
  | 'nakedGroupCols'
  | 'rectangle'
  | 'insideXor'
  | 'boardCount'
  | 'roomReasoning'
  | 'murderRule'
  | 'forcing'
  | 'satForcing'
  | 'victim'
  | 'murderer'
  | 'stuck'

/** Cells removed from a person's domain as a consequence of a step. */
export interface Elimination {
  personId: PersonId
  cells: Cell[]
}

/** One explainable deduction — the unit consumed by hints and difficulty rating. */
export interface DeductionStep {
  technique: Technique
  personId?: PersonId
  placedCell?: Cell
  candidates?: Cell[]
  eliminated?: Elimination[]
  explanation: Explanation
  /** For proof-by-contradiction steps: the readable chain of consequences that
   *  the assumption triggers, ending in the contradiction. */
  chain?: Explanation[]
}

/**
 * How a hint's highlighted cells should be read:
 * - `place`   the single cell a person is forced onto;
 * - `narrow`  every cell that person can still occupy after the deduction;
 * - `exclude` cells that can now be ruled out (crossed) for someone.
 */
export type HintKind = 'place' | 'narrow' | 'exclude'

/** A hint = the next deduction plus the cells to highlight for it on the board. */
export interface HintResult {
  step: DeductionStep
  focus: Cell[]
  kind: HintKind
}

/**
 * Hints already shown this round, fed back so pressing "hint" again advances to the
 * NEXT deduction instead of repeating (a step-through of the solution). Reset when
 * the player actually changes the board.
 */
export interface HintProgress {
  placed: ReadonlyMap<PersonId, Cell>
  eliminated: ReadonlyMap<PersonId, ReadonlySet<Cell>>
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'

/** How advanced each technique is — drives the difficulty rating. */
export const TECHNIQUE_RANK: Record<Technique, number> = {
  clueCandidates: 0,
  murderer: 0,
  stuck: 0,
  nakedSingle: 1,
  uniqueConstraint: 1,
  victim: 1,
  hiddenSingleRow: 2,
  hiddenSingleCol: 2,
  relational: 3,
  nakedGroupRows: 3,
  nakedGroupCols: 3,
  rectangle: 3,
  insideXor: 3,
  boardCount: 4,
  roomReasoning: 4,
  murderRule: 5,
  forcing: 6,
  satForcing: 7,
}

export function difficultyOf(maxRank: number): Difficulty {
  if (maxRank <= 1) return 'easy'
  if (maxRank <= 3) return 'medium'
  if (maxRank <= 6) return 'hard'
  return 'expert'
}

export interface DeductionResult {
  steps: DeductionStep[]
  solution: Solution | null
  solved: boolean
  /** Engine-relative difficulty: tier + the hardest technique rank used. */
  difficulty: Difficulty
  maxRank: number
  techniqueCounts: Record<string, number>
}
