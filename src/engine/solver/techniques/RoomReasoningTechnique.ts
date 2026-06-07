import { Technique } from './Technique.ts'
import { AloneClue, RoomAttributeClue } from '../../clues/socialClues.ts'
import { AndClue } from '../../clues/compositeClues.ts'
import type { Clue } from '../../clues/Clue.ts'
import type { Axis, SolveContext } from '../SolveContext.ts'
import type { DeductionStep, Elimination } from '../DeductionStep.ts'
import type { PersonId } from '../../model/types.ts'
import type { Puzzle } from '../../model/Puzzle.ts'

/** Required clues are top-level or inside an AND (an OR branch is not certain). */
function hasAlone(clue: Clue): boolean {
  if (clue instanceof AloneClue) return true
  if (clue instanceof AndClue) return clue.clues.some(hasAlone)
  return false
}

function roomAttributes(clue: Clue): RoomAttributeClue[] {
  if (clue instanceof RoomAttributeClue) return [clue]
  if (clue instanceof AndClue) return clue.clues.flatMap(roomAttributes)
  return []
}

/**
 * Room-level deductions (rulebook Tip 2) for the social clues:
 * - a suspect whose every candidate lies in one room is *guaranteed* there;
 * - an "alone" suspect can't enter a room already guaranteed to someone else,
 *   and once they're guaranteed a room, everyone else leaves it;
 * - a "no one with X in my room" suspect can't enter a room guaranteed to an
 *   X-person, and once guaranteed a room, every X-person leaves it.
 */
export class RoomReasoningTechnique extends Technique {
  readonly name = 'roomReasoning'
  readonly difficulty = 4

  apply(ctx: SolveContext): DeductionStep | null {
    const guaranteed = this.guaranteedRooms(ctx)

    for (const suspect of ctx.puzzle.suspects) {
      if (ctx.state.placed.has(suspect.id)) continue
      if (suspect.clues.some(hasAlone)) {
        const step = this.applyAlone(ctx, suspect.id, guaranteed)
        if (step) return step
      }
      for (const rc of suspect.clues.flatMap(roomAttributes)) {
        if (rc.quantifier !== 'none') continue
        const step = this.applyRoomAttribute(ctx, suspect.id, rc, guaranteed)
        if (step) return step
        const pigeon = this.applyAttrPigeonhole(ctx, suspect.id, rc)
        if (pigeon) return pigeon
      }
    }
    return null
  }

  override relevant(puzzle: Puzzle): boolean {
    for (const suspect of puzzle.suspects) {
      for (const clue of suspect.clues) {
        if (hasAlone(clue) || roomAttributes(clue).length > 0) return true
      }
    }
    return false
  }

  /** Room each person is guaranteed to be in (placed cell, or confined domain). */
  private guaranteedRooms(ctx: SolveContext): Map<PersonId, string> {
    const guaranteed = new Map<PersonId, string>()
    for (const [id, cell] of ctx.state.placed) guaranteed.set(id, ctx.roomOf(cell))
    for (const id of ctx.state.unplaced()) {
      const room = ctx.guaranteedRoomOf(id)
      if (room) guaranteed.set(id, room)
    }
    return guaranteed
  }

  private applyAlone(
    ctx: SolveContext,
    id: PersonId,
    guaranteed: Map<PersonId, string>,
  ): DeductionStep | null {
    for (const [otherId, room] of guaranteed) {
      if (otherId === id) continue
      const removed = ctx.removeWhere(id, (c) => ctx.roomOf(c) === room)
      if (removed.length > 0) {
        return {
          technique: 'roomReasoning',
          personId: id,
          eliminated: [{ personId: id, cells: removed }],
          explanation: { key: 'step.aloneExcludeRoom', params: { name: id, room } },
        }
      }
    }

    // (I) Capacity: a room that fully contains a row/column in which this suspect has
    // no candidate is guaranteed to hold that line's occupant (one person per line in
    // a full permutation). Since "alone" means the SOLE person in the room — victim
    // included — the suspect can't be there.
    if (ctx.fullPermutation) {
      for (const room of ctx.roomsOf(id)) {
        for (const axis of ['row', 'col'] as Axis[]) {
          for (const line of ctx.fullLinesIn(room, axis)) {
            if ([...ctx.state.domain(id)].some((c) => ctx.axisOf(c, axis) === line)) continue
            const removed = ctx.removeWhere(id, (c) => ctx.roomOf(c) === room)
            if (removed.length > 0) {
              return {
                technique: 'roomReasoning',
                personId: id,
                eliminated: [{ personId: id, cells: removed }],
                explanation: {
                  key: 'step.aloneExcludeLine',
                  params: { name: id, room, line: axis, num: line + 1 },
                },
              }
            }
          }
        }
      }
    }

    const myRoom = ctx.guaranteedRoomOf(id)
    if (myRoom) {
      const eliminated = this.removeRoomFromOthers(ctx, id, myRoom, () => true)
      if (eliminated.length > 0) {
        return {
          technique: 'roomReasoning',
          personId: id,
          eliminated,
          explanation: { key: 'step.aloneReserve', params: { name: id, room: myRoom } },
        }
      }
    }
    return null
  }

