import { UnaryClue } from './Clue.ts'
import type { Board } from '../model/Board.ts'
import type { Cell, Explanation } from '../model/types.ts'

/** "{name} was on a {object}." */
export class OnObjectClue extends UnaryClue {
  constructor(readonly object: string) {
    super()
  }
  candidateCells(board: Board): Set<Cell> {
    return board.cellsWithObject(this.object)
  }
  describe(): Explanation {
    return { key: 'clue.onObject', params: { object: this.object } }
  }
}

/** "{name} was beside a {object}." (orthogonal + same room) */
export class NearObjectClue extends UnaryClue {
  constructor(readonly object: string) {
    super()
  }
  candidateCells(board: Board): Set<Cell> {
    return board.cellsNearObject(this.object)
  }
  describe(): Explanation {
    return { key: 'clue.nearObject', params: { object: this.object } }
  }
}

/** "{name} was beside a window." */
export class NearWindowClue extends UnaryClue {
  candidateCells(board: Board): Set<Cell> {
    return board.cellsNearWindow()
  }
  describe(): Explanation {
    return { key: 'clue.nearWindow' }
  }
}

/** "{name} was in {room}." */
export class InRoomClue extends UnaryClue {
  constructor(readonly room: string) {
    super()
  }
  candidateCells(board: Board): Set<Cell> {
    return board.cellsInRoom(this.room)
  }
  describe(): Explanation {
    return { key: 'clue.inRoom', params: { room: this.room } }
  }
}

/** "{name} was in row {row}." (row is 0-indexed internally) */
export class InRowClue extends UnaryClue {
  constructor(readonly row: number) {
    super()
  }
  candidateCells(board: Board): Set<Cell> {
    return board.cellsInRow(this.row)
  }
  describe(): Explanation {
    return { key: 'clue.inRow', params: { row: this.row + 1 } }
  }
}

/** "{name} was in column {col}." (col is 0-indexed internally) */
export class InColClue extends UnaryClue {
  constructor(readonly col: number) {
    super()
  }
  candidateCells(board: Board): Set<Cell> {
    return board.cellsInCol(this.col)
  }
  describe(): Explanation {
    return { key: 'clue.inCol', params: { col: this.col + 1 } }
  }
}

/** "{name} was in a corner." */
export class CornerClue extends UnaryClue {
  candidateCells(board: Board): Set<Cell> {
    return board.cornerCells()
  }
  describe(): Explanation {
    return { key: 'clue.corner' }
  }
}
