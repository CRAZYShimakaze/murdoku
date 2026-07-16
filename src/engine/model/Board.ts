import { MULTI_CELL_TYPES, VOID_ROOM, type Cell, type Side } from './types.ts'
import { MERGE_INSTANCE_TYPES } from './objects.ts'
import type { Tile } from './Tile.ts'
import type { Room } from './Room.ts'

/** Shared empty result for rooms without neighbours (avoids allocating per lookup). */
const EMPTY_ROOM_SET: ReadonlySet<string> = new Set<string>()

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
  /** Lazily-built footprint pairing for two-tile objects (see bigObjectPartners). */
  private bigPartners?: ReadonlyMap<Cell, Cell | null>

  constructor(
    readonly width: number,
    readonly height: number,
    readonly tiles: readonly Tile[],
    readonly rooms: ReadonlyMap<string, Room>,
    /**
     * Windows by owning cell → the sides they sit on. A window belongs to the
     * cell that declares it (so only THAT cell is "beside" it — a window on a
     * shared edge is not automatically beside the neighbour across the wall).
     */
    private readonly windows: ReadonlyMap<Cell, ReadonlySet<Side>>,
    /**
     * Doors by cell → the sides they sit on. Unlike windows a door is TWO-sided:
     * the loader registers it on both cells of the shared edge, so both count as
     * "beside a door".
     */
    private readonly doors: ReadonlyMap<Cell, ReadonlySet<Side>> = new Map(),
  ) {
    for (let c = 0; c < tiles.length; c++) {
      // Void (no-room) cells are exterior — never occupiable, whatever sits on them.
      if (tiles[c].occupiable && tiles[c].roomId !== VOID_ROOM) this.occupiable.push(c)
    }
  }

  /** Whether a cell belongs to no room (empty exterior / void). */
  isVoid(cell: Cell): boolean {
    return this.tiles[cell].roomId === VOID_ROOM
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
    return this.tiles[cell].occupiable && this.tiles[cell].roomId !== VOID_ROOM
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

  /** Whether this cell owns a window (i.e. is "beside a window"). */
  hasWindow(cell: Cell): boolean {
    return this.windows.has(cell)
  }

  /** The sides of this cell that carry a window (for rendering). */
  windowSides(cell: Cell): Side[] {
    const sides = this.windows.get(cell)
    return sides ? [...sides] : []
  }

  /** Whether this cell is beside a door (doors are two-sided). */
  hasDoor(cell: Cell): boolean {
    return this.doors.has(cell)
  }

  /** The sides of this cell that carry a door (for rendering). */
  doorSides(cell: Cell): Side[] {
    const sides = this.doors.get(cell)
    return sides ? [...sides] : []
  }

  /** Occupiable cells beside a door. */
  cellsNearDoor(): Set<Cell> {
    const out = new Set<Cell>()
    for (const cell of this.occupiable) {
      if (this.hasDoor(cell)) out.add(cell)
    }
    return out
  }

  /** Whether a cell's room is an outdoor area (pasture/yard/garden). */
  isOutside(cell: Cell): boolean {
    return this.rooms.get(this.roomIdOf(cell))?.outside ?? false
  }

  /** Occupiable cells in an outdoor (true) or indoor (false) room. */
  cellsOutside(outside: boolean): Set<Cell> {
    const out = new Set<Cell>()
    for (const cell of this.occupiable) {
      if (this.isOutside(cell) === outside) out.add(cell)
    }
    return out
  }

  /** A side is a wall when it leaves the board or crosses into another room. */
  private isWall(row: number, col: number, room: string): boolean {
    return !this.inBounds(row, col) || this.tiles[this.idx(row, col)].roomId !== room
  }

  /** A cell is a corner of its room when two perpendicular sides are walls. */
  isCorner(cell: Cell): boolean {
    const { row, col } = this.rc(cell)
    const room = this.tiles[cell].roomId
    const n = this.isWall(row - 1, col, room)
    const s = this.isWall(row + 1, col, room)
    const w = this.isWall(row, col - 1, room)
    const e = this.isWall(row, col + 1, room)
    return (n && e) || (e && s) || (s && w) || (w && n)
  }

  /** A cell is beside a wall when at least one of its sides is a wall. */
  isAtWall(cell: Cell): boolean {
    const { row, col } = this.rc(cell)
    const room = this.tiles[cell].roomId
    return (
      this.isWall(row - 1, col, room) ||
      this.isWall(row + 1, col, room) ||
      this.isWall(row, col - 1, room) ||
      this.isWall(row, col + 1, room)
    )
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

  /** ALL cells (occupiable or not) carrying the object type — for relating a
   *  person's row/column/direction to where a (possibly blocking) object sits. */
  objectCells(type: string): Cell[] {
    const out: Cell[] = []
    for (let cell = 0; cell < this.tiles.length; cell++) {
      if (this.tiles[cell].hasObjectType(type)) out.push(cell)
    }
    return out
  }

  /**
   * Footprint pairing for two-tile objects (bed/car): each such cell mapped to its
   * partner cell, or null when it stands alone. Cells are paired greedily in
   * row-major order — RIGHT first, else BELOW — IDENTICAL to how the board is
   * drawn, so the picture and "beside an object" never disagree. Built once.
   */
  bigObjectPartners(): ReadonlyMap<Cell, Cell | null> {
    if (this.bigPartners) return this.bigPartners
    const partner = new Map<Cell, Cell | null>()
    const consumed = new Set<Cell>()
    for (let cell = 0; cell < this.tiles.length; cell++) {
      const type = this.tiles[cell].top?.type
      if (!type || !MULTI_CELL_TYPES.has(type) || consumed.has(cell)) continue
      const { row, col } = this.rc(cell)
      const room = this.tiles[cell].roomId
      const free = (r: number, c: number): boolean => {
        if (!this.inBounds(r, c)) return false
        const i = this.idx(r, c)
        return !consumed.has(i) && this.tiles[i].top?.type === type && this.tiles[i].roomId === room
      }
      let mate: Cell | null = null
      if (free(row, col + 1)) mate = this.idx(row, col + 1)
      else if (free(row + 1, col)) mate = this.idx(row + 1, col)
      partner.set(cell, mate)
      consumed.add(cell)
      if (mate !== null) {
        partner.set(mate, cell)
        consumed.add(mate)
      }
    }
    this.bigPartners = partner
    return partner
  }

  /**
   * Occupiable cells with a same-room orthogonal neighbour carrying `type` that belongs
   * to a DIFFERENT object instance than the one the person may be standing on. Standing
   * on an object is being "on" it, never "beside" IT — but a SECOND chair right next
   * door is another object, so sitting on chair one you ARE beside chair two. Instances
   * follow MERGE_INSTANCE_TYPES: a merged rug/table or a two-cell bed counts as ONE
   * object whose own cells never make you "beside" it; single-cell types (chairs above
   * all) are one instance per cell.
   */
  cellsNearObject(type: string): Set<Cell> {
    const out = new Set<Cell>()
    for (const cell of this.occupiable) {
      if (this.isBesideObject(cell, type)) out.add(cell)
    }
    return out
  }

  /**
   * Whether `cell` is beside a `type` instance OTHER than the one it may stand on —
   * the single "beside" truth shared by nearObject clues, roomExists('near') and the
   * generator (the three used to disagree). Called from solver hot paths, hence the
   * memoized instance map (the board is immutable, so caching is safe).
   */
  isBesideObject(cell: Cell, type: string): boolean {
    const instance = this.objectInstanceIds(type)
    const own = instance.get(cell) // undefined when not standing on `type`
    const room = this.tiles[cell].roomId
    for (const nb of this.neighbors4(cell)) {
      if (this.tiles[nb].roomId !== room) continue
      const nbInstance = instance.get(nb)
      if (nbInstance === undefined) continue // neighbour doesn't carry the type
      if (own !== undefined && nbInstance === own) continue // same instance ⇒ ON it
      return true
    }
    return false
  }

  private instanceIdCache = new Map<string, Map<Cell, number>>()

  /**
   * Instance id per cell carrying `type` (memoized).
   *  - Two-tile objects (bed/car/boat/carriage) follow the RENDERER'S pairing
   *    (bigObjectPartners): two beds touching in an L are TWO beds, exactly as drawn —
   *    so someone lying on one IS "beside" the other.
   *  - Merged surfaces (table/carpet/street/path) flood-fill orthogonally within one
   *    room — one continuous rug is ONE object.
   *  - Everything else (chairs above all) is one instance per cell.
   */
  private objectInstanceIds(type: string): Map<Cell, number> {
    const cached = this.instanceIdCache.get(type)
    if (cached) return cached
    const ids = new Map<Cell, number>()
    let next = 0
    const cells = this.objectCells(type)
    if (MULTI_CELL_TYPES.has(type)) {
      const partner = this.bigObjectPartners()
      for (const cell of cells) {
        if (ids.has(cell)) continue
        ids.set(cell, next)
        const mate = partner.get(cell)
        if (mate !== null && mate !== undefined) ids.set(mate, next)
        next++
      }
    } else if (!MERGE_INSTANCE_TYPES.has(type)) {
      for (const cell of cells) ids.set(cell, next++)
    } else {
      const inType = new Set(cells)
      for (const start of cells) {
        if (ids.has(start)) continue
        const room = this.tiles[start].roomId
        const stack: Cell[] = [start]
        ids.set(start, next)
        while (stack.length > 0) {
          const c = stack.pop()!
          for (const nb of this.neighbors4(c)) {
            if (inType.has(nb) && !ids.has(nb) && this.tiles[nb].roomId === room) {
              ids.set(nb, next)
              stack.push(nb)
            }
          }
        }
        next++
      }
    }
    this.instanceIdCache.set(type, ids)
    return ids
  }

  /** The distinct instances of `type` as cell sets (pairing/merge rules above) —
   *  shared with "beside the SAME object", so both "beside" notions agree with the
   *  picture. Returns fresh sets; callers may keep or mutate them. */
  objectInstances(type: string): Set<Cell>[] {
    const groups = new Map<number, Set<Cell>>()
    for (const [cell, id] of this.objectInstanceIds(type)) {
      let g = groups.get(id)
      if (!g) {
        g = new Set<Cell>()
        groups.set(id, g)
      }
      g.add(cell)
    }
    return [...groups.values()]
  }

  /** Lazily-built room adjacency (see roomNeighbors). */
  private roomNeighborCache?: ReadonlyMap<string, Set<string>>

  /**
   * The rooms sharing a wall EDGE with `roomId` — two rooms are neighbours as soon as any
   * two of their cells touch orthogonally. Diagonal contact does NOT count (rooms that only
   * meet at a corner share no wall). `VOID_ROOM` is exterior and is never a neighbour, and a
   * room is never its own neighbour. Symmetric by construction, memoized (the board is
   * immutable) — clue candidate sets are rebuilt often, so this must be cheap.
   */
  roomNeighbors(roomId: string): ReadonlySet<string> {
    if (!this.roomNeighborCache) {
      const map = new Map<string, Set<string>>()
      const link = (a: string, b: string): void => {
        let set = map.get(a)
        if (!set) {
          set = new Set<string>()
          map.set(a, set)
        }
        set.add(b)
      }
      for (let cell = 0; cell < this.tiles.length; cell++) {
        const a = this.tiles[cell].roomId
        if (a === VOID_ROOM) continue
        const { row, col } = this.rc(cell)
        // Only right/down: every shared edge is visited exactly once, then linked both ways.
        for (const [r, c] of [
          [row, col + 1],
          [row + 1, col],
        ]) {
          if (!this.inBounds(r, c)) continue
          const b = this.tiles[this.idx(r, c)].roomId
          if (b === VOID_ROOM || b === a) continue
          link(a, b)
          link(b, a)
        }
      }
      this.roomNeighborCache = map
    }
    return this.roomNeighborCache.get(roomId) ?? EMPTY_ROOM_SET
  }

  /** Lazily-built per-room extent / capacity (see roomBounds / roomCapacity). */
  private roomBoundsCache?: ReadonlyMap<string, { minRow: number; maxRow: number; minCol: number; maxCol: number }>
  private roomCapacityCache?: ReadonlyMap<string, number>

  /**
   * The bounding box of a room over ALL its cells (occupiable or not) — the extent a player
   * actually SEES. Lets "that room lies entirely south of this cell" be decided in O(1):
   * every cell of the room is south of `row` exactly when `minRow > row`. Memoized.
   * Returns null for a room with no cells.
   */
  roomBounds(roomId: string): { minRow: number; maxRow: number; minCol: number; maxCol: number } | null {
    if (!this.roomBoundsCache) {
      const map = new Map<string, { minRow: number; maxRow: number; minCol: number; maxCol: number }>()
      for (let cell = 0; cell < this.tiles.length; cell++) {
        const id = this.tiles[cell].roomId
        if (id === VOID_ROOM) continue
        const { row, col } = this.rc(cell)
        const b = map.get(id)
        if (!b) map.set(id, { minRow: row, maxRow: row, minCol: col, maxCol: col })
        else {
          if (row < b.minRow) b.minRow = row
          if (row > b.maxRow) b.maxRow = row
          if (col < b.minCol) b.minCol = col
          if (col > b.maxCol) b.maxCol = col
        }
      }
      this.roomBoundsCache = map
    }
    return this.roomBoundsCache.get(roomId) ?? null
  }

  /**
   * Upper bound on how many people a room can hold: everyone sits in a distinct row AND a
   * distinct column (the game's core rule), so a room can never hold more people than the
   * distinct rows — or columns — its OCCUPIABLE cells span. Same reasoning as
   * `SolveContext.roomsCapacity`, but board-only so clues can use it. Memoized.
   */
  roomCapacity(roomId: string): number {
    if (!this.roomCapacityCache) {
      const rows = new Map<string, Set<number>>()
      const cols = new Map<string, Set<number>>()
      for (const cell of this.occupiable) {
        const id = this.tiles[cell].roomId
        const { row, col } = this.rc(cell)
        let r = rows.get(id)
        if (!r) rows.set(id, (r = new Set<number>()))
        r.add(row)
        let c = cols.get(id)
        if (!c) cols.set(id, (c = new Set<number>()))
        c.add(col)
      }
      const map = new Map<string, number>()
      for (const [id, r] of rows) map.set(id, Math.min(r.size, cols.get(id)?.size ?? 0))
      this.roomCapacityCache = map
    }
    return this.roomCapacityCache.get(roomId) ?? 0
  }

  /** Occupiable cells of every room bordering `roomId` (never the room's own cells). */
  cellsInRoomsAdjacentTo(roomId: string): Set<Cell> {
    const rooms = this.roomNeighbors(roomId)
    const out = new Set<Cell>()
    for (const cell of this.occupiable) {
      if (rooms.has(this.tiles[cell].roomId)) out.add(cell)
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

  /** Occupiable cells that sit beside at least one wall. */
  cellsAtWall(): Set<Cell> {
    const out = new Set<Cell>()
    for (const cell of this.occupiable) {
      if (this.isAtWall(cell)) out.add(cell)
    }
    return out
  }
}
