import { Clue, UnaryClue } from './Clue.ts'
import { inDirection8 } from '../model/types.ts'
import type { Board } from '../model/Board.ts'
import type { Solution } from '../model/Solution.ts'
import type { Puzzle } from '../model/Puzzle.ts'
import type { AttributeValue, Cell, Direction8, Explanation, PersonId } from '../model/types.ts'

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

/**
 * "{name} was in the same room as a {object}" — any occupiable cell whose room
 * holds at least one such object. (Object positions are fixed, so deducible.)
 * With `alone`, the subject is additionally the ONLY person in that room (no other
 * suspect, not even the victim) — "alone in a room with a {object}". The aloneness
 * depends on others, so it's checked in `test`/`violatedBy`; `candidateCells` stays
 * the sound room restriction used for deduction.
 */
export class SameRoomAsObjectClue extends UnaryClue {
  constructor(
    readonly object: string,
    readonly alone = false,
  ) {
    super()
  }

  candidateCells(board: Board): Set<Cell> {
    const rooms = new Set(objectsOf(board, this.object).map((o) => o.room))
    const out = new Set<Cell>()
    for (const cell of board.occupiableCells()) {
      if (rooms.has(board.roomIdOf(cell))) out.add(cell)
    }
    return out
  }

  override test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const board = puzzle.board
    const cell = solution.cellOf(subjectId)
    if (!this.candidateCells(board).has(cell)) return false
    if (!this.alone) return true
    const room = board.roomIdOf(cell)
    for (const id of puzzle.allIds()) {
      if (id === subjectId) continue
      if (board.roomIdOf(solution.cellOf(id)) === room) return false
    }
    return true
  }

  override violatedBy(
    subjectId: PersonId,
    placement: ReadonlyMap<PersonId, Cell>,
    puzzle: Puzzle,
  ): boolean {
    if (!this.alone) return false
    const cell = placement.get(subjectId)
    if (cell === undefined) return false
    const room = puzzle.board.roomIdOf(cell)
    for (const [id, c] of placement) {
      if (id === subjectId) continue
      if (puzzle.board.roomIdOf(c) === room) return true
    }
    return false
  }

  override definiteCells(board: Board): Set<Cell> | null {
    // "alone with an object" depends on others, so its negation prunes nothing.
    return this.alone ? null : this.candidateCells(board)
  }

  describe(): Explanation {
    return {
      key: this.alone ? 'clue.aloneSameRoomAsObject' : 'clue.sameRoomAsObject',
      params: { objectNom: this.object },
    }
  }
}

/** "{name} was {dir} of a {object}" (optionally same/other room). With `at`, the
 *  clue is anchored to the object TILE at that cell ("east of the tree at Z7/S6") —
 *  unambiguous when several objects of the type exist. Without it, ANY object of
 *  the type counts (legacy/existential reading, kept for older levels). */
export class DirectionFromObjectClue extends UnaryClue {
  constructor(
    readonly object: string,
    readonly direction: Direction8,
    readonly room: RoomRel,
    readonly at: Cell | null = null,
  ) {
    super()
  }

  candidateCells(board: Board): Set<Cell> {
    const objs = objectsOf(board, this.object).filter(
      (o) => this.at === null || board.idx(o.row, o.col) === this.at,
    )
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
      // atCell: "<type>:<cell>" — the Renderer shows the coordinate only when the
      // board holds several objects of the type (otherwise it adds nothing).
      params: {
        object: this.object,
        direction: this.direction,
        roomRel: this.room,
        atCell: this.at !== null ? `${this.object}:${this.at}` : '',
      },
    }
  }
}

/** Who the subject shares an object with: anyone (a suspect), a named person, or
 *  someone matching an attribute. */
export type ObjectMate =
  | { kind: 'any' }
  | { kind: 'person'; of: PersonId }
  | { kind: 'attr'; attribute: string; value: AttributeValue }

/**
 * "{name} was beside the SAME {object} as {mate}." A multi-cell object (a table or
 * carpet spanning several tiles) counts as ONE instance, so both must stand beside
 * the same connected group — at any of its tiles. `dir` (optional) additionally
 * requires the mate to lie in that compass direction from the subject. The mate is
 * always a suspect (never the victim). Relational, so `candidateCells` only pins the
 * subject to "beside an object of this type" (necessary); `test` checks the rest.
 */
