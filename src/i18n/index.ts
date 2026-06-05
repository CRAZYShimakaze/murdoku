import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './locales/de.json'
import en from './locales/en.json'

// All UI/clue strings live in the locale JSON files — never hard-coded in TS.

const LANG_KEY = 'murdoku.lang.v1'
type Lang = 'de' | 'en'

/** Save the active language so the next visit restores it (de/en only). */
function persist(lng: string): void {
  try {
    localStorage.setItem(LANG_KEY, lng.startsWith('de') ? 'de' : 'en')
  } catch {
    /* ignore write failures (e.g. private mode) */
  }
}

/**
 * Which language to start in: the user's previously saved choice if there is one,
 * otherwise German only when the browser is set to German, English for everything
 * else.
 */
function initialLanguage(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'de' || saved === 'en') return saved
  } catch {
    /* localStorage can be unavailable — fall back to browser detection */
  }
  const browser = (navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase()
  return browser.startsWith('de') ? 'de' : 'en'
}

const startLang = initialLanguage()
persist(startLang) // remember the first-visit detection too, not just later changes
i18n.on('languageChanged', persist) // and whenever the user switches via the toggle

void i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  lng: startLang,
  fallbackLng: 'en',
  supportedLngs: ['de', 'en'],
  interpolation: { escapeValue: false },
})

export default i18n
