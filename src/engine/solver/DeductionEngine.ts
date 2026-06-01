import { Solution } from '../model/Solution.ts'
import { SolveContext } from './SolveContext.ts'
import { findMurderer } from './murderer.ts'
import { createForwardTechniques, propagate } from './forward.ts'
import { TECHNIQUE_RANK, difficultyOf } from './DeductionStep.ts'
import type { Cell, Explanation, PersonId } from '../model/types.ts'
import type { Puzzle } from '../model/Puzzle.ts'
import type {
  DeductionResult,
  DeductionStep,
  HintKind,
  HintProgress,
  HintResult,
} from './DeductionStep.ts'
import type { Technique } from './techniques/Technique.ts'

/**
 * Solves a puzzle by **pure forward deduction** — no guessing, no trial
 * placements, no search. Each technique only ever places a provably-forced cell
 * or eliminates a provably-impossible one; after every step all techniques are
 * retried, so a placement fires as soon as eliminations make a cell forced (the
 * human "remember impossible cells, then re-check"). Produces the hint path and
 * the difficulty rating. Levels that need search are left `stuck` (the
 * SearchSolver is the fast oracle for uniqueness + the answer).
 */
export class DeductionEngine {
  private readonly techniques: Technique[]

  constructor(private readonly puzzle: Puzzle) {
    this.techniques = createForwardTechniques(puzzle)
  }

  solve(): DeductionResult {
    const ctx = SolveContext.create(this.puzzle)
    const steps: DeductionStep[] = []
    this.seedDomains(ctx)
    this.recordCandidates(ctx, steps)

    for (const step of propagate(ctx, this.techniques)) steps.push(step)

    if (ctx.state.unplaced().length > 0) {
      steps.push({
        technique: 'stuck',
        explanation: { key: 'step.stuck', params: { count: ctx.state.unplaced().length } },
      })
      return this.finish(steps, null, false)
    }

    const solution = new Solution(new Map(ctx.state.placed))
    steps.push(this.identifyMurderer(solution))
    return this.finish(steps, solution, true)
  }

  /**
   * The next single deduction given the player's current placements — the hint
   * system. `placed` maps a person to the cell the player has committed. Returns
   * the step plus the cells to highlight (see HintResult), or null when stuck.
   */
  nextHint(
    placed: ReadonlyMap<PersonId, Cell>,
    crosses: ReadonlySet<Cell> = new Set(),
    seen?: HintProgress,
  ): HintResult | null {
    const ctx = this.buildContext(placed, crosses, seen)
    // A useful hint is the next "real" step: a placement ("X goes here"), a
    // contradiction proof with a readable chain ("if X here → … → impossible"), or
    // the opaque SAT fallback. Cheap intermediate eliminations are applied silently
    // (they were the "useless" hints), so the surfaced hint always carries weight.
    let fallback: HintResult | null = null
    while (ctx.state.unplaced().length > 0) {
      let step: DeductionStep | null = null
      for (const technique of this.techniques) {
        step = technique.apply(ctx)
        if (step) break
      }
      if (!step) break
      const result = { step, ...this.focusOf(ctx, step) }
      if (
        step.placedCell !== undefined ||
        step.chain ||
        step.technique === 'satForcing' ||
        step.technique === 'rectangle'
      ) {
        // A transparent placement whose uniqueness isn't obvious gets a "why the
        // others fall away" chain. (SAT placements already carry their own reason.)
        if (
          step.placedCell !== undefined &&
          !step.chain &&
          step.personId &&
          step.technique !== 'satForcing'
        ) {
          const why = this.explainPlacement(placed, crosses, seen, step.personId, step.placedCell)
          if (why.length > 0) step.chain = why
        }
        return result
      }
      fallback = result
    }
    return fallback
  }

  /**
   * Why a forced placement is the ONLY option: a reason for each OTHER cell the
   * player still sees open for this person (occupied row/column, a reserved line,
   * crossed out, or otherwise excluded), ending in the conclusion. Empty when the
   * clues already pin the person to one cell (nothing to explain) or for the
   * unconstrained victim.
   */
  private explainPlacement(
    placed: ReadonlyMap<PersonId, Cell>,
    crosses: ReadonlySet<Cell>,
    seen: HintProgress | undefined,
    id: PersonId,
    cell: Cell,
  ): Explanation[] {
    if (id === this.puzzle.victim.id) return []
    const visible = [...this.clueCandidates(id)]
    if (visible.length <= 1 || visible.length > 6) return []
    // Same board state the hint was derived from (placements + crosses + walk), id open.
    const ctx = this.buildContext(placed, crosses, seen)
    const chain: Explanation[] = []
    for (const d of visible) {
      if (d !== cell) chain.push(this.whyExcluded(ctx, crosses, id, d))
    }
    chain.push({ key: 'why.only', params: { name: id, cell } })
    return chain
  }

