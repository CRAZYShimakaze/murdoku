import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { updateSettings, useSettings, type HelpMode } from '../game/settings.ts'

const LANGS = ['de', 'en'] as const
const HELP_MODES: readonly HelpMode[] = ['full', 'reduced', 'none']
const MODE_KEY: Record<HelpMode, string> = {
  full: 'settings.helpFull',
  reduced: 'settings.helpReduced',
  none: 'settings.helpNone',
}

/** A compact label + switch row — no helper text, so the list stays short. */
function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      className="mk-settings__row mk-settings__toggle"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="mk-settings__label">{label}</span>
      <span className="mk-switch" data-on={checked} aria-hidden="true">
        <span className="mk-switch__knob" />
      </span>
    </button>
  )
}

/** The settings "case file": language, help mode, stopwatch, gender tints,
 *  object badges, floor patterns. */
export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const lang = i18n.resolvedLanguage ?? i18n.language

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="mk-overlay" onClick={onClose}>
      <div
        className="mk-dialog mk-settings"
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mk-dialog__stamp mk-settings__stamp">{t('settings.stamp')}</span>
        <h3>{t('settings.title')}</h3>

        <div className="mk-settings__row">
          <span className="mk-settings__label">{t('settings.language')}</span>
          <div className="mk-seg" role="group" aria-label={t('settings.language')}>
            {LANGS.map((l) => (
              <button key={l} data-active={lang === l} onClick={() => void i18n.changeLanguage(l)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="mk-settings__row mk-settings__row--stack">
          <span className="mk-settings__label">{t('settings.help')}</span>
          <div className="mk-settings__modes" role="radiogroup" aria-label={t('settings.help')}>
            {HELP_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={settings.helpMode === mode}
                className="mk-settings__mode"
                data-active={settings.helpMode === mode}
                onClick={() => updateSettings({ helpMode: mode })}
              >
                <span className="mk-settings__modename">{t(MODE_KEY[mode])}</span>
                <span className="mk-settings__modesub">{t(`${MODE_KEY[mode]}Sub`)}</span>
              </button>
            ))}
          </div>
        </div>

        <ToggleRow
          label={t('settings.timer')}
          checked={settings.timer}
          onChange={(timer) => updateSettings({ timer })}
        />
        <ToggleRow
          label={t('settings.genderColors')}
          checked={settings.genderColors}
          onChange={(genderColors) => updateSettings({ genderColors })}
        />
        <ToggleRow
          label={t('settings.objectBadges')}
          checked={settings.objectBadges}
          onChange={(objectBadges) => updateSettings({ objectBadges })}
        />
        <ToggleRow
          label={t('settings.floorTextures')}
          checked={settings.floorTextures}
          onChange={(floorTextures) => updateSettings({ floorTextures })}
        />

        <button type="button" className="mk-btn mk-settings__close" onClick={onClose}>
          {t('settings.close')}
        </button>
      </div>
    </div>
  )
}
