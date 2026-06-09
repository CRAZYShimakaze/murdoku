import { Technique } from './Technique.ts'
import { BesideSameObjectClue } from '../../clues/objectClues.ts'
import { AndClue } from '../../clues/compositeClues.ts'
import type { Clue } from '../../clues/Clue.ts'
import type { Cell, PersonId } from '../../model/types.ts'
import type { SolveContext } from '../SolveContext.ts'
import type { DeductionStep } from '../DeductionStep.ts'
import type { Puzzle } from '../../model/Puzzle.ts'

/** "Beside the same object as …" clues that are certain (top-level or inside an AND). */
function besideClues(clue: Clue): BesideSameObjectClue[] {
  if (clue instanceof BesideSameObjectClue) return [clue]
  if (clue instanceof AndClue) return clue.clues.flatMap(besideClues)
  return []
}

/**
 * Forward refinement for "{name} was beside the same object as {mate}": the subject
 * can only stand beside an object instance that a possible mate can ALSO stand beside
 * — so cells beside instances no mate can reach are removed (and, for a named mate,
 * symmetrically). Sound (only removes provably-impossible cells); the candidate set
 * from the clue already pins both sides to "beside such an object". Direction is left
 * to the search (ignoring it here only prunes less, never wrongly).
 */
export class SameObjectTechnique extends Technique {
  readonly name = 'sameObject'
  readonly difficulty = 3

  override relevant(puzzle: Puzzle): boolean {
    return puzzle.suspects.some((s) => s.clues.some((c) => besideClues(c).length > 0))
  }

  apply(ctx: SolveContext): DeductionStep | null {
    for (const suspect of ctx.puzzle.suspects) {
      if (ctx.state.placed.has(suspect.id)) continue
      for (const clue of suspect.clues.flatMap(besideClues)) {
        const step = this.applyClue(ctx, suspect.id, clue)
        if (step) return step
      }
    }
    return null
  }

  private applyClue(ctx: SolveContext, id: PersonId, clue: BesideSameObjectClue): DeductionStep | null {
    const besides = clue.besideSets(ctx.board)
    const mates = clue.mateIds(ctx.puzzle, id)
    const canBeside = (who: PersonId, set: Set<Cell>): boolean =>
      ctx.cellsOf(who).some((c) => set.has(c))

    // The subject can only be beside an instance some mate can also reach.
    const allowed = new Set<Cell>()
    for (const set of besides) {
      if (mates.some((m) => canBeside(m, set))) for (const c of set) allowed.add(c)
    }
    const removed = ctx.removeWhere(id, (c) => !allowed.has(c))
    if (removed.length > 0) {
      return {
        technique: 'sameObject',
        personId: id,
        eliminated: [{ personId: id, cells: removed }],
        explanation: { key: 'step.sameObject', params: { name: id, objectNom: clue.object } },
      }
    }

    // Named mate: symmetrically, they can only be beside an instance the subject can reach.
    if (clue.mate.kind === 'person' && !ctx.state.placed.has(clue.mate.of)) {
      const mate = clue.mate.of
      const allowedM = new Set<Cell>()
      for (const set of besides) {
        if (canBeside(id, set)) for (const c of set) allowedM.add(c)
      }
      const removedM = ctx.removeWhere(mate, (c) => !allowedM.has(c))
      if (removedM.length > 0) {
        return {
          technique: 'sameObject',
          personId: mate,
          eliminated: [{ personId: mate, cells: removedM }],
          explanation: { key: 'step.sameObject', params: { name: mate, objectNom: clue.object } },
        }
      }
    }
    return null
  }
}
