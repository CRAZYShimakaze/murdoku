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

  private ccBoard: Board | null = null
  private ccCells: Set<Cell> | null = null

  /**
   * Memoised per board (single entry, keyed by Board identity): the set is a pure function
   * of (clue, board), and the generator rates hundreds of full deductions per attempt against
   * the SAME board — recomputing the board scans every time was 11% of its whole runtime.
   * Subclasses implement `computeCandidateCells`; nobody overrides THIS. Because the set is
   * shared between solves, callers must never mutate it (all engine consumers only read;
   * the composites copy before intersecting — audited, keep it that way).
   */
  candidateCells(board: Board): Set<Cell> | null {
    if (this.ccBoard !== board) {
      this.ccBoard = board
      this.ccCells = this.computeCandidateCells(board)
    }
    return this.ccCells
  }

  /** The actual candidate-set logic — override this, never `candidateCells` (see there).
   *  Default: relational/social clues have no fixed set. */
  protected computeCandidateCells(_board: Board): Set<Cell> | null {
    return null
  }

  /**
   * Cells where this clue is GUARANTEED true no matter where anyone else stands —
   * so its negation may safely exclude exactly these. `null` (the default) when no
   * such guarantee exists (relational / social / uniqueness clues): there the
   * negation prunes nothing and is decided by `test` instead. Only ever a SUBSET of
   * "true" cells, so negating it never removes a legitimate placement.
   */
  definiteCells(_board: Board): Set<Cell> | null {
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
  protected abstract override computeCandidateCells(board: Board): Set<Cell>

  override test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    // Non-null by contract: computeCandidateCells returns a concrete Set for unary clues.
    return this.candidateCells(puzzle.board)!.has(solution.cellOf(subjectId))
  }

  // A unary clue is true exactly on its candidate cells (independent of others), so
  // those are also its definite cells. Subclasses that add an others-dependent check
  // (e.g. occupancy) override this to null (hence the nullable return type).
  override definiteCells(board: Board): Set<Cell> | null {
    return this.candidateCells(board)
  }
}
