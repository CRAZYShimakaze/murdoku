import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageToggle from '../components/LanguageToggle.tsx'
import BoardPreview from '../components/BoardPreview.tsx'
import {
  DEFAULT_FILTER,
  DIFFICULTIES,
  LEVEL_SIZES,
  allLevels,
  filterLevels,
  levelMetaFromJson,
  type LevelFilter,
  type LevelMeta,
} from '../game/levels.ts'
import { loadCustomLevels, loadFilter, loadSolved, saveFilter } from '../game/storage.ts'

interface Props {
  onPick: (level: LevelMeta) => void
  onBack: () => void
}

export default function LevelSelect({ onPick, onBack }: Props) {
  const { t } = useTranslation()
  // Filter is persisted so it survives leaving for a level and coming back.
  const [filter, setFilter] = useState<LevelFilter>(() => loadFilter(DEFAULT_FILTER))
  const [solved] = useState(() => loadSolved())
  const [custom] = useState(() => loadCustomLevels().map((j) => levelMetaFromJson(j, true)))

  useEffect(() => saveFilter(filter), [filter])

  const levels = useMemo(
    () => filterLevels(allLevels(custom), filter, solved),
    [filter, custom, solved],
  )

  const update = (key: keyof LevelFilter, value: string) =>
    setFilter((f) => ({ ...f, [key]: value }) as LevelFilter)

  // One source of truth for the three filters; rendered as inline chips on
  // desktop and as compact dropdowns on mobile (CSS toggles which is visible).
  const filters: {
    key: keyof LevelFilter
    label: string
    value: string
    options: { value: string; label: string }[]
  }[] = [
    {
      key: 'difficulty',
      label: t('select.filterDifficulty'),
      value: filter.difficulty,
      options: [
        { value: 'all', label: t('select.all') },
        ...DIFFICULTIES.map((d) => ({ value: d, label: t(`difficulty.${d}`) })),
      ],
    },
    {
      key: 'size',
      label: t('select.filterSize'),
      value: filter.size,
      options: [
        { value: 'all', label: t('select.all') },
        ...LEVEL_SIZES.map((s) => ({ value: s, label: s })),
      ],
    },
    {
      key: 'status',
      label: t('select.filterStatus'),
      value: filter.status,
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
                    onClick={() => update(f.key, o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <select
                className="mk-select-input mk-filterselect"
                aria-label={f.label}
                value={f.value}
                onChange={(e) => update(f.key, e.target.value)}
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
