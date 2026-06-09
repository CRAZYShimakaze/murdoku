import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DeductionEngine,
  SearchSolver,
  findMurderer,
  loadLevel,
  unsatisfiedClues,
  VICTIM_ID,
  type Cell,
  type HintResult,
  type PersonId,
} from '../engine/index.ts'
import { Renderer } from '../i18n/Renderer.ts'
import { useDebugSolveKey } from '../game/debugSolve.ts'
import { useGameSession } from '../game/useGameSession.ts'
import { useTutorialFlow } from '../game/useTutorialFlow.ts'
import { CANDIDATE_BLUE, HINT_BLACK, suspectColor } from '../game/palette.ts'
import {
  markSolved,
  saveCustomLevel,
  exportLevelJson,
  isCustomSaved,
  loadCustomLevels,
  loadFilter,
  loadSolved,
} from '../game/storage.ts'
import {
  DEFAULT_FILTER,
  allLevels,
  filterLevels,
  levelMetaFromJson,
  nextLevel,
  type LevelMeta,
} from '../game/levels.ts'
import BoardCanvas from '../components/BoardCanvas.tsx'
import CluePanel from '../components/CluePanel.tsx'
import Toolbar from '../components/Toolbar.tsx'
import Legend from '../components/Legend.tsx'
import ResultDialog from '../components/ResultDialog.tsx'
import Coach from '../components/Coach.tsx'

const NOOP = () => {}

interface Props {
  meta: LevelMeta
  onBack: () => void
  /** True when this level was just generated (offers save/export/new on a win). */
  generated?: boolean
  onNew?: () => void
  /** Open the current level in the editor to tweak it. */
  onEdit?: () => void
  /** Play another level after a win (omitted for generated / editor test-plays). */
  onNext?: (level: LevelMeta) => void
  /** Tutorial mode: fresh start, separate storage slot (doesn't touch the demo). */
  tutorial?: boolean
}

interface Result {
  win: boolean
  murderer: { name: string; room: string; id: PersonId | null } | null
  victimCell: Cell | null
  /** On a loss: the clues the current placement doesn't satisfy. */
  failures?: string[]
  /** On a win: the next level matching the saved filter (null if none). */
  next?: LevelMeta | null
}

