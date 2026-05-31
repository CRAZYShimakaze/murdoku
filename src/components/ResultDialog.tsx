import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  win: boolean
  murderer: { name: string; room: string } | null
  onRetry: () => void
  onBack: () => void
  /** Generated-level extras (only shown on a win of a freshly generated level). */
  generated?: boolean
  saved?: boolean
  defaultName?: string
  onSave: (name: string) => void
  onExport: (name: string) => void
  onNew?: () => void
}

export default function ResultDialog({
  win,
  murderer,
  onRetry,
  onBack,
  generated,
  saved,
  defaultName,
  onSave,
  onExport,
  onNew,
}: Props) {
  const { t } = useTranslation()
  const showGen = win && generated
  const [name, setName] = useState(defaultName ?? '')
  const value = () => name.trim() || (defaultName ?? '')

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

        {showGen && (
          <div className="mk-nameform">
            <label htmlFor="mk-lvlname">{t('result.nameLabel')}</label>
            <input
              id="mk-lvlname"
              type="text"
              autoFocus
              value={name}
              maxLength={40}
              placeholder={t('result.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !saved) onSave(value())
              }}
            />
          </div>
        )}

        <div className="mk-dialog__actions">
          {!win && (
            <button type="button" className="mk-btn mk-btn--primary" onClick={onRetry}>
              {t('result.retry')}
            </button>
          )}
          {showGen && (
            <>
              <button
                type="button"
                className="mk-btn mk-btn--primary"
                onClick={() => onSave(value())}
                disabled={saved}
              >
                {saved ? t('result.saved') : t('result.save')}
              </button>
              <button type="button" className="mk-btn mk-btn--ghost" onClick={() => onExport(value())}>
                {t('result.export')}
              </button>
              <button type="button" className="mk-btn mk-btn--ghost" onClick={onNew}>
                {t('result.new')}
              </button>
            </>
          )}
          <button
            type="button"
            className={win && !generated ? 'mk-btn mk-btn--primary' : 'mk-btn mk-btn--ghost'}
            onClick={onBack}
          >
            {t('result.back')}
          </button>
        </div>
      </div>
    </div>
  )
}
