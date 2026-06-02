import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageToggle from '../components/LanguageToggle.tsx'
import BoardPreview from '../components/BoardPreview.tsx'
import {
  DIFFICULTIES,
  LEVELS,
  LEVEL_SIZES,
  compareLevels,
  levelMetaFromJson,
  type Difficulty,
  type LevelMeta,
} from '../game/levels.ts'
import { loadCustomLevels, loadSolved } from '../game/storage.ts'

interface Props {
  onPick: (level: LevelMeta) => void
  onBack: () => void
}

export default function LevelSelect({ onPick, onBack }: Props) {
  const { t } = useTranslation()
  const [diff, setDiff] = useState<Difficulty | 'all'>('all')
  const [size, setSize] = useState<string | 'all'>('all')
  const [status, setStatus] = useState<'all' | 'solved' | 'unsolved'>('all')
  const [solved] = useState(() => loadSolved())
  const [custom] = useState(() => loadCustomLevels().map((j) => levelMetaFromJson(j, true)))

  const levels = useMemo(() => {
    const seen = new Set<string>()
    return [...custom, ...LEVELS]
      .filter((l) => !seen.has(l.id) && seen.add(l.id) !== undefined) // de-dupe by id
      .filter(
        (l) =>
          (diff === 'all' || l.difficulty === diff) &&
          (size === 'all' || `${l.width}×${l.height}` === size) &&
          (status === 'all' || solved.has(l.id) === (status === 'solved')),
      )
      .sort(compareLevels) // difficulty → size; custom levels sort in like any other
  }, [diff, size, status, solved, custom])

  // One source of truth for the three filters; rendered as inline chips on
  // desktop and as compact dropdowns on mobile (CSS toggles which is visible).
  const filters: {
    key: string
    label: string
    value: string
    set: (v: string) => void
    options: { value: string; label: string }[]
  }[] = [
    {
      key: 'difficulty',
      label: t('select.filterDifficulty'),
      value: diff,
      set: setDiff as (v: string) => void,
      options: [
        { value: 'all', label: t('select.all') },
        ...DIFFICULTIES.map((d) => ({ value: d, label: t(`difficulty.${d}`) })),
      ],
    },
    {
      key: 'size',
      label: t('select.filterSize'),
      value: size,
      set: setSize,
      options: [
        { value: 'all', label: t('select.all') },
        ...LEVEL_SIZES.map((s) => ({ value: s, label: s })),
      ],
    },
    {
      key: 'status',
      label: t('select.filterStatus'),
      value: status,
      set: setStatus as (v: string) => void,
      options: [
        { value: 'all', label: t('select.all') },
        { value: 'solved', label: t('select.solved') },
        { value: 'unsolved', label: t('select.unsolved') },
      ],
    },
  ]

  return (
    <div className="mk-screen">
      <div className="mk-select">
        <header className="mk-topbar">
          <button type="button" className="mk-back" onClick={onBack} aria-label="back">
            ←
          </button>
          <h1>
            {t('select.title')}
            <small>{t('select.subtitle')}</small>
          </h1>
          <LanguageToggle />
        </header>

        <div className="mk-filters">
          {filters.map((f) => (
            <div className="mk-filtergroup" key={f.key}>
              <span className="mk-filtergroup__label">{f.label}</span>
              <div className="mk-chips">
                {f.options.map((o) => (
                  <button
                    key={o.value}
                    className="mk-chip"
                    data-active={f.value === o.value}
                    onClick={() => f.set(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <select
                className="mk-select-input mk-filterselect"
                aria-label={f.label}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="mk-level-grid">
          {levels.length === 0 && <p className="mk-empty">{t('select.empty')}</p>}
          {levels.map((l, i) => (
            <button
              key={l.id}
              type="button"
              className="mk-card"
              data-solved={solved.has(l.id)}
              style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}
              onClick={() => onPick(l)}
            >
              {l.custom && <span className="mk-custom">{t('select.custom')}</span>}
              {solved.has(l.id) && <span className="mk-solved">✓ {t('select.solved')}</span>}
              <BoardPreview json={l.json} />
              <div className="mk-card__body">
                <span className="mk-card__title">{l.title}</span>
                <div className="mk-card__meta">
                  <span className="mk-pill" data-d={l.difficulty}>
                    {t(`difficulty.${l.difficulty}`)}
                  </span>
                  <span className="mk-card__size">
                    {l.width}×{l.height}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
