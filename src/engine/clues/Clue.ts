import type { Board } from '../model/Board.ts'
import type { Solution } from '../model/Solution.ts'
import type { Puzzle } from '../model/Puzzle.ts'
import type { Cell, Explanation, PersonId } from '../model/types.ts'

/**
 * A clue constrains where a subject (a suspect) can stand.
 *
 * - `test` validates a complete solution. It receives the whole puzzle so
 *   social clues can inspect other people's rooms and attributes.
 * - `candidateCells` returns the fixed set of cells a subject could occupy
 *   considering only this clue (used for deduction). Relational/social clues
 *   return `null` because their candidates depend on other people.
 * - `forbiddenForOthers` returns cells no other person may occupy when the clue
 *   holds (e.g. "only person on a carpet").
 * - `describe` returns an i18n descriptor — never hard-coded text.
 */
export abstract class Clue {
  abstract test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean

  candidateCells(_board: Board): Set<Cell> | null {
    return null
  }

  forbiddenForOthers(_board: Board): Set<Cell> | null {
    return null
  }

  /**
   * True if the PARTIAL placement already makes this clue impossible to satisfy
   * (used to prune the search early). Must never be a false positive. Default:
   * only decidable when complete, so returns false here.
   */
  violatedBy(
    _subjectId: PersonId,
    _placement: ReadonlyMap<PersonId, Cell>,
    _puzzle: Puzzle,
  ): boolean {
    return false
  }

  abstract describe(): Explanation
}

/** Base for clues whose candidate set is fixed and independent of other people. */
export abstract class UnaryClue extends Clue {
  abstract override candidateCells(board: Board): Set<Cell>

  override test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    return this.candidateCells(puzzle.board).has(solution.cellOf(subjectId))
  }
}
