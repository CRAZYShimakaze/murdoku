import { Technique } from './Technique.ts'
import { RoomOccupancyClue } from '../../clues/boardClues.ts'
import { VICTIM_ID } from '../../model/types.ts'
import type { SolveContext } from '../SolveContext.ts'
import type { DeductionStep, Elimination } from '../DeductionStep.ts'
import type { PersonId } from '../../model/types.ts'
import type { Puzzle } from '../../model/Puzzle.ts'

/** What is known about one room right now. */
interface RoomState {
  /** People of the counted group certainly in it (placed, or every candidate inside). */
  certain: PersonId[]
  /** Unplaced people of the group who could still join it. */
  possible: PersonId[]
}

/**
 * Board clue "every / no room held {at least | at most | exactly | not exactly} N".
 *
 * Each operator gets the forward rules a player would actually use — all of them read off
 * "this room already certainly holds C, and only these people could still join":
 *
 *  - atMost N:     C == N ⇒ the room is full, nobody else may enter.
 *  - atLeast N:    the room still needs N−C more and only that many can still reach it ⇒
 *                  every one of them is confined to it.
 *  - exactly N:    both of the above (a ceiling and a floor at the same number).
 *  - notExactly N: C == N ⇒ someone MUST still join (else the room lands on the forbidden
 *                  count); if exactly one person can, they are confined to it.
 *                  C == N−1 ⇒ a single possible joiner would land it exactly on N, so that
 *                  person must stay out.
 *
 * The last two only fire when exactly ONE candidate is involved — with several it is a
 * disjunction ("one of them must move"), which is not a forward step.
 */
export class RoomOccupancyTechnique extends Technique {
  readonly name = 'roomOccupancy'
  readonly difficulty = 4

  override relevant(puzzle: Puzzle): boolean {
    return puzzle.boardClues.some((c) => c instanceof RoomOccupancyClue)
  }

  apply(ctx: SolveContext): DeductionStep | null {
    for (const clue of ctx.puzzle.boardClues) {
      if (!(clue instanceof RoomOccupancyClue)) continue
      const step = this.applyClue(ctx, clue)
      if (step) return step
    }
    return null
  }

  private applyClue(ctx: SolveContext, clue: RoomOccupancyClue): DeductionStep | null {
    const counted = (id: PersonId): boolean => clue.scope === 'people' || id !== VICTIM_ID
    const rooms = new Map<string, RoomState>()
    for (const id of ctx.board.rooms.keys()) rooms.set(id, { certain: [], possible: [] })

    for (const person of ctx.people) {
      if (!counted(person.id)) continue
      const placed = ctx.state.placed.get(person.id)
      if (placed !== undefined) {
        rooms.get(ctx.roomOf(placed))?.certain.push(person.id)
        continue
      }
      const where = ctx.roomsOf(person.id)
      if (where.size === 1) rooms.get([...where][0])?.certain.push(person.id)
      else for (const r of where) rooms.get(r)?.possible.push(person.id)
    }

    for (const [room, state] of rooms) {
      const c = state.certain.length
      const step =
        this.applyCeiling(ctx, clue, room, state, c) ?? this.applyFloor(ctx, clue, room, state, c)
      if (step) return step
    }
    return null
  }

  /** atMost / exactly: the room is full at `count`, so nobody else may enter.
   *  notExactly: at `count` it must NOT stay there — with one possible joiner, they must join. */
  private applyCeiling(
    ctx: SolveContext,
    clue: RoomOccupancyClue,
    room: string,
    state: RoomState,
    c: number,
  ): DeductionStep | null {
    if (clue.op === 'atMost' || clue.op === 'exactly') {
      if (c < clue.count) return null
      const eliminated: Elimination[] = []
      for (const id of state.possible) {
        const removed = ctx.removeWhere(id, (cell) => ctx.roomOf(cell) === room)
        if (removed.length > 0) eliminated.push({ personId: id, cells: removed })
      }
      if (eliminated.length === 0) return null
      return this.step(clue, 'Full', eliminated, { room, count: clue.count })
    }
    if (clue.op === 'notExactly' && c === clue.count && state.possible.length === 1) {
      const id = state.possible[0]
      const removed = ctx.removeWhere(id, (cell) => ctx.roomOf(cell) !== room)
      if (removed.length === 0) return null
      return this.step(clue, 'MustJoin', [{ personId: id, cells: removed }], { room, count: clue.count, name: id })
    }
    return null
  }

  /** atLeast / exactly: the room still needs people and only just enough can reach it.
   *  notExactly: one short of the forbidden count, and a lone joiner would hit it exactly. */
  private applyFloor(
    ctx: SolveContext,
    clue: RoomOccupancyClue,
    room: string,
    state: RoomState,
    c: number,
  ): DeductionStep | null {
    if (clue.op === 'atLeast' || clue.op === 'exactly') {
      const need = clue.count - c
      if (need <= 0 || state.possible.length !== need) return null
      for (const id of state.possible) {
        const removed = ctx.removeWhere(id, (cell) => ctx.roomOf(cell) !== room)
        if (removed.length > 0) {
          return this.step(clue, 'Confine', [{ personId: id, cells: removed }], { room, count: clue.count, name: id })
        }
      }
      return null
    }
    if (clue.op === 'notExactly' && c === clue.count - 1 && state.possible.length === 1) {
      const id = state.possible[0]
      const removed = ctx.removeWhere(id, (cell) => ctx.roomOf(cell) === room)
      if (removed.length === 0) return null
      return this.step(clue, 'MustStayOut', [{ personId: id, cells: removed }], { room, count: clue.count, name: id })
    }
    return null
  }

  private step(
    clue: RoomOccupancyClue,
    kind: string,
    eliminated: Elimination[],
    params: Record<string, string | number>,
  ): DeductionStep {
    return {
      technique: 'roomOccupancy',
      ...(params.name ? { personId: String(params.name) } : {}),
      eliminated,
      // Quote the clue itself as the child so the reason always matches its wording.
      explanation: { key: `step.roomOccupancy${kind}`, params, children: [clue.describe()] },
    }
  }
}
