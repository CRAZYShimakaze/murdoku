import { Clue } from './Clue.ts'
import { ON_OBJECT_KEY_SUFFIX } from './unaryClues.ts'
import type { Board } from '../model/Board.ts'
import type { Solution } from '../model/Solution.ts'
import type { Puzzle } from '../model/Puzzle.ts'
import { VICTIM_ID } from '../model/types.ts'
import type { AttributeValue, Cell, Direction, Explanation, PersonId } from '../model/types.ts'

/** "{name} was alone." — no other person at all shares the room, NOT even the victim,
 *  so an "alone" suspect is never the murderer (the murderer is alone *with* the victim).
 *  This keeps the victim out of an "alone" room, which constrains where the body is. */
export class AloneClue extends Clue {
  test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const board = puzzle.board
    const room = board.roomIdOf(solution.cellOf(subjectId))
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
    const cell = placement.get(subjectId)
    if (cell === undefined) return false
    const room = puzzle.board.roomIdOf(cell)
    for (const [id, c] of placement) {
      if (id !== subjectId && puzzle.board.roomIdOf(c) === room) return true
    }
    return false
  }

  describe(): Explanation {
    return { key: 'clue.alone' }
  }
}

/** "{name} was not alone." — at least one other person shares the subject's room. */
export class NotAloneClue extends Clue {
  test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const board = puzzle.board
    const room = board.roomIdOf(solution.cellOf(subjectId))
    for (const id of puzzle.allIds()) {
      if (id !== subjectId && board.roomIdOf(solution.cellOf(id)) === room) return true
    }
    return false
  }

  describe(): Explanation {
    return { key: 'clue.notAlone' }
  }
}

/**
 * "{name} was alone with [people] and `extraCount` person(s) matching attr=value,
 * one of whom was `dir` of them." The room contains EXACTLY the subject, the named
 * people, and `extraCount` matching others — nobody else (not even the victim).
 * Tailored to clues like "alone with Joaquin and a woman east of her".
 */
export class AloneWithClue extends Clue {
  constructor(
    readonly people: PersonId[],
    readonly attribute: string,
    readonly value: AttributeValue,
    readonly extraCount: number,
    readonly dir: Direction | null = null,
  ) {
    super()
  }

  test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const board = puzzle.board
    const myCell = solution.cellOf(subjectId)
    const room = board.roomIdOf(myCell)
    const mates = puzzle
      .allIds()
      .filter((id) => id !== subjectId && board.roomIdOf(solution.cellOf(id)) === room)
    for (const p of this.people) if (!mates.includes(p)) return false
    const extras = mates.filter((id) => !this.people.includes(id))
    if (extras.length !== this.extraCount) return false
    if (!extras.every((id) => puzzle.attributesOf(id)[this.attribute] === this.value)) return false
    if (this.dir) {
      const { row, col } = board.rc(myCell)
      const inDir = (cell: Cell): boolean => {
        const p = board.rc(cell)
        if (this.dir === 'north') return p.row < row
        if (this.dir === 'south') return p.row > row
        if (this.dir === 'east') return p.col > col
        return p.col < col
      }
      if (!extras.some((id) => inDir(solution.cellOf(id)))) return false
    }
    return true
  }

  override violatedBy(
    subjectId: PersonId,
    placement: ReadonlyMap<PersonId, Cell>,
    puzzle: Puzzle,
  ): boolean {
    const cell = placement.get(subjectId)
    if (cell === undefined) return false
    const room = puzzle.board.roomIdOf(cell)
    for (const p of this.people) {
      const pc = placement.get(p)
      if (pc !== undefined && puzzle.board.roomIdOf(pc) !== room) return true
    }
    let extras = 0
    for (const [id, c] of placement) {
      if (id === subjectId || puzzle.board.roomIdOf(c) !== room || this.people.includes(id)) continue
      if (puzzle.attributesOf(id)[this.attribute] !== this.value) return true
      if (++extras > this.extraCount) return true
    }
    return false
  }

  describe(): Explanation {
    // Reflect ALL parts (named person, how many extras, their trait, optional
    // direction) so the editor preview updates when any is changed.
    const token = this.value === true ? this.attribute : `${this.attribute}_${this.value}`
    return {
      key: this.dir ? 'clue.aloneWithDir' : 'clue.aloneWithPeople',
      params: {
        target: this.people[0] ?? '',
        count: this.extraCount,
        attribute: token,
        direction: this.dir ?? '',
      },
    }
  }
}

