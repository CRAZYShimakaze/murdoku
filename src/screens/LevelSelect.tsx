import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageToggle from '../components/LanguageToggle.tsx'
import BoardPreview from '../components/BoardPreview.tsx'
import {
  DIFFICULTIES,
  LEVELS,
  LEVEL_SIZES,
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
  const [solved] = useState(() => loadSolved())
  const [custom] = useState(() => loadCustomLevels().map((j) => levelMetaFromJson(j, true)))

  const levels = useMemo(() => {
    const seen = new Set<string>()
    return [...custom, ...LEVELS]
      .filter((l) => !seen.has(l.id) && seen.add(l.id) !== undefined) // de-dupe by id
      .filter(
        (l) =>
          (diff === 'all' || l.difficulty === diff) &&
          (size === 'all' || `${l.width}×${l.height}` === size),
      )
  }, [diff, size, custom])

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
          <div className="mk-filtergroup">
            <span className="mk-filtergroup__label">{t('select.filterDifficulty')}</span>
            <div className="mk-chips">
              <button className="mk-chip" data-active={diff === 'all'} onClick={() => setDiff('all')}>
                {t('select.all')}
              </button>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  className="mk-chip"
                  data-active={diff === d}
                  onClick={() => setDiff(d)}
                >
                  {t(`difficulty.${d}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="mk-filtergroup">
            <span className="mk-filtergroup__label">{t('select.filterSize')}</span>
            <div className="mk-chips">
              <button className="mk-chip" data-active={size === 'all'} onClick={() => setSize('all')}>
                {t('select.all')}
              </button>
              {LEVEL_SIZES.map((s) => (
                <button key={s} className="mk-chip" data-active={size === s} onClick={() => setSize(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
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
