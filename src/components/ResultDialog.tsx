import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Avatar from './Avatar.tsx'
import type { AvatarAttrs } from '../game/avatar.ts'

interface Props {
  win: boolean
  murderer: { name: string; room: string } | null
  /** The murderer's avatar (shown alongside the reveal on a win). */
  avatar?: { attrs: AvatarAttrs; color: string; letter: string } | null
  /** On a loss: human-readable clues the current placement fails to satisfy. */
  failures?: string[]
  /** On a win: jump straight to the next level (omitted when none is available). */
  onNext?: () => void
  onRetry: () => void
  /** On a win: replay this level from scratch. */
  onRestart?: () => void
  /** On a win: tuck the verdict away to look at the solved board (tap the board to
   *  bring it back). Omitted on a loss, which stays modal. */
  onDismiss?: () => void
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
  avatar,
  failures,
  onNext,
  onRetry,
  onRestart,
  onDismiss,
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
  // A touch device pops the on-screen keyboard when the field auto-focuses, which is
  // annoying right after a generated win (mobile browser AND the Android app). Only
  // auto-focus where a physical keyboard exists (fine pointer = desktop mouse/trackpad).
  const autoFocusName =
    typeof window !== 'undefined' && !window.matchMedia('(pointer: coarse)').matches

  return (
    <div
      className="mk-overlay"
      data-dismissible={onDismiss ? 'true' : undefined}
      // Tapping the dimmed backdrop (never the card itself) tucks the verdict away so
      // the solved board is visible. `onClick` already ignores a scroll/drag on touch.
      onClick={onDismiss ? (e) => e.target === e.currentTarget && onDismiss() : undefined}
    >
      <div className="mk-dialog" role="dialog" aria-modal="true">
        <span className="mk-dialog__stamp" data-win={win}>
          {win ? t('result.winStamp') : t('result.loseStamp')}
        </span>
        <h3>{win ? t('result.winTitle') : t('result.loseTitle')}</h3>
        <p>{win ? t('result.winBody') : t('result.loseBody')}</p>
        {win && murderer && (
          <div className="mk-dialog__murderer">
            {avatar && (
              <Avatar
                className="mk-dialog__avatar"
                attrs={avatar.attrs}
                color={avatar.color}
                letter={avatar.letter}
              />
            )}
            <p>{t('result.winMurderer', { name: murderer.name, room: murderer.room })}</p>
          </div>
        )}
        {!win && failures && failures.length > 0 && (
          <div className="mk-dialog__clues">
            <p className="mk-dialog__clues-title">{t('result.loseClues')}</p>
            <ul>
              {failures.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        {showGen && (
          <div className="mk-nameform">
            <label htmlFor="mk-lvlname">{t('result.nameLabel')}</label>
            <input
              id="mk-lvlname"
              type="text"
              autoFocus={autoFocusName}
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
          {win && onNext && (
            <button type="button" className="mk-btn mk-btn--primary" onClick={onNext}>
              {t('result.nextLevel')}
            </button>
          )}
          {win && onRestart && (
            <button type="button" className="mk-btn mk-btn--ghost mk-btn--restart" onClick={onRestart}>
              <span className="mk-btn__icon" aria-hidden="true">↻</span>
              {t('result.restart')}
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
            className={
              win && !generated && !onNext ? 'mk-btn mk-btn--primary' : 'mk-btn mk-btn--ghost'
            }
            onClick={onBack}
          >
            {t('result.back')}
          </button>
        </div>

        {onDismiss && (
          <button type="button" className="mk-dialog__peek" onClick={onDismiss}>
            {t('result.peekHint')}
          </button>
        )}
      </div>
    </div>
  )
}
