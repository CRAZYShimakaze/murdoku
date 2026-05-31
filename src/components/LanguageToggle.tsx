import { useTranslation } from 'react-i18next'

const LANGS = ['de', 'en'] as const

export default function LanguageToggle() {
  const { i18n } = useTranslation()
  const active = i18n.resolvedLanguage ?? i18n.language

  return (
    <div className="mk-seg" role="group" aria-label="language">
      {LANGS.map((l) => (
        <button key={l} data-active={active === l} onClick={() => void i18n.changeLanguage(l)}>
          {l}
        </button>
      ))}
    </div>
  )
}