/**
 * "At least one EMPTY room adjoined {name}'s room." — some room sharing a wall edge with the
 * subject's room holds nobody at all. Negated (via the `clue.neighborRoomEmptyNeg` wording)
 * it reads "no empty room adjoined his room", i.e. EVERY neighbour was occupied — the far
 * stronger universal form.
 *
 * Emptiness is counted over ALL people (victim included). On a valid solution that is the
 * same as "no suspect": the victim always shares its room with exactly one suspect, so a
 * room without suspects has no victim either. Counting people keeps `test` independent of
 * the murder rule.
 *
 * Depends on where everyone else stands, so `candidateCells` is only the sound necessary
 * bound (the subject's room must HAVE a neighbour) and `definiteCells` stays null — the
 * negation is therefore handled by NeighborRoomTechnique, not by NotClue.
 */
export class NeighborRoomEmptyClue extends Clue {
  /** Sound superset: an empty NEIGHBOUR can only exist if the room has a neighbour at all. */
  protected override computeCandidateCells(board: Board): Set<Cell> {
    const out = new Set<Cell>()
    for (const cell of board.occupiableCells()) {
      if (board.roomNeighbors(board.roomIdOf(cell)).size > 0) out.add(cell)
    }
    return out
  }

  test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const board = puzzle.board
    const occupied = new Set<string>()
    for (const [, cell] of solution.entries()) occupied.add(board.roomIdOf(cell))
    for (const room of board.roomNeighbors(board.roomIdOf(solution.cellOf(subjectId)))) {
      if (!occupied.has(room)) return true
    }
    return false
  }

  describe(): Explanation {
    return { key: 'clue.neighborRoomEmpty' }
  }
}

/**
 * "An adjoining room [{dir} of {name}] held exactly {count} suspects." — some room sharing a
 * wall edge with the subject's room holds exactly `count` SUSPECTS (never the victim).
 *
 * `dir` (optional) is a STRICT half-plane over the room's whole extent: "south of Bella"
 * means EVERY cell of that room lies strictly below Bella's, so the player reads it straight
 * off the floor plan instead of estimating a centre.
 *
 * CARDINALS ONLY, deliberately. Lifting a diagonal to a room forces the quadrant — "every
 * cell southeast" is, by definition, "every cell south AND every cell east" — which is both
 * far rarer (measured: 4.5–7.6% of adjacencies vs 29–32% for a cardinal) and awkward to read.
 * The only looser reading ("part of it lies southeast") can't be checked at a glance and
 * would call a room that SURROUNDS Bella "southeast of her".
 */
export class NeighborRoomCountClue extends Clue {
  constructor(
    readonly count: number,
    readonly dir: Direction | null = null,
  ) {
    super()
  }

  /** Whether room `room` qualifies for a subject standing on `cell` (adjacency + direction). */
  qualifies(board: Board, cell: Cell, room: string): boolean {
    if (!board.roomNeighbors(board.roomIdOf(cell)).has(room)) return false
    if (!this.dir) return true
    const b = board.roomBounds(room)
    if (!b) return false
    const { row, col } = board.rc(cell)
    switch (this.dir) {
      case 'north':
        return b.maxRow < row
      case 'south':
        return b.minRow > row
      case 'west':
        return b.maxCol < col
      case 'east':
        return b.minCol > col
    }
  }

  /** The qualifying neighbour rooms for a subject on `cell`. */
  targetRooms(board: Board, cell: Cell): string[] {
    return [...board.roomNeighbors(board.roomIdOf(cell))].filter((r) => this.qualifies(board, cell, r))
  }

  /**
   * Sound superset: the subject can only stand where SOME qualifying neighbour room could
   * hold `count` suspects at all — i.e. its row/column capacity is not already below it.
   * Both parts are necessary conditions of `test`, never sufficient, so no legal placement
   * is lost.
   */
  protected override computeCandidateCells(board: Board): Set<Cell> {
    const out = new Set<Cell>()
    for (const cell of board.occupiableCells()) {
      if (this.targetRooms(board, cell).some((r) => board.roomCapacity(r) >= this.count)) out.add(cell)
    }
    return out
  }

