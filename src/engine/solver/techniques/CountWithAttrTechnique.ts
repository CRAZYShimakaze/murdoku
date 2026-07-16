import { Technique } from './Technique.ts'
import { CountWithAttrClue } from '../../clues/boardClues.ts'
import { VICTIM_ID } from '../../model/types.ts'
import type { SolveContext } from '../SolveContext.ts'
import type { DeductionStep, Elimination } from '../DeductionStep.ts'
import type { Cell, PersonId } from '../../model/types.ts'
import type { Puzzle } from '../../model/Puzzle.ts'

/**
 * Board clue "exactly N people/suspects with <trait> were inside / outside".
 *
 * This is BoardCountTechnique's counting argument generalised from "everyone × the object
 * cells" to "the trait's carriers × the area cells" — the three rules carry over unchanged:
 *
 *  1. the quota is already met by carriers certain to be in the area ⇒ no other carrier may
 *     enter it;
 *  2. exactly as many carriers can still reach the area as are needed ⇒ each is confined to it;
 *  3. LINE COVER — the area cells the carriers can still reach span exactly `need` distinct
 *     rows (or columns). Each line holds at most one person, so those `need` carriers fill
 *     exactly those lines, one each, every one of them on an area cell ⇒ every NON-area cell
 *     of those lines is empty for EVERYONE (carrier or not).
 */
export class CountWithAttrTechnique extends Technique {
  readonly name = 'countWithAttr'
  readonly difficulty = 4

  override relevant(puzzle: Puzzle): boolean {
    return puzzle.boardClues.some((c) => c instanceof CountWithAttrClue)
  }

  apply(ctx: SolveContext): DeductionStep | null {
    for (const clue of ctx.puzzle.boardClues) {
      if (!(clue instanceof CountWithAttrClue)) continue
      const step = this.applyClue(ctx, clue)
      if (step) return step
    }
    return null
  }

  private applyClue(ctx: SolveContext, clue: CountWithAttrClue): DeductionStep | null {
    const outside = clue.area === 'outside'
    const cells = ctx.board.cellsOutside(outside)
    if (cells.size === 0) return null

    // The clue's carriers: the trait's bearers within its scope (the victim only counts for
    // scope 'people' — and then only for gender, which the clue's own contract enforces).
    const carries = (id: PersonId): boolean =>
      (clue.scope === 'people' || id !== VICTIM_ID) &&
      ctx.puzzle.attributesOf(id)[clue.attribute] === clue.value
    const carriers = ctx.people.map((p) => p.id).filter(carries)
    if (carriers.length === 0) return null

    let placedIn = 0
    for (const id of carriers) {
      const cell = ctx.state.placed.get(id)
      if (cell !== undefined && cells.has(cell)) placedIn++
    }
    const unplaced = carriers.filter((id) => !ctx.state.placed.has(id))
    const guaranteed = unplaced.filter((id) => [...ctx.state.domain(id)].every((c) => cells.has(c)))

    // (1) quota met → no other carrier may be in the area.
    if (placedIn + guaranteed.length === clue.count) {
      const eliminated: Elimination[] = []
      for (const id of unplaced) {
        if (guaranteed.includes(id)) continue
        const removed = ctx.removeWhere(id, (c) => cells.has(c))
        if (removed.length > 0) eliminated.push({ personId: id, cells: removed })
      }
      if (eliminated.length > 0) return this.step(clue, 'Full', eliminated)
    }

    const need = clue.count - placedIn
    if (need <= 0) return null

    // (2) exactly `need` carriers can still reach the area → each is confined to it.
    const possible = unplaced.filter((id) => [...ctx.state.domain(id)].some((c) => cells.has(c)))
    if (possible.length === need) {
      for (const id of possible) {
        const removed = ctx.removeWhere(id, (c) => !cells.has(c))
        if (removed.length > 0) {
          return this.step(clue, 'Confine', [{ personId: id, cells: removed }], id)
        }
      }
    }

    // (3) line cover.
    const reachable = new Set<Cell>()
    for (const id of unplaced) for (const c of ctx.state.domain(id)) if (cells.has(c)) reachable.add(c)
    for (const axis of ['row', 'col'] as const) {
      const lines = new Set([...reachable].map((c) => ctx.board.rc(c)[axis]))
      if (lines.size !== need) continue
      const eliminated: Elimination[] = []
      for (const id of ctx.state.unplaced()) {
        const removed = ctx.removeWhere(
          id,
          (c) => lines.has(ctx.board.rc(c)[axis]) && !cells.has(c),
        )
        if (removed.length > 0) eliminated.push({ personId: id, cells: removed })
      }
      if (eliminated.length > 0) return this.step(clue, 'Line', eliminated)
    }
    return null
  }

  private step(
    clue: CountWithAttrClue,
    kind: 'Full' | 'Confine' | 'Line',
    eliminated: Elimination[],
    personId?: PersonId,
  ): DeductionStep {
    // Reuse the clue's own describe() as the reason's child so the step text quotes the
    // board clue verbatim — no second wording to keep in sync.
    return {
      technique: 'countWithAttr',
      ...(personId ? { personId } : {}),
      eliminated,
      explanation: {
        key: `step.countWithAttr${kind}`,
        params: { ...(personId ? { name: personId } : {}), count: clue.count },
        children: [clue.describe()],
      },
    }
  }
}
