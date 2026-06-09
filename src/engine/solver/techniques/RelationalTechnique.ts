import { Technique } from './Technique.ts'
import { DirectionClue, OffsetClue, SameRoomClue } from '../../clues/relationalClues.ts'
import { AndClue, NotClue } from '../../clues/compositeClues.ts'
import type { Clue } from '../../clues/Clue.ts'
import type { Axis, SolveContext } from '../SolveContext.ts'
import type { DeductionStep, Elimination } from '../DeductionStep.ts'
import type { PersonId } from '../../model/types.ts'
import type { Puzzle } from '../../model/Puzzle.ts'

type Relational = DirectionClue | OffsetClue | SameRoomClue

function relationalClues(clue: Clue): Relational[] {
  if (clue instanceof DirectionClue || clue instanceof OffsetClue || clue instanceof SameRoomClue) {
    return [clue]
  }
  if (clue instanceof AndClue) return clue.clues.flatMap(relationalClues)
  return []
}

/** "NOT in the same room as X" — the people each suspect must be apart from. Only a
 *  PLAIN sameRoom negation gives this; NOT(alone-with) is weaker (could be together
 *  but not alone), so it's excluded. */
function differentRoomTargets(clue: Clue): PersonId[] {
  if (clue instanceof NotClue && clue.inner instanceof SameRoomClue && !clue.inner.alone) {
    return [clue.inner.target]
  }
  if (clue instanceof AndClue) return clue.clues.flatMap(differentRoomTargets)
  return []
}

/**
 * Bound propagation for relational clues:
 * - "south/north/east/west of X": the subject's row/column must beat one of X's
 *   possible rows/columns, and X's must beat one of the subject's.
 * - "same room as X": both are confined to the rooms they share.
 */
export class RelationalTechnique extends Technique {
  readonly name = 'relational'
  readonly difficulty = 3

  apply(ctx: SolveContext): DeductionStep | null {
    for (const suspect of ctx.puzzle.suspects) {
      if (ctx.state.placed.has(suspect.id)) continue
      for (const clue of suspect.clues.flatMap(relationalClues)) {
        let step: DeductionStep | null
        if (clue instanceof DirectionClue) step = this.applyDirection(ctx, suspect.id, clue)
        else if (clue instanceof OffsetClue) step = this.applyOffset(ctx, suspect.id, clue)
        else step = this.applySameRoom(ctx, suspect.id, clue)
        if (step) return step
      }
    }
    // "Different room" — a placed/confined side keeps the other out of that room.
    // (Iterates all suspects: even a placed subject still constrains its target.)
    for (const suspect of ctx.puzzle.suspects) {
      for (const target of suspect.clues.flatMap(differentRoomTargets)) {
        const step = this.applyDifferentRoom(ctx, suspect.id, target)
        if (step) return step
      }
    }
    return null
  }

  override relevant(puzzle: Puzzle): boolean {
    for (const suspect of puzzle.suspects) {
      for (const clue of suspect.clues) {
        if (relationalClues(clue).length > 0 || differentRoomTargets(clue).length > 0) return true
      }
    }
    return false
  }

  /** The room a person is certainly in (placed cell, or whole domain in one room). */
  private roomOf(ctx: SolveContext, id: PersonId): string | null {
    const cell = ctx.state.placed.get(id)
    if (cell !== undefined) return ctx.roomOf(cell)
    return ctx.guaranteedRoomOf(id)
  }

  /** "{subject} not in the same room as {target}": if one is confined to a room, the
   *  other can't be in it. `removeFrom` skips a placed side, so both directions are safe. */
  private applyDifferentRoom(
    ctx: SolveContext,
    subjectId: PersonId,
    target: PersonId,
  ): DeductionStep | null {
    const subjRoom = this.roomOf(ctx, subjectId)
    const targetRoom = this.roomOf(ctx, target)
    const eliminated: Elimination[] = []
    if (subjRoom) this.removeFrom(ctx, target, (c) => ctx.roomOf(c) === subjRoom, eliminated)
    if (targetRoom) this.removeFrom(ctx, subjectId, (c) => ctx.roomOf(c) === targetRoom, eliminated)
    if (eliminated.length === 0) return null
    return {
      technique: 'relational',
      personId: subjectId,
      eliminated,
      explanation: { key: 'step.differentRoom', params: { name: subjectId, target } },
    }
  }

