import { Clue } from './Clue.ts'
import type { Board } from '../model/Board.ts'
import type { Solution } from '../model/Solution.ts'
import type { Puzzle } from '../model/Puzzle.ts'
import type { Cell, Explanation, PersonId } from '../model/types.ts'

/**
 * "{name} was the only person on a {object}." The subject stands on the object
 * and no other person does. `candidateCells` prunes the subject to the object's
 * cells; `forbiddenForOthers` keeps everyone else off those cells; `test`
 * verifies the "only" part across the whole solution.
 */
export class UniqueOnObjectClue extends Clue {
  constructor(readonly object: string) {
    super()
  }

  override candidateCells(board: Board): Set<Cell> {
    return board.cellsWithObject(this.object)
  }

  override forbiddenForOthers(board: Board): Set<Cell> {
    return board.cellsWithObject(this.object)
  }

  test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const onObject = puzzle.board.cellsWithObject(this.object)
    if (!onObject.has(solution.cellOf(subjectId))) return false
    for (const [id, cell] of solution.entries()) {
      if (id !== subjectId && onObject.has(cell)) return false
    }
    return true
  }

  override violatedBy(
    subjectId: PersonId,
    placement: ReadonlyMap<PersonId, Cell>,
    puzzle: Puzzle,
  ): boolean {
    const onObject = puzzle.board.cellsWithObject(this.object)
    const subjectCell = placement.get(subjectId)
    if (subjectCell !== undefined && !onObject.has(subjectCell)) return true
    for (const [id, c] of placement) {
      if (id !== subjectId && onObject.has(c)) return true
    }
    return false
  }

  describe(): Explanation {
    return { key: 'clue.uniqueOnObject', params: { object: this.object } }
  }
}

/**
 * "{name} was the only person beside a window." The subject is beside a window
 * and no other person is. Mirrors {@link UniqueOnObjectClue} over the window set.
 */
export class UniqueNearWindowClue extends Clue {
  override candidateCells(board: Board): Set<Cell> {
    return board.cellsNearWindow()
  }

  override forbiddenForOthers(board: Board): Set<Cell> {
    return board.cellsNearWindow()
  }

  test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const nearWindow = puzzle.board.cellsNearWindow()
    if (!nearWindow.has(solution.cellOf(subjectId))) return false
    for (const [id, cell] of solution.entries()) {
      if (id !== subjectId && nearWindow.has(cell)) return false
    }
    return true
  }

  override violatedBy(
    subjectId: PersonId,
    placement: ReadonlyMap<PersonId, Cell>,
    puzzle: Puzzle,
  ): boolean {
    const nearWindow = puzzle.board.cellsNearWindow()
    const subjectCell = placement.get(subjectId)
    if (subjectCell !== undefined && !nearWindow.has(subjectCell)) return true
    for (const [id, c] of placement) {
      if (id !== subjectId && nearWindow.has(c)) return true
    }
    return false
  }

  describe(): Explanation {
    return { key: 'clue.uniqueNearWindow' }
  }
}
