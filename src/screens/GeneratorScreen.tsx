import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SettingsButton from '../components/SettingsButton.tsx'
import { generateLevelAsync, type GenHandle } from '../game/generatorClient.ts'
import { levelMetaFromJson, type LevelMeta } from '../game/levels.ts'
import { loadGenSettings, saveGenSettings } from '../game/storage.ts'
import { OBJECT_GLYPHS } from '../game/glyphs.ts'
import {
  OCCUPIABLE_OBJECT_TYPES,
  BLOCKING_OBJECT_TYPES,
  GENERATOR_OBJECT_TYPES,
  THEME_IDS,
  themeDefaultObjects,
  type GenDifficulty,
} from '../engine/generator/index.ts'

/** The objects pre-selected for a theme: a specific theme → its natural kit; "random" →
 *  EVERYTHING, so whichever theme is rolled has all its objects available (deselect freely). */
const objectsForTheme = (id: string): string[] =>
  id === 'random' ? GENERATOR_OBJECT_TYPES : themeDefaultObjects(id)

const GEN_DIFFS: GenDifficulty[] = ['easy', 'medium', 'hard']
/** Short codes for the faux case reference shown on the dossier (pure flavour). */
const DIFF_CODE: Record<GenDifficulty, string> = { easy: 'E', medium: 'M', hard: 'H' }
const MIN = 4
const MAX = 16

/** Form defaults for a first-time visitor (windows on, doors off, no trash bin). */
const DEFAULT_SETTINGS = {
  size: 8,
  difficulty: 'medium' as GenDifficulty,
  theme: 'random',
  // Default theme is "random" → start with EVERYTHING selected (see objectsForTheme).
  objects: [...GENERATOR_OBJECT_TYPES],
  windows: true,
  doors: false,
}

interface Props {
  onPlay: (level: LevelMeta) => void
  onBack: () => void
}

