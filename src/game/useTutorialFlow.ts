import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { VICTIM_ID, type Cell, type PersonId, type Puzzle, type Solution } from '../engine/index.ts'
import { CANDIDATE_BLUE, HINT_BLACK } from './palette.ts'
import { useNarrowLayout } from './useNarrowLayout.ts'
import type { GameSession } from './useGameSession.ts'

type Kind = 'info' | 'select' | 'note' | 'place' | 'tool' | 'cross' | 'dialog'
interface Step {
  kind: Kind
  id: string
  who?: PersonId
  target?: string
  /** For `cross` steps: the cells (row, col) the player should X out. */
  cells?: [number, number][]
}

/** Phase 1 — the demo (4×4): selecting, candidate notes, placing, the verdict. */
const DEMO_STEPS: Step[] = [
  { kind: 'info', id: 'welcome' },
  { kind: 'info', id: 'goal' },
  { kind: 'info', id: 'rules' },
  { kind: 'info', id: 'board', target: '.mk-board' },
  { kind: 'info', id: 'suspects', target: '.mk-clues' },
  { kind: 'info', id: 'terms', target: '.mk-clues' },
  { kind: 'select', id: 'selectA', who: 'A' },
  { kind: 'note', id: 'noteA', who: 'A' },
  { kind: 'select', id: 'selectB', who: 'B' },
  { kind: 'note', id: 'noteB', who: 'B' },
  { kind: 'select', id: 'selectC', who: 'C' },
  { kind: 'place', id: 'placeC', who: 'C' },
  { kind: 'info', id: 'locked', target: '.mk-board' },
  { kind: 'select', id: 'selectB2', who: 'B' },
  { kind: 'place', id: 'placeB', who: 'B' },
  { kind: 'select', id: 'selectA2', who: 'A' },
  { kind: 'place', id: 'placeA', who: 'A' },
  { kind: 'info', id: 'tools', target: '.mk-tools' },
  { kind: 'select', id: 'selectV', who: VICTIM_ID },
  { kind: 'place', id: 'placeV', who: VICTIM_ID },
  { kind: 'info', id: 'solve', target: '.mk-tool--submit' },
  // After the win the verdict dialog appears — the coach explains it, then "next"
  // loads the second tutorial level.
  { kind: 'dialog', id: 'verdict', target: '.mk-dialog' },
]

/** Phase 2 — "Tutorial Wohnung" (6×6): crossing fields (the X-tool), row/column
 *  elimination, the hint button, settings, then a full guided solve. The X-out targets
 *  are hard-wired to this level's solution
 *  (A=Z1/S5, B=Z2/S6, victim=Z3/S2, C=Z4/S3, D=Z5/S1, E=Z6/S4). */
const WOHNUNG_STEPS: Step[] = [
  { kind: 'info', id: 'w_intro', target: '.mk-board' },
  // E sits in row 6 (3 spots) — so nobody else is in row 6: introduce crossing.
  { kind: 'select', id: 'w_selectE', who: 'E' },
  { kind: 'info', id: 'w_rowE', target: '.mk-board', who: 'E', cells: [[5, 4], [5, 5]] },
  { kind: 'tool', id: 'w_armX', target: '.mk-tool--x' },
  { kind: 'cross', id: 'w_crossE', who: 'E', cells: [[5, 4], [5, 5]] },
  // A & B are both in the kitchen (rows 1+2) — cross the rest of rows 1+2 (the living
  // room cells on the left).
  { kind: 'select', id: 'w_selectA', who: 'A' },
  { kind: 'note', id: 'w_noteA', who: 'A' },
  { kind: 'select', id: 'w_selectB', who: 'B' },
  { kind: 'note', id: 'w_noteB', who: 'B' },
  { kind: 'info', id: 'w_rowsAB', target: '.mk-board', cells: [[0, 1], [0, 2], [1, 0], [1, 1], [1, 2]] },
  { kind: 'cross', id: 'w_crossAB', cells: [[0, 1], [0, 2], [1, 0], [1, 1], [1, 2]] },
  // Caro is on a chair — the others are crossed or in rows 1+2, so only one is left.
  { kind: 'select', id: 'w_selectC', who: 'C' },
  { kind: 'place', id: 'w_placeC', who: 'C' },
  // The hint tool — actually press it, then read the hint that appears.
  { kind: 'tool', id: 'w_hintBtn', target: '.mk-tool--hint' },
  { kind: 'info', id: 'w_hintShown', target: '.mk-hintbar' },
  // The settings — open them and show what's tunable.
  { kind: 'tool', id: 'w_settingsBtn', target: '.mk-gear' },
  { kind: 'info', id: 'w_settingsOpen', target: '.mk-settings' },
  // Finish the case, guided.
  { kind: 'select', id: 'w_selectD', who: 'D' },
  { kind: 'place', id: 'w_placeD', who: 'D' },
  { kind: 'select', id: 'w_selectE2', who: 'E' },
  { kind: 'place', id: 'w_placeE', who: 'E' },
  { kind: 'select', id: 'w_selectB2', who: 'B' },
  { kind: 'place', id: 'w_placeB', who: 'B' },
  { kind: 'select', id: 'w_selectA2', who: 'A' },
  { kind: 'place', id: 'w_placeA', who: 'A' },
  { kind: 'select', id: 'w_selectV', who: VICTIM_ID },
  { kind: 'place', id: 'w_placeV', who: VICTIM_ID },
  { kind: 'info', id: 'w_solve', target: '.mk-tool--submit' },
]