function formatTime(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export default function GameScreen({ meta, onBack, generated, onNew, onEdit, onNext, tutorial }: Props) {
  const { t, i18n } = useTranslation()
  const storageId = tutorial ? '__tutorial__' : meta.id
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

  // Ctrl+B → log the solved board + full deduction path to the console.
  useDebugSolveKey(() => ({ puzzle, renderer }))

  const session = useGameSession(puzzle, storageId, tutorial, !tutorial)
  const [selected, setSelected] = useState<PersonId | null>(null)
  const [hoveredSuspect, setHoveredSuspect] = useState<PersonId | null>(null)
  const [xTool, setXTool] = useState(false)
  const tut = useTutorialFlow({ enabled: !!tutorial, puzzle, solution, session, selected, setSelected })
  const [hint, setHint] = useState<HintResult | null>(null)
  const [hintShown, setHintShown] = useState(false) // hint requested (even if none was found)
  // Hints shown this round (until the board changes), so pressing "hint" again
  // advances to the next deduction instead of repeating the same one.
  const [hintProgress, setHintProgress] = useState<{
    placed: Map<PersonId, Cell>
    eliminated: Map<PersonId, Set<Cell>>
  }>(() => ({ placed: new Map(), eliminated: new Map() }))
  const [result, setResult] = useState<Result | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [saved, setSaved] = useState(() => isCustomSaved(meta.id))

  useEffect(() => {
    if (result?.win) return
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [result?.win])

  // A board change makes any shown hint stale — drop it and restart the hint walk.
  // Done during render against the previous board (not in an effect) so the reset
  // lands before paint; showing a hint doesn't touch session.state, so it survives.
  const [hintBoard, setHintBoard] = useState(session.state)
  if (hintBoard !== session.state) {
    setHintBoard(session.state)
    setHint(null)
    setHintShown(false)
    setHintProgress({ placed: new Map(), eliminated: new Map() })
  }

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

  const clearHint = () => {
    setHint(null)
    setHintShown(false)
    setHintProgress({ placed: new Map(), eliminated: new Map() })
  }
  const selectFromCard = (id: PersonId) => {
    setSelected((prev) => (prev === id ? null : id))
    setXTool(false)
    clearHint()
  }
  const selectFromBoard = (id: PersonId | null) => {
    setSelected(id)
    setXTool(false)
    clearHint()
  }
  const toggleX = () => {
    clearHint()
    setXTool((v) => {
      if (!v) setSelected(null)
      return !v
    })
  }

  const showHint = () => {
    setSelected(null) // the black hint highlight replaces the blue selection
    setXTool(false)
    const h = engine.nextHint(session.state.placements, session.state.crosses, hintProgress)
    setHint(h)
    setHintShown(true)
    if (!h) return
    // Record this hint so the next press moves on to the following deduction.
    const placedNext = new Map(hintProgress.placed)
    const elimNext = new Map([...hintProgress.eliminated].map(([k, v]) => [k, new Set(v)]))
    if (h.step.placedCell !== undefined && h.step.personId) {
      placedNext.set(h.step.personId, h.step.placedCell)
    }
    for (const e of h.step.eliminated ?? []) {
      const set = elimNext.get(e.personId) ?? new Set<Cell>()
      for (const c of e.cells) set.add(c)
      elimNext.set(e.personId, set)
    }
    setHintProgress({ placed: placedNext, eliminated: elimNext })
  }

  // Hint (black) wins the board highlight; otherwise the tutorial / selected suspect (blue).
  const boardHighlight =
    !tut.active && hint ? new Set(hint.focus) : tut.active ? tut.highlight : highlight
  const boardHighlightColor = !tut.active && hint ? HINT_BLACK : CANDIDATE_BLUE
  const hintText = hint
    ? renderer.render(hint.step.explanation)
    : hintShown
      ? t('tool.hintNone')
      : null
  // Readable contradiction chain ("if X here → … → impossible"), when the hint has one.
  const hintChain = hint?.step.chain?.map((e) => renderer.render(e)) ?? null

  const submit = () => {
    if (!session.allPlaced || !solution) return
    const win =
      puzzle.suspects.every((s) => session.state.placements.get(s.id) === solution.cellOf(s.id)) &&
      session.state.placements.get(VICTIM_ID) === solution.cellOf(VICTIM_ID)
    if (!win) {
      // Pinpoint which clue(s) the placement breaks — suspects, the "alone with
      // the victim" rule, and global/board clues — so it's not just "wrong".
      const failures = unsatisfiedClues(puzzle, session.state.placements).map((f) =>
        f.personId ? renderer.namedClue(f.explanation, f.personId) : renderer.render(f.explanation),
      )
      setResult({ win: false, murderer: null, victimCell: null, failures })
      return
    }
    markSolved(storageId)
    session.clearSaved()
    const m = findMurderer(puzzle, solution)
    const room = puzzle.board.rooms.get(m.roomId)
    // Next level honours the saved filter and the (now updated) solved set.
    let next: LevelMeta | null = null
    if (onNext) {
      const custom = loadCustomLevels().map((j) => levelMetaFromJson(j, true))
      const filtered = filterLevels(allLevels(custom), loadFilter(DEFAULT_FILTER), loadSolved())
      next = nextLevel(meta, filtered)
    }
    setResult({
      win: true,
      murderer: {
        name: m.suspectId ? puzzle.nameOf(m.suspectId) : '',
        room: room ? t(room.nameKey) : m.roomId,
        id: m.suspectId,
      },
      victimCell: solution.cellOf(VICTIM_ID),
      next,
    })
  }

  return (
    <div className="mk-game">
      <header className="mk-game__head">
        <div className="mk-game__lead">
          <button type="button" className="mk-back" onClick={onBack} aria-label="back">
            ←
          </button>
          {onEdit && !tutorial && (
            <button
              type="button"
              className="mk-game__edit"
              onClick={onEdit}
              aria-label={t('game.openInEditor')}
            >
              <span aria-hidden="true">✎</span>
              <span className="mk-game__edit-label">{t('game.openInEditor')}</span>
            </button>
          )}
        </div>
        <h2 className="mk-game__title">
          {meta.title} <span className="mk-game__sz">{meta.width}×{meta.height}</span>
          {meta.author && (
            <span className="mk-game__author"> · {t('game.author', { name: meta.author })}</span>
          )}
        </h2>
        <span className="mk-timer">{formatTime(elapsed)}</span>
      </header>

      <CluePanel
        puzzle={puzzle}
        suspectIndex={suspectIndex}
        placements={session.state.placements}
        selectedSuspect={selected}
        onSelect={tut.active ? tut.onSelect : selectFromCard}
        onHoverSuspect={setHoveredSuspect}
        hint={hintText}
        hintChain={hintChain}
      />

      <div className="mk-board">
        <BoardCanvas
          puzzle={puzzle}
          state={session.state}
          suspectIndex={suspectIndex}
          selectedSuspect={selected}
          highlight={boardHighlight}
          highlightColor={boardHighlightColor}
          emphasize={hoveredSuspect}
          xTool={tut.active ? false : xTool}
          reveal={reveal}
          roomName={(key) => t(key)}
          occupantAt={session.occupantAt}
          onPlaceMark={tut.active ? tut.onPlaceMark : session.placeMark}
          onCommit={tut.active ? tut.onCommit : session.commit}
          onRemove={tut.active ? NOOP : session.remove}
          onSetCross={tut.active ? NOOP : session.setCross}
          onSelectSuspect={tut.active ? (id) => id && tut.onSelect(id) : selectFromBoard}
        />
      </div>

      <Toolbar
        xTool={tut.active ? false : xTool}
        onToggleX={tut.active ? NOOP : toggleX}
        onUndo={tut.active ? NOOP : session.undo}
        canUndo={tut.active ? false : session.canUndo}
        onReset={tut.active ? NOOP : session.resetAll}
        onHint={tut.active ? NOOP : showHint}
        onSubmit={submit}
        allPlaced={session.allPlaced}
        legend={<Legend puzzle={puzzle} />}
      />

      {result && (
        <ResultDialog
          win={result.win}
          murderer={result.win ? result.murderer : null}
          avatar={
            result.win && result.murderer?.id
              ? {
                  attrs: puzzle.attributesOf(result.murderer.id),
                  color: suspectColor(suspectIndex.get(result.murderer.id) ?? 0),
                  letter: result.murderer.id,
                }
              : null
          }
          failures={result.win ? undefined : result.failures}
          onNext={
            result.win && result.next && onNext
              ? () => onNext(result.next!)
              : undefined
          }
          onRetry={() => setResult(null)}
          onBack={onBack}
          generated={generated}
          saved={saved}
          defaultName={meta.title}
          onSave={(name) => {
            saveCustomLevel({ ...meta.json, title: name })
            setSaved(true)
          }}
          onExport={(name) => exportLevelJson({ ...meta.json, title: name })}
          onNew={onNew}
        />
      )}

      {tut.coach && !result && <Coach view={tut.coach} />}
    </div>
  )
}