export default function GeneratorScreen({ onPlay, onBack }: Props) {
  const { t } = useTranslation()
  // Restore the last form selection (size, difficulty, theme, objects, openings).
  const [saved] = useState(() => loadGenSettings(DEFAULT_SETTINGS))
  const [size, setSize] = useState(saved.size)
  const [difficulty, setDifficulty] = useState<GenDifficulty>(saved.difficulty as GenDifficulty)
  const [objects, setObjects] = useState<Set<string>>(() => new Set(saved.objects))
  const [windows, setWindows] = useState(saved.windows)
  const [doors, setDoors] = useState(saved.doors)
  const [theme, setTheme] = useState<string>(saved.theme)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const handleRef = useRef<GenHandle | null>(null)

  // Persist every change so the next visit reopens with the same settings.
  useEffect(() => {
    saveGenSettings({ size, difficulty, theme, objects: [...objects], windows, doors })
  }, [size, difficulty, theme, objects, windows, doors])

  const toggleObject = (type: string) =>
    setObjects((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })

  // Picking a theme pre-selects the objects that naturally fit its rooms (farm → animals,
  // supermarket → fridges); "random" pre-selects everything. The user can still toggle.
  const changeTheme = (id: string) => {
    setTheme(id)
    setObjects(new Set(objectsForTheme(id)))
  }

  /** One toggle group of object chips (walkable vs blocking). The optional hint is an
      explanatory suffix shown only on desktop — it would overflow the narrow mobile row. */
  const objectGroup = (label: string, types: readonly string[], hint?: string) => (
    <div className="mk-field">
      <span className="mk-field__label">
        {label}
        {hint && <span className="mk-fieldhint">{hint}</span>}
      </span>
      <div className="mk-chips">
        {types.map((type) => (
          <button
            key={type}
            type="button"
            className="mk-chip"
            data-active={objects.has(type)}
            disabled={busy}
            onClick={() => toggleObject(type)}
          >
            {OBJECT_GLYPHS[type] ?? '▦'} {t(`objName.${type}`)}
          </button>
        ))}
      </div>
    </div>
  )

  const create = () => {
    setError(null)
    setBusy(true)
    const handle = generateLevelAsync({
      width: size,
      height: size,
      suspects: size - 1,
      difficulty,
      objects: [...objects],
      windows,
      doors,
      themeId: theme === 'random' ? undefined : theme,
    })
    handleRef.current = handle
    handle.promise
      .then((level) => {
        handleRef.current = null
        onPlay(levelMetaFromJson(level))
      })
      .catch((err: Error) => {
        handleRef.current = null
        setBusy(false)
        if (err.message !== 'cancelled') setError(t('generate.failed'))
      })
  }

  const cancel = () => {
    handleRef.current?.cancel()
    handleRef.current = null
    setBusy(false)
  }

  // A faux case reference that updates live as the form changes — dossier flavour only.
  const caseRef = `MD-${String(size).padStart(2, '0')}-${DIFF_CODE[difficulty]}`

  return (
    <div className="mk-screen">
      <div className="mk-generate">
        <header className="mk-topbar">
          <button type="button" className="mk-back" onClick={onBack} aria-label="back">
            ←
          </button>
          <h1>
            {t('generate.title')}
            <small>{t('generate.subtitle')}</small>
          </h1>
          <SettingsButton />
        </header>

        <div className="mk-genform">
          {/* Dossier header band: the case-file label + a live (faux) case number and a
              stamped CONFIDENTIAL mark — frames the whole form as a real case file. */}
          <div className="mk-genform__head">
            <span className="mk-genform__akte">
              {t('generate.akte')}
              <span className="mk-genform__no">№ {caseRef}</span>
            </span>
            <span className="mk-genform__stamp" aria-hidden="true">
              {t('generate.confidential')}
            </span>
          </div>

          {/* Two sections, each opened by the app's standard .mk-divider (brass label +
              dashed rule) — the same case-drawer dividers used in the level select. */}
          <section className="mk-genset">
            <div className="mk-divider">
              <span className="mk-divider__label">{t('generate.sectionCase')}</span>
            </div>
            {/* size · difficulty · theme side by side on desktop; on phones .mk-genrow
                collapses to display:contents so each field stacks full-width. */}
            <div className="mk-genrow">
              <div className="mk-field">
                <label className="mk-field__label" htmlFor="mk-size">
                  {t('generate.size')}: <strong>{size}×{size}</strong> ·{' '}
                  {t('generate.suspects', { n: size - 1 })}
                </label>
                <input
                  id="mk-size"
                  type="range"
                  min={MIN}
                  max={MAX}
                  value={size}
                  disabled={busy}
                  onChange={(e) => setSize(Number(e.target.value))}
                />
              </div>

              <div className="mk-field">
                <span className="mk-field__label">{t('generate.difficulty')}</span>
                <div className="mk-chips">
                  {GEN_DIFFS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="mk-chip"
                      data-active={difficulty === d}
                      disabled={busy}
                      onClick={() => setDifficulty(d)}
                    >
                      {t(`difficulty.${d}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mk-field">
                <label className="mk-field__label" htmlFor="mk-theme">
                  {t('generate.theme')}
                </label>
                <select
                  id="mk-theme"
                  className="mk-select-input"
                  value={theme}
                  disabled={busy}
                  onChange={(e) => changeTheme(e.target.value)}
                >
                  <option value="random">{t('theme.random')}</option>
                  {THEME_IDS.map((id) => (
                    <option key={id} value={id}>
                      {t(`theme.${id}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="mk-genset">
            <div className="mk-divider">
              <span className="mk-divider__label">{t('generate.sectionScene')}</span>
            </div>
            {objectGroup(
              t('generate.objectsOccupiable'),
              OCCUPIABLE_OBJECT_TYPES,
              t('generate.objectsOccupiableHint'),
            )}
            {objectGroup(t('generate.objectsBlocking'), BLOCKING_OBJECT_TYPES)}

            <div className="mk-field">
              <span className="mk-field__label">{t('generate.openings')}</span>
              <div className="mk-chips">
                <button
                  type="button"
                  className="mk-chip"
                  data-active={windows}
                  disabled={busy}
                  onClick={() => setWindows((w) => !w)}
                >
                  {OBJECT_GLYPHS.window} {t('generate.windows')}
                </button>
                <button
                  type="button"
                  className="mk-chip"
                  data-active={doors}
                  disabled={busy}
                  onClick={() => setDoors((d) => !d)}
                >
                  {OBJECT_GLYPHS.door} {t('generate.doors')}
                </button>
              </div>
            </div>
          </section>

          {error && <p className="mk-generr">{error}</p>}

          <button
            type="button"
            className="mk-btn mk-btn--primary mk-btn--block"
            onClick={create}
            disabled={busy}
          >
            {t('generate.create')}
          </button>
          <p className="mk-genhint">{t('generate.hint')}</p>
        </div>
      </div>

      {busy && (
        <div className="mk-overlay">
          <div className="mk-dialog">
            <span className="mk-spinner" />
            <p>{t('generate.generating')}</p>
            <button type="button" className="mk-btn mk-btn--ghost" onClick={cancel}>
              {t('generate.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