  test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const board = puzzle.board
    const cell = solution.cellOf(subjectId)
    const counts = new Map<string, number>()
    for (const s of puzzle.suspects) {
      const room = board.roomIdOf(solution.cellOf(s.id))
      counts.set(room, (counts.get(room) ?? 0) + 1)
    }
    return this.targetRooms(board, cell).some((r) => (counts.get(r) ?? 0) === this.count)
  }

  describe(): Explanation {
    return this.dir
      ? { key: 'clue.neighborRoomCountDir', params: { count: this.count, direction: this.dir } }
      : { key: 'clue.neighborRoomCount', params: { count: this.count } }
  }
}

export type Quantifier = 'none' | 'some' | 'all'

/**
 * Clue about who else shares the subject's room, by attribute — e.g.
 * "no one in his area had a beard" (none/beard/true) or "a woman was in his
 * room" (some/gender/"f"). `excludeSelf` ignores the subject in the count.
 */
export class RoomAttributeClue extends Clue {
  constructor(
    readonly quantifier: Quantifier,
    readonly attribute: string,
    readonly value: AttributeValue,
    readonly excludeSelf = false,
    /** For the 'some' quantifier: how many matching others are required
     *  ("≥ count" by default, "exactly count" when `exact`). Ignored by none/all. */
    readonly count = 1,
    /** 'some' only: `count` is an EXACT count, not a lower bound. */
    readonly exact = false,
  ) {
    super()
  }

  test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const board = puzzle.board
    const room = board.roomIdOf(solution.cellOf(subjectId))
    let total = 0
    let matches = 0
    for (const id of puzzle.allIds()) {
      if (this.excludeSelf && id === subjectId) continue
      if (board.roomIdOf(solution.cellOf(id)) !== room) continue
      total++
      if (puzzle.attributesOf(id)[this.attribute] === this.value) matches++
    }
    switch (this.quantifier) {
      case 'none':
        return matches === 0
      case 'some':
        return this.exact ? matches === this.count : matches >= this.count
      case 'all':
        return total > 0 && matches === total
    }
  }

  override violatedBy(
    subjectId: PersonId,
    placement: ReadonlyMap<PersonId, Cell>,
    puzzle: Puzzle,
  ): boolean {
    if (this.quantifier !== 'none') return false
    const cell = placement.get(subjectId)
    if (cell === undefined) return false
    const room = puzzle.board.roomIdOf(cell)
    for (const [id, c] of placement) {
      if (this.excludeSelf && id === subjectId) continue
      if (
        puzzle.board.roomIdOf(c) === room &&
        puzzle.attributesOf(id)[this.attribute] === this.value
      ) {
        return true
      }
    }
    return false
  }

  describe(): Explanation {
    // Gender is categorical ("a man/woman"), not a "with <trait>" attribute, so it
    // gets its own wording (none/some/all) via the nominative who-token.
    if (this.attribute === 'gender') {
      const g = String(this.value)
      if (this.quantifier === 'some') {
        if (this.exact) {
          return this.count >= 2
            ? { key: 'clue.roomGender.someExact', params: { count: this.count, whoOtherPl: g } }
            // `whoOther` carries the article for German ("ein anderer Mann"); `whoBare`
            // the article-free noun for English ("one other man").
            : { key: 'clue.roomGender.someExactOne', params: { count: this.count, whoOther: g, whoBare: g } }
        }
        if (this.count >= 2) {
          return { key: 'clue.roomGender.someMin', params: { count: this.count, whoOtherPl: g } }
        }
        // "≥ 1 other" — the original wording, now "_other"-aware via `whoOther`; keep
        // `who` so the negated ("kein …") form still resolves.
        return { key: 'clue.roomGender.some', params: { who: `${g}_nom`, whoOther: g } }
      }
      return { key: `clue.roomGender.${this.quantifier}`, params: { who: `${g}_nom` } }
    }
    // Boolean traits read as the attribute itself ("a beard"); valued traits
    // (hair colour, …) fold the value into the token so the wording can
    // distinguish "blond hair" from "brown hair" via `attr.<attribute>_<value>`.
    const token = this.value === true ? this.attribute : `${this.attribute}_${this.value}`
    if (this.quantifier === 'some') {
      if (this.exact) {
        return this.count >= 2
          ? { key: 'clue.roomAttribute.someExact', params: { count: this.count, attribute: token } }
          : { key: 'clue.roomAttribute.someExactOne', params: { count: this.count, attribute: token } }
      }
      if (this.count >= 2) {
        return { key: 'clue.roomAttribute.someMin', params: { count: this.count, attribute: token } }
      }
      return { key: 'clue.roomAttribute.some', params: { attribute: token } }
    }
    return { key: `clue.roomAttribute.${this.quantifier}`, params: { attribute: token } }
  }
}