  private removeFrom(
    ctx: SolveContext,
    id: PersonId,
    predicate: (cell: number) => boolean,
    out: Elimination[],
  ): void {
    if (ctx.state.placed.has(id)) return
    const removed = ctx.removeWhere(id, predicate)
    if (removed.length > 0) out.push({ personId: id, cells: removed })
  }

  private applyDirection(
    ctx: SolveContext,
    subjectId: PersonId,
    clue: DirectionClue,
  ): DeductionStep | null {
    const axis: Axis =
      clue.direction === 'north' || clue.direction === 'south' ? 'row' : 'col'
    const subj = ctx.linesOf(subjectId, axis)
    const target = ctx.linesOf(clue.target, axis)
    if (subj.size === 0 || target.size === 0) return null

    const greater = clue.direction === 'south' || clue.direction === 'east'
    const eliminated: Elimination[] = []
    if (greater) {
      const tgtMin = Math.min(...target)
      const subjMax = Math.max(...subj)
      this.removeFrom(ctx, subjectId, (c) => ctx.axisOf(c, axis) <= tgtMin, eliminated)
      this.removeFrom(ctx, clue.target, (c) => ctx.axisOf(c, axis) >= subjMax, eliminated)
    } else {
      const tgtMax = Math.max(...target)
      const subjMin = Math.min(...subj)
      this.removeFrom(ctx, subjectId, (c) => ctx.axisOf(c, axis) >= tgtMax, eliminated)
      this.removeFrom(ctx, clue.target, (c) => ctx.axisOf(c, axis) <= subjMin, eliminated)
    }
    if (eliminated.length === 0) return null
    return {
      technique: 'relational',
      personId: subjectId,
      eliminated,
      explanation: {
        key: 'step.relationalDirection',
        params: { name: subjectId, direction: clue.direction, target: clue.target },
      },
    }
  }

  private applyOffset(
    ctx: SolveContext,
    subjectId: PersonId,
    clue: OffsetClue,
  ): DeductionStep | null {
    const { isColumn, delta } = clue.resolve()
    const axis: Axis = isColumn ? 'col' : 'row'
    const subj = ctx.linesOf(subjectId, axis)
    const target = ctx.linesOf(clue.target, axis)
    if (subj.size === 0 || target.size === 0) return null

    const allowedSubj = new Set([...target].map((c) => c + delta))
    const allowedTarget = new Set([...subj].map((c) => c - delta))
    const eliminated: Elimination[] = []
    this.removeFrom(ctx, subjectId, (c) => !allowedSubj.has(ctx.axisOf(c, axis)), eliminated)
    this.removeFrom(ctx, clue.target, (c) => !allowedTarget.has(ctx.axisOf(c, axis)), eliminated)
    if (eliminated.length === 0) return null

    const described = clue.describe()
    return {
      technique: 'relational',
      personId: subjectId,
      eliminated,
      explanation: { key: described.key, params: { ...described.params, name: subjectId } },
    }
  }

  private applySameRoom(
    ctx: SolveContext,
    subjectId: PersonId,
    clue: SameRoomClue,
  ): DeductionStep | null {
    const subjRooms = ctx.roomsOf(subjectId)
    const targetRooms = ctx.roomsOf(clue.target)
    if (subjRooms.size === 0 || targetRooms.size === 0) return null

    const eliminated: Elimination[] = []
    this.removeFrom(ctx, subjectId, (c) => !targetRooms.has(ctx.roomOf(c)), eliminated)
    this.removeFrom(ctx, clue.target, (c) => !subjRooms.has(ctx.roomOf(c)), eliminated)
    if (eliminated.length === 0) return null
    return {
      technique: 'relational',
      personId: subjectId,
      eliminated,
      explanation: {
        key: 'step.relationalSameRoom',
        params: { name: subjectId, target: clue.target },
      },
    }
  }
}
