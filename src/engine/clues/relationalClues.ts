import { Clue } from './Clue.ts'
import { inDirection8 } from '../model/types.ts'
import type { Solution } from '../model/Solution.ts'
import type { Puzzle } from '../model/Puzzle.ts'
import type { Cell, Direction, Direction8, Explanation, PersonId } from '../model/types.ts'

/** "{name} and {target} were one inside and one outside." (opposite areas) */
export class InsideXorClue extends Clue {
  constructor(readonly target: PersonId) {
    super()
  }

  test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const a = puzzle.board.isOutside(solution.cellOf(subjectId))
    const b = puzzle.board.isOutside(solution.cellOf(this.target))
    return a !== b
  }

  override violatedBy(
    subjectId: PersonId,
    placement: ReadonlyMap<PersonId, Cell>,
    puzzle: Puzzle,
  ): boolean {
    const a = placement.get(subjectId)
    const b = placement.get(this.target)
    if (a === undefined || b === undefined) return false
    return puzzle.board.isOutside(a) === puzzle.board.isOutside(b)
  }

  describe(): Explanation {
    return { key: 'clue.insideXor', params: { target: this.target } }
  }
}

/**
 * "{name} was {direction} of {target}." Cardinals are half-planes (south = any
 * cell strictly below); diagonals mean BOTH cardinals (southwest = below AND
 * left), not only the diagonal line.
 */
export class DirectionClue extends Clue {
  constructor(
    readonly target: PersonId,
    readonly direction: Direction8,
  ) {
    super()
  }

  test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const s = puzzle.board.rc(solution.cellOf(subjectId))
    const t = puzzle.board.rc(solution.cellOf(this.target))
    return inDirection8(this.direction, s, t)
  }

  override violatedBy(
    subjectId: PersonId,
    placement: ReadonlyMap<PersonId, Cell>,
    puzzle: Puzzle,
  ): boolean {
    const s = placement.get(subjectId)
    const t = placement.get(this.target)
    if (s === undefined || t === undefined) return false
    return !inDirection8(this.direction, puzzle.board.rc(s), puzzle.board.rc(t))
  }

  describe(): Explanation {
    return {
      key: 'clue.direction',
      params: { direction: this.direction, target: this.target },
    }
  }
}

/**
 * "{name} was in the same room as {target}." With `alone`, the two share the room
 * AND nobody else is there (no other suspect, not even the victim) — "alone with X".
 */
export class SameRoomClue extends Clue {
  constructor(
    readonly target: PersonId,
    readonly alone = false,
  ) {
    super()
  }

  test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const board = puzzle.board
    const room = board.roomIdOf(solution.cellOf(subjectId))
    if (board.roomIdOf(solution.cellOf(this.target)) !== room) return false
    if (!this.alone) return true
    for (const id of puzzle.allIds()) {
      if (id === subjectId || id === this.target) continue
      if (board.roomIdOf(solution.cellOf(id)) === room) return false
    }
    return true
  }

  override violatedBy(
    subjectId: PersonId,
    placement: ReadonlyMap<PersonId, Cell>,
    puzzle: Puzzle,
  ): boolean {
    const board = puzzle.board
    const s = placement.get(subjectId)
    const t = placement.get(this.target)
    if (s !== undefined && t !== undefined && board.roomIdOf(s) !== board.roomIdOf(t)) return true
    if (this.alone && s !== undefined) {
      const room = board.roomIdOf(s)
      for (const [id, c] of placement) {
        if (id === subjectId || id === this.target) continue
        if (board.roomIdOf(c) === room) return true
      }
    }
    return false
  }

  describe(): Explanation {
    return { key: this.alone ? 'clue.aloneSameRoom' : 'clue.sameRoom', params: { target: this.target } }
  }
}

/** "{name} was exactly {distance} column(s)/row(s) {direction} of {target}." */
export class OffsetClue extends Clue {
  constructor(
    readonly target: PersonId,
    readonly direction: Direction,
    readonly distance: number,
  ) {
    super()
  }

  /** Whether this offset is along columns, and the signed delta to apply. */
  resolve(): { isColumn: boolean; delta: number } {
    const isColumn = this.direction === 'west' || this.direction === 'east'
    const negative = this.direction === 'west' || this.direction === 'north'
    return { isColumn, delta: negative ? -this.distance : this.distance }
  }

  test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const { isColumn, delta } = this.resolve()
    const s = puzzle.board.rc(solution.cellOf(subjectId))
    const t = puzzle.board.rc(solution.cellOf(this.target))
    const sc = isColumn ? s.col : s.row
    const tc = isColumn ? t.col : t.row
    return sc === tc + delta
  }

  override violatedBy(
    subjectId: PersonId,
    placement: ReadonlyMap<PersonId, Cell>,
    puzzle: Puzzle,
  ): boolean {
    const s = placement.get(subjectId)
    const t = placement.get(this.target)
    if (s === undefined || t === undefined) return false
    const { isColumn, delta } = this.resolve()
    const sub = puzzle.board.rc(s)
    const tar = puzzle.board.rc(t)
    const sc = isColumn ? sub.col : sub.row
    const tc = isColumn ? tar.col : tar.row
    return sc !== tc + delta
  }

  describe(): Explanation {
    const key =
      'clue.offset' + this.direction.charAt(0).toUpperCase() + this.direction.slice(1)
    return { key, params: { n: this.distance, target: this.target } }
  }
}