/**
 * "{name} was alone with a {value}." — exactly `count` other people share the
 * subject's room, and every one of them matches attribute == value.
 */
export class RoomCompanionClue extends Clue {
  constructor(
    readonly count: number,
    readonly attribute: string,
    readonly value: AttributeValue,
  ) {
    super()
  }

  test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const board = puzzle.board
    const room = board.roomIdOf(solution.cellOf(subjectId))
    const others: PersonId[] = []
    for (const id of puzzle.allIds()) {
      if (id === subjectId || id === VICTIM_ID) continue
      if (board.roomIdOf(solution.cellOf(id)) === room) others.push(id)
    }
    if (others.length !== this.count) return false
    return others.every((id) => puzzle.attributesOf(id)[this.attribute] === this.value)
  }

  override violatedBy(
    subjectId: PersonId,
    placement: ReadonlyMap<PersonId, Cell>,
    puzzle: Puzzle,
  ): boolean {
    const cell = placement.get(subjectId)
    if (cell === undefined) return false
    const room = puzzle.board.roomIdOf(cell)
    let others = 0
    for (const [id, c] of placement) {
      if (id === subjectId || id === VICTIM_ID || puzzle.board.roomIdOf(c) !== room) continue
      others++
      if (puzzle.attributesOf(id)[this.attribute] !== this.value) return true
      if (others > this.count) return true
    }
    return false
  }

  describe(): Explanation {
    // Gender reads as "alone with a man/woman"; other traits as "alone with a person
    // who had <trait>" (the trait token reuses the attr.* wordings). ≥2 companions get
    // the plural "alone with N (other) men / N people who had …" wording.
    if (this.attribute === 'gender') {
      const g = String(this.value)
      // The companions are suspects (never the victim) → "verdächtiger Mann/Männern".
      return this.count >= 2
        ? { key: 'clue.aloneWithMany', params: { count: this.count, who: `${g}_datpl_susp` } }
        : { key: 'clue.aloneWith', params: { who: `${g}_dat_susp` } }
    }
    const token = this.value === true ? this.attribute : `${this.attribute}_${this.value}`
    return this.count >= 2
      ? { key: 'clue.aloneWithTraitMany', params: { count: this.count, attribute: token } }
      : { key: 'clue.aloneWithTrait', params: { attribute: token } }
  }
}

/**
 * Where the "someone" of a roomExists clue stood, within the subject's room:
 *  - 'on'     — standing ON an object of the given type;
 *  - 'near'   — BESIDE one in the same room (orthogonal, not on it — the game's "neben");
 *  - 'corner' — on a corner cell;  'wall' — on a cell touching a wall;
 *  - 'window' — on a cell beside a window;  'door' — beside a door.
 * 'on'/'near' use `object`; the board-position relations ignore it.
 */
export type RoomExistsRelation = 'on' | 'near' | 'corner' | 'wall' | 'window' | 'door'

const ROOM_EXISTS_REL_KEY: Record<RoomExistsRelation, string> = {
  on: 'On',
  near: 'Near',
  corner: 'Corner',
  wall: 'Wall',
  window: 'Window',
  door: 'Door',
}

/**
 * "Someone (else) was {on/beside an object | in a corner | …} in {name}'s area." —
 * some OTHER person in the subject's room (never the subject, never the victim)
 * stands somewhere matching `relation`, and matches the "who":
 *  - `person` set → it must be that specific named suspect;
 *  - else `attribute` set → attribute == value (e.g. a woman, someone with a beard);
 *  - else (attribute null, no person) → anyone qualifies.
 */
