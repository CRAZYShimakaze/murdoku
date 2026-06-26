import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  xTool: boolean
  onToggleX: () => void
  onUndo: () => void
  canUndo: boolean
  onReset: () => void
  onHint: () => void
  onSubmit: () => void
  allPlaced: boolean
  /** Level already finished and being reviewed: the editing tools (X, reset, undo, hint)
   *  are disabled — there's nothing left to solve. */
  locked?: boolean
  legend?: React.ReactNode
}

const HOLD_MS = 700

/** A button that fires only after being held down for HOLD_MS (with a ring). */
function HoldButton({
  onComplete,
  className,
  disabled,
  children,
}: {
  onComplete: () => void
  className: string
  disabled?: boolean
  children: React.ReactNode
}) {
  const [progress, setProgress] = useState(0)
  const raf = useRef<number | null>(null)
  const start = useRef(0)

  const stop = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    raf.current = null
    start.current = 0
    setProgress(0)
  }
  // `now` is the high-res timestamp requestAnimationFrame passes in — no impure call.
  const tick = (now: number) => {
    if (start.current === 0) start.current = now
    const p = Math.min(1, (now - start.current) / HOLD_MS)
    setProgress(p)
    if (p >= 1) {
      stop()
      onComplete()
    } else {
      raf.current = requestAnimationFrame(tick)
    }
  }
  const begin = () => {
    if (disabled) return
    start.current = 0
    raf.current = requestAnimationFrame(tick)
  }

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {progress > 0 && (
        <span className="mk-tool__ring" style={{ ['--p' as string]: String(progress) }} />
      )}
      {children}
    </button>
  )
}

export default function Toolbar({
  xTool,
  onToggleX,
  onUndo,
  canUndo,
  onReset,
  onHint,
  onSubmit,
  allPlaced,
  locked = false,
  legend,
}: Props) {
  const { t } = useTranslation()

  return (
    <aside className="mk-tools">
      <span className="mk-tools__label">{t('game.tools')}</span>

      <button
        type="button"
        className="mk-tool mk-tool--x"
        data-active={xTool}
        onClick={onToggleX}
        disabled={locked}
      >
        <span className="mk-tool__icon">✕</span>
        <span>{t('tool.x')}</span>
        <span className="mk-tool__sub">{t('tool.xSub')}</span>
      </button>

      <HoldButton className="mk-tool" onComplete={onReset} disabled={locked}>
        <span className="mk-tool__icon">↺</span>
        <span>{t('tool.reset')}</span>
        <span className="mk-tool__sub">{t('tool.eraseSub')}</span>
      </HoldButton>

      <button type="button" className="mk-tool" onClick={onUndo} disabled={locked || !canUndo}>
        <span className="mk-tool__icon">↶</span>
        <span>{t('tool.undo')}</span>
      </button>

      <button type="button" className="mk-tool mk-tool--hint" onClick={onHint} disabled={locked}>
        <span className="mk-tool__icon">💡</span>
        <span>{t('tool.hint')}</span>
      </button>

      {legend}

      <button
        type="button"
        className="mk-tool mk-tool--submit"
        onClick={onSubmit}
        disabled={!allPlaced}
      >
        <span>{t('tool.submit')}</span>
        {!allPlaced && <span className="mk-tool__sub">{t('tool.submitLocked')}</span>}
      </button>
    </aside>
  )
}
