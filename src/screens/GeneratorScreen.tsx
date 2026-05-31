import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageToggle from '../components/LanguageToggle.tsx'
import { generateLevelAsync, type GenHandle } from '../game/generatorClient.ts'
import { levelMetaFromJson, type LevelMeta } from '../game/levels.ts'
import { OBJECT_GLYPHS } from '../game/glyphs.ts'
import { GENERATOR_OBJECT_TYPES, THEME_IDS, type GenDifficulty } from '../engine/generator/index.ts'

const GEN_DIFFS: GenDifficulty[] = ['easy', 'medium', 'hard']
const MIN = 4
const MAX = 16

interface Props {
  onPlay: (level: LevelMeta) => void
  onBack: () => void
}

export default function GeneratorScreen({ onPlay, onBack }: Props) {
  const { t } = useTranslation()
  const [size, setSize] = useState(8)
  const [difficulty, setDifficulty] = useState<GenDifficulty>('medium')
  const [objects, setObjects] = useState<Set<string>>(() => new Set(GENERATOR_OBJECT_TYPES))
  const [theme, setTheme] = useState<string>('random')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const handleRef = useRef<GenHandle | null>(null)

  const toggleObject = (type: string) =>
    setObjects((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })

  const create = () => {
    setError(null)
    setBusy(true)
    const handle = generateLevelAsync({
      width: size,
      height: size,
      suspects: size - 1,
      difficulty,
      objects: [...objects],
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
          <LanguageToggle />
        </header>

        <div className="mk-genform">
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
              onChange={(e) => setTheme(e.target.value)}
            >
              <option value="random">{t('theme.random')}</option>
              {THEME_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(`theme.${id}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="mk-field">
            <span className="mk-field__label">{t('generate.objects')}</span>
            <div className="mk-chips">
              {GENERATOR_OBJECT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className="mk-chip"
                  data-active={objects.has(type)}
                  disabled={busy}
                  onClick={() => toggleObject(type)}
                >
                  {OBJECT_GLYPHS[type]} {t(`objName.${type}`)}
                </button>
              ))}
            </div>
          </div>

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
