import { Solution } from '../model/Solution.ts'
import { SolveContext } from './SolveContext.ts'
import { findMurderer } from './murderer.ts'
import { createForwardTechniques, propagate } from './forward.ts'
import { TECHNIQUE_RANK, difficultyOf } from './DeductionStep.ts'
import type { Cell, Explanation, PersonId } from '../model/types.ts'
import type { Puzzle } from '../model/Puzzle.ts'
import type { DeductionResult, DeductionStep, HintResult } from './DeductionStep.ts'
import type { Technique } from './techniques/Technique.ts'

/** One player-facing hint distilled from the full solution: cross a now-empty cell,
 *  or place a person. `step` carries the readable reasoning shown to the player. */
interface HintAction {
  kind: 'cross' | 'place'
  /** A placement targets one cell; a cross groups every cell the SAME deduction empties. */
  cells: Cell[]
  personId?: PersonId
  step: DeductionStep
}

/** The readable "if X here → … → impossible" trace of a hypothetical step (case
 *  split / forcing), or null for a transparent step (which needs no chain). */
function contradictionChain(step: DeductionStep): Explanation[] | undefined {
  return step.chain && step.chain.length > 0 ? step.chain : undefined
}

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
  /** The full solution replayed as ordered player actions — built once, on demand. */
  private hintActionsCache?: HintAction[]

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
   * The next hint for the player — a REPLAY of the full solution (the exact path the
   * debug solve logs), distilled into the concrete actions a player takes and shown
   * one at a time. Reads the player's committed `placed` and crossed-out `crosses`;
   * returns the FIRST action they haven't done yet, so pressing again repeats the
   * same hint until they act on it, then advances.
   *
   * Two action kinds, each carrying the real reasoning (never a bare "only field"):
   *  - **cross** a cell whose LAST possible occupant the deduction just removed — a
   *    provably empty cell, so a sound X (e.g. "Anna can't be in the fruit aisle, and
   *    she was the only one left for Z2/S1 → X").
   *  - **place** a person, listing WHY each of their other candidate cells fell away
   *    (so "Floyd → Z5/S6" comes WITH the murder-rule reason, not as a bare claim).
   */
  nextHint(
    placed: ReadonlyMap<PersonId, Cell>,
    crosses: ReadonlySet<Cell> = new Set(),
  ): HintResult | null {
    // Every suspect placed ⇒ the case is solved; the leftover crosses don't matter.
    if (this.puzzle.suspects.every((s) => placed.has(s.id))) return null
    for (const action of this.hintActions()) {
      if (action.kind === 'place') {
        if (placed.get(action.personId!) === action.cells[0]) continue
        return { step: action.step, focus: action.cells, kind: 'place' }
      }
      // Only the cells not yet crossed remain to do — repeats (with fewer cells) until
      // the player has crossed them all, then the next action surfaces. The "cross these"
      // line is appended AFTER any contradiction chain the step already carries.
      const pending = action.cells.filter((c) => !crosses.has(c))
      if (pending.length === 0) continue
      const cells = pending.join(',')
      return {
        step: {
          ...action.step,
          chain: [...(action.step.chain ?? []), { key: 'why.crossThis', params: { cells } }],
        },
        focus: pending,
        kind: 'exclude',
      }
    }
    return null
  }

  /**
   * Replay the full solution once and distil it into the ordered list of concrete
   * player actions. A cell is surfaced as a "cross" only at the step that removes its
   * LAST possible occupant — so every suggested X is genuinely empty in the solution,
   * never a premature guess. Placement steps auto-cross their own row/column in-game,
   * so those crosses aren't surfaced separately. Cached (the puzzle never changes).
   */
  private hintActions(): HintAction[] {
    if (this.hintActionsCache) return this.hintActionsCache
    const victimId = this.puzzle.victim.id
    const ctx = SolveContext.create(this.puzzle)
    this.seedDomains(ctx)
    const liveCells = (): Set<Cell> => {
      const set = new Set<Cell>()
      for (const id of ctx.state.unplaced()) for (const c of ctx.state.domain(id)) set.add(c)
      for (const c of ctx.state.placed.values()) set.add(c)
      return set
    }
    let live = liveCells()
    // For each (person, cell) the solution rules out, the FIRST (most fundamental)
    // reason — as readable LINES. A proof-by-contradiction step contributes its whole
    // "if X here → … → impossible" chain (so a placement that hinged on it explains
    // the contradiction), everything else its one-line explanation.
    const elimReason = new Map<string, Explanation[]>()
    const actions: HintAction[] = []
    let progress = true
    while (progress && ctx.state.unplaced().length > 0) {
      progress = false
      for (const technique of this.techniques) {
        const step = technique.apply(ctx)
        if (!step) continue
        progress = true
        const reason = contradictionChain(step) ?? [step.explanation]
        for (const e of step.eliminated ?? []) {
          for (const c of e.cells) {
            const key = `${e.personId}:${c}`
            if (!elimReason.has(key)) elimReason.set(key, reason)
          }
        }
        const nowLive = liveCells()
        if (step.placedCell !== undefined && step.personId && step.personId !== victimId) {
          actions.push({
            kind: 'place',
            cells: [step.placedCell],
            personId: step.personId,
            step: { ...step, chain: this.placementWhy(step.personId, step.placedCell, elimReason) },
          })
        } else if (step.placedCell === undefined) {
          // Every cell this reasoning step just emptied (its last occupant removed) —
          // grouped into ONE cross hint so the reason reads once, not per cell. A
          // contradiction step carries its chain so the cross isn't a bare "impossible".
          const dead = [...live].filter((c) => !nowLive.has(c))
          if (dead.length > 0) {
            actions.push({
              kind: 'cross',
              cells: dead,
              step: {
                technique: step.technique,
                personId: step.personId,
                explanation: step.explanation,
                chain: contradictionChain(step),
              },
            })
          }
        }
        live = nowLive
        break
      }
    }
    return (this.hintActionsCache = actions)
  }

  /**
   * Why each of a placed person's OTHER candidate cells was impossible — the real
   * reasons drawn from the solution, deduped (a step that ruled out several of this
   * person's cells reads once) and softly capped, ending in "so {name} is on {cell}".
   */
  private placementWhy(
    id: PersonId,
    cell: Cell,
    elimReason: ReadonlyMap<string, Explanation[]>,
  ): Explanation[] {
    const cands = [...this.clueCandidates(id)]
    if (cands.length <= 1) return [{ key: 'why.only', params: { name: id, cell } }]
    const chain: Explanation[] = []
    const seen = new Set<string>()
    for (const c of cands) {
      if (c === cell || chain.length >= 12) continue // soft cap so the panel stays readable
      const lines = elimReason.get(`${id}:${c}`)
      if (!lines) continue
      const k = lines.map((e) => `${e.key}|${JSON.stringify(e.params ?? {})}`).join('>')
      if (seen.has(k)) continue
      seen.add(k)
      chain.push(...lines)
    }
    chain.push({ key: 'why.only', params: { name: id, cell } })
    return chain
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
