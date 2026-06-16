import { Technique } from './Technique.ts'
import { EmptyRoomsClue } from '../../clues/boardClues.ts'
import type { SolveContext } from '../SolveContext.ts'
import type { DeductionStep, Elimination } from '../DeductionStep.ts'
import type { Puzzle } from '../../model/Puzzle.ts'

/**
 * Board clue "exactly N rooms are empty" — two forward deductions a human makes
 * straight from the rule, no trial:
 *
 *  A. Enough rooms are ALREADY certainly occupied (R−N of them) ⇒ every other room
 *     must stay empty ⇒ nobody may be placed there. (The player's "B can't go here,
 *     that would leave the wrong number of rooms empty".)
 *  B. Exactly N rooms can no longer hold anyone ⇒ every other room must be occupied ⇒
 *     a room only one person can still reach confines that person to it.
 *
 * The victim never opens a NEW room (it always shares the murderer's), so a room counts
 * as occupied as soon as one suspect is certain to be in it.
 */
export class EmptyRoomsTechnique extends Technique {
  readonly name = 'emptyRooms'
  readonly difficulty = 4

  override relevant(puzzle: Puzzle): boolean {
    return puzzle.boardClues.some((c) => c instanceof EmptyRoomsClue)
  }

  apply(ctx: SolveContext): DeductionStep | null {
    const clue = ctx.puzzle.boardClues.find((c): c is EmptyRoomsClue => c instanceof EmptyRoomsClue)
    if (!clue) return null
    const n = clue.count
    const rooms = [...ctx.board.rooms.keys()]
    const occupiedTarget = rooms.length - n
    if (occupiedTarget < 0) return null

    // Occupancy is reckoned over SUSPECTS only: the victim never occupies a room on its
    // own (it sits with the murderer), so "empty" means "no suspect here". Counting the
    // victim as a possible occupant would mask exactly the deductions a player makes.
    const suspects = ctx.state.unplaced().filter((id) => !ctx.isVictim(id))
    // Rooms with a CERTAIN suspect (a placed suspect, or an unplaced suspect all of whose
    // candidates lie in one room) and rooms a suspect can still reach at all.
    const certain = new Set<string>()
    for (const [id, cell] of ctx.state.placed) {
      if (!ctx.isVictim(id)) certain.add(ctx.board.roomIdOf(cell))
    }
    for (const id of suspects) {
      const where = ctx.roomsOf(id)
      if (where.size === 1) certain.add([...where][0])
    }
    const live = new Set<string>(certain)
    for (const id of suspects) for (const r of ctx.roomsOf(id)) live.add(r)

    // A. The occupied quota is met → every other room must end empty, so NObody (suspect
    //    or victim) may be placed there.
    if (certain.size === occupiedTarget) {
      const eliminated: Elimination[] = []
      for (const id of ctx.state.unplaced()) {
        const removed = ctx.removeWhere(id, (c) => !certain.has(ctx.board.roomIdOf(c)))
        if (removed.length > 0) eliminated.push({ personId: id, cells: removed })
      }
      if (eliminated.length > 0) {
        return {
          technique: 'emptyRooms',
          eliminated,
          explanation: { key: 'step.emptyRoomsAllOccupied', params: { count: n } },
        }
      }
    }

    // B. Exactly N rooms can no longer hold a suspect → every other room must be occupied;
    //    a room only one suspect can still reach confines that suspect to it.
    const deadEmpty = rooms.filter((r) => !live.has(r))
    if (deadEmpty.length === n) {
      for (const room of rooms) {
        if (certain.has(room) || !live.has(room)) continue
        const possible = suspects.filter((id) => ctx.roomsOf(id).has(room))
        if (possible.length !== 1) continue
        const id = possible[0]
        const removed = ctx.removeWhere(id, (c) => ctx.board.roomIdOf(c) !== room)
        if (removed.length > 0) {
          return {
            technique: 'emptyRooms',
            personId: id,
            eliminated: [{ personId: id, cells: removed }],
            explanation: { key: 'step.emptyRoomsConfine', params: { name: id, room, count: n } },
          }
        }
      }
    }
    return null
  }
}
