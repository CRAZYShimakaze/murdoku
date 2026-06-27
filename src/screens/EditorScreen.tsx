import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SettingsButton from '../components/SettingsButton.tsx'
import EditorBoard from '../components/EditorBoard.tsx'
import SuspectsPanel from '../components/SuspectsPanel.tsx'
import ObjectIcon from '../components/ObjectIcon.tsx'
import { OBJECT_GLYPHS } from '../game/glyphs.ts'
import { THEME_IDS, themeRooms, themeOutdoor, themeFromRoomKeys, themeDefaultObjects } from '../engine/generator/index.ts'
import { fillBoardCluesAsync, generateLevelAsync, type GenHandle } from '../game/generatorClient.ts'
import type { Condition } from '../game/editorClues.ts'
import { LEVELS, levelMetaFromJson, type Difficulty, type LevelMeta } from '../game/levels.ts'
import {
  saveCustomLevel,
  exportLevelJson,
  loadCustomLevels,
  loadEditorDraft,
  saveEditorDraft,
} from '../game/storage.ts'
import {
  GROUND_OBJECTS,
  ROOM_COLORS,
  ROOM_IDS,
  TOP_OBJECTS,
  buildEditorLevel,
  buildPlayableLevel,
  editorPeopleFromLevel,
  editorStateFromLevel,
  emptyEditorState,
  presentObjectTypes,
  pruneWallEdges,
  setCell,
  toggleWallEdgeAt,
  type EditorObject,
  type EditorState,
  type EditorSuspect,
} from '../game/editorModel.ts'
import { checkLevel, findMurderer, loadLevel, startCoverage, VOID_ROOM, type BoardClueJson, type Cell, type LevelJson } from '../engine/index.ts'
import { Renderer } from '../i18n/Renderer.ts'
import { useDebugSolveKey } from '../game/debugSolve.ts'
import { useBackInterceptor } from '../game/backHandler.ts'

type Mode = 'rooms' | 'ground' | 'top' | 'window' | 'door' | 'global'
/** The four board layers shown as tabs; windows & doors live inside 'top' (Objekte). */
const LAYERS: Mode[] = ['rooms', 'ground', 'top', 'global']
type CheckResult = {
  kind: 'ok' | 'multi' | 'none' | 'contradiction' | 'error' | 'saved' | 'exported' | 'genfail' | 'genfailVorgaben'
  murderer?: string
  /** For a solvable level: did pure forward deduction crack it ('pure'), or were
   *  proof-by-contradiction steps (forcing/SAT search) required ('contradiction')? */
  logic?: 'pure' | 'contradiction'
  /** Start coverage in percent (union over restricted suspects). */
  coverage?: number
  /** Mean per-suspect domain breadth in percent. */
  breadth?: number
}
type EditDifficulty = Exclude<Difficulty, 'tutorial' | 'original'>
const DIFFS: EditDifficulty[] = ['easy', 'medium', 'hard']
const MIN = 4
const MAX = 16
/** The result banner behaves like a toast — it self-dismisses after this long. */
const RESULT_TOAST_MS = 4000

/** Pick a random theme to seed the room names (changeable in the dropdown). */
const pickTheme = (): string => THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)]

/** A decorative dossier case number, stable per case name (pure flavour). */
function caseNumber(name: string): string {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619)
  return String(((h >>> 0) % 9000) + 1000)
}

/** True on the narrow/portrait layout (same breakpoint the editor CSS uses to
 *  switch the tools into a horizontal bar) — drives the mobile object dropdown. */
