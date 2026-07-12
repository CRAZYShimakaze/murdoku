import { useTranslation } from 'react-i18next'
import FilterDropdown from './FilterDropdown.tsx'
import { SUPPORTED_LANGS, LANGUAGE_NAMES } from '../i18n/index.ts'

/**
 * Language picker for the start screen and the settings dialog. Reuses the noir
 * {@link FilterDropdown} (listbox) on desktop and a native `<select>` on touch —
 * the same pattern the level filters use. Scales to any number of locales: the
 * options come straight from {@link SUPPORTED_LANGS}, each labelled with its own
 * autonym ({@link LANGUAGE_NAMES}) so the list reads the same in every UI language.
 *
 * `dropUp` opens the panel upward — needed on the start screen, where the picker
 * sits just above the fixed credit line and a downward panel would collide with it.
 */
export default function LanguageSelect({ dropUp = false }: { dropUp?: boolean }) {
  const { t, i18n } = useTranslation()
  // Normalise to the base subtag ('de' from 'de-AT') so it matches an option.
  const active = (i18n.resolvedLanguage ?? i18n.language).split('-')[0]
  const label = t('settings.language')
  const options = SUPPORTED_LANGS.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))
  const change = (value: string) => void i18n.changeLanguage(value)

  return (
    <div className="mk-langselect">
      <FilterDropdown label={label} value={active} options={options} onChange={change} dropUp={dropUp} />
      <select
        className="mk-langselect__native"
        aria-label={label}
        value={active}
        onChange={(e) => change(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
