import { Technique } from './Technique.ts'
import { NeighborRoomCountClue, NeighborRoomEmptyClue } from '../../clues/socialClues.ts'
import { AndClue, NotClue } from '../../clues/compositeClues.ts'
import type { Clue } from '../../clues/Clue.ts'
import type { SolveContext } from '../SolveContext.ts'
import type { DeductionStep } from '../DeductionStep.ts'
import type { Cell, PersonId } from '../../model/types.ts'
import type { Puzzle } from '../../model/Puzzle.ts'

/** An "empty neighbour" clue and whether it is negated. `NeighborRoomEmptyClue` has no
 *  `definiteCells` (it depends on everyone else), so `NotClue` can't prune it — the negated
 *  form has to be recognised here, the same way RelationalTechnique reads NOT(sameRoom). */
interface EmptyUse {
  clue: NeighborRoomEmptyClue
  negated: boolean
}

function emptyUses(clue: Clue, negated = false): EmptyUse[] {
  if (clue instanceof NeighborRoomEmptyClue) return [{ clue, negated }]
  if (clue instanceof NotClue) return emptyUses(clue.inner, !negated)
  if (clue instanceof AndClue) return clue.clues.flatMap((c) => emptyUses(c, negated))
  return []
}

/** Certain (non-negated) "adjoining room held exactly N suspects" clues. A NEGATED one says
 *  only "some other count" — a disjunction over every other value, which prunes nothing
 *  forward, so it is deliberately ignored. */
function countClues(clue: Clue): NeighborRoomCountClue[] {
  if (clue instanceof NeighborRoomCountClue) return [clue]
  if (clue instanceof AndClue) return clue.clues.flatMap(countClues)
  return []
}

/**
 * Forward deduction for the two room-neighbourhood clues. Both work the same way: for each
 * cell the subject could still occupy, ask whether the clue could STILL come true if they
 * stood there; cells where it provably can't are removed. Every bound below is a necessary
 * condition, so a cell is only ever dropped when no completion could rescue it.
 *
 *  - "an empty room adjoined his room" (∃): once EVERY neighbour of a room is certainly
 *    occupied, the subject can't be in that room.
 *  - "NO empty room adjoined his room" (∀, the negation): if a room has a neighbour that
 *    nobody can reach any more, that neighbour ends up empty — so the subject can't be in it.
 *  - "an adjoining room held exactly N suspects": a room is only a possible witness while N
 *    lies between the suspects already certain to be in it and the most it could still hold
 *    (row/column capacity, and how many suspects can reach it at all). With no qualifying
 *    neighbour left, the cell goes.
 */
export class NeighborRoomTechnique extends Technique {
  readonly name = 'neighborRoom'
  readonly difficulty = 4

  override relevant(puzzle: Puzzle): boolean {
    return puzzle.suspects.some((s) =>
      s.clues.some((c) => emptyUses(c).length > 0 || countClues(c).length > 0),
    )
  }

  apply(ctx: SolveContext): DeductionStep | null {
    for (const suspect of ctx.puzzle.suspects) {
      if (ctx.state.placed.has(suspect.id)) continue
      for (const use of suspect.clues.flatMap((c) => emptyUses(c))) {
        const step = this.applyEmpty(ctx, suspect.id, use.negated)
        if (step) return step
      }
      for (const clue of suspect.clues.flatMap(countClues)) {
        const step = this.applyCount(ctx, suspect.id, clue)
        if (step) return step
      }
    }
    return null
  }

  /** Rooms where SOME person is already certain to be (placed there, or every candidate of
   *  theirs lies inside it). Counted over ALL people, matching the clue's own notion of
   *  "empty" — a person of any kind makes a room non-empty. */
  private certainlyOccupied(ctx: SolveContext): Set<string> {
    const out = new Set<string>()
    for (const person of ctx.people) {
      const placed = ctx.state.placed.get(person.id)
      if (placed !== undefined) out.add(ctx.roomOf(placed))
      else {
        const room = ctx.guaranteedRoomOf(person.id)
        if (room) out.add(room)
      }
    }
    return out
  }

  /** Rooms at least one person can still reach (placed in, or holding a candidate). */
  private reachable(ctx: SolveContext): Set<string> {
    const out = new Set<string>()
    for (const person of ctx.people) for (const room of ctx.roomsOf(person.id)) out.add(room)
    return out
  }

  private applyEmpty(ctx: SolveContext, subjectId: PersonId, negated: boolean): DeductionStep | null {
    const board = ctx.board
    // ∃-form: a room is impossible once every neighbour of it is certainly occupied.
    // ∀-form: a room is impossible as soon as one neighbour can no longer hold anyone.
    const occupied = negated ? null : this.certainlyOccupied(ctx)
    const live = negated ? this.reachable(ctx) : null
    const dead = (room: string): boolean => {
      const neighbors = board.roomNeighbors(room)
      if (neighbors.size === 0) return !negated // no neighbour at all ⇒ no empty one exists
      return negated
        ? [...neighbors].some((n) => !live!.has(n))
        : [...neighbors].every((n) => occupied!.has(n))
    }
    const removed = ctx.removeWhere(subjectId, (c) => dead(ctx.roomOf(c)))
    if (removed.length === 0) return null
    return {
      technique: 'neighborRoom',
      personId: subjectId,
      eliminated: [{ personId: subjectId, cells: removed }],
      explanation: {
        key: negated ? 'step.neighborRoomAllOccupied' : 'step.neighborRoomEmpty',
        params: { name: subjectId },
      },
    }
  }

  private applyCount(
    ctx: SolveContext,
    subjectId: PersonId,
    clue: NeighborRoomCountClue,
  ): DeductionStep | null {
    const board = ctx.board
    const suspects = ctx.puzzle.suspects.map((s) => s.id)

    /** Suspects certainly in `room`, and the most it could still hold. */
    const bounds = (room: string): { min: number; max: number } => {
      let min = 0
      let possible = 0
      for (const id of suspects) {
        const rooms = ctx.roomsOf(id)
        if (!rooms.has(room)) continue
        possible++
        if (rooms.size === 1) min++
      }
      // Everyone sits in a distinct row AND column, so a room never holds more than its
      // capacity — nor more suspects than can reach it.
      return { min, max: Math.min(possible, board.roomCapacity(room)) }
    }
    const cache = new Map<string, boolean>()
    const feasible = (room: string): boolean => {
      let hit = cache.get(room)
      if (hit === undefined) {
        const { min, max } = bounds(room)
        hit = clue.count >= min && clue.count <= max
        cache.set(room, hit)
      }
      return hit
    }
    // The subject can only stand where at least one qualifying neighbour could still hold
    // exactly `count` suspects.
    const dead = (cell: Cell): boolean => !clue.targetRooms(board, cell).some(feasible)
    const removed = ctx.removeWhere(subjectId, dead)
    if (removed.length === 0) return null
    return {
      technique: 'neighborRoom',
      personId: subjectId,
      eliminated: [{ personId: subjectId, cells: removed }],
      explanation: {
        key: 'step.neighborRoomCount',
        params: { name: subjectId, count: clue.count },
      },
    }
  }
}
