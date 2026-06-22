import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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
import { CANDIDATE_BLUE, HIGHLIGHT_DIM, HINT_BLACK, suspectColor } from '../game/palette.ts'
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
  prevLevel,
  pickerLevels,
  titleOf,
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
  /** Which tutorial level is running: 1 = demo, 2 = Tutorial Wohnung. */
  tutorialPhase?: 1 | 2
  /** From the phase-1 verdict step: advance to the second tutorial level. */
  onTutorialAdvance?: () => void
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

export default function GameScreen({
  meta,
  onBack,
  generated,
  onNew,
  onEdit,
  onNext,
  tutorial,
  tutorialPhase,
  onTutorialAdvance,
}: Props) {
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
  // The title in the active language (per-language override from the level JSON).
  const title = titleOf(meta, lang)

  // Ctrl+B → log the solved board + full deduction path to the console.
  useDebugSolveKey(() => ({ puzzle, renderer }))

  const settings = useSettings()
  const session = useGameSession(puzzle, storageId, tutorial, !tutorial)
  const [selected, setSelected] = useState<PersonId | null>(null)
  const [hoveredSuspect, setHoveredSuspect] = useState<PersonId | null>(null)
  const [xTool, setXTool] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  // Header "solved" mark: already in the solved set on entry (re-checked per level),
  // OR just won this session (result.win) — the difficulty stamp then shows a check.
  const alreadySolved = useMemo(() => loadSolved().has(storageId), [storageId])
  // After a win the verdict can be tucked away to study the solved board; a tap on the
  // board brings it back (see the review layer below).
  const [dialogHidden, setDialogHidden] = useState(false)
  const tut = useTutorialFlow({
    enabled: !!tutorial,
    puzzle,
    solution,
    session,
    selected,
    setSelected,
    phase: tutorialPhase ?? 1,
    won: !!result?.win,
    onAdvancePhase: onTutorialAdvance ?? NOOP,
  })
  const [hint, setHint] = useState<HintResult | null>(null)
  const [hintShown, setHintShown] = useState(false) // hint requested (even if none was found)
  const [hintRequestId, setHintRequestId] = useState(0) // bumped per request → scrolls the hint into view
  const [elapsed, setElapsed] = useState(0)
  const [saved, setSaved] = useState(() => isCustomSaved(meta.id))
  // The settings dialog is controlled so the tutorial can open it (and explain it).
  const [settingsOpen, setSettingsOpen] = useState(false)
  // On the phase-1 tutorial verdict, Restart / Back are LOCKED (they'd skip the second
  // part) — clicking them just explains what they'd do; only the coach's "Next" proceeds.
  const [tutNote, setTutNote] = useState<string | null>(null)
  useEffect(() => {
    if (!tutNote) return
    const id = window.setTimeout(() => setTutNote(null), 4200)
    return () => window.clearTimeout(id)
  }, [tutNote])
  const verdictLock = tut.active && !!tut.coach?.overDialog
  useEffect(() => {
    if (!tut.active) return
    // Sync the dialog to the tutorial-driven phase (open / forced-closed); other
    // phases leave the player's own toggle alone. This is a genuine external sync.
    if (tut.settingsPhase === 'open' || tut.settingsPhase === null)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSettingsOpen(tut.settingsPhase === 'open')
  }, [tut.active, tut.settingsPhase])

  // Header title fit (mostly mobile): the title slot sits between the back/edit
  // buttons and the timer. If the title + the tag cluster (difficulty stamp + size)
  // overflow it, drop the cluster first; if the title alone still doesn't fit, CSS
  // clips it with an ellipsis.
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
  }, [title, meta.author, meta.width, meta.height, meta.difficulty, meta.custom])

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
  // After placing a figure, drop the selection so their candidate highlight clears — the
  // player is done with that suspect.
  const commitAndClear = (cell: Cell, id: PersonId) => {
    session.commit(cell, id)
    setSelected(null)
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

  // Replay the solved level from scratch: clear the board, drop the verdict, restart the
  // clock. (Offered on the win dialog.)
  const restart = () => {
    session.resetAll()
    clearHint()
    setSelected(null)
    setXTool(false)
    setResult(null)
    setDialogHidden(false)
    setElapsed(0)
    // Restarting from the final tutorial verdict means "I'm done learning" — drop the
    // guided overlay and let the level be played freely.
    if (tut.active) tut.end()
  }

  // Tap (not scroll/drag) on the revealed board re-opens the tucked-away verdict. A
  // pointer that moves past a small threshold is a swipe — it must NOT count as a tap,
  // which matters on touch where a scroll starts as a press.
  const reviewTap = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const onReviewDown = (e: ReactPointerEvent) => {
    reviewTap.current = { x: e.clientX, y: e.clientY, moved: false }
  }
  const onReviewMove = (e: ReactPointerEvent) => {
    const t = reviewTap.current
    if (t && !t.moved && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) t.moved = true
  }
  const onReviewUp = () => {
    const t = reviewTap.current
    reviewTap.current = null
    if (t && !t.moved) setDialogHidden(false)
  }

  // The next un-done action from the full solution: cross a now-empty cell, or place
  // a person. It stays on screen until done (see the effects above); pressing again
  // before acting just recomputes the same next action.
  const showHint = () => {
    setSelected(null) // the black hint highlight replaces the blue selection
    setXTool(false)
    setHint(engine.nextHint(session.state.placements, session.state.crosses))
    setHintShown(true)
    setHintRequestId((n) => n + 1) // re-scroll even when the same hint is requested again
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
  // In the tutorial the flow owns both layers (black "to cross" over blue candidates);
  // outside it, a hint (black) sits over the selection (blue).
  const boardHighlightColor = tut.active ? tut.highlightColor : hintHL ? HINT_BLACK : CANDIDATE_BLUE
  const boardHighlight2 = tut.active ? tut.highlight2 : hintHL && selectHL ? selectHL : null
  // A selected suspect who is ALREADY placed has moot candidates — dim their whole
  // highlight so the live (un-placed) suspects' candidates stand out more.
  const selDim = !tut.active && selected !== null && session.state.placements.has(selected) ? HIGHLIGHT_DIM : 1
  const boardHighlightAlpha = hintHL ? 1 : selDim // primary = black hint (full opacity) when a hint is up
  const boardHighlightAlpha2 = selDim // the secondary layer carries the selection under a hint
  const hintText = activeHint
    ? renderer.render(activeHint.step.explanation)
    : hintShown && !hintDone
      ? t('tool.hintNone')
      : null
  // Readable contradiction chain ("if X here → … → impossible"), when the hint has one.
  const hintChain = activeHint?.step.chain?.map((e) => renderer.render(e)) ?? null

  // The neighbouring level (next/prev) honouring the saved filter, the hidden-author
  // toggle and the current solved set — exactly what the picker would offer. Shared by
  // the post-win "next level" button and the n / p skip shortcuts.
  const neighborLevel = useCallback(
    (pick: (current: LevelMeta, filtered: LevelMeta[]) => LevelMeta | null): LevelMeta | null => {
      const custom = loadCustomLevels().map((j) => levelMetaFromJson(j, true))
      const filtered = pickerLevels(
        custom,
        loadFilter(DEFAULT_FILTER),
        loadSolved(),
        loadShowHiddenAuthor(),
      )
      return pick(meta, filtered)
    },
    [meta],
  )

  // Press "n" / "p" to jump to the next / previous level — same target as the verdict's
  // "next level" button. Only where that navigation exists (not tutorial / generated /
  // editor test-play, where onNext is omitted) and never while typing in a field.
  useEffect(() => {
    if (!onNext) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const key = e.key.toLowerCase()
      const pick = key === 'n' ? nextLevel : key === 'p' ? prevLevel : null
      if (!pick) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const target = neighborLevel(pick)
      if (!target) return
      e.preventDefault()
      onNext(target)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNext, neighborLevel])

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
    setDialogHidden(false) // a fresh verdict always shows the dialog first
    const m = findMurderer(puzzle, solution)
    const room = puzzle.board.rooms.get(m.roomId)
    // markSolved above already updated the solved set neighborLevel reads from.
    const next = onNext ? neighborLevel(nextLevel) : null
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
            <h2 className="mk-game__title" ref={titleRef}><BloodText text={title} /></h2>
            {meta.author && (
              <span className="mk-game__author">{t('game.author', { name: meta.author })}</span>
            )}
          </div>
          {!hideBadge && (
            <span className="mk-game__tags" ref={badgeRef}>
              <span
                className="mk-game__case"
                data-d={meta.difficulty}
                data-solved={alreadySolved || result?.win ? 'true' : undefined}
              >
                <span className="mk-game__case-diff">{t(`difficulty.${meta.difficulty}`)}</span>
                {meta.custom && <span className="mk-game__case-own">{t('select.custom')}</span>}
              </span>
              <span className="mk-game__sz">{meta.width}×{meta.height}</span>
            </span>
          )}
        </div>
        <div className="mk-game__corner">
          {settings.timer && <span className="mk-timer">{formatTime(elapsed)}</span>}
          <SettingsButton
            open={settingsOpen}
            onOpenChange={(o) => {
              setSettingsOpen(o)
              if (o && tut.active) tut.onSettingsOpen()
            }}
          />
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
        hintRequestId={hintRequestId}
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
          highlightAlpha={boardHighlightAlpha}
          highlightAlpha2={boardHighlightAlpha2}
          helpMarks={tut.active ? null : refMarks}
          emphasize={hoveredSuspect}
          xTool={tut.active ? tut.xTool : xTool}
          reveal={reveal}
          roomName={(key) => t(key)}
          occupantAt={session.occupantAt}
          onPlaceMark={tut.active ? tut.onPlaceMark : session.placeMark}
          onCommit={tut.active ? tut.onCommit : commitAndClear}
          onRemove={tut.active ? NOOP : session.remove}
          onSetCross={tut.active ? tut.onSetCross : session.setCross}
          onSelectSuspect={tut.active ? (id) => id && tut.onSelect(id) : selectFromBoard}
        />
        {result?.win && dialogHidden && (
          <div
            className="mk-review"
            onPointerDown={onReviewDown}
            onPointerMove={onReviewMove}
            onPointerUp={onReviewUp}
            onPointerCancel={() => (reviewTap.current = null)}
          >
            <span className="mk-review__pill">
              <span className="mk-review__icon" aria-hidden="true">⌕</span>
              {t('result.reopenHint')}
            </span>
          </div>
        )}
      </div>

      <Toolbar
        xTool={tut.active ? tut.xTool : xTool}
        onToggleX={tut.active ? tut.onToggleX : toggleX}
        onUndo={tut.active ? NOOP : onUndoClick}
        canUndo={tut.active ? false : session.canUndo}
        onReset={tut.active ? NOOP : onResetClick}
        onHint={
          tut.active
            ? () => {
                if (tut.hintPhase) {
                  showHint()
                  tut.onHint()
                }
              }
            : showHint
        }
        onSubmit={submit}
        allPlaced={session.allPlaced}
        legend={<Legend puzzle={puzzle} />}
      />

      {result && !dialogHidden && (
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
          onRestart={
            result.win
              ? verdictLock
                ? () => setTutNote(t('tutorial.lockRestart'))
                : restart
              : undefined
          }
          onDismiss={result.win ? () => setDialogHidden(true) : undefined}
          onBack={verdictLock ? () => setTutNote(t('tutorial.lockBack')) : onBack}
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

      {tut.coach && (!result || tut.coach.overDialog) && <Coach view={tut.coach} />}

      {tutNote && (
        <div className="mk-coachnote" role="status" aria-live="polite">
          {tutNote}
        </div>
      )}
    </div>
  )
}
