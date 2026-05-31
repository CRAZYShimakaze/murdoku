import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { VICTIM_ID, type Cell, type PersonId, type Puzzle, type Solution } from '../engine/index.ts'
import { CANDIDATE_BLUE } from './palette.ts'
import type { GameSession } from './useGameSession.ts'

type Kind = 'info' | 'select' | 'note' | 'place'
interface Step {
  kind: Kind
  id: string
  who?: PersonId
  target?: string
}

/** The scripted, guided solve of the demo level — one action per step. */
const STEPS: Step[] = [
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
]

export interface CoachView {
  title: string
  body: string
  stepLabel: string
  target?: string
  /** Dim the screen + spotlight the target (info/select). Bright board for note/place. */
  dim: boolean
  /** For bright (note/place) steps: place the card away from the candidates. */
  cardSide: 'top' | 'bottom'
  error: string | null
  showNext: boolean
  onNext: () => void
  onSkip: () => void
}

export interface TutorialFlow {
  active: boolean
  coach: CoachView | null
  highlight: Set<Cell> | null
  highlightColor: { wash: string; ring: string }
  onSelect: (id: PersonId) => void
  onPlaceMark: (cell: Cell, id: PersonId) => void
  onCommit: (cell: Cell, id: PersonId) => void
}

interface Params {
  enabled: boolean
  puzzle: Puzzle
  solution: Solution | null
  session: GameSession
  selected: PersonId | null
  setSelected: (id: PersonId | null) => void
}

export function useTutorialFlow({ enabled, puzzle, solution, session, setSelected }: Params): TutorialFlow {
  const { t } = useTranslation()
  const [idx, setIdx] = useState(0)
  const [active, setActive] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const step = STEPS[idx]

  // Keep the focus suspect selected during note/place steps (so the board accepts input).
  useEffect(() => {
    if (active && (step.kind === 'note' || step.kind === 'place') && step.who) {
      setSelected(step.who)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, active])

  const nameOf = (id?: PersonId) => (id ? puzzle.nameOf(id) : '')

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

  const next = () => {
    setError(null)
    setIdx((i) => Math.min(i + 1, STEPS.length - 1))
  }

  const candidates =
    active && (step.kind === 'note' || step.kind === 'place') && step.who
      ? liveCandidates(step.who)
      : null

  // Keep the coach card clear of the highlighted candidates.
  let cardSide: 'top' | 'bottom' = 'bottom'
  if (candidates && candidates.size > 0) {
    let sum = 0
    for (const c of candidates) sum += puzzle.board.rc(c).row
    cardSide = sum / candidates.size >= puzzle.board.height / 2 ? 'top' : 'bottom'
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
    // info steps: ignore selection
  }

  const onPlaceMark = (cell: Cell, _id: PersonId) => {
    if (step.kind === 'note' && step.who) {
      const cands = liveCandidates(step.who)
      if (!cands.has(cell)) {
        setError(t('tutorial.err.notCandidate', { name: nameOf(step.who) }))
        return
      }
      setError(null)
      const marked = new Set<Cell>()
      for (const [c, set] of session.state.marks) if (set.has(step.who)) marked.add(c)
      if (marked.has(cell)) marked.delete(cell)
      else marked.add(cell) // placeMark toggles — predict the result
      session.placeMark(cell, step.who)
      if ([...cands].every((c) => marked.has(c))) next()
      return
    }
    if (step.kind === 'place') setError(t('tutorial.err.holdToPlace'))
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
    else if (step.kind === 'select') setError(t('tutorial.err.selectFirst', { name: nameOf(step.who) }))
  }

  const coach: CoachView | null = active
    ? {
        title: t(`tutorial.${step.id}.title`),
        body: t(`tutorial.${step.id}.body`),
        stepLabel: t('tutorial.step', { n: idx + 1, total: STEPS.length }),
        target: step.kind === 'select' ? `[data-suspect="${step.who}"]` : step.target,
        dim: step.kind === 'info' || step.kind === 'select',
        cardSide,
        error,
        showNext: step.kind === 'info' && idx < STEPS.length - 1,
        onNext: next,
        onSkip: () => {
          setError(null)
          setActive(false)
        },
      }
    : null

  return {
    active,
    coach,
    highlight: candidates,
    highlightColor: CANDIDATE_BLUE,
    onSelect,
    onPlaceMark,
    onCommit,
  }
}