export class RoomExistsClue extends Clue {
  constructor(
    readonly attribute: string | null,
    readonly value: AttributeValue,
    readonly object: string,
    readonly relation: RoomExistsRelation = 'on',
    /** A specific named suspect as the "someone" (overrides attribute/value). */
    readonly person: PersonId | null = null,
  ) {
    super()
  }

  private get usesObject(): boolean {
    return this.relation === 'on' || this.relation === 'near'
  }

  /** Cells where a companion would satisfy the board-position part (room-independent). */
  private positionCells(board: Board): Set<Cell> {
    switch (this.relation) {
      case 'corner':
        return board.cornerCells()
      case 'wall':
        return board.cellsAtWall()
      case 'window':
        return board.cellsNearWindow()
      case 'door':
        return board.cellsNearDoor()
      default:
        return new Set()
    }
  }

  /** Whether `id` can play the "someone" role (named person, trait/gender, or anyone). */
  matchesPerson(puzzle: Puzzle, id: PersonId): boolean {
    if (this.person !== null) return id === this.person
    return this.attribute === null || puzzle.attributesOf(id)[this.attribute] === this.value
  }

  /** Whether a person standing on `cell` satisfies the position part within `room`. */
  qualifies(board: Board, cell: Cell, room: string): boolean {
    if (board.roomIdOf(cell) !== room) return false
    if (this.relation === 'on') return board.tileAt(cell).hasObjectType(this.object)
    // "beside" delegates to the board's single instance-aware rule (sitting on chair
    // one beside chair two IS "beside a chair" — this inline copy used to disagree
    // with cellsNearObject and hid legitimate placements).
    if (this.relation === 'near') return board.isBesideObject(cell, this.object)
    // Board-position relations (corner/wall/window/door): the cell itself qualifies.
    return this.positionCells(board).has(cell)
  }

  /** The subject's room must at least offer an occupiable spot where the companion
   *  could satisfy the clue — else the subject can't be there. */
  protected override computeCandidateCells(board: Board): Set<Cell> {
    const spots = this.usesObject
      ? this.relation === 'on'
        ? [...board.objectCells(this.object)].filter((c) => board.isOccupiable(c))
        : [...board.cellsNearObject(this.object)]
      : [...this.positionCells(board)].filter((c) => board.isOccupiable(c))
    const rooms = new Set(spots.map((c) => board.roomIdOf(c)))
    const out = new Set<Cell>()
    for (const cell of board.occupiableCells()) {
      if (rooms.has(board.roomIdOf(cell))) out.add(cell)
    }
    return out
  }

  test(subjectId: PersonId, solution: Solution, puzzle: Puzzle): boolean {
    const board = puzzle.board
    const room = board.roomIdOf(solution.cellOf(subjectId))
    for (const id of puzzle.allIds()) {
      if (id === VICTIM_ID || id === subjectId) continue
      if (this.matchesPerson(puzzle, id) && this.qualifies(board, solution.cellOf(id), room)) {
        return true
      }
    }
    return false
  }

  /** The "who" encoded for the `mate` renderer param: a named person, a gender, a
   *  trait, or anyone — so one set of templates renders every variant. */
  whoToken(): string {
    if (this.person !== null) return `person:${this.person}`
    if (this.attribute === null) return 'anyElse'
    if (this.attribute === 'gender') return `attr:gender_${this.value}`
    const token = this.value === true ? this.attribute : `${this.attribute}_${this.value}`
    return `attr:${token}`
  }

  /** The position encoded for the `pos` renderer param (solver step texts). */
  posToken(): string {
    return this.usesObject ? `${this.relation}:${this.object}` : this.relation
  }

  describe(): Explanation {
    const params: Record<string, string> = { mateLc: this.whoToken() }
    if (this.usesObject) params.object = this.object
    // 'on' picks the object's natural preposition (in a tent / under a parasol).
    const suffix = this.relation === 'on' ? (ON_OBJECT_KEY_SUFFIX[this.object] ?? '') : ''
    return { key: `clue.roomExists${ROOM_EXISTS_REL_KEY[this.relation]}${suffix}`, params }
  }
}
