import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageToggle from '../components/LanguageToggle.tsx'
import EditorBoard from '../components/EditorBoard.tsx'
import SuspectsPanel from '../components/SuspectsPanel.tsx'
import { OBJECT_GLYPHS } from '../game/glyphs.ts'
import { THEME_IDS, themeRooms } from '../engine/generator/index.ts'
import { levelMetaFromJson, type Difficulty, type LevelMeta } from '../game/levels.ts'
import { saveCustomLevel, exportLevelJson, loadEditorDraft, saveEditorDraft } from '../game/storage.ts'
import {
  GROUND_OBJECTS,
  ROOM_COLORS,
  ROOM_IDS,
  TOP_OBJECTS,
  buildPlayableLevel,
  emptyEditorState,
  setCell,
  toggleWindowAt,
  type EditorState,
  type EditorSuspect,
} from '../game/editorModel.ts'
import { SearchSolver, findMurderer, loadLevel, type Cell } from '../engine/index.ts'

type Mode = 'rooms' | 'ground' | 'top' | 'window'
type CheckResult = { kind: 'ok' | 'multi' | 'none' | 'error' | 'saved' | 'exported'; murderer?: string }
type EditDifficulty = Exclude<Difficulty, 'tutorial'>
const DIFFS: EditDifficulty[] = ['easy', 'medium', 'hard']
const MIN = 4
const MAX = 16

/** Pick a random theme to seed the room names (changeable in the dropdown). */
const pickTheme = (): string => THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)]

interface Props {
  onBack: () => void
  onPlay: (level: LevelMeta) => void
}

/** Everything the editor persists so test-playing (or a reload) never loses work. */
interface EditorDraft {
  state: EditorState
  name: string
  difficulty: EditDifficulty
  theme: string
}

