import { UnaryClue } from './Clue.ts'
import { inDirection8 } from '../model/types.ts'
import type { Board } from '../model/Board.ts'
import type { Cell, Direction8, Explanation } from '../model/types.ts'

/**
 * Object-relative clues. Because object positions are FIXED on the board, these
 * are ordinary deducible UnaryClues: the candidate set is computed once from the
 * object cells (no dependency on where other people stand).
 */

/** Which line a person shares with the object. */
export type LineKind = 'col' | 'row' | 'either'
/** Optional room qualifier tying the object's room to the person's. */
export type RoomRel = 'any' | 'same' | 'other'

function roomRelOk(rel: RoomRel, sameRoom: boolean): boolean {
  return rel === 'any' ? true : rel === 'same' ? sameRoom : !sameRoom
}

/** Object cells with their pre-resolved {row,col} and room id. */
function objectsOf(board: Board, type: string): { row: number; col: number; room: string }[] {
  return board.objectCells(type).map((c) => ({ ...board.rc(c), room: board.roomIdOf(c) }))
}

/** "{name} was in the same column/row as a {object}" (optionally same/other room). */
export class SameLineAsObjectClue extends UnaryClue {
  constructor(
    readonly object: string,
    readonly line: LineKind,
    readonly room: RoomRel,
  ) {
    super()
  }

  candidateCells(board: Board): Set<Cell> {
    const objs = objectsOf(board, this.object)
    const out = new Set<Cell>()
    for (const cell of board.occupiableCells()) {
      const s = board.rc(cell)
      const sRoom = board.roomIdOf(cell)
      for (const o of objs) {
        const lineOk =
          this.line === 'col'
            ? s.col === o.col
            : this.line === 'row'
              ? s.row === o.row
              : s.col === o.col || s.row === o.row
        if (lineOk && roomRelOk(this.room, o.room === sRoom)) {
          out.add(cell)
          break
        }
      }
    }
    return out
  }

  describe(): Explanation {
    return {
      key: 'clue.sameLineAsObject',
      params: { object: this.object, line: this.line, roomRel: this.room },
    }
  }
}

/** "{name} was {dir} of a {object}" (optionally same/other room). */
export class DirectionFromObjectClue extends UnaryClue {
  constructor(
    readonly object: string,
    readonly direction: Direction8,
    readonly room: RoomRel,
  ) {
    super()
  }

  candidateCells(board: Board): Set<Cell> {
    const objs = objectsOf(board, this.object)
    const out = new Set<Cell>()
    for (const cell of board.occupiableCells()) {
      const s = board.rc(cell)
      const sRoom = board.roomIdOf(cell)
      for (const o of objs) {
        if (inDirection8(this.direction, s, o) && roomRelOk(this.room, o.room === sRoom)) {
          out.add(cell)
          break
        }
      }
    }
    return out
  }

  describe(): Explanation {
    return {
      key: 'clue.directionFromObject',
      params: { object: this.object, direction: this.direction, roomRel: this.room },
    }
  }
}
