import type { Cell, Side } from './types.ts'
import type { Tile } from './Tile.ts'
import type { Room } from './Room.ts'

/** Canonical key for the edge on a given side of tile (row,col). */
export function edgeKey(row: number, col: number, side: Side): string {
  switch (side) {
    case 'N':
      return `h:${row}:${col}`
    case 'S':
      return `h:${row + 1}:${col}`
    case 'W':
      return `v:${row}:${col}`
    case 'E':
      return `v:${row}:${col + 1}`
  }
}

/**
 * The static layout of a level: the grid of tiles, its rooms, and window edges.
 * Walls and corners are derived from room membership — they are not stored.
 */
export class Board {
  private readonly occupiable: Cell[] = []

  constructor(
    readonly width: number,
    readonly height: number,
    readonly tiles: readonly Tile[],
    readonly rooms: ReadonlyMap<string, Room>,
    private readonly windowEdges: ReadonlySet<string>,
  ) {
    for (let c = 0; c < tiles.length; c++) {
      if (tiles[c].occupiable) this.occupiable.push(c)
    }
  }

  idx(row: number, col: number): Cell {
    return row * this.width + col
  }

  rc(cell: Cell): { row: number; col: number } {
    return { row: Math.floor(cell / this.width), col: cell % this.width }
  }

  inBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.height && col >= 0 && col < this.width
  }

  tileAt(cell: Cell): Tile {
    return this.tiles[cell]
  }

  roomIdOf(cell: Cell): string {
    return this.tiles[cell].roomId
  }

  isOccupiable(cell: Cell): boolean {
    return this.tiles[cell].occupiable
  }

  /** All occupiable cells, in ascending index order. */
  occupiableCells(): readonly Cell[] {
    return this.occupiable
  }

  /** Orthogonal (N/E/S/W) in-bounds neighbours of a cell. */
  neighbors4(cell: Cell): Cell[] {
    const { row, col } = this.rc(cell)
    const out: Cell[] = []
    if (this.inBounds(row - 1, col)) out.push(this.idx(row - 1, col))
    if (this.inBounds(row + 1, col)) out.push(this.idx(row + 1, col))
    if (this.inBounds(row, col - 1)) out.push(this.idx(row, col - 1))
    if (this.inBounds(row, col + 1)) out.push(this.idx(row, col + 1))
    return out
  }

  /** Whether any of the cell's four sides carries a window. */
  hasWindow(cell: Cell): boolean {
    const { row, col } = this.rc(cell)
    return (
      this.windowEdges.has(`h:${row}:${col}`) ||
      this.windowEdges.has(`h:${row + 1}:${col}`) ||
      this.windowEdges.has(`v:${row}:${col}`) ||
      this.windowEdges.has(`v:${row}:${col + 1}`)
    )
  }

  /** A cell is a corner of its room when two perpendicular sides are walls. */
  isCorner(cell: Cell): boolean {
    const { row, col } = this.rc(cell)
    const room = this.tiles[cell].roomId
    const wall = (r: number, c: number): boolean =>
      !this.inBounds(r, c) || this.tiles[this.idx(r, c)].roomId !== room
    const n = wall(row - 1, col)
    const s = wall(row + 1, col)
    const w = wall(row, col - 1)
    const e = wall(row, col + 1)
    return (n && e) || (e && s) || (s && w) || (w && n)
  }

  // --- candidate-set helpers used by clues -------------------------------

  /** Occupiable cells whose tile carries the given object type. */
  cellsWithObject(type: string): Set<Cell> {
    const out = new Set<Cell>()
    for (const cell of this.occupiable) {
      if (this.tiles[cell].hasObjectType(type)) out.add(cell)
    }
    return out
  }

  /** Occupiable cells with a same-room orthogonal neighbour carrying `type`. */
  cellsNearObject(type: string): Set<Cell> {
    const out = new Set<Cell>()
    for (const cell of this.occupiable) {
      const room = this.tiles[cell].roomId
      for (const nb of this.neighbors4(cell)) {
        if (this.tiles[nb].roomId === room && this.tiles[nb].hasObjectType(type)) {
          out.add(cell)
          break
        }
      }
    }
    return out
  }

  /** Occupiable cells adjacent to a window. */
  cellsNearWindow(): Set<Cell> {
    const out = new Set<Cell>()
    for (const cell of this.occupiable) {
      if (this.hasWindow(cell)) out.add(cell)
    }
    return out
  }

  cellsInRoom(roomId: string): Set<Cell> {
    const out = new Set<Cell>()
    for (const cell of this.occupiable) {
      if (this.tiles[cell].roomId === roomId) out.add(cell)
    }
    return out
  }

  cellsInRow(row: number): Set<Cell> {
    const out = new Set<Cell>()
    for (const cell of this.occupiable) {
      if (this.rc(cell).row === row) out.add(cell)
    }
    return out
  }

  cellsInCol(col: number): Set<Cell> {
    const out = new Set<Cell>()
    for (const cell of this.occupiable) {
      if (this.rc(cell).col === col) out.add(cell)
    }
    return out
  }

  cornerCells(): Set<Cell> {
    const out = new Set<Cell>()
    for (const cell of this.occupiable) {
      if (this.isCorner(cell)) out.add(cell)
    }
    return out
  }
}