export interface CoachView {
  title: string
  body: string
  stepLabel: string
  target?: string
  /** Dim the screen + spotlight the target (info/select/tool/dialog). Bright board for
   *  note/place/cross steps (the highlighted cells live on the board). */
  dim: boolean
  /** Render ON TOP of the result dialog (the phase-1 verdict explanation). */
  overDialog: boolean
  /** Spotlights a centered dialog (verdict / settings) — the card gets a wider, safe
   *  placement so it doesn't cover the dialog. */
  dialogStep: boolean
  /** For bright steps: place the card away from the highlighted cells. */
  cardSide: 'top' | 'bottom'
  error: string | null
  showNext: boolean
  onNext: () => void
  onSkip: () => void
}

export interface TutorialFlow {
  active: boolean
  coach: CoachView | null
  /** Primary highlight (blue candidates, OR black "to cross" cells on a cross step). */
  highlight: Set<Cell> | null
  highlightColor: { wash: string; ring: string }
  /** Secondary highlight (blue candidates UNDER the black to-cross ring). */
  highlight2: Set<Cell> | null
  /** Whether the X-tool is armed (true only during a cross step). */
  xTool: boolean
  onSelect: (id: PersonId) => void
  onPlaceMark: (cell: Cell, id: PersonId) => void
  onCommit: (cell: Cell, id: PersonId) => void
  onToggleX: () => void
  onSetCross: (cell: Cell, value: boolean) => void
  /** Quick-drag note painting: set/clear the focus suspect's pencil note on a candidate
   *  cell (other cells are ignored). Works in every step that has a focus suspect. */
  onSetMark: (cell: Cell, id: PersonId, on: boolean) => void
  onHint: () => void
  onSettingsOpen: () => void
  /** True while the "press Hint" step is active (GameScreen actually fires the hint). */
  hintPhase: boolean
  /** Drives the settings dialog: 'button' = waiting for the gear tap, 'open' = keep it
   *  open and explain it, null = closed. */
  settingsPhase: 'button' | 'open' | null
  /** End the tutorial (e.g. the player restarts the level on the final dialog). */
  end: () => void
}

interface Params {
  enabled: boolean
  puzzle: Puzzle
  solution: Solution | null
  session: GameSession
  selected: PersonId | null
  setSelected: (id: PersonId | null) => void
  /** 1 = demo, 2 = Tutorial Wohnung. Drives which script runs. */
  phase: 1 | 2
  /** True once the level is solved (so the flow can advance to the verdict step). */
  won: boolean
  /** Called from the phase-1 verdict step to load the second tutorial level. */
  onAdvancePhase: () => void
}