export class BesideSameObjectClue extends Clue {
  constructor(
    readonly object: string,
    readonly mate: ObjectMate,
    readonly dir: Direction8 | null = null,
  ) {
    super()
  }

  override candidateCells(board: Board): Set<Cell> {
    return board.cellsNearObject(this.object) // necessary: beside an object of this type
  }
  // definiteCells stays null (default): negation depends on others, so it prunes nothing.

  /** Connected same-type object groups (orthogonally adjacent cells = one instance) — but
   *  an instance NEVER crosses a room border: two adjacent table tiles in different rooms
   *  are TWO tables, so "beside the same table" means the two people share ONE room. */
  private instances(board: Board): Set<Cell>[] {
    const cells = new Set<Cell>(board.objectCells(this.object))
    const seen = new Set<Cell>()
    const out: Set<Cell>[] = []
    for (const start of cells) {
      if (seen.has(start)) continue
      const room = board.roomIdOf(start)
      const comp = new Set<Cell>()
      const stack: Cell[] = [start]
      while (stack.length > 0) {
        const c = stack.pop()!
        if (seen.has(c)) continue
        seen.add(c)
        comp.add(c)
        for (const nb of board.neighbors4(c)) {
          if (cells.has(nb) && !seen.has(nb) && board.roomIdOf(nb) === room) stack.push(nb)
        }
      }
      out.push(comp)
    }
    return out
  }

  /** Cells orthogonally beside instance `comp`, in the same room (not the object itself). */
  private besideCells(board: Board, comp: Set<Cell>): Set<Cell> {
    const out = new Set<Cell>()
    for (const c of comp) {
      const room = board.roomIdOf(c)
      for (const nb of board.neighbors4(c)) {
        if (!comp.has(nb) && board.roomIdOf(nb) === room) out.add(nb)
      }
    }
    return out
  }

  /** Suspects (never the victim, never the subject) that can play the mate role. */
  private mates(puzzle: Puzzle, subjectId: PersonId): PersonId[] {
    return puzzle.suspects
      .map((s) => s.id)
      .filter(
        (id) =>
          id !== subjectId &&
          (this.mate.kind === 'any' ||
            (this.mate.kind === 'person'
              ? id === this.mate.of
              : puzzle.attributesOf(id)[this.mate.attribute] === this.mate.value)),
      )
  }

  /** Beside-cells for each object instance — used by the deduction technique. */
  besideSets(board: Board): Set<Cell>[] {
    return this.instances(board).map((comp) => this.besideCells(board, comp))
  }
  /** Suspects (never victim/subject) that can play the mate role — for deduction. */
  mateIds(puzzle: Puzzle, subjectId: PersonId): PersonId[] {
    return this.mates(puzzle, subjectId)
  }

  test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const board = puzzle.board
    const subjCell = solution.cellOf(subjectId)
    const subjRc = board.rc(subjCell)
    const mateIds = this.mates(puzzle, subjectId)
    if (mateIds.length === 0) return false
    for (const comp of this.instances(board)) {
      const beside = this.besideCells(board, comp)
      if (!beside.has(subjCell)) continue // subject must be beside THIS instance
      for (const id of mateIds) {
        const mc = solution.cellOf(id)
        if (!beside.has(mc)) continue
        if (!this.dir || inDirection8(this.dir, board.rc(mc), subjRc)) return true
      }
    }
    return false
  }

  describe(): Explanation {
    const mate =
      this.mate.kind === 'person'
        ? `person:${this.mate.of}`
        : this.mate.kind === 'attr'
          ? `attr:${this.mate.value === true ? this.mate.attribute : `${this.mate.attribute}_${this.mate.value}`}`
          : 'any'
    return {
      key: this.dir ? 'clue.besideSameObjectDir' : 'clue.besideSameObject',
      // object → "(beside) a table" (sentence 1); objectSame/objName → "the same table"
      // (sentence 2); mate → the other person/anyone/trait; direction (+ subjectObj,
      // injected per render) → optional "north of him".
      params: { object: this.object, objectSame: this.object, objName: this.object, mate, direction: this.dir ?? '' },
    }
  }
}