  private applyRoomAttribute(
    ctx: SolveContext,
    id: PersonId,
    rc: RoomAttributeClue,
    guaranteed: Map<PersonId, string>,
  ): DeductionStep | null {
    const matches = (other: PersonId): boolean =>
      ctx.puzzle.attributesOf(other)[rc.attribute] === rc.value

    for (const [otherId, room] of guaranteed) {
      if (otherId === id || !matches(otherId)) continue
      const removed = ctx.removeWhere(id, (c) => ctx.roomOf(c) === room)
      if (removed.length > 0) {
        return {
          technique: 'roomReasoning',
          personId: id,
          eliminated: [{ personId: id, cells: removed }],
          explanation: {
            key: 'step.attrExcludeRoom',
            params: { name: id, room, attribute: rc.attribute },
          },
        }
      }
    }
    const myRoom = ctx.guaranteedRoomOf(id)
    if (myRoom) {
      const eliminated = this.removeRoomFromOthers(ctx, id, myRoom, matches)
      if (eliminated.length > 0) {
        return {
          technique: 'roomReasoning',
          personId: id,
          eliminated,
          explanation: {
            key: 'step.attrReserve',
            params: { name: id, room: myRoom, attribute: rc.attribute },
          },
        }
      }
    }
    return null
  }

  /**
   * (II) Capacity pigeonhole for a "no one with X in my room" suspect: if the people
   * who HAVE X are collectively confined to a set of rooms whose members other than R
   * can't hold them all, then R is forced to contain an X-person — so the subject
   * can't enter R. Generalises the single-person guaranteed-room exclusion to the
   * case where no individual is pinned but the group as a whole overflows.
   */
  private applyAttrPigeonhole(
    ctx: SolveContext,
    id: PersonId,
    rc: RoomAttributeClue,
  ): DeductionStep | null {
    if (!ctx.fullPermutation) return null
    const matchers = ctx.state
      .unplaced()
      .filter((p) => p !== id && ctx.puzzle.attributesOf(p)[rc.attribute] === rc.value)
      .map((p) => ({ rooms: ctx.roomsOf(p) }))
    if (matchers.length === 0) return null

    // The room universe to combine — every room any matcher can still be in. Room
    // counts are tiny; guard the 2^n subset scan anyway for unusually large maps.
    const universe = new Set<string>()
    for (const m of matchers) for (const r of m.rooms) universe.add(r)
    if (universe.size > 12) return null
    const roomList = [...universe]

    for (const target of ctx.roomsOf(id)) {
      if (!universe.has(target)) continue
      for (let mask = 0; mask < 1 << roomList.length; mask++) {
        const set = new Set<string>()
        for (let i = 0; i < roomList.length; i++) if (mask & (1 << i)) set.add(roomList[i])
        if (!set.has(target)) continue
        const group = matchers.filter((m) => [...m.rooms].every((r) => set.has(r)))
        if (group.length === 0) continue
        const others = [...set].filter((r) => r !== target)
        if (group.length <= ctx.roomsCapacity(others)) continue
        const removed = ctx.removeWhere(id, (c) => ctx.roomOf(c) === target)
        if (removed.length > 0) {
          return {
            technique: 'roomReasoning',
            personId: id,
            eliminated: [{ personId: id, cells: removed }],
            explanation: {
              key: 'step.attrPigeonhole',
              params: { name: id, room: target, attribute: rc.attribute },
            },
          }
        }
      }
    }
    return null
  }

  private removeRoomFromOthers(
    ctx: SolveContext,
    id: PersonId,
    room: string,
    predicate: (other: PersonId) => boolean,
  ): Elimination[] {
    const eliminated: Elimination[] = []
    for (const other of ctx.state.unplaced()) {
      if (other === id || !predicate(other)) continue
      const removed = ctx.removeWhere(other, (c) => ctx.roomOf(c) === room)
      if (removed.length > 0) eliminated.push({ personId: other, cells: removed })
    }
    return eliminated
  }
}
