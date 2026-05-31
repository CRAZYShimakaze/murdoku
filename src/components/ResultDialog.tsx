import { useTranslation } from 'react-i18next'

interface Props {
  win: boolean
  murderer: { name: string; room: string } | null
  onRetry: () => void
  onBack: () => void
}

export default function ResultDialog({ win, murderer, onRetry, onBack }: Props) {
  const { t } = useTranslation()

  return (
    <div className="mk-overlay">
      <div className="mk-dialog" role="dialog" aria-modal="true">
        <span className="mk-dialog__stamp" data-win={win}>
          {win ? t('result.winStamp') : t('result.loseStamp')}
        </span>
        <h3>{win ? t('result.winTitle') : t('result.loseTitle')}</h3>
        <p>{win ? t('result.winBody') : t('result.loseBody')}</p>
        {win && murderer && (
          <p className="mk-dialog__murderer">
            {t('result.winMurderer', { name: murderer.name, room: murderer.room })}
          </p>
        )}
        <div className="mk-dialog__actions">
          {!win && (
            <button type="button" className="mk-btn mk-btn--primary" onClick={onRetry}>
              {t('result.retry')}
            </button>
          )}
          <button
            type="button"
            className={win ? 'mk-btn mk-btn--primary' : 'mk-btn mk-btn--ghost'}
            onClick={onBack}
          >
            {t('result.back')}
          </button>
        </div>
      </div>
    </div>
  )
}