  /** The reason cell `d` is impossible for `id`, given the current board state. */
  private whyExcluded(
    ctx: SolveContext,
    crosses: ReadonlySet<Cell>,
    id: PersonId,
    d: Cell,
  ): Explanation {
    const board = this.puzzle.board
    const { row, col } = board.rc(d)
    if (crosses.has(d)) return { key: 'why.crossed', params: { cell: d } }
    for (const [pid, pc] of ctx.state.placed) {
      if (pid === id) continue
      if (pc === d) return { key: 'why.occupied', params: { cell: d, name: pid } }
      const p = board.rc(pc)
      if (p.row === row) return { key: 'why.row', params: { cell: d, name: pid } }
      if (p.col === col) return { key: 'why.col', params: { cell: d, name: pid } }
    }
    for (const z of ctx.state.unplaced()) {
      if (z === id) continue
      const rows = ctx.linesOf(z, 'row')
      if (rows.size === 1 && rows.has(row)) return { key: 'why.rowReserved', params: { cell: d, name: z } }
      const cols = ctx.linesOf(z, 'col')
      if (cols.size === 1 && cols.has(col)) return { key: 'why.colReserved', params: { cell: d, name: z } }
    }
    return { key: 'why.eliminated', params: { cell: d } }
  }

  /**
   * A solving context seeded from the clues with the player's committed placements
   * and crosses applied — plus, optionally, the hints already shown this round
   * (`seen`) so the next hint advances rather than repeats.
   */
  private buildContext(
    placed: ReadonlyMap<PersonId, Cell>,
    crosses: ReadonlySet<Cell>,
    seen?: HintProgress,
  ): SolveContext {
    const ctx = SolveContext.create(this.puzzle)
    this.seedDomains(ctx)
    for (const [id, cell] of placed) if (!ctx.state.placed.has(id)) ctx.place(id, cell)
    if (seen) for (const [id, cell] of seen.placed) if (!ctx.state.placed.has(id)) ctx.place(id, cell)
    if (crosses.size > 0) for (const id of ctx.state.unplaced()) ctx.removeWhere(id, (c) => crosses.has(c))
    if (seen) {
      for (const [id, cells] of seen.eliminated) {
        if (!ctx.state.placed.has(id)) ctx.removeWhere(id, (c) => cells.has(c))
      }
    }
    return ctx
  }

  /** The cells a person could occupy considering ONLY their own clues (what the
   *  player sees highlighted when selecting them). */
  private clueCandidates(id: PersonId): Set<Cell> {
    const board = this.puzzle.board
    const person = this.puzzle.people().find((p) => p.id === id)
    let domain = new Set<Cell>(board.occupiableCells())
    for (const clue of person?.clues ?? []) {
      const cells = clue.candidateCells(board)
      if (cells) domain = new Set([...domain].filter((c) => cells.has(c)))
    }
    return domain
  }

  /**
   * The cells a hint highlights, read from the step AFTER it was applied: a
   * forced cell (place), the subject's remaining candidates when their OWN
   * domain shrank (narrow), else the cells removed from others (exclude).
   */
  private focusOf(ctx: SolveContext, step: DeductionStep): { focus: Cell[]; kind: HintKind } {
    if (step.placedCell !== undefined) return { focus: [step.placedCell], kind: 'place' }
    // A proof-by-contradiction step is about the cell(s) it just ruled out.
    if (step.chain) {
      const cells = new Set<Cell>()
      for (const e of step.eliminated ?? []) for (const c of e.cells) cells.add(c)
      return { focus: [...cells], kind: 'exclude' }
    }
    const selfNarrowed =
      step.personId !== undefined &&
      (step.eliminated ?? []).some((e) => e.personId === step.personId)
    if (selfNarrowed) return { focus: [...ctx.state.domain(step.personId!)], kind: 'narrow' }
    const cells = new Set<Cell>()
    for (const e of step.eliminated ?? []) for (const c of e.cells) cells.add(c)
    return { focus: [...cells], kind: 'exclude' }
  }

  /** Initial per-person candidate sets from the clues. */
  private seedDomains(ctx: SolveContext): void {
    const occupiable = ctx.board.occupiableCells()
    for (const person of ctx.people) {
      const domain = new Set<Cell>(occupiable)
      for (const clue of person.clues) {
        const cells = clue.candidateCells(ctx.board)
        if (cells) {
          for (const cell of [...domain]) {
            if (!cells.has(cell)) domain.delete(cell)
          }
        }
      }
      ctx.state.setDomain(person.id, domain)
    }
  }

  private recordCandidates(ctx: SolveContext, steps: DeductionStep[]): void {
    for (const person of ctx.people) {
      if (person.clues.length === 0) continue
      steps.push({
        technique: 'clueCandidates',
        personId: person.id,
        candidates: [...ctx.state.domain(person.id)],
        explanation: {
          key: 'step.clueCandidates',
          params: { name: person.id, count: ctx.state.domain(person.id).size },
        },
      })
    }
  }

  private finish(
    steps: DeductionStep[],
    solution: Solution | null,
    solved: boolean,
  ): DeductionResult {
    const techniqueCounts: Record<string, number> = {}
    let maxRank = 0
    for (const step of steps) {
      techniqueCounts[step.technique] = (techniqueCounts[step.technique] ?? 0) + 1
      maxRank = Math.max(maxRank, TECHNIQUE_RANK[step.technique])
    }
    return { steps, solution, solved, difficulty: difficultyOf(maxRank), maxRank, techniqueCounts }
  }

  private identifyMurderer(solution: Solution): DeductionStep {
    const result = findMurderer(this.puzzle, solution)
    if (result.suspectId) {
      return {
        technique: 'murderer',
        personId: result.suspectId,
        explanation: {
          key: 'step.murderer',
          params: { name: result.suspectId, room: result.roomId },
        },
      }
    }
    return {
      technique: 'murderer',
      explanation: {
        key: 'step.murdererAmbiguous',
        params: { count: result.suspectsInRoom.length, room: result.roomId },
      },
    }
  }
}