export function useTutorialFlow({
  enabled,
  puzzle,
  solution,
  session,
  setSelected,
  phase,
  won,
  onAdvancePhase,
}: Params): TutorialFlow {
  const { t } = useTranslation()
  const narrow = useNarrowLayout()
  const STEPS = phase === 1 ? DEMO_STEPS : WOHNUNG_STEPS
  const [idx, setIdx] = useState(0)
  const [active, setActive] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const step = STEPS[Math.min(idx, STEPS.length - 1)]

  // Keep the focus suspect selected during note/place steps (so the board accepts input).
  useEffect(() => {
    if (active && (step.kind === 'note' || step.kind === 'place') && step.who) {
      setSelected(step.who)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, active])

  // The win arrives after the "press Solve" step — advance to the verdict explanation
  // (phase 1 only; phase 2 just shows the normal dialog and the tutorial is over).
  useEffect(() => {
    if (active && won && phase === 1 && step.id === 'solve') {
      // React to the external win event: advance to the verdict step. The setState
      // belongs here (it's a response to an event, not derived render state).
      /* eslint-disable react-hooks/set-state-in-effect */
      setError(null)
      setIdx((i) => Math.min(i + 1, STEPS.length - 1))
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [won, active, phase, step.id])

  const nameOf = (id?: PersonId) => (id ? puzzle.nameOf(id) : '')
  const cellsOf = (s: Step): Set<Cell> =>
    new Set((s.cells ?? []).map(([r, c]) => puzzle.board.idx(r, c)))

  /** Cells where `who` could still legally stand given the current board. */
  const liveCandidates = (who: PersonId): Set<Cell> => {
    const board = puzzle.board
    let cand: Set<Cell> | null = null
    if (who !== VICTIM_ID) {
      const suspect = puzzle.suspects.find((s) => s.id === who)
      for (const clue of suspect?.clues ?? []) {
        const set = clue.candidateCells(board)
        if (!set) continue
        if (cand === null) {
          cand = new Set(set)
        } else {
          const intersect = new Set<Cell>()
          for (const c of cand) if (set.has(c)) intersect.add(c)
          cand = intersect
        }
      }
    }
    if (cand === null) cand = new Set(board.occupiableCells())
    const rows = new Set<number>()
    const cols = new Set<number>()
    const occupied = new Set<Cell>()
    for (const [id, c] of session.state.placements) {
      if (id === who) continue
      occupied.add(c)
      const { row, col } = board.rc(c)
      rows.add(row)
      cols.add(col)
    }
    const out = new Set<Cell>()
    for (const c of cand) {
      if (session.state.crosses.has(c) || occupied.has(c)) continue
      const { row, col } = board.rc(c)
      if (rows.has(row) || cols.has(col)) continue
      out.add(c)
    }
    return out
  }

  // A note step is done once every one of the focus suspect's candidate cells carries
  // their pencil note — whether the player tapped the cells one by one OR quick-dragged
  // across them. Driven by an effect (not the tap/drag handlers) so the marks have settled
  // before the check, which a fast drag-paint would otherwise race.
  useEffect(() => {
    if (!active || step.kind !== 'note' || !step.who) return
    const cands = liveCandidates(step.who)
    if (cands.size === 0) return
    for (const c of cands) if (!session.state.marks.get(c)?.has(step.who)) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setError(null)
    setIdx((i) => Math.min(i + 1, STEPS.length - 1))
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.state.marks, idx, active])

  const next = () => {
    setError(null)
    setIdx((i) => Math.min(i + 1, STEPS.length - 1))
  }

  // Two highlight layers: cells to CROSS are ringed BLACK (the primary layer, same as a
  // hint), the subject's possible cells stay BLUE underneath. A plain note/place step just
  // shows the blue candidates.
  const candidates = active && step.who ? liveCandidates(step.who) : null
  const crossCells = step.cells && step.cells.length > 0 ? cellsOf(step) : null
  const highlight = active
    ? (crossCells ?? (step.kind === 'note' || step.kind === 'place' ? candidates : null))
    : null
  const highlight2 = active && crossCells ? candidates : null
  const highlightColor = crossCells ? HINT_BLACK : CANDIDATE_BLUE

  // Keep the coach card clear of the highlighted cells.
  let cardSide: 'top' | 'bottom' = 'bottom'
  const cardRef = highlight ?? highlight2
  if (cardRef && cardRef.size > 0) {
    let sum = 0
    for (const c of cardRef) sum += puzzle.board.rc(c).row
    cardSide = sum / cardRef.size >= puzzle.board.height / 2 ? 'top' : 'bottom'
  }

  const onSelect = (id: PersonId) => {
    if (step.kind === 'select') {
      if (id === step.who) {
        setSelected(id)
        next()
      } else {
        setError(t('tutorial.err.wrongSelect', { name: nameOf(step.who) }))
      }
      return
    }
    if (step.kind === 'note' || step.kind === 'place') {
      if (id === step.who) setSelected(id)
      else setError(t('tutorial.err.stayWith', { name: nameOf(step.who) }))
    }
    // info / tool / cross / dialog steps: ignore selection
  }

  const onPlaceMark = (cell: Cell, _id: PersonId) => {
    // While the coach EXPLAINS (an info step with a focus suspect), let the player jot
    // small notes on that suspect's candidate cells — but not place the figure yet.
    if (step.kind === 'info' && step.who) {
      if (liveCandidates(step.who).has(cell)) {
        setError(null)
        session.placeMark(cell, step.who)
      }
      return
    }
    if (step.kind === 'note' && step.who) {
      if (!liveCandidates(step.who).has(cell)) {
        setError(t('tutorial.err.notCandidate', { name: nameOf(step.who) }))
        return
      }
      setError(null)
      session.placeMark(cell, step.who) // the note-completion effect advances the step
      return
    }
    if (step.kind === 'place') setError(t('tutorial.err.holdToPlace'))
    else if (step.kind === 'cross') setError(t('tutorial.err.armCross'))
    else if (step.kind === 'select') setError(t('tutorial.err.selectFirst', { name: nameOf(step.who) }))
  }

  const onCommit = (cell: Cell, _id: PersonId) => {
    if (step.kind === 'place' && step.who) {
      const correct = solution ? solution.cellOf(step.who) : -1
      if (cell === correct) {
        setError(null)
        session.commit(cell, step.who)
        next()
      } else {
        setError(t('tutorial.err.wrongCell'))
      }
      return
    }
    if (step.kind === 'note') setError(t('tutorial.err.tapForNote'))
    else if (step.kind === 'info' && step.who) setError(t('tutorial.err.markOnly'))
    else if (step.kind === 'select') setError(t('tutorial.err.selectFirst', { name: nameOf(step.who) }))
  }

  // Each "tool" step advances when the player presses THAT specific button — arming the
  // X-tool, pressing Hint, or opening Settings. (The tutorial otherwise controls these.)
  const onToggleX = () => {
    if (step.id === 'w_armX') {
      setError(null)
      next()
    }
  }
  const onHint = () => {
    if (step.id === 'w_hintBtn') {
      setError(null)
      next()
    }
  }
  const onSettingsOpen = () => {
    if (step.id === 'w_settingsBtn') {
      setError(null)
      next()
    }
  }

  // Crossing a field: only the intended cells are allowed; once they're all crossed the
  // step is done.
  // Quick-drag note painting (press a candidate cell and drag): only the current focus
  // suspect's live candidate cells take a note; anything else is ignored, so a drag across
  // the board never errors out. Allowed in every focused step — the note-completion effect
  // handles advancing a note step once they're all marked.
  const onSetMark = (cell: Cell, id: PersonId, on: boolean) => {
    if (!step.who || id !== step.who) return
    if (!liveCandidates(step.who).has(cell)) return
    setError(null)
    session.setMark(cell, id, on)
  }

  const onSetCross = (cell: Cell, value: boolean) => {
    if (step.kind !== 'cross') return
    const want = cellsOf(step)
    if (value && !want.has(cell)) {
      setError(t('tutorial.err.crossWrong'))
      return
    }
    setError(null)
    session.setCross(cell, value)
    const crossed = new Set(session.state.crosses)
    if (value) crossed.add(cell)
    else crossed.delete(cell)
    if ([...want].every((c) => crossed.has(c))) next()
  }

  const coach: CoachView | null = active
    ? {
        title: t(`tutorial.${step.id}.title`),
        // On the stacked phone layout, prefer a `_touch` copy when the step has one (e.g.
        // "tap a word" instead of "hover", "below the board" instead of "on the left");
        // it falls back to the desktop `body` when no touch variant exists.
        body: narrow
          ? t([`tutorial.${step.id}.body_touch`, `tutorial.${step.id}.body`])
          : t(`tutorial.${step.id}.body`),
        stepLabel: t('tutorial.step', { n: idx + 1, total: STEPS.length }),
        target: step.kind === 'select' ? `[data-suspect="${step.who}"]` : step.target,
        // An info step that highlights board cells stays BRIGHT (like a note/place step)
        // so the card sits clear of the cells (via cardSide); other info/select/tool/
        // dialog steps dim + spotlight their target.
        dim:
          (step.kind === 'info' && !(step.cells && step.cells.length > 0)) ||
          step.kind === 'select' ||
          step.kind === 'tool' ||
          step.kind === 'dialog',
        overDialog: step.kind === 'dialog',
        // Steps that spotlight a centered dialog (the verdict, the open settings) get a
        // wider, safely-placed card so it doesn't bury the dialog.
        dialogStep: step.kind === 'dialog' || step.id === 'w_settingsOpen',
        cardSide,
        error,
        // A plain info step gets a "next"; the verdict step's "next" loads level 2; the
        // "press Solve" steps wait for the actual win, so they show no button.
        showNext:
          (step.kind === 'info' && step.id !== 'solve' && step.id !== 'w_solve') ||
          step.kind === 'dialog',
        onNext: step.kind === 'dialog' ? onAdvancePhase : next,
        onSkip: () => {
          setError(null)
          setActive(false)
        },
      }
    : null

  return {
    active,
    coach,
    highlight,
    highlightColor,
    highlight2,
    xTool: active && step.kind === 'cross',
    onSelect,
    onPlaceMark,
    onCommit,
    onToggleX,
    onSetCross,
    onSetMark,
    onHint,
    onSettingsOpen,
    hintPhase: active && step.id === 'w_hintBtn',
    settingsPhase: !active
      ? null
      : step.id === 'w_settingsBtn'
        ? 'button'
        : step.id === 'w_settingsOpen'
          ? 'open'
          : null,
    end: () => setActive(false),
  }
}
