import type { Solution } from '../model/Solution.ts'
import type { Puzzle } from '../model/Puzzle.ts'
import type { AttributeValue, Explanation, PersonId } from '../model/types.ts'
import type { BoardClueJson } from '../io/LevelSchema.ts'

/**
 * A board-wide clue: a constraint on the whole solution rather than one suspect
 * (e.g. "exactly one person was in a mud puddle"). Shown separately in the UI.
 */
export abstract class BoardClue {
  abstract test(solution: Solution, puzzle: Puzzle): boolean
  abstract describe(): Explanation
}

/** Exactly `count` people stand on a cell carrying `object`. */
export class CountOnObjectClue extends BoardClue {
  constructor(
    readonly object: string,
    readonly count: number,
  ) {
    super()
  }
  test(solution: Solution, puzzle: Puzzle): boolean {
    let n = 0
    for (const [, cell] of solution.entries()) {
      if (puzzle.board.tileAt(cell).hasObjectType(this.object)) n++
    }
    return n === this.count
  }
  describe(): Explanation {
    return { key: 'boardClue.countOnObject', params: { object: this.object, count: this.count } }
  }
}

/** Exactly `count` rooms hold nobody (0 = "no room is empty"). */
export class EmptyRoomsClue extends BoardClue {
  constructor(readonly count: number) {
    super()
  }
  test(solution: Solution, puzzle: Puzzle): boolean {
    const occupied = new Set<string>()
    for (const [, cell] of solution.entries()) occupied.add(puzzle.board.roomIdOf(cell))
    let empty = 0
    for (const id of puzzle.board.rooms.keys()) if (!occupied.has(id)) empty++
    return empty === this.count
  }
  describe(): Explanation {
    return { key: 'boardClue.emptyRooms', params: { count: this.count } }
  }
}

/**
 * How a room's headcount is compared against `count` in a RoomOccupancyClue. `atLeast`,
 * `atMost` and `exactly` hold for EVERY room; `notExactly` holds for NO room.
 */
export type OccupancyOp = 'atLeast' | 'atMost' | 'exactly' | 'notExactly'

/** Whether a single room's headcount satisfies the operator. */
function occupancyHolds(op: OccupancyOp, n: number, count: number): boolean {
  switch (op) {
    case 'atLeast':
      return n >= count
    case 'atMost':
      return n <= count
    case 'exactly':
      return n === count
    case 'notExactly':
      return n !== count
  }
}

/**
 * Who a counting board clue counts: every person (the victim included) or only the suspects.
 * Both are offered because they read as genuinely different statements — and the murder rule
 * gives them different floors (a victim's room always holds 2 people / 1 suspect).
 */
export type CountScope = 'people' | 'suspects'

/** The ids a scope counts. */
function scopeIds(scope: CountScope, puzzle: Puzzle): PersonId[] {
  return scope === 'people' ? puzzle.allIds() : puzzle.suspects.map((s) => s.id)
}

/**
 * One statement about EVERY room's headcount at once:
 *   atLeast    — "every room held at least N"
 *   atMost     — "no room held more than N"
 *   exactly    — "every room held exactly N"
 *   notExactly — "no room held exactly N"  (e.g. "no room held just one person")
 *
 * Rooms with nobody in them count as 0 and are included — "no room held exactly 1" allows an
 * empty room, "every room held at least 1" does not.
 *
 * The murder rule (victim's room = the victim + exactly one suspect ⇒ 2 people / 1 suspect)
 * makes some combinations unsatisfiable on EVERY board, and the editor blocks those:
 *   atMost     needs count >= 2 (people) / >= 1 (suspects)
 *   exactly    only count == 2 (people) / == 1 (suspects) can ever hold
 *   notExactly forbids count == 2 (people) / == 1 (suspects)
 */
