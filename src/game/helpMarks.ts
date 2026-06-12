/**
 * Reduced-help mode ("Kommissar"): instead of the full candidate intersection,
 * each clue marks only what it REFERENCES on the board — the player draws the
 * conclusion. Marks of all clues are shown side by side (no intersection):
 *
 * - row/col, on-object, outside/inside, wall, corner, same line as an object →
 *   their cells, filled (as the full mode would, just per clue)
 * - object references (beside X, same line/room as X, direction from X, …) →
 *   only the object cells, as a dashed "chalk" ring
 * - in-room (incl. alone/not alone) → the room's outline only
 * - beside a window/door → the window/door symbols themselves light up
 * - NEGATED clues mark the same reference in red ("not here") instead of the
 *   filled complement
 *
 * Relational/social clues (depend on other people) mark nothing — exactly as
 * in full mode, where their candidateCells are null.
 */
import {
  AndClue,
  AtWallClue,
  BesideSameObjectClue,
  CornerClue,
  DirectionFromObjectClue,
  InColClue,
  InRoomClue,
  InRowClue,
  NearAnyObjectClue,
  NearDoorClue,
  NearObjectClue,
  NearWindowClue,
  NotClue,
  OnObjectClue,
  OrClue,
  OutsideClue,
  SameLineAsObjectClue,
  SameRoomAsObjectClue,
  UniqueNearDoorClue,
  UniqueNearObjectClue,
  UniqueNearWindowClue,
  UniqueOnObjectClue,
  UniqueOutsideClue,
  type Board,
  type Cell,
  type Clue,
} from '../engine/index.ts'

export interface HelpMarks {
  /** Candidate-style filled cells (row/col, on-object, outside, wall, corner). */
  fill: Set<Cell>
  /** Referenced object cells, drawn as a dashed ring only (no wash). */
  ring: Set<Cell>
  /** Rooms whose outline is traced. */
  rooms: Set<string>
  /** Light up all window / door symbols. */
  windows: boolean
  doors: boolean
  /** The same shapes for NEGATED clues, drawn in red ("not here"). */
  redFill: Set<Cell>
  redRing: Set<Cell>
  redRooms: Set<string>
  redWindows: boolean
  redDoors: boolean
}

function empty(): HelpMarks {
  return {
    fill: new Set(),
    ring: new Set(),
    rooms: new Set(),
    windows: false,
    doors: false,
    redFill: new Set(),
    redRing: new Set(),
    redRooms: new Set(),
    redWindows: false,
    redDoors: false,
  }
}

export function hasMarks(marks: HelpMarks): boolean {
  return (
    marks.fill.size > 0 ||
    marks.ring.size > 0 ||
    marks.rooms.size > 0 ||
    marks.windows ||
    marks.doors ||
    marks.redFill.size > 0 ||
    marks.redRing.size > 0 ||
    marks.redRooms.size > 0 ||
    marks.redWindows ||
    marks.redDoors
  )
}

const addAll = (target: Set<Cell>, cells: Iterable<Cell>): void => {
  for (const c of cells) target.add(c)
}

/** ALL cells carrying the object type — including blocked ones (a lamp is never
 *  occupiable, yet it IS the reference the player needs to find). */
function objectRef(board: Board, type: string): Cell[] {
  return board.objectCells(type)
}

function addClue(clue: Clue, board: Board, neg: boolean, out: HelpMarks): void {
  if (clue instanceof NotClue) return addClue(clue.inner, board, !neg, out)
  if (clue instanceof AndClue || clue instanceof OrClue) {
    for (const child of clue.clues) addClue(child, board, neg, out)
    return
  }

  const fill = neg ? out.redFill : out.fill
  const ring = neg ? out.redRing : out.ring
  const rooms = neg ? out.redRooms : out.rooms

  // Area clues keep their (per-clue) filled cells; negated → the same area in red.
  if (
    clue instanceof OnObjectClue ||
    clue instanceof InRowClue ||
    clue instanceof InColClue ||
    clue instanceof CornerClue ||
    clue instanceof AtWallClue ||
    clue instanceof OutsideClue ||
    clue instanceof UniqueOutsideClue
  ) {
    addAll(fill, clue.candidateCells(board))
    return
  }

  // "Same row/column as an object": the line itself is the lead — fill it as
  // full mode would (per clue), plus a chalk ring on the anchoring object(s).
  if (clue instanceof SameLineAsObjectClue) {
    addAll(fill, clue.candidateCells(board))
    addAll(ring, objectRef(board, clue.object))
    return
  }

  // Object references → only the object itself.
  if (
    clue instanceof NearObjectClue ||
    clue instanceof UniqueOnObjectClue ||
    clue instanceof UniqueNearObjectClue ||
    clue instanceof BesideSameObjectClue
  ) {
    addAll(ring, objectRef(board, clue.object))
    return
  }
  if (clue instanceof NearAnyObjectClue) {
    for (const type of clue.objects) addAll(ring, objectRef(board, type))
    return
  }
  if (clue instanceof DirectionFromObjectClue) {
    // Anchored ("… the tree at G7") → only that tile; otherwise every object of the type.
    const cells = objectRef(board, clue.object).filter((c) => clue.at === null || c === clue.at)
    addAll(ring, cells)
    return
  }
  if (clue instanceof SameRoomAsObjectClue) {
    const cells = objectRef(board, clue.object)
    addAll(ring, cells)
    for (const c of cells) rooms.add(board.roomIdOf(c))
    return
  }

  if (clue instanceof InRoomClue) {
    rooms.add(clue.room)
    return
  }

  if (clue instanceof NearWindowClue || clue instanceof UniqueNearWindowClue) {
    if (neg) out.redWindows = true
    else out.windows = true
    return
  }
  if (clue instanceof NearDoorClue || clue instanceof UniqueNearDoorClue) {
    if (neg) out.redDoors = true
    else out.doors = true
    return
  }
  // Relational / social / board clues: no reference to mark (as in full mode).
}

/** The reduced-help marks for a suspect's clues (all shown together). */
export function helpMarks(clues: readonly Clue[], board: Board): HelpMarks {
  const out = empty()
  for (const clue of clues) addClue(clue, board, false, out)
  return out
}
