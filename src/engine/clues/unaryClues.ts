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

/** "{name} was beside one of these objects." (any of a list — reads as one phrase) */
export class NearAnyObjectClue extends UnaryClue {
  constructor(readonly objects: string[]) {
    super()
  }
  candidateCells(board: Board): Set<Cell> {
    const out = new Set<Cell>()
    for (const object of this.objects) for (const c of board.cellsNearObject(object)) out.add(c)
    return out
  }
  describe(): Explanation {
    return { key: 'clue.nearObjectAny', params: { objects: this.objects.join(',') } }
  }
}

/** "{name} was beside a door." (doors are two-sided) */
export class NearDoorClue extends UnaryClue {
  candidateCells(board: Board): Set<Cell> {
    return board.cellsNearDoor()
  }
  describe(): Explanation {
    return { key: 'clue.nearDoor' }
  }
}

/** "{name} was outside / inside." (outdoor area vs indoor room) */
export class OutsideClue extends UnaryClue {
  constructor(readonly outside: boolean) {
    super()
  }
  candidateCells(board: Board): Set<Cell> {
    return board.cellsOutside(this.outside)
  }
  describe(): Explanation {
    return { key: this.outside ? 'clue.outside' : 'clue.inside' }
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

/** "{name} was beside a wall." (at least one side is a wall) */
export class AtWallClue extends UnaryClue {
  candidateCells(board: Board): Set<Cell> {
    return board.cellsAtWall()
  }
  describe(): Explanation {
    return { key: 'clue.atWall' }
  }
}
