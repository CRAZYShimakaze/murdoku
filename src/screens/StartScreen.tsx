import { useTranslation } from 'react-i18next'
import LanguageToggle from '../components/LanguageToggle.tsx'

export default function StartScreen({
  onPlay,
  onGenerate,
  onTutorial,
  onEditor,
}: {
  onPlay: () => void
  onGenerate: () => void
  onTutorial: () => void
  onEditor: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="mk-screen">
      <svg className="mk-start__thread" preserveAspectRatio="none" viewBox="0 0 100 100">
        <line x1="8" y1="14" x2="92" y2="78" stroke="#cf463c" strokeWidth="0.18" opacity="0.5" />
        <line x1="90" y1="10" x2="14" y2="86" stroke="#cf463c" strokeWidth="0.18" opacity="0.5" />
        <circle cx="8" cy="14" r="0.7" fill="#e2b75e" />
        <circle cx="92" cy="78" r="0.7" fill="#e2b75e" />
        <circle cx="90" cy="10" r="0.7" fill="#e2b75e" />
        <circle cx="14" cy="86" r="0.7" fill="#e2b75e" />
      </svg>

      <main className="mk-start">
        <div className="mk-start__inner">
          <p className="mk-start__kicker">{t('start.kicker')}</p>
          <h1 className="mk-wordmark">
            MURD<em>O</em>KU
          </h1>
          <div className="mk-credits">
            <p className="mk-credits__line">
              {t('start.original_idea')}{' '}
              <a
                className="mk-credits__name"
                href="https://murdoku.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Manuel Garand
              </a>
            </p>
            <p className="mk-credits__line">
              {t('start.fan_version')}{' '}
              <a
                className="mk-credits__name"
                href="https://apo-games.de/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Dirk Aporius
              </a>
            </p>
          </div>
          <p className="mk-start__tag">{t('app.subtitle')}</p>
          <div className="mk-start__cta">
            <button type="button" className="mk-btn mk-btn--primary" onClick={onPlay}>
              {t('start.play')}
            </button>
          </div>
          <div className="mk-start__more">
            <button type="button" className="mk-tile" onClick={onTutorial}>
              <span className="mk-tile__icon">🎓</span>
              {t('start.tutorial')}
            </button>
            <button type="button" className="mk-tile" onClick={onEditor}>
              <span className="mk-tile__icon">🛠️</span>
              {t('start.editor')}
            </button>
            <button type="button" className="mk-tile" onClick={onGenerate}>
              <span className="mk-tile__icon">🎲</span>
              {t('start.generate')}
            </button>
          </div>
          <div className="mk-start__lang">
            <LanguageToggle />
          </div>
        </div>
      </main>
      <p className="mk-start__credit">{t('start.credit')}</p>
    </div>
  )
}