function useNarrowLayout(): boolean {
  const query = '(orientation: portrait), (max-width: 860px)'
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

interface Props {
  onBack: () => void
  onPlay: (level: LevelMeta) => void
  /** When set, the editor opens this existing level for editing instead of a draft. */
  initialLevel?: LevelJson
}

/** Everything the editor persists so test-playing (or a reload) never loses work. */
interface EditorDraft {
  state: EditorState
  name: string
  difficulty: EditDifficulty
  theme: string
}

/** Seed an editor draft from an existing level ("open in the editor"). */
function draftFromLevel(level: LevelJson): EditorDraft {
  const diff = level.difficulty
  const state = editorStateFromLevel(level)
  // Preselect the theme that matches the level's rooms; fall back to a random one for
  // levels with only generic room slots (no theme to detect).
  const theme = themeFromRoomKeys(state.roomNames) ?? pickTheme()
  // Fill the room slots the level DIDN'T use (still generic "room.editorX") with the
  // theme's rooms that AREN'T already used — so every slot is labelled, with no
  // duplicates ("Room 6, 7 …" becomes the remaining theme rooms in order).
  const generic = (i: number) => `room.editor${ROOM_IDS[i]}`
  const used = new Set(state.roomNames.filter((n, i) => n !== generic(i)))
  const remaining = themeRooms(theme).filter((name) => !used.has(name))
  let next = 0
  const roomNames = state.roomNames.map((n, i) => (n === generic(i) ? (remaining[next++] ?? n) : n))
  return {
    state: { ...state, roomNames },
    name: level.title ?? '',
    difficulty: diff === 'easy' || diff === 'medium' || diff === 'hard' ? diff : 'medium',
    theme,
  }
}

export default function EditorScreen({ onBack, onPlay, initialLevel }: Props) {
  const { t, i18n } = useTranslation()
  // Open the passed level for editing; otherwise restore the saved draft, else fresh.
  const [draft] = useState<EditorDraft | null>(() =>
    initialLevel ? draftFromLevel(initialLevel) : loadEditorDraft<EditorDraft>(),
  )
  const [theme, setTheme] = useState<string>(() => draft?.theme ?? pickTheme())
  const [state, setState] = useState<EditorState>(
    () => draft?.state ?? emptyEditorState(8, themeRooms(theme)),
  )
  const [name, setName] = useState(() => draft?.name ?? '')
  const [difficulty, setDifficulty] = useState<EditDifficulty>(() => draft?.difficulty ?? 'medium')
  const [mode, setMode] = useState<Mode>('rooms')
  const [paintRoom, setPaintRoom] = useState('1')
  const [paintObj, setPaintObj] = useState<string>('s') // top object char, or '' to erase
  const [result, setResult] = useState<CheckResult | null>(null)
  const [showSave, setShowSave] = useState(false)
  // Validity shown as a WARNING in the save dialog (saving stays allowed — the user must be
  // able to keep/export a level for testing/sharing even when it's not yet fair).
  const [saveWarn, setSaveWarn] = useState<'ok' | 'multi' | 'none' | 'contradiction'>('ok')
  // Stable per-session fallback id; a named level uses a slug so re-saving overwrites.
  const [sessionId] = useState(() => `editor-${Date.now()}`)
  const [randomizing, setRandomizing] = useState(false)
  const randomHandle = useRef<GenHandle | null>(null)
  const [regenBusy, setRegenBusy] = useState(false)
  const regenHandle = useRef<GenHandle | null>(null)

  // Every level already in the game (bundled + saved): a content signature to spot an
  // exact duplicate, and the titles to warn about a name clash. Computed once.
  const existing = useMemo(() => {
    const sigs = new Set<string>()
    const titles = new Set<string>()
    const add = (json: LevelJson) => {
      sigs.add(JSON.stringify(editorStateFromLevel(json)))
      const title = (json.title ?? '').trim().toLowerCase()
      if (title) titles.add(title)
    }
    for (const l of LEVELS) add(l.json)
    for (const j of loadCustomLevels()) add(j)
    return { sigs, titles }
  }, [])
  // This exact board+people already exists ⇒ nothing to save. A different board whose
  // name is taken ⇒ saving would overwrite, so warn (but still allow it).
  const contentExists = existing.sigs.has(JSON.stringify(state))
  const nameTaken = name.trim() !== '' && existing.titles.has(name.trim().toLowerCase())

  // Persist the draft on every change so navigating away and back restores it.
  useEffect(() => {
    saveEditorDraft({ state, name, difficulty, theme })
  }, [state, name, difficulty, theme])

  // Auto-dismiss the result banner: a fresh result re-arms the 4 s timer.
  useEffect(() => {
    if (!result) return
    const id = window.setTimeout(() => setResult(null), RESULT_TOAST_MS)
    return () => window.clearTimeout(id)
  }, [result])

  const cols = state.size

  /** Storage id: a slug of the name (re-save overwrites), else the session id. */
  const levelId = () => {
    const slug = name.trim().toLowerCase().replace(/[^\w-]+/g, '-').replace(/(^-+|-+$)/g, '')
    return slug ? `editor-${slug}` : sessionId
  }

  const resize = (size: number) => {
    setResult(null)
    setState(emptyEditorState(size, themeRooms(theme)))
  }

  /** Switch theme → re-label the room slots with that theme's room names. */
  const changeTheme = (id: string) => {
    setTheme(id)
    const names = themeRooms(id)
    setState((s) => ({ ...s, roomNames: s.roomNames.map((n, i) => names[i] ?? n) }))
  }

  const changeSuspect = (i: number, sus: EditorSuspect) =>
    setState((s) => ({ ...s, suspects: s.suspects.map((x, j) => (j === i ? sus : x)) }))

  const changeVictim = (name: string, gender: 'm' | 'f') =>
    setState((s) => ({ ...s, victim: { name, gender } }))

  const build = (id: string) =>
    buildPlayableLevel(state, id, name.trim() || undefined, difficulty, themeOutdoor(theme))

  // Ctrl+B → log the solved board + full deduction path for the level as drawn.
  useDebugSolveKey(() => {
    try {
      const puzzle = loadLevel(build('editor-debug'))
      const lang = i18n.resolvedLanguage ?? i18n.language
      const renderer = new Renderer(i18n.getResourceBundle(lang, 'translation'), puzzle)
      return { puzzle, renderer }
    } catch {
      console.warn('[Murdoku] Board lässt sich (noch) nicht bauen.')
      return null
    }
  })

  /**
   * Keep the board (rooms, floor, objects, windows, doors, global clues) exactly as
   * drawn and let the generator fill the PEOPLE: fresh names, traits and clues so the
   * case is uniquely solvable at the chosen difficulty. Runs in the worker.
   */
  const randomize = (palette?: Condition[]) => {
    setResult(null)
    setRandomizing(true)
    const boardLevel = buildEditorLevel(
      state,
      state.suspects.map((s) => ({ id: s.id, name: s.name, attributes: { gender: s.gender }, clues: [] })),
      { name: state.victim.name || '?', attributes: { gender: state.victim.gender } },
      name.trim() || undefined,
      themeOutdoor(theme),
    )
    const constrained = !!palette && palette.length > 0
    const handle = fillBoardCluesAsync(boardLevel, { difficulty }, constrained ? palette : undefined)
    randomHandle.current = handle
    handle.promise
      .then((level) => {
        randomHandle.current = null
        setRandomizing(false)
        const people = editorPeopleFromLevel(level)
        setState((s) => ({ ...s, suspects: people.suspects, victim: people.victim }))
      })
      .catch((err: Error) => {
        randomHandle.current = null
        setRandomizing(false)
        // Strict constraints can be unsatisfiable on this board → a tailored hint.
        if (err.message !== 'cancelled') setResult({ kind: constrained ? 'genfailVorgaben' : 'genfail' })
      })
  }

  const cancelRandom = () => {
    randomHandle.current?.cancel()
    randomHandle.current = null
    setRandomizing(false)
  }

  /**
   * Generate fresh ROOMS + OBJECTS (layout, floor, furniture, windows, doors) for the
   * current theme/size/difficulty, KEEPING the suspects & victim and the global clues —
   * the people are still (re)made on the left. Runs in the worker.
   */
  const regenerateBoard = () => {
    setResult(null)
    setRegenBusy(true)
    const handle = generateLevelAsync({
      width: state.size,
      height: state.size,
      suspects: state.suspects.length,
      difficulty,
      themeId: theme,
      objects: themeDefaultObjects(theme),
    })
    regenHandle.current = handle
    handle.promise
      .then((level) => {
        regenHandle.current = null
        setRegenBusy(false)
        const gen = editorStateFromLevel(level)
        // Take only the BOARD (rooms/floor/objects/openings); keep people + global clues.
        setState((s) => ({
          ...s,
          roomMap: gen.roomMap,
          roomNames: gen.roomNames,
          groundMap: gen.groundMap,
          topMap: gen.topMap,
          windows: gen.windows,
          doors: gen.doors,
        }))
      })
      .catch((err: Error) => {
        regenHandle.current = null
        setRegenBusy(false)
        if (err.message !== 'cancelled') setResult({ kind: 'genfail' })
      })
  }

  const cancelRegen = () => {
    regenHandle.current?.cancel()
    regenHandle.current = null
    setRegenBusy(false)
  }

  // Back/ESC inside the editor closes the open dialog/spinner first, so you land
  // back IN the editor instead of leaving it.
  useBackInterceptor(showSave, () => setShowSave(false))
  useBackInterceptor(randomizing, cancelRandom)
  useBackInterceptor(regenBusy, cancelRegen)

  const check = () => {
    try {
      const puzzle = loadLevel(build('editor-check'))
      const c = checkLevel(puzzle)
      if (c.solutions === 0) return setResult({ kind: 'none' })
      if (c.solutions >= 2) return setResult({ kind: 'multi' })
      const m = findMurderer(puzzle, c.solution!)
      // `c.solvable` is the SAME human-logic verdict the save gate uses: forward +
      // convergent ("egal wo X → raus"), never proof-by-contradiction. Solved ⇒ crackable
      // by clean logic; stuck ⇒ would need trial-and-error → flagged "Nur mit Widersprüchen".
      const cov = startCoverage(puzzle)
      setResult({
        kind: 'ok',
        murderer: m.suspectId ? puzzle.nameOf(m.suspectId) : undefined,
        logic: c.solvable ? 'pure' : 'contradiction',
        coverage: Math.round(cov.constrainedRatio * 100),
        breadth: Math.round(cov.avgBreadth * 100),
      })
    } catch {
      setResult({ kind: 'error' })
    }
  }

  const play = () => {
    try {
      const level = build(levelId())
      // Test-play is ALWAYS allowed — even an unsolvable, ambiguous, or contradiction-only
      // board may be played to try it out (the game tolerates a solution-less board: you
      // simply can't "win" it). Only SAVING/exporting requires a genuinely valid level.
      // loadLevel still runs so a structurally broken board shows an error instead of
      // navigating into a crash.
      loadLevel(level)
      onPlay(levelMetaFromJson(level, true))
    } catch {
      setResult({ kind: 'error' })
    }
  }

  // The save-dialog warning uses the EXACT same `checkLevel` as the Check button above —
  // one source of truth (DRY), so "Prüfen" and "Speichern" can never disagree.
  const validity = (level: LevelJson): 'ok' | 'multi' | 'none' | 'contradiction' => {
    const c = checkLevel(loadLevel(level))
    if (c.solutions === 0) return 'none'
    if (c.solutions >= 2) return 'multi'
    return c.solvable ? 'ok' : 'contradiction'
  }

  // Open the save dialog ALWAYS; if the level isn't fully valid, surface it as a warning
  // inside the dialog but still let the user keep/export it (e.g. to test or to share a
  // case for debugging). The real guard against shipping a bad level is the GENERATOR.
  const openSave = () => {
    try {
      setSaveWarn(validity(build('editor-check')))
      setShowSave(true)
    } catch {
      setResult({ kind: 'error' })
    }
  }

  const keep = () => {
    try {
      saveCustomLevel(build(levelId()))
      setShowSave(false)
      setResult({ kind: 'saved' })
    } catch {
      setShowSave(false)
      setResult({ kind: 'error' })
    }
  }

  const exportJson = () => {
    try {
      exportLevelJson(build(levelId()))
      setShowSave(false)
      setResult({ kind: 'exported' })
    } catch {
      setShowSave(false)
      setResult({ kind: 'error' })
    }
  }

  const paint = (cell: Cell) => {
    const row = Math.floor(cell / cols)
    const col = cell % cols
    setState((s) => {
      if (mode === 'rooms') {
        const roomMap = setCell(s.roomMap, row, col, paintRoom)
        // Moving a wall can orphan windows/doors — drop the ones no longer on a wall.
        const { windows, doors } = pruneWallEdges(roomMap, s.size, s.windows, s.doors)
        return { ...s, roomMap, windows, doors }
      }
      if (mode === 'ground') {
        // Clicking the same object that's already there removes it (toggle).
        const ch = paintObj && s.groundMap[row][col] === paintObj ? '.' : paintObj || '.'
        return { ...s, groundMap: setCell(s.groundMap, row, col, ch) }
      }
      if (mode === 'top') {
        const ch = paintObj && s.topMap[row][col] === paintObj ? '.' : paintObj || '.'
        return { ...s, topMap: setCell(s.topMap, row, col, ch) }
      }
      return s
    })
  }

  const paintWindow = (cell: Cell, fx: number, fy: number) => {
    const row = Math.floor(cell / cols)
    const col = cell % cols
    setState((s) => ({ ...s, windows: toggleWallEdgeAt(s.windows, row, col, fx, fy) }))
  }

  const paintDoor = (cell: Cell, fx: number, fy: number) => {
    const row = Math.floor(cell / cols)
    const col = cell % cols
    setState((s) => ({ ...s, doors: toggleWallEdgeAt(s.doors, row, col, fx, fy) }))
  }

  const updateBoardClue = (i: number, next: BoardClueJson) =>
    setState((s) => ({ ...s, boardClues: s.boardClues.map((b, j) => (j === i ? next : b)) }))
  const removeBoardClue = (i: number) =>
    setState((s) => ({ ...s, boardClues: s.boardClues.filter((_, j) => j !== i) }))
  const addBoardClue = () =>
    setState((s) => ({
      ...s,
      boardClues: [
        ...s.boardClues,
        { type: 'countOnObject', object: presentObjectTypes(s)[0] ?? 'mud', count: 1 },
      ],
    }))

  // Windows & doors are placed from INSIDE the Objekte (top) layer — its 'Wände'
  // group — so they share the 'top' tab instead of being their own layers.
  const activeLayer: Mode = mode === 'window' || mode === 'door' ? 'top' : mode
  const selectLayer = (layer: Mode) => {
    setMode(layer)
    if (layer === 'ground') setPaintObj('r')
    else if (layer === 'top') setPaintObj('s')
  }

  // Keep the paint selection valid for the active layer.
  const palette = useMemo(() => {
    const base = activeLayer === 'ground' ? GROUND_OBJECTS : activeLayer === 'top' ? TOP_OBJECTS : []
    // Walkable objects on top, blocking ones below (stable within each group).
    return [...base].sort((a, b) => Number(b.occupiable) - Number(a.occupiable))
  }, [activeLayer])

  // On mobile the whole palette collapses to compact dropdowns (the button grid
  // wrapped too tall and covered the action buttons). Desktop keeps the grid.
  const narrow = useNarrowLayout()
  const selectedObj = palette.find((o) => o.char === paintObj)

  // Mobile "Platzieren" dropdown merges rooms + floor + objects into ONE control;
  // its value encodes "<mode>:<token>" so picking an entry also sets the mode.
  const placeValue =
    mode === 'rooms'
      ? `room:${paintRoom}`
      : mode === 'ground'
        ? `ground:${paintObj}`
        : mode === 'top'
          ? `top:${paintObj}`
          : mode === 'window'
            ? 'wall:window'
            : mode === 'door'
              ? 'wall:door'
              : '' // global → nothing to paint
  const changePlace = (value: string) => {
    const i = value.indexOf(':')
    const kind = value.slice(0, i)
    const token = value.slice(i + 1)
    if (kind === 'room') {
      setMode('rooms')
      setPaintRoom(token)
    } else if (kind === 'ground') {
      setMode('ground')
      setPaintObj(token)
    } else if (kind === 'top') {
      setMode('top')
      setPaintObj(token)
    } else if (kind === 'wall') {
      setMode(token === 'door' ? 'door' : 'window')
    }
  }
  const roomSwatchStyle =
    paintRoom === VOID_ROOM
      ? { background: '#191722', border: '1px dashed #6f6a78' }
      : { background: ROOM_COLORS[ROOM_IDS.indexOf(paintRoom)] }

  /** One object paint button — shared by the Boden and Objekte palettes. */
  const objButton = (o: EditorObject, active: boolean, onPick: () => void) => (
    <button key={o.char} type="button" className="mk-pal" data-active={active} onClick={onPick}>
      <ObjectIcon type={o.type} occupiable={o.occupiable} size={26} className="mk-pal__canvas" />
      {t(`objName.${o.type}`)}
    </button>
  )

  // Check / Play / Save — pinned in the right column on desktop, in a sticky
  // bottom bar on mobile, so the same three buttons live in exactly one place.
  const actionButtons = (
    <>
      <button type="button" className="mk-btn mk-btn--ghost" onClick={check}>
        {t('editor.check')}
      </button>
      <button type="button" className="mk-btn mk-btn--ghost" onClick={play}>
        {t('editor.play')}
      </button>
      <button type="button" className="mk-btn mk-btn--primary" onClick={openSave}>
        {t('editor.save')}
      </button>
    </>
  )

  return (
    <div className="mk-game mk-editor">
      <header className="mk-game__head mk-editor__head">
        {/* Identity: back, the wordmark, and a stamped case-file tag. */}
        <div className="mk-editor__brand">
          <button type="button" className="mk-back" onClick={onBack} aria-label="back">
            ←
          </button>
          <div className="mk-editor__ident">
            <strong className="mk-editor__title">
              <span className="mk-editor__mark" aria-hidden="true">☠</span>
              {t('editor.title')}
            </strong>
            <span className="mk-editor__casetag" aria-hidden="true">
              {t('editor.caseTag')} №{caseNumber(name)}
            </span>
          </div>
        </div>

        {/* Grouped, labelled case fields: title · theme · difficulty · size. */}
        <div className="mk-editor__fields">
          <label className="mk-field mk-field--title">
            <span className="mk-field__label">{t('editor.fieldTitle')}</span>
            <input
              className="mk-input mk-editor__name"
              value={name}
              placeholder={t('editor.name')}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="mk-field">
            <span className="mk-field__label">{t('editor.theme')}</span>
            <select
              className="mk-select-input"
              value={theme}
              onChange={(e) => changeTheme(e.target.value)}
            >
              {THEME_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(`theme.${id}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="mk-field">
            <span className="mk-field__label">{t('generate.difficulty')}</span>
            <select
              className="mk-select-input"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as EditDifficulty)}
            >
              {DIFFS.map((d) => (
                <option key={d} value={d}>
                  {t(`difficulty.${d}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="mk-field mk-field--size">
            <span className="mk-field__label">
              {t('editor.size')} <strong>{state.size}×{state.size}</strong>
            </span>
            <input
              type="range"
              min={MIN}
              max={MAX}
              value={state.size}
              onChange={(e) => resize(Number(e.target.value))}
            />
          </label>

          {/* EBENE is a normal field in the SAME container as Titel/Thema/… so it
              lines up identically. Windows & doors live inside the Objekte layer.
              Hidden on phones (which use the consolidated dropdown instead). */}
          <div className="mk-field mk-editor__layerfield">
            <span className="mk-field__label">{t('editor.layer')}</span>
            <div className="mk-editor__layers" role="tablist" aria-label={t('editor.layer')}>
              {LAYERS.map((layer) => (
                <button
                  key={layer}
                  type="button"
                  role="tab"
                  className="mk-layertab"
                  data-active={activeLayer === layer}
                  aria-selected={activeLayer === layer}
                  onClick={() => selectLayer(layer)}
                >
                  {t(`editor.mode_${layer}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* "Regenerate rooms & objects" — its own slot LEFT of the divider (the divider
            is the left border of .mk-editor__lang), so it isn't grouped with the gear. */}
        <div className="mk-editor__tool">
          <button
            type="button"
            className="mk-gear mk-gear--board"
            onClick={regenerateBoard}
            disabled={regenBusy}
            title={t('editor.randomBoardHint')}
            aria-label={t('editor.randomBoard')}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <rect x="3.5" y="3.5" width="17" height="17" rx="1.6" />
              <path d="M13 3.5 V12 M3.5 12 H9 M13 12 H20.5" />
            </svg>
          </button>
        </div>

        <div className="mk-editor__lang">
          <SettingsButton />
        </div>
      </header>

      {result && (
        <div className="mk-editor__result" data-kind={result.kind}>
          {result.kind === 'ok' ? (
            <>
              {result.murderer
                ? t('editor.resultOk', { name: result.murderer })
                : t('editor.resultOkNoMurderer')}
              {result.logic && (
                <span className="mk-editor__logic" data-logic={result.logic}>
                  {t(`editor.logic_${result.logic}`)}
                </span>
              )}
              {result.coverage !== undefined && (
                <span className="mk-editor__logic">
                  {t('editor.coverage', { percent: result.coverage, avg: result.breadth ?? 0 })}
                </span>
              )}
            </>
          ) : (
            t(`editor.result_${result.kind}`)
          )}
        </div>
      )}

      <SuspectsPanel
        state={state}
        onChangeSuspect={changeSuspect}
        onChangeVictim={changeVictim}
        onRandom={randomize}
        randomizing={randomizing}
      />

      <div className="mk-board">
        <EditorBoard
          state={state}
          onPaint={paint}
          windowMode={mode === 'window'}
          onPaintWindow={paintWindow}
          doorMode={mode === 'door'}
          onPaintDoor={paintDoor}
        />
      </div>

      <aside className="mk-tools mk-editor__palette">
        <div className="mk-editor__palettescroll">
          {/* MOBILE: the layer lives here (no room for the reiter). One dropdown
              merges rooms + floor + objects + walls; a button for global. */}
          {narrow && (
            <div className="mk-mobtools">
              <label className="mk-mobtools__row">
                <span className="mk-mobtools__lbl">{t('editor.placeLabel')}</span>
                <select
                  className="mk-select-input mk-objsel__select"
                  value={placeValue}
                  onChange={(e) => changePlace(e.target.value)}
                >
                  <optgroup label={t('editor.rooms')}>
                    <option value={`room:${VOID_ROOM}`}>{t('editor.roomEmpty')}</option>
                    {ROOM_IDS.map((id, i) => (
                      <option key={id} value={`room:${id}`}>
                        {t(state.roomNames[i] ?? `room.editor${id}`)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t('editor.mode_ground')}>
                    {GROUND_OBJECTS.map((o) => (
                      <option key={o.char} value={`ground:${o.char}`}>
                        {t(`objName.${o.type}`)}
                      </option>
                    ))}
                    <option value="ground:">{`✕ ${t('editor.erase')}`}</option>
                  </optgroup>
                  <optgroup label={`${t('editor.mode_top')} – ${t('generate.objectsOccupiable')}`}>
                    {TOP_OBJECTS.filter((o) => o.occupiable).map((o) => (
                      <option key={o.char} value={`top:${o.char}`}>
                        {`${OBJECT_GLYPHS[o.type] ?? '▦'} ${t(`objName.${o.type}`)}`}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={`${t('editor.mode_top')} – ${t('generate.objectsBlocking')}`}>
                    {TOP_OBJECTS.filter((o) => !o.occupiable).map((o) => (
                      <option key={o.char} value={`top:${o.char}`}>
                        {`${OBJECT_GLYPHS[o.type] ?? '▦'} ${t(`objName.${o.type}`)}`}
                      </option>
                    ))}
                    <option value="top:">{`✕ ${t('editor.erase')}`}</option>
                  </optgroup>
                  <optgroup label={t('editor.wallsLabel')}>
                    <option value="wall:window">{`▭ ${t('objName.window')}`}</option>
                    <option value="wall:door">{`▯ ${t('objName.door')}`}</option>
                  </optgroup>
                  {mode === 'global' && (
                    <option value="" disabled>{`— ${t('editor.placeLabel')} —`}</option>
                  )}
                </select>
                <div className="mk-objsel__preview" aria-hidden="true">
                  {mode === 'rooms' ? (
                    <span className="mk-objsel__swatch" style={roomSwatchStyle} />
                  ) : mode === 'window' || mode === 'door' ? (
                    <ObjectIcon type={mode} occupiable={false} size={34} className="mk-pal__canvas" />
                  ) : mode === 'ground' || mode === 'top' ? (
                    selectedObj ? (
                      <ObjectIcon
                        type={selectedObj.type}
                        occupiable={selectedObj.occupiable}
                        size={34}
                        className="mk-pal__canvas"
                      />
                    ) : (
                      <span className="mk-pal__icon">✕</span>
                    )
                  ) : (
                    <span className="mk-pal__icon mk-pal__icon--muted">·</span>
                  )}
                </div>
              </label>

              <div className="mk-mobtools__row">
                <span className="mk-mobtools__lbl">{t('editor.mode_global')}</span>
                <button
                  type="button"
                  className="mk-chip mk-mobtools__global"
                  data-active={mode === 'global'}
                  onClick={() => setMode(mode === 'global' ? 'top' : 'global')}
                >
                  {t('editor.globalClues')}
                </button>
              </div>
            </div>
          )}

          {mode === 'window' && <p className="mk-pal__hint">{t('editor.windowHint')}</p>}
          {mode === 'door' && <p className="mk-pal__hint">{t('editor.doorHint')}</p>}

          {activeLayer === 'global' && (
            <div className="mk-boardclue-edit">
              {state.boardClues.map((bc, i) => (
                <div key={i} className="mk-bce">
                  <button
                    type="button"
                    className="mk-bce__del"
                    onClick={() => removeBoardClue(i)}
                    aria-label={t('cond.remove')}
                  >
                    ✕
                  </button>
                  <select
                    className="mk-select-input"
                    value={bc.type}
                    onChange={(e) => {
                      const type = e.target.value as BoardClueJson['type']
                      updateBoardClue(
                        i,
                        type === 'countOnObject'
                          ? { type, object: presentObjectTypes(state)[0] ?? 'mud', count: bc.count }
                          : { type, count: bc.count },
                      )
                    }}
                  >
                    {(['countOnObject', 'emptyRooms', 'everyRoomCount'] as const).map((k) => (
                      <option key={k} value={k}>
                        {t(`editor.boardClueKind.${k}`)}
                      </option>
                    ))}
                  </select>
                  {bc.type === 'countOnObject' && (
                    <select
                      className="mk-select-input"
                      value={bc.object}
                      onChange={(e) => updateBoardClue(i, { ...bc, object: e.target.value })}
                    >
                      {presentObjectTypes(state).map((o) => (
                        <option key={o} value={o}>
                          {t(`objName.${o}`)}
                        </option>
                      ))}
                    </select>
                  )}
                  <label className="mk-bce__count">
                    <span>{t('editor.count')}</span>
                    <input
                      className="mk-input"
                      type="number"
                      min={0}
                      value={bc.count}
                      onChange={(e) =>
                        updateBoardClue(i, { ...bc, count: Math.max(0, Number(e.target.value)) })
                      }
                    />
                  </label>
                </div>
              ))}
              <button type="button" className="mk-btn mk-btn--ghost mk-cb__add" onClick={addBoardClue}>
                {t('editor.addClue')}
              </button>
            </div>
          )}

          {/* DESKTOP: per-layer item buttons (mobile uses the dropdowns above). */}
          {!narrow && activeLayer === 'rooms' && (
            <>
              <button
                type="button"
                className="mk-pal mk-pal--room"
                data-active={paintRoom === VOID_ROOM}
                onClick={() => setPaintRoom(VOID_ROOM)}
              >
                <span
                  className="mk-pal__swatch"
                  style={{ background: '#191722', border: '1px dashed #6f6a78' }}
                />
                {t('editor.roomEmpty')}
              </button>
              {ROOM_IDS.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  className="mk-pal mk-pal--room"
                  data-active={paintRoom === id}
                  onClick={() => setPaintRoom(id)}
                >
                  <span className="mk-pal__swatch" style={{ background: ROOM_COLORS[i] }} />
                  {t(state.roomNames[i] ?? `room.editor${id}`)}
                </button>
              ))}
            </>
          )}

          {/* Boden: a single flat list of floor objects. */}
          {!narrow && activeLayer === 'ground' && (
            <>
              {palette.map((o) => objButton(o, paintObj === o.char, () => setPaintObj(o.char)))}
              <button
                type="button"
                className="mk-pal"
                data-active={paintObj === ''}
                onClick={() => setPaintObj('')}
              >
                <span className="mk-pal__icon">✕</span>
                {t('editor.erase')}
              </button>
            </>
          )}

          {/* Objekte: grouped walkable / blocking, plus the 'Wände' subgroup that
              merges the former Fenster & Türen tools (selecting one arms edge mode). */}
          {!narrow && activeLayer === 'top' && (
            <>
              <div className="mk-pal__group">
                <span className="mk-pal__grouplabel">{t('editor.groupWalkable')}</span>
                {TOP_OBJECTS.filter((o) => o.occupiable).map((o) =>
                  objButton(o, mode === 'top' && paintObj === o.char, () => {
                    setMode('top')
                    setPaintObj(o.char)
                  }),
                )}
              </div>
              <div className="mk-pal__group">
                <span className="mk-pal__grouplabel">{t('editor.groupBlocking')}</span>
                {TOP_OBJECTS.filter((o) => !o.occupiable).map((o) =>
                  objButton(o, mode === 'top' && paintObj === o.char, () => {
                    setMode('top')
                    setPaintObj(o.char)
                  }),
                )}
              </div>
              <button
                type="button"
                className="mk-pal"
                data-active={mode === 'top' && paintObj === ''}
                onClick={() => {
                  setMode('top')
                  setPaintObj('')
                }}
              >
                <span className="mk-pal__icon">✕</span>
                {t('editor.erase')}
              </button>
              <div className="mk-pal__group">
                <span className="mk-pal__grouplabel">{t('editor.wallsLabel')}</span>
                <button
                  type="button"
                  className="mk-pal mk-pal--wall"
                  data-active={mode === 'window'}
                  onClick={() => setMode('window')}
                >
                  <ObjectIcon type="window" occupiable={false} size={26} className="mk-pal__canvas" />
                  {t('objName.window')}
                  <span className="mk-pal__tag">{t('legend.wall')}</span>
                </button>
                <button
                  type="button"
                  className="mk-pal mk-pal--wall"
                  data-active={mode === 'door'}
                  onClick={() => setMode('door')}
                >
                  <ObjectIcon type="door" occupiable={false} size={26} className="mk-pal__canvas" />
                  {t('objName.door')}
                  <span className="mk-pal__tag">{t('legend.wall')}</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Desktop keeps the actions pinned at the bottom of this column. */}
        {!narrow && <div className="mk-editor__actions">{actionButtons}</div>}
      </aside>

      {/* Mobile: actions are a sticky bar at the very bottom of the page. */}
      {narrow && <div className="mk-editor__actions mk-editor__actionsbar">{actionButtons}</div>}

      {showSave && (
        <div className="mk-overlay" onClick={() => setShowSave(false)}>
          <div className="mk-dialog mk-savedlg" onClick={(e) => e.stopPropagation()}>
            <h3>{t('editor.saveTitle')}</h3>
            <div className="mk-nameform">
              <label htmlFor="mk-savename">{t('result.nameLabel')}</label>
              <input
                id="mk-savename"
                type="text"
                autoFocus
                value={name}
                maxLength={40}
                placeholder={t('editor.name')}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="mk-savedlg__diff">
              {DIFFS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="mk-chip"
                  data-active={difficulty === d}
                  onClick={() => setDifficulty(d)}
                >
                  {t(`difficulty.${d}`)}
                </button>
              ))}
            </div>
            <p className="mk-savedlg__hint">{t('editor.saveHint')}</p>
            {saveWarn !== 'ok' && (
              <p className="mk-savedlg__warn">⚠ {t(`editor.result_${saveWarn}`)}</p>
            )}
            {contentExists ? (
              <>
                <p className="mk-savedlg__exists">{t('editor.levelExists')}</p>
                <div className="mk-dialog__actions">
                  <button type="button" className="mk-btn mk-btn--ghost" onClick={() => setShowSave(false)}>
                    {t('result.back')}
                  </button>
                </div>
              </>
            ) : (
              <>
                {nameTaken && <p className="mk-savedlg__warn">{t('editor.nameTaken')}</p>}
                <div className="mk-dialog__actions">
                  <button type="button" className="mk-btn mk-btn--primary" onClick={keep}>
                    {t('editor.saveKeep')}
                  </button>
                  <button type="button" className="mk-btn mk-btn--ghost" onClick={exportJson}>
                    {t('editor.saveExport')}
                  </button>
                  <button type="button" className="mk-btn mk-btn--ghost" onClick={() => setShowSave(false)}>
                    {t('result.back')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {randomizing && (
        <div className="mk-overlay">
          <div className="mk-dialog">
            <span className="mk-spinner" />
            <p>{t('editor.randomizing')}</p>
            <button type="button" className="mk-btn mk-btn--ghost" onClick={cancelRandom}>
              {t('generate.cancel')}
            </button>
          </div>
        </div>
      )}

      {regenBusy && (
        <div className="mk-overlay">
          <div className="mk-dialog">
            <span className="mk-spinner" />
            <p>{t('editor.randomizingBoard')}</p>
            <button type="button" className="mk-btn mk-btn--ghost" onClick={cancelRegen}>
              {t('generate.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
