import { Solution } from '../model/Solution.ts'
import { SolveContext } from './SolveContext.ts'
import { findMurderer } from './murderer.ts'
import { unsatisfiedClues } from './diagnose.ts'
import { createForwardTechniques, propagate, type TechniqueOptions } from './forward.ts'
import { TECHNIQUE_RANK, difficultyOf } from './DeductionStep.ts'
import type { Cell, Explanation, PersonId } from '../model/types.ts'
import type { Puzzle } from '../model/Puzzle.ts'
import type { DeductionResult, DeductionStep, HintResult, Technique as TechniqueName } from './DeductionStep.ts'
import type { Technique } from './techniques/Technique.ts'
import { AloneClue, AndClue, type Clue } from '../clues/index.ts'

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

/** Techniques whose REASON describes the partially-solved board ("everything crossed
 *  except X", "only Y is free", a placement) instead of a direct clue fact — excluded from
 *  the player-error note/figure reasons, which must read as obvious from the clues alone
 *  (the player usually hasn't crossed anything yet, so "all crossed except X" is nonsense). */
const DERIVED_TECHNIQUES = new Set<TechniqueName>([
  'hiddenSingleRow',
  'hiddenSingleCol',
  'forcedCell',
  'crossCenter',
  'rectangle',
  'nakedSingle',
])

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
  /** Per "personId:cell": the DIRECT reason the solution rules it out — drawn ONLY from
   *  constraint steps that fire BEFORE anyone is placed (no "X must be on Y" placement
   *  reasons, nothing derived). Built alongside the hint actions. */
  private directElimCache?: Map<string, { lines: Explanation[]; rank: number }>

  /**
   * If putting `id` on `cell` is OBVIOUSLY wrong — ruled out by a DIRECT clue statement the
   * player can follow right away (e.g. "B was in row 1", "D was south of C"), not by a
   * derived placement ("X must be on Y") or a deep contradiction — return that one-line
   * reason, else null. Uses `directElimCache`: only pre-placement constraint steps, single
   * line, basic technique (rank ≤ 4).
   */
  private removableReason(
    id: PersonId,
    cell: Cell,
    placed: ReadonlyMap<PersonId, Cell>,
    marks: ReadonlyMap<Cell, ReadonlySet<PersonId>>,
  ): Explanation | null {
    // (1) a DIRECT pre-placement constraint from the clues rules it out (e.g. "B was in
    //   row 1", "D south of C" ruling out the top row) — from the engine's own steps.
    this.hintActions() // populates directElimCache
    const e = this.directElimCache!.get(`${id}:${cell}`)
    if (e && e.lines.length === 1 && e.rank <= 4) return e.lines[0]
    // (2) given the player's PLACED figures, this cell directly breaks one of id's own clues
    //   — e.g. once Caroline is placed, Dittbert "south of Caroline" rules out the cells
    //   north of her. Drilled to the broken part for a short, direct reason.
    const person = this.puzzle.people().find((p) => p.id === id)
    const hyp = new Map(placed)
    hyp.set(id, cell)
    for (const clue of person?.clues ?? []) {
      const r = this.brokenLeaf(clue, id, cell, hyp)
      if (r) return r
    }
    // (3) one person per row & column: a figure the player placed already takes this cell's
    //   row or column, so no one else can be here.
    const { row, col } = this.puzzle.board.rc(cell)
    for (const [pid, pc] of placed) {
      if (pid === id) continue
      const p = this.puzzle.board.rc(pc)
      if (p.row === row) return { key: 'why.rowTaken', params: { name: id, target: pid } }
      if (p.col === col) return { key: 'why.colTaken', params: { name: id, target: pid } }
    }
    // (4) another suspect is CONFINED to this cell's row/column by the PLAYER'S OWN NOTES —
    //   e.g. after placing people, all of E's notes sit in one line → no one else there.
    return this.lineConfinedReason(id, cell, marks)
  }

  /** If, by the PLAYER'S notes, some OTHER suspect is now only noted within `cell`'s row (or
   *  column) — and that line really is theirs in the solution — they must occupy it, so
   *  nobody else (incl. `id`) can be in it. Uses the player's marks, VALIDATED against the
   *  solution so a mis-narrowed note never triggers a wrong removal. */
  private lineConfinedReason(
    id: PersonId,
    cell: Cell,
    marks: ReadonlyMap<Cell, ReadonlySet<PersonId>>,
  ): Explanation | null {
    const board = this.puzzle.board
    const { row, col } = board.rc(cell)
    for (const other of this.puzzle.suspects) {
      if (other.id === id) continue
      const noted: Cell[] = []
      for (const [c, ids] of marks) if (ids.has(other.id)) noted.push(c)
      if (noted.length === 0) continue
      const sol = this.solvedCellOf(other.id)
      if (sol === null) continue
      const s = board.rc(sol)
      if (s.row === row && noted.every((c) => board.rc(c).row === row)) {
        return { key: 'why.rowConfined', params: { name: id, target: other.id, num: row + 1 } }
      }
      if (s.col === col && noted.every((c) => board.rc(c).col === col)) {
        return { key: 'why.colConfined', params: { name: id, target: other.id, num: col + 1 } }
      }
    }
    return null
  }

  /** This suspect's cell in the (unique) solution — read from the replayed place actions, or
   *  null if pure deduction can't place it. Used to VALIDATE a "place from your notes" hint. */
  private solvedCellOf(id: PersonId): Cell | null {
    for (const a of this.hintActions()) {
      if (a.kind === 'place' && a.personId === id) return a.cells[0]
    }
    return null
  }

  /** The leaf-level reason a clue forbids `cell` for `id` given the board `hyp` (the player's
   *  figures + this cell), or null — drilling into AND so a compound clue blames only its ONE
   *  broken part: a positional part whose fixed cells exclude the cell, or a relation / "alone"
   *  already broken by a placed figure. */
  private brokenLeaf(
    clue: Clue,
    id: PersonId,
    cell: Cell,
    hyp: ReadonlyMap<PersonId, Cell>,
  ): Explanation | null {
    const board = this.puzzle.board
    if (clue instanceof AndClue) {
      for (const c of clue.clues) {
        const r = this.brokenLeaf(c, id, cell, hyp)
        if (r) return r
      }
      return null
    }
    const cells = clue.candidateCells(board)
    if (cells && !cells.has(cell)) {
      return { key: 'why.brokenClue', params: { name: id }, children: [clue.describe()] }
    }
    if (clue.violatedBy(id, hyp, this.puzzle)) {
      if (clue instanceof AloneClue) {
        const room = board.roomIdOf(cell)
        const blocker = [...hyp].find(([pid, pc]) => pid !== id && board.roomIdOf(pc) === room)
        if (blocker) return { key: 'why.aloneOccupied', params: { name: id, target: blocker[0] } }
      }
      return { key: 'why.brokenClue', params: { name: id }, children: [clue.describe()] }
    }
    return null
  }

  constructor(
    private readonly puzzle: Puzzle,
    opts: TechniqueOptions = {},
  ) {
    this.techniques = createForwardTechniques(puzzle, opts)
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
    // A COMPLETE placement is only genuinely SOLVED if it actually satisfies every clue and
    // the murder rule. Some clues — notably existence clues like "another <trait> in my room"
    // — are not fully enforced by any forward technique, so the techniques can drive the board
    // to a complete BUT INVALID arrangement (the SearchSolver would then find 0 solutions). If
    // so, this is not a solution: report `solved: false` so the engine never disagrees with
    // whether a valid arrangement actually exists.
    if (unsatisfiedClues(this.puzzle, ctx.state.placed).length > 0) {
      steps.push({ technique: 'stuck', explanation: { key: 'step.contradiction' } })
      return this.finish(steps, null, false)
    }
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
    marks: ReadonlyMap<Cell, ReadonlySet<PersonId>> = new Map(),
  ): HintResult | null {
    // Every suspect placed ⇒ the case is solved; the leftover crosses don't matter.
    if (this.puzzle.suspects.every((s) => placed.has(s.id))) return null

    // Order: (0) remove a wrong figure, (1) place a suspect the notes pin to ONE cell, (2)
    // remove notes on MULTI-note cells, (3) remove notes on SINGLE-note cells, (4) cross out,
    // (5) the actual deduction (place). All note clean-up comes BEFORE crossing out — a human
    // first fixes their own notes from the clues, then crosses, then deduces.

    // (0) a figure on a cell that's provably (and obviously) not its own → remove it.
    for (const [id, cell] of placed) {
      const why = this.removableReason(id, cell, placed, marks)
      if (why) {
        return {
          step: {
            technique: 'playerError',
            personId: id,
            explanation: { key: 'step.removePlacement', params: { name: id, cell } },
            chain: [why],
          },
          focus: [cell],
          kind: 'unplace',
        }
      }
    }

    // (1) a suspect the player narrowed (via notes) to a SINGLE remaining cell → place it
    //   right away (no need to cross the rest out). Validated against the solution: if that
    //   one note is actually wrong, warn instead of placing.
    for (const s of this.puzzle.suspects) {
      if (placed.has(s.id)) continue
      const noted: Cell[] = []
      for (const [cell, ids] of marks) if (ids.has(s.id)) noted.push(cell)
      if (noted.length !== 1) continue
      const cell = noted[0]
      const sol = this.solvedCellOf(s.id)
      if (sol === cell) {
        return {
          step: { technique: 'playerError', personId: s.id, explanation: { key: 'step.placeFromNotes', params: { name: s.id, cell } } },
          focus: [cell],
          kind: 'place',
        }
      }
      if (sol !== null) {
        return {
          step: { technique: 'playerError', personId: s.id, explanation: { key: 'step.notesWrong', params: { name: s.id, cell } } },
          focus: [cell],
          kind: 'unmark',
        }
      }
    }

    // (2) notes on MULTI-note cells (≥ 2 notes) — investigate those first.
    const multi = this.removableMarksHint(marks, placed, (cell) => (marks.get(cell)?.size ?? 0) >= 2)
    if (multi) return multi

    // (3) notes on SINGLE-note cells — still clue-based removals, so before any crossing.
    const single = this.removableMarksHint(marks, placed, (cell) => (marks.get(cell)?.size ?? 0) === 1)
    if (single) return single

    // (4) CROSS OUT when possible: the next cross the player hasn't done; stash the next place.
    let nextPlace: HintAction | null = null
    for (const action of this.hintActions()) {
      if (action.kind === 'place') {
        if (placed.get(action.personId!) === action.cells[0]) continue
        nextPlace = action
        break
      }
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

    // (5) the actual deduction: place the next forced person.
    if (nextPlace) {
      return { step: nextPlace.step, focus: nextPlace.cells, kind: 'place' }
    }
    return null
  }

  /** The next "remove your notes" hint among the marked cells `cellAllowed` permits: ONE
   *  reason-group of ONE suspect at a time (topmost-leftmost first), or null. */
  private removableMarksHint(
    marks: ReadonlyMap<Cell, ReadonlySet<PersonId>>,
    placed: ReadonlyMap<PersonId, Cell>,
    cellAllowed: (cell: Cell) => boolean,
  ): HintResult | null {
    for (const s of this.puzzle.suspects) {
      if (placed.has(s.id)) continue
      const groups = new Map<string, { reason: Explanation; cells: Cell[] }>()
      for (const [cell, ids] of marks) {
        if (!ids.has(s.id) || !cellAllowed(cell)) continue
        const r = this.removableReason(s.id, cell, placed, marks)
        if (!r) continue
        const key = `${r.key}|${JSON.stringify(r.params ?? {})}`
        const g = groups.get(key) ?? { reason: r, cells: [] }
        g.cells.push(cell)
        groups.set(key, g)
      }
      const ordered = [...groups.values()].sort((a, b) => Math.min(...a.cells) - Math.min(...b.cells))
      const first = ordered[0]
      if (first) {
        const cells = [...first.cells].sort((a, b) => a - b)
        return {
          step: {
            technique: 'playerError',
            personId: s.id,
            explanation: { key: 'step.removeMarks', params: { name: s.id, cells: cells.join(',') } },
            chain: [first.reason],
          },
          focus: cells,
          kind: 'unmark',
        }
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
    const elimReason = new Map<string, { lines: Explanation[]; rank: number }>()
    // The DIRECT subset for player-error hints: constraint reasons only, recorded until the
    // first placement happens (after that, eliminations hinge on derived "X must be on Y").
    const directElim = new Map<string, { lines: Explanation[]; rank: number }>()
    let placedYet = false
    const actions: HintAction[] = []
    let progress = true
    while (progress && ctx.state.unplaced().length > 0) {
      progress = false
      for (const technique of this.techniques) {
        const step = technique.apply(ctx)
        if (!step) continue
        progress = true
        const reason = contradictionChain(step) ?? [step.explanation]
        const rank = TECHNIQUE_RANK[step.technique] ?? 0
        const direct =
          !placedYet && step.placedCell === undefined && !DERIVED_TECHNIQUES.has(step.technique)
        for (const e of step.eliminated ?? []) {
          for (const c of e.cells) {
            const key = `${e.personId}:${c}`
            if (!elimReason.has(key)) elimReason.set(key, { lines: reason, rank })
            if (direct && !directElim.has(key)) directElim.set(key, { lines: reason, rank })
          }
        }
        if (step.placedCell !== undefined) placedYet = true
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
    this.directElimCache = directElim
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
    elimReason: ReadonlyMap<string, { lines: Explanation[]; rank: number }>,
  ): Explanation[] {
    const cands = [...this.clueCandidates(id)]
    if (cands.length <= 1) return [{ key: 'why.only', params: { name: id, cell } }]
    const chain: Explanation[] = []
    const seen = new Set<string>()
    for (const c of cands) {
      if (c === cell || chain.length >= 12) continue // soft cap so the panel stays readable
      const lines = elimReason.get(`${id}:${c}`)?.lines
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