export default function EditorScreen({ onBack, onPlay }: Props) {
  const { t } = useTranslation()
  // Restore the saved draft (set when leaving to test-play), else start fresh.
  const [draft] = useState<EditorDraft | null>(() => loadEditorDraft<EditorDraft>())
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
  // Stable per-session fallback id; a named level uses a slug so re-saving overwrites.
  const [sessionId] = useState(() => `editor-${Date.now()}`)

  // Persist the draft on every change so navigating away and back restores it.
  useEffect(() => {
    saveEditorDraft({ state, name, difficulty, theme })
  }, [state, name, difficulty, theme])

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
    buildPlayableLevel(state, id, name.trim() || undefined, difficulty)

  const check = () => {
    try {
      const puzzle = loadLevel(build('editor-check'))
      const solver = new SearchSolver(puzzle)
      const count = solver.countSolutions(2)
      if (count === 0) return setResult({ kind: 'none' })
      if (count >= 2) return setResult({ kind: 'multi' })
      const solution = solver.firstSolution()!
      const m = findMurderer(puzzle, solution)
      setResult({ kind: 'ok', murderer: m.suspectId ? puzzle.nameOf(m.suspectId) : undefined })
    } catch {
      setResult({ kind: 'error' })
    }
  }

  const play = () => {
    try {
      const level = build(levelId())
      const count = new SearchSolver(loadLevel(level)).countSolutions(2)
      if (count === 1) onPlay(levelMetaFromJson(level, true))
      else setResult({ kind: count === 0 ? 'none' : 'multi' })
    } catch {
      setResult({ kind: 'error' })
    }
  }

  // Open the save dialog only once the level is verified solvable & unique.
  const openSave = () => {
    try {
      const count = new SearchSolver(loadLevel(build('editor-check'))).countSolutions(2)
      if (count !== 1) return setResult({ kind: count === 0 ? 'none' : 'multi' })
      setShowSave(true)
    } catch {
      setResult({ kind: 'error' })
    }
  }

  const keep = () => {
    saveCustomLevel(build(levelId()))
    setShowSave(false)
    setResult({ kind: 'saved' })
  }

  const exportJson = () => {
    exportLevelJson(build(levelId()))
    setShowSave(false)
    setResult({ kind: 'exported' })
  }

  const paint = (cell: Cell) => {
    const row = Math.floor(cell / cols)
    const col = cell % cols
    setState((s) => {
      if (mode === 'rooms') return { ...s, roomMap: setCell(s.roomMap, row, col, paintRoom) }
      if (mode === 'ground') return { ...s, groundMap: setCell(s.groundMap, row, col, paintObj || '.') }
      if (mode === 'top') return { ...s, topMap: setCell(s.topMap, row, col, paintObj || '.') }
      return s
    })
  }

  const paintWindow = (cell: Cell, fx: number, fy: number) => {
    const row = Math.floor(cell / cols)
    const col = cell % cols
    setState((s) => ({ ...s, windows: toggleWindowAt(s.windows, row, col, fx, fy) }))
  }

  // Keep the paint selection valid for the active mode.
  const palette = useMemo(() => {
    if (mode === 'ground') return GROUND_OBJECTS
    if (mode === 'top') return TOP_OBJECTS
    return []
  }, [mode])

  return (
    <div className="mk-game mk-editor">
      <header className="mk-game__head mk-editor__head">
        <button type="button" className="mk-back" onClick={onBack} aria-label="back">
          ←
        </button>
        <strong className="mk-editor__title">{t('editor.title')}</strong>
        <input
          className="mk-input mk-editor__name"
          value={name}
          placeholder={t('editor.name')}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="mk-editor__size">
          {t('editor.size')} <strong>{state.size}×{state.size}</strong>
          <input
            type="range"
            min={MIN}
            max={MAX}
            value={state.size}
            onChange={(e) => resize(Number(e.target.value))}
          />
        </label>
        <select
          className="mk-select-input"
          value={theme}
          onChange={(e) => changeTheme(e.target.value)}
          aria-label={t('editor.theme')}
        >
          {THEME_IDS.map((id) => (
            <option key={id} value={id}>
              {t(`theme.${id}`)}
            </option>
          ))}
        </select>
        <select
          className="mk-select-input"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as EditDifficulty)}
          aria-label={t('generate.difficulty')}
        >
          {DIFFS.map((d) => (
            <option key={d} value={d}>
              {t(`difficulty.${d}`)}
            </option>
          ))}
        </select>
        <div className="mk-editor__modes">
          {(['rooms', 'ground', 'top', 'window'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              className="mk-chip"
              data-active={mode === m}
              onClick={() => {
                setMode(m)
                if (m === 'ground') setPaintObj('r')
                else if (m === 'top') setPaintObj('s')
              }}
            >
              {t(`editor.mode_${m}`)}
            </button>
          ))}
        </div>
        <div className="mk-editor__lang">
          <LanguageToggle />
        </div>
      </header>

      {result && (
        <div className="mk-editor__result" data-kind={result.kind}>
          {result.kind === 'ok'
            ? result.murderer
              ? t('editor.resultOk', { name: result.murderer })
              : t('editor.resultOkNoMurderer')
            : t(`editor.result_${result.kind}`)}
        </div>
      )}

      <SuspectsPanel
        state={state}
        onChangeSuspect={changeSuspect}
        onChangeVictim={changeVictim}
      />

      <div className="mk-board">
        <EditorBoard
          state={state}
          onPaint={paint}
          windowMode={mode === 'window'}
          onPaintWindow={paintWindow}
        />
      </div>

      <aside className="mk-tools mk-editor__palette">
        <div className="mk-editor__palettescroll">
          <span className="mk-tools__label">
            {mode === 'rooms' ? t('editor.rooms') : mode === 'window' ? t('editor.windows') : t('editor.objects')}
          </span>

          {mode === 'window' && <p className="mk-empty">{t('editor.windowHint')}</p>}

          {mode === 'rooms' &&
            ROOM_IDS.map((id, i) => (
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

          {(mode === 'ground' || mode === 'top') && (
            <>
              {palette.map((o) => (
                <button
                  key={o.char}
                  type="button"
                  className="mk-pal"
                  data-active={paintObj === o.char}
                  onClick={() => setPaintObj(o.char)}
                >
                  <span className="mk-pal__icon">{OBJECT_GLYPHS[o.type] ?? '•'}</span>
                  {t(`objName.${o.type}`)}
                </button>
              ))}
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
        </div>

        <div className="mk-editor__actions">
          <button type="button" className="mk-btn mk-btn--ghost" onClick={check}>
            {t('editor.check')}
          </button>
          <button type="button" className="mk-btn mk-btn--ghost" onClick={play}>
            {t('editor.play')}
          </button>
          <button type="button" className="mk-btn mk-btn--primary" onClick={openSave}>
            {t('editor.save')}
          </button>
        </div>
      </aside>

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
          </div>
        </div>
      )}
    </div>
  )
}
