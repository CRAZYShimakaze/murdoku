import { Technique } from './Technique.ts'
import type { SolveContext } from '../SolveContext.ts'
import type { DeductionStep, Elimination } from '../DeductionStep.ts'
import type { Cell, PersonId } from '../../model/types.ts'

/**
 * Short, human-style case analysis ("either Eli is on the pasture or in the
 * cowshed — either way Z8/S4 is out"). For a candidate cell the transparent base
 * rules are propagated a BOUNDED number of steps on a copy; then:
 *  - a case that quickly hits a contradiction eliminates that candidate (with
 *    the readable chain — the "short logical contradiction" of the rulebook);
 *  - for a person with only a few candidates, a cell impossible in EVERY case
 *    is impossible outright — the classic "wo sich alle Möglichkeiten
 *    überschneiden" elimination.
 * At `depth` 2 the hypothetical propagation may itself use a depth-1 case split
 * — the rulebook's nested "but then either … or …, both fail" argument (rated
 * harder). Unlike the forcing fallback this never searches: the bound keeps
 * every argument short enough to follow by hand.
 */
export class CaseSplitTechnique extends Technique {
  readonly name: 'caseSplit' | 'caseSplitDeep'
  readonly difficulty: number

  /** Intersect cases only for people with this many candidates or fewer. */
  private static readonly MAX_DOMAIN = 4
  /** Propagation budget per case — keeps the chains short and followable. */
  private static readonly MAX_STEPS = 32
  /** Total hypothetical placements per apply() — bounds the scan, smallest
   *  domains first (the cells a human would actually probe). */
  private static readonly MAX_TRIALS = 96

  private readonly inner: Technique[]

  constructor(base: Technique[], depth: 1 | 2 = 1) {
    super()
    this.name = depth === 1 ? 'caseSplit' : 'caseSplitDeep'
    this.difficulty = depth === 1 ? 5 : 6
    this.inner = depth === 1 ? base : [...base, new CaseSplitTechnique(base, 1)]
  }

  apply(ctx: SolveContext): DeductionStep | null {
    const byConstraint = [...ctx.state.unplaced()]
      .filter((id) => ctx.state.domain(id).size >= 2)
      .sort((a, b) => ctx.state.domain(a).size - ctx.state.domain(b).size)

    // Phase 1: probe candidates (most-constrained people first, budgeted) for a
    // case that dies quickly. Cache the surviving trials for phase 2.
    const survivors = new Map<PersonId, { cell: Cell; trial: SolveContext }[]>()
    let trials = 0
    for (const id of byConstraint) {
      const cells = [...ctx.state.domain(id)]
      if (trials + cells.length > CaseSplitTechnique.MAX_TRIALS) break
      trials += cells.length
      const cases: { cell: Cell; trial: SolveContext }[] = []
      for (const cell of cells) {
        const trial = ctx.clone()
        trial.place(id, cell)
        const { steps, dead } = this.propagateBounded(trial)
        if (dead) {
          const removed = ctx.removeWhere(id, (c) => c === cell)
          return {
            technique: this.name,
            personId: id,
            eliminated: [{ personId: id, cells: removed }],
            explanation: { key: 'step.caseSplitContradiction', params: { name: id, cell } },
            chain: [
              { key: 'step.assume', params: { name: id, cell } },
              ...steps.map((s) => s.explanation),
              dead,
            ],
          }
        }
        cases.push({ cell, trial })
      }
      if (cells.length <= CaseSplitTechnique.MAX_DOMAIN) survivors.set(id, cases)
    }

    // Phase 2: for the few-candidate people, eliminate whatever is impossible in
    // every surviving case.
    for (const [id, cases] of survivors) {
      const step = this.intersect(ctx, id, cases)
      if (step) return step
    }
    return null
  }

  /** Eliminate the cells impossible in EVERY case of `id`'s split. */
  private intersect(
    ctx: SolveContext,
    id: PersonId,
    cases: { cell: Cell; trial: SolveContext }[],
  ): DeductionStep | null {
    const eliminated: Elimination[] = []
    for (const other of ctx.state.unplaced()) {
      if (other === id) continue
      const impossible = [...ctx.state.domain(other)].filter((cell) =>
        cases.every(({ trial }) => {
          const placed = trial.state.placed.get(other)
          return placed !== undefined ? placed !== cell : !trial.state.domain(other).has(cell)
        }),
      )
      if (impossible.length > 0) {
        const removed = ctx.removeWhere(other, (c) => impossible.includes(c))
        eliminated.push({ personId: other, cells: removed })
      }
    }
    if (eliminated.length === 0) return null
    return {
      technique: this.name,
      personId: id,
      eliminated,
      explanation: { key: 'step.caseSplitCommon', params: { name: id, count: cases.length } },
    }
  }

  /** Propagate the rules on a copy, stopping at a contradiction, a fixpoint,
   *  or the step budget (so every case stays a SHORT argument). */
  private propagateBounded(trial: SolveContext): {
    steps: DeductionStep[]
    dead: ReturnType<SolveContext['deadReason']>
  } {
    const steps: DeductionStep[] = []
    for (;;) {
      const dead = trial.deadReason()
      if (dead) return { steps, dead }
      if (steps.length >= CaseSplitTechnique.MAX_STEPS) return { steps, dead: null }
      let progressed = false
      for (const technique of this.inner) {
        const step = technique.apply(trial)
        if (step) {
          steps.push(step)
          progressed = true
          break
        }
      }
      if (!progressed) return { steps, dead: null }
    }
  }
}
