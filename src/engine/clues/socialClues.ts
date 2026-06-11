import { Clue } from './Clue.ts'
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
        return matches >= 1
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
      return { key: `clue.roomGender.${this.quantifier}`, params: { who: `${this.value}_nom` } }
    }
    // Boolean traits read as the attribute itself ("a beard"); valued traits
    // (hair colour, …) fold the value into the token so the wording can
    // distinguish "blond hair" from "brown hair" via `attr.<attribute>_<value>`.
    const token = this.value === true ? this.attribute : `${this.attribute}_${this.value}`
    return {
      key: `clue.roomAttribute.${this.quantifier}`,
      params: { attribute: token },
    }
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
    // who had <trait>" (the trait token reuses the attr.* wordings).
    if (this.attribute === 'gender') {
      return { key: 'clue.aloneWith', params: { who: `${this.value}_dat` } }
    }
    const token = this.value === true ? this.attribute : `${this.attribute}_${this.value}`
    return { key: 'clue.aloneWithTrait', params: { attribute: token } }
  }
}

/** How the companion of a roomExists clue relates to the object: standing ON it,
 *  or BESIDE it (orthogonally adjacent, object in the same room — like "neben"). */
export type RoomExistsRelation = 'on' | 'near'

/**
 * "Someone (else) was on/beside a {object} in {name}'s area." — some OTHER person
 * in the subject's room (never the subject, never the victim) stands on the given
 * object (`relation` 'on') or beside one lying in the same room ('near'), and —
 * when `attribute` is set — matches attribute == value. `attribute: null` means
 * anyone qualifies ("jemand anders saß auf einem Stuhl in seinem Raum").
 */
export class RoomExistsClue extends Clue {
  constructor(
    readonly attribute: string | null,
    readonly value: AttributeValue,
    readonly object: string,
    readonly relation: RoomExistsRelation = 'on',
  ) {
    super()
  }

  /** Whether `id` can play the "someone" role (anyone when no attribute is set). */
  matchesPerson(puzzle: Puzzle, id: PersonId): boolean {
    return this.attribute === null || puzzle.attributesOf(id)[this.attribute] === this.value
  }

  /** Whether a person standing on `cell` satisfies the object part within `room`:
   *  ON an object of the type, or BESIDE one in the same room (mirrors the game's
   *  "neben": orthogonal neighbour, same room, not standing on the object itself). */
  qualifies(board: Board, cell: Cell, room: string): boolean {
    if (board.roomIdOf(cell) !== room) return false
    if (this.relation === 'on') return board.tileAt(cell).hasObjectType(this.object)
    if (board.tileAt(cell).hasObjectType(this.object)) return false
    for (const nb of board.neighbors4(cell)) {
      if (board.roomIdOf(nb) === room && board.tileAt(nb).hasObjectType(this.object)) return true
    }
    return false
  }

  /** The subject's room must at least offer a spot for the companion — an
   *  occupiable object cell ('on') or a cell beside an in-room object ('near'). */
  override candidateCells(board: Board): Set<Cell> {
    const spots =
      this.relation === 'on'
        ? [...board.objectCells(this.object)].filter((c) => board.isOccupiable(c))
        : [...board.cellsNearObject(this.object)]
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

  describe(): Explanation {
    const rel = this.relation === 'on' ? 'On' : 'Near'
    if (this.attribute === null) {
      return { key: `clue.roomExistsAny${rel}`, params: { object: this.object } }
    }
    if (this.attribute === 'gender') {
      return {
        key: this.relation === 'on' ? 'clue.roomExistsOnObject' : 'clue.roomExistsNearObject',
        params: { who: `${this.value}_nom`, object: this.object },
      }
    }
    const token = this.value === true ? this.attribute : `${this.attribute}_${this.value}`
    return { key: `clue.roomExistsTrait${rel}`, params: { attribute: token, object: this.object } }
  }
}
