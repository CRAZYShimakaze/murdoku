import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SettingsButton from '../components/SettingsButton.tsx'
import BoardPreview from '../components/BoardPreview.tsx'
import {
  DEFAULT_FILTER,
  DIFFICULTIES,
  allLevels,
  authorVisibleLevels,
  availableFilterOptions,
  availableSizes,
  effectiveFilter,
  filterLevels,
  levelMetaFromJson,
  type LevelFilter,
  type LevelMeta,
} from '../game/levels.ts'
import {
  loadCustomLevels,
  loadFilter,
  loadShowHiddenAuthor,
  loadSolved,
  saveFilter,
  saveShowHiddenAuthor,
} from '../game/storage.ts'

interface Props {
  onPick: (level: LevelMeta) => void
  onBack: () => void
}

// Secret unlock: five taps on the title within a two-second window toggles whether
// the hidden author's levels are shown. Tracked by their timestamps so a slow,
// deliberate tap never trips it — only a quick burst does.
const TAP_COUNT = 5
const TAP_WINDOW_MS = 2000
const TOAST_MS = 1800

export default function LevelSelect({ onPick, onBack }: Props) {
  const { t } = useTranslation()
  // Filter is persisted so it survives leaving for a level and coming back.
  const [filter, setFilter] = useState<LevelFilter>(() => loadFilter(DEFAULT_FILTER))
  const [solved] = useState(() => loadSolved())
  const [custom] = useState(() => loadCustomLevels().map((j) => levelMetaFromJson(j, true)))
  // Whether the hidden author's levels are revealed (persisted, off by default).
  const [showHidden, setShowHidden] = useState(() => loadShowHiddenAuthor())
  const [toast, setToast] = useState<{ text: string; on: boolean; n: number } | null>(null)
  const tapTimes = useRef<number[]>([])
  const toastN = useRef(0)

  useEffect(() => saveFilter(filter), [filter])
  useEffect(() => saveShowHiddenAuthor(showHidden), [showHidden])

  // Self-dismiss the toast; re-arming on a new toggle restarts the timer.
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(id)
  }, [toast])

  // The picker's universe once the hidden author is filtered in/out. Both the grid
  // and the filter options derive from this, so hiding the author also drops any
  // filter option (e.g. "Original") that would now match nothing.
  const universe = useMemo(
    () => authorVisibleLevels(allLevels(custom), showHidden),
    [custom, showHidden],
  )

  // Which option values still have at least one level — used to prune empty chips.
  const available = useMemo(() => availableFilterOptions(universe, solved), [universe, solved])

  // The filter actually applied: stale stored selections fall back to "all".
  const effective = useMemo(() => effectiveFilter(filter, available), [filter, available])

  const levels = useMemo(
    () => filterLevels(universe, effective, solved),
    [universe, effective, solved],
  )

  const update = (key: keyof LevelFilter, value: string) =>
    setFilter((f) => ({ ...f, [key]: value }) as LevelFilter)

  // A burst of TAP_COUNT taps inside TAP_WINDOW_MS flips the hidden author on/off.
  const onSecretTap = () => {
    const now = Date.now()
    const recent = [...tapTimes.current.filter((tm) => now - tm < TAP_WINDOW_MS), now]
    if (recent.length < TAP_COUNT) {
      tapTimes.current = recent
      return
    }
    tapTimes.current = []
    const on = !showHidden
    setShowHidden(on)
    toastN.current += 1
    setToast({ text: on ? t('select.garandOn') : t('select.garandOff'), on, n: toastN.current })
  }

  // One source of truth for the three filters; rendered as inline chips on
  // desktop and as compact dropdowns on mobile (CSS toggles which is visible).
  // Empty non-"all" options are pruned, and a group with no real choice is dropped.
  const filterDefs: {
    key: keyof LevelFilter
    label: string
    value: string
    options: { value: string; label: string }[]
  }[] = [
    {
      key: 'difficulty',
      label: t('select.filterDifficulty'),
      value: effective.difficulty,
      options: [
        { value: 'all', label: t('select.all') },
        ...DIFFICULTIES.filter((d) => available.difficulty.has(d)).map((d) => ({
          value: d,
          label: t(`difficulty.${d}`),
        })),
      ],
    },
    {
      key: 'size',
      label: t('select.filterSize'),
      value: effective.size,
      options: [
        { value: 'all', label: t('select.all') },
        ...availableSizes(universe).map((s) => ({ value: s, label: s })),
      ],
    },
    {
      key: 'status',
      label: t('select.filterStatus'),
      value: effective.status,
      options: [
        { value: 'all', label: t('select.all') },
        ...(available.status.has('solved') ? [{ value: 'solved', label: t('select.solved') }] : []),
        ...(available.status.has('unsolved')
          ? [{ value: 'unsolved', label: t('select.unsolved') }]
          : []),
      ],
    },
  ]
  // Drop a whole group that collapsed to just "All" (no real choice left).
  const filters = filterDefs.filter((f) => f.options.length > 1)

  return (
    <div className="mk-screen">
      <div className="mk-select">
        <header className="mk-topbar">
          <button type="button" className="mk-back" onClick={onBack} aria-label="back">
            ←
          </button>
          <h1>
            <span className="mk-secret" onClick={onSecretTap}>
              {t('select.title')}
            </span>
            <small>{t('select.subtitle')}</small>
          </h1>
          <SettingsButton />
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
                {l.author && (
                  <span className="mk-card__author">{t('game.author', { name: l.author })}</span>
                )}
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

      {toast && (
        <div className="mk-toast" role="status" aria-live="polite" data-on={toast.on} key={toast.n}>
          <span className="mk-toast__tag">{t('select.garandTag')}</span>
          <span className="mk-toast__msg">{toast.text}</span>
        </div>
      )}
    </div>
  )
}
