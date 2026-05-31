import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DeductionEngine,
  SearchSolver,
  findMurderer,
  loadLevel,
  VICTIM_ID,
  type Cell,
  type PersonId,
} from '../engine/index.ts'
import { Renderer } from '../i18n/Renderer.ts'
import { useGameSession } from '../game/useGameSession.ts'
import { markSolved } from '../game/storage.ts'
import type { LevelMeta } from '../game/levels.ts'
import BoardCanvas from '../components/BoardCanvas.tsx'
import CluePanel from '../components/CluePanel.tsx'
import Toolbar from '../components/Toolbar.tsx'
import Legend from '../components/Legend.tsx'
import ResultDialog from '../components/ResultDialog.tsx'

interface Props {
  meta: LevelMeta
  onBack: () => void
}

interface Result {
  win: boolean
  murderer: { name: string; room: string; id: PersonId | null } | null
  victimCell: Cell | null
}

function formatTime(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export default function GameScreen({ meta, onBack }: Props) {
  const { t, i18n } = useTranslation()
  const puzzle = useMemo(() => loadLevel(meta.json), [meta])
  const solution = useMemo(() => new SearchSolver(puzzle).firstSolution(), [puzzle])
  const engine = useMemo(() => new DeductionEngine(puzzle), [puzzle])
  const suspectIndex = useMemo(
    () => new Map(puzzle.suspects.map((s, i) => [s.id, i] as const)),
    [puzzle],
  )
  const lang = i18n.resolvedLanguage ?? i18n.language
  const renderer = useMemo(
    () => new Renderer(i18n.getResourceBundle(lang, 'translation'), puzzle),
    [i18n, lang, puzzle],
  )

  const session = useGameSession(puzzle, meta.id)
  const [selected, setSelected] = useState<PersonId | null>(null)
  const [xTool, setXTool] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (result?.win) return
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [result?.win])

  const highlight = useMemo<Set<Cell> | null>(() => {
    if (!selected) return null
    const suspect = puzzle.suspects.find((s) => s.id === selected)
    if (!suspect) return null
    let acc: Set<Cell> | null = null
    for (const clue of suspect.clues) {
      const set = clue.candidateCells(puzzle.board)
      if (!set) continue
      if (acc === null) acc = new Set(set)
      else for (const c of [...acc]) if (!set.has(c)) acc.delete(c)
    }
    return acc
  }, [selected, puzzle])

  const reveal =
    result?.win && result.victimCell !== null
      ? { victimCell: result.victimCell, murdererId: result.murderer?.id ?? null }
      : null

  const selectFromCard = (id: PersonId) => {
    setSelected((prev) => (prev === id ? null : id))
    setXTool(false)
    setHint(null)
  }
  const selectFromBoard = (id: PersonId | null) => {
    setSelected(id)
    setXTool(false)
    setHint(null)
  }
  const toggleX = () =>
    setXTool((v) => {
      if (!v) setSelected(null)
      return !v
    })

  const showHint = () => {
    const step = engine.nextHint(session.state.placements)
    setHint(step ? renderer.render(step.explanation) : t('tool.hintNone'))
  }

  const submit = () => {
    if (!session.allPlaced || !solution) return
    const win =
      puzzle.suspects.every((s) => session.state.placements.get(s.id) === solution.cellOf(s.id)) &&
      session.state.placements.get(VICTIM_ID) === solution.cellOf(VICTIM_ID)
    if (!win) {
      setResult({ win: false, murderer: null, victimCell: null })
      return
    }
    markSolved(meta.id)
    session.clearSaved()
    const m = findMurderer(puzzle, solution)
    const room = puzzle.board.rooms.get(m.roomId)
    setResult({
      win: true,
      murderer: {
        name: m.suspectId ? puzzle.nameOf(m.suspectId) : '',
        room: room ? t(room.nameKey) : m.roomId,
        id: m.suspectId,
      },
      victimCell: solution.cellOf(VICTIM_ID),
    })
  }

  return (
    <div className="mk-game">
      <header className="mk-game__head">
        <button type="button" className="mk-back" onClick={onBack} aria-label="back">
          ←
        </button>
        <h2>
          {meta.title} <span className="mk-game__sz">{meta.width}×{meta.height}</span>
        </h2>
        <span className="mk-timer">{formatTime(elapsed)}</span>
      </header>

      <CluePanel
        puzzle={puzzle}
        suspectIndex={suspectIndex}
        placements={session.state.placements}
        selectedSuspect={selected}
        onSelect={selectFromCard}
        hint={hint}
      />

      <div className="mk-board">
        <BoardCanvas
          puzzle={puzzle}
          state={session.state}
          suspectIndex={suspectIndex}
          selectedSuspect={selected}
          highlight={highlight}
          xTool={xTool}
          reveal={reveal}
          roomName={(key) => t(key)}
          occupantAt={session.occupantAt}
          onPlaceMark={session.placeMark}
          onCommit={session.commit}
          onSetCross={session.setCross}
          onSelectSuspect={selectFromBoard}
        />
      </div>

      <Toolbar
        xTool={xTool}
        onToggleX={toggleX}
        onUndo={session.undo}
        canUndo={session.canUndo}
        onClearAll={session.clearAllCrosses}
        onHint={showHint}
        onSubmit={submit}
        allPlaced={session.allPlaced}
        legend={<Legend puzzle={puzzle} />}
      />

      {result && (
        <ResultDialog
          win={result.win}
          murderer={result.win ? result.murderer : null}
          onRetry={() => setResult(null)}
          onBack={onBack}
        />
      )}
    </div>
  )
}