export class RoomOccupancyClue extends BoardClue {
  constructor(
    readonly op: OccupancyOp,
    readonly count: number,
    readonly scope: CountScope = 'people',
  ) {
    super()
  }
  test(solution: Solution, puzzle: Puzzle): boolean {
    const counts = new Map<string, number>()
    for (const id of puzzle.board.rooms.keys()) counts.set(id, 0)
    for (const id of scopeIds(this.scope, puzzle)) {
      const room = puzzle.board.roomIdOf(solution.cellOf(id))
      counts.set(room, (counts.get(room) ?? 0) + 1)
    }
    for (const n of counts.values()) {
      if (!occupancyHolds(this.op, n, this.count)) return false
    }
    return true
  }
  describe(): Explanation {
    return {
      key: `boardClue.roomOccupancy.${this.op}${this.scope === 'suspects' ? 'Susp' : ''}`,
      params: { count: this.count },
    }
  }
}

/**
 * "Exactly `count` people/suspects with <trait> were inside / outside." The only clue that
 * talks about ALL carriers of a trait without naming a subject.
 *
 * `area` is required: over the whole board the statement would be vacuous — the player can
 * simply count the trait's carriers on the suspect cards.
 *
 * FAIRNESS: with scope `people` only `gender` may be used. The victim's other traits
 * (beard/glasses/bald/hair) are random and hidden from the player, so a clue counting them
 * could never be checked; the generator's `usableTrait` enforces the same rule.
 */
export class CountWithAttrClue extends BoardClue {
  constructor(
    readonly attribute: string,
    readonly value: AttributeValue,
    readonly area: 'inside' | 'outside',
    readonly count: number,
    readonly scope: CountScope = 'suspects',
  ) {
    super()
  }
  test(solution: Solution, puzzle: Puzzle): boolean {
    const outside = this.area === 'outside'
    let n = 0
    for (const id of scopeIds(this.scope, puzzle)) {
      if (puzzle.attributesOf(id)[this.attribute] !== this.value) continue
      if (puzzle.board.isOutside(solution.cellOf(id)) === outside) n++
    }
    return n === this.count
  }
  describe(): Explanation {
    // Gender is categorical ("2 women"), so ONE template carries both scopes — the who-token
    // spells the whole noun ("Frauen" / "weibliche Verdächtige"). Other traits read as
    // "people who had <trait>", where German needs a different relative pronoun per scope
    // ("Person, DIE …" vs "Verdächtiger, DER …"), so those get a template per scope.
    const susp = this.scope === 'suspects' ? '_susp' : ''
    if (this.attribute === 'gender') {
      return {
        key: 'boardClue.countWithAttrGender',
        params: {
          count: this.count,
          area: this.area,
          who: `${this.value}_countPl${susp}`,
          whoSg: `${this.value}_countSg${susp}`,
        },
      }
    }
    const token = this.value === true ? this.attribute : `${this.attribute}_${this.value}`
    return {
      key: `boardClue.countWithAttrTrait${this.scope === 'suspects' ? 'Susp' : ''}`,
      params: { count: this.count, area: this.area, attribute: token },
    }
  }
}

/** Build a BoardClue from its JSON representation. */
export function createBoardClue(json: BoardClueJson): BoardClue {
  switch (json.type) {
    case 'countOnObject':
      return new CountOnObjectClue(json.object, json.count)
    case 'emptyRooms':
      return new EmptyRoomsClue(json.count)
    // Legacy shape, kept so older level JSON still loads: it is exactly "every room holds
    // exactly N people".
    case 'everyRoomCount':
      return new RoomOccupancyClue('exactly', json.count, 'people')
    case 'roomOccupancy':
      return new RoomOccupancyClue(json.op, json.count, json.scope ?? 'people')
    case 'countWithAttr':
      return new CountWithAttrClue(
        json.attribute,
        json.value,
        json.area,
        json.count,
        json.scope ?? 'suspects',
      )
    default: {
      // Level JSON is persisted data (saved levels, editor drafts, exported files) and can
      // outlive a refactor, so it may name a type this build no longer knows. Fail LOUDLY
      // here: falling through returned `undefined`, which only surfaced later as a
      // "cannot read properties of undefined" deep inside a component. Editor-side data is
      // migrated before it ever gets here (see normalizeBoardClue).
      const unknown = json as { type: string }
      throw new Error(`Unknown board clue type "${unknown.type}"`)
    }
  }
}
