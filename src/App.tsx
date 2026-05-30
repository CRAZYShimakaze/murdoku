import { useTranslation } from 'react-i18next'
import { ENGINE_VERSION } from './engine'

export default function App() {
  const { t, i18n } = useTranslation()

  return (
    <main style={{ padding: '1rem', maxWidth: '40rem', margin: '0 auto' }}>
      <h1>{t('app.title')}</h1>
      <p>{t('app.subtitle')}</p>
      <p>
        <button onClick={() => void i18n.changeLanguage('de')}>
          {t('language.de')}
        </button>{' '}
        <button onClick={() => void i18n.changeLanguage('en')}>
          {t('language.en')}
        </button>
      </p>
      <small>engine v{ENGINE_VERSION}</small>
    </main>
  )
}
