import { Technique } from './Technique.ts'
import { VICTIM_ID, type PersonId } from '../../model/types.ts'
import type { SolveContext } from '../SolveContext.ts'
import type { DeductionStep, Elimination } from '../DeductionStep.ts'

/**
 * The core rule of every case: the victim was ALONE with the murderer, so exactly
 * one suspect shares the victim's room. Three sound, readable deductions:
 *  - a room already holding ≥2 sure suspects can't be the victim's room;
 *  - once the victim's room is known, a suspect sure to be there IS the murderer,
 *    so every other suspect leaves that room;
 *  - if only one suspect can be in the victim's room, that suspect must be there.
 */
export class MurderTechnique extends Technique {
  readonly name = 'murderRule'
  readonly difficulty = 5

  apply(ctx: SolveContext): DeductionStep | null {
    const suspects = ctx.puzzle.suspects.map((s) => s.id)
    /** The single room a person is confined to (placed cell or whole domain), else null. */
    const sole = (id: PersonId): string | null => {
      const rooms = ctx.roomsOf(id)
      return rooms.size === 1 ? [...rooms][0] : null
    }
    const victimRoom = sole(VICTIM_ID)

    // --- victim's room is known -------------------------------------------
    if (victimRoom) {
      // A suspect sure to be there is the murderer → every other suspect leaves it.
      const murderer = suspects.find((id) => sole(id) === victimRoom)
      if (murderer) {
        const eliminated: Elimination[] = []
        for (const other of ctx.state.unplaced()) {
          if (other === murderer || other === VICTIM_ID) continue
          const removed = ctx.removeWhere(other, (c) => ctx.roomOf(c) === victimRoom)
          if (removed.length > 0) eliminated.push({ personId: other, cells: removed })
        }
        if (eliminated.length > 0) {
          return {
            technique: 'murderRule',
            personId: murderer,
            eliminated,
            explanation: { key: 'step.murderIdentified', params: { name: murderer, room: victimRoom } },
          }
        }
      }
      // Only one suspect can even be there → that suspect must be the murderer.
      const canBeThere = suspects.filter((id) => ctx.roomsOf(id).has(victimRoom))
      if (canBeThere.length === 1 && !ctx.state.placed.has(canBeThere[0])) {
        const id = canBeThere[0]
        const removed = ctx.removeWhere(id, (c) => ctx.roomOf(c) !== victimRoom)
        if (removed.length > 0) {
          return {
            technique: 'murderRule',
            personId: id,
            eliminated: [{ personId: id, cells: removed }],
            explanation: { key: 'step.murderConfine', params: { name: id, room: victimRoom } },
          }
        }
      }
    }

    // --- a room with ≥2 sure suspects can't be the victim's room ----------
    if (!ctx.state.placed.has(VICTIM_ID)) {
      const sureCount = new Map<string, number>()
      for (const id of suspects) {
        const room = sole(id)
        if (room) sureCount.set(room, (sureCount.get(room) ?? 0) + 1)
      }
      for (const [room, count] of sureCount) {
        if (count < 2) continue
        const removed = ctx.removeWhere(VICTIM_ID, (c) => ctx.roomOf(c) === room)
        if (removed.length > 0) {
          return {
            technique: 'murderRule',
            personId: VICTIM_ID,
            eliminated: [{ personId: VICTIM_ID, cells: removed }],
            explanation: { key: 'step.murderVictimNotRoom', params: { room, count } },
          }
        }
      }
    }

    return null
  }
}
