import { useEffect, useMemo, useRef, useState } from 'react'
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
  loadShowHiddenAuthor,
  loadSolved,
} from '../game/storage.ts'
import {
  DEFAULT_FILTER,
  levelMetaFromJson,
  nextLevel,
  pickerLevels,
  type LevelMeta,
} from '../game/levels.ts'
import BloodText from '../components/BloodText.tsx'
import BoardCanvas from '../components/BoardCanvas.tsx'
import CluePanel from '../components/CluePanel.tsx'
import Toolbar from '../components/Toolbar.tsx'
import Legend from '../components/Legend.tsx'
import ResultDialog from '../components/ResultDialog.tsx'
import SettingsButton from '../components/SettingsButton.tsx'
import Coach from '../components/Coach.tsx'
import { useSettings } from '../game/settings.ts'
import { hasMarks, helpMarks, type HelpMarks } from '../game/helpMarks.ts'

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

  const settings = useSettings()
  const session = useGameSession(puzzle, storageId, tutorial, !tutorial)
  const [selected, setSelected] = useState<PersonId | null>(null)
  const [hoveredSuspect, setHoveredSuspect] = useState<PersonId | null>(null)
  const [xTool, setXTool] = useState(false)
  const tut = useTutorialFlow({ enabled: !!tutorial, puzzle, solution, session, selected, setSelected })
  const [hint, setHint] = useState<HintResult | null>(null)
  const [hintShown, setHintShown] = useState(false) // hint requested (even if none was found)
  const [result, setResult] = useState<Result | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [saved, setSaved] = useState(() => isCustomSaved(meta.id))

  // Header title fit (mostly mobile): the title slot sits between the back/edit
  // buttons and the timer. If the title + size tag overflow it, drop the tag first;
  // if the title alone still doesn't fit, CSS clips it with an ellipsis.
  const headingRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const badgeRef = useRef<HTMLSpanElement>(null)
  const badgeWidthRef = useRef(0)
  const [hideBadge, setHideBadge] = useState(false)

  useEffect(() => {
    if (result?.win) return
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [result?.win])

  useEffect(() => {
    const heading = headingRef.current
    const title = titleRef.current
    if (!heading || !title) return
    let alive = true
    const measure = () => {
      if (!alive) return
      const badge = badgeRef.current
      if (badge) badgeWidthRef.current = badge.offsetWidth // remember it while shown
      const gap = parseFloat(getComputedStyle(heading).columnGap) || 0
      const needed = title.scrollWidth + (badgeWidthRef.current ? badgeWidthRef.current + gap : 0)
      setHideBadge(needed > heading.clientWidth + 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(heading)
    document.fonts?.ready.then(measure)
    return () => {
      alive = false
      ro.disconnect()
    }
  }, [meta.title, meta.author, meta.width, meta.height])

  // The hint stays on screen (with its highlight) until it's DONE or invalidated:
  //  - PLACING or removing a figure clears it (a different suspect set, or the hinted
  //    one set = done) — tracked by a content signature, since every board action
  //    hands back a fresh placements Map.
  //  - a CROSS hint clears once every highlighted cell is crossed (all done).
  // Crossing cells partway, or selecting a suspect, leaves it up. (Reset & undo clear
  // it too — wired on those buttons.)
  const placementSig = [...session.state.placements]
    .map(([id, c]) => `${id}@${c}`)
    .sort()
    .join('|')
  const placementSigRef = useRef<string | null>(null)
  useEffect(() => {
    if (placementSigRef.current !== null && placementSigRef.current !== placementSig) {
      setHint(null)
      setHintShown(false)
    }
    placementSigRef.current = placementSig
  }, [placementSig])
  // A CROSS hint is DONE once every highlighted cell is crossed — derived rather
  // than cleared via state, so no effect is needed; the stale state resets with
  // the next hint request or placement change anyway.
  const hintDone =
    hint?.kind === 'exclude' && hint.focus.every((c) => session.state.crosses.has(c))
  const activeHint = hintDone ? null : hint

  const highlight = useMemo<Set<Cell> | null>(() => {
    if (!selected || settings.helpMode !== 'full') return null
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
  }, [selected, puzzle, settings.helpMode])

  // Reduced help ("Kommissar"): each clue marks only its reference on the board.
  const refMarks = useMemo<HelpMarks | null>(() => {
    if (!selected || settings.helpMode !== 'reduced') return null
    const suspect = puzzle.suspects.find((s) => s.id === selected)
    if (!suspect) return null
    const marks = helpMarks(suspect.clues, puzzle.board)
    return hasMarks(marks) ? marks : null
  }, [selected, puzzle, settings.helpMode])

  const reveal =
    result?.win && result.victimCell !== null
      ? { victimCell: result.victimCell, murdererId: result.murderer?.id ?? null }
      : null

  const clearHint = () => {
    setHint(null)
    setHintShown(false)
  }
  // Selecting a suspect or arming the X-tool must NOT drop the hint (the player is
  // about to act ON it) — so these no longer clear it.
  const selectFromCard = (id: PersonId) => {
    setSelected((prev) => (prev === id ? null : id))
    setXTool(false)
  }
  const selectFromBoard = (id: PersonId | null) => {
    setSelected(id)
    setXTool(false)
  }
  const toggleX = () => {
    setXTool((v) => {
      if (!v) setSelected(null)
      return !v
    })
  }
  // Undo and reset are structural — they discard the active hint.
  const onUndoClick = () => {
    session.undo()
    clearHint()
  }
  const onResetClick = () => {
    session.resetAll()
    clearHint()
  }

  // The next un-done action from the full solution: cross a now-empty cell, or place
  // a person. It stays on screen until done (see the effects above); pressing again
  // before acting just recomputes the same next action.
  const showHint = () => {
    setSelected(null) // the black hint highlight replaces the blue selection
    setXTool(false)
    setHint(engine.nextHint(session.state.placements, session.state.crosses))
    setHintShown(true)
  }

  // Two highlight layers so a selected suspect's possible cells (blue) stay visible
  // UNDER an active hint (black) — both at once when both apply. A cross hint only
  // highlights the cells STILL to cross, so it shrinks as the player works through it
  // (and vanishes — via the effect above — once they're all done).
  const hintHL =
    !tut.active && activeHint
      ? new Set(
          activeHint.kind === 'exclude'
            ? activeHint.focus.filter((c) => !session.state.crosses.has(c))
            : activeHint.focus,
        )
      : null
  const selectHL = tut.active ? tut.highlight : highlight
  const boardHighlight = hintHL ?? selectHL
  const boardHighlightColor = hintHL ? HINT_BLACK : CANDIDATE_BLUE
  // The selection (blue) as the second layer, only when a hint already owns the first.
  const boardHighlight2 = hintHL && selectHL ? selectHL : null
  const hintText = activeHint
    ? renderer.render(activeHint.step.explanation)
    : hintShown && !hintDone
      ? t('tool.hintNone')
      : null
  // Readable contradiction chain ("if X here → … → impossible"), when the hint has one.
  const hintChain = activeHint?.step.chain?.map((e) => renderer.render(e)) ?? null

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
    // Next level honours the saved filter, the hidden-author toggle and the
    // (now updated) solved set — exactly what the picker would show.
    let next: LevelMeta | null = null
    if (onNext) {
      const custom = loadCustomLevels().map((j) => levelMetaFromJson(j, true))
      const filtered = pickerLevels(
        custom,
        loadFilter(DEFAULT_FILTER),
        loadSolved(),
        loadShowHiddenAuthor(),
      )
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
        <div className="mk-game__heading" ref={headingRef}>
          <div className="mk-game__titlewrap">
            <h2 className="mk-game__title" ref={titleRef}><BloodText text={meta.title} /></h2>
            {meta.author && (
              <span className="mk-game__author">{t('game.author', { name: meta.author })}</span>
            )}
          </div>
          {!hideBadge && (
            <span className="mk-game__sz" ref={badgeRef}>{meta.width}×{meta.height}</span>
          )}
        </div>
        <div className="mk-game__corner">
          {settings.timer && <span className="mk-timer">{formatTime(elapsed)}</span>}
          <SettingsButton />
        </div>
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
          highlight2={boardHighlight2}
          highlightColor2={CANDIDATE_BLUE}
          helpMarks={tut.active ? null : refMarks}
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
        onUndo={tut.active ? NOOP : onUndoClick}
        canUndo={tut.active ? false : session.canUndo}
        onReset={tut.active ? NOOP : onResetClick}
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
