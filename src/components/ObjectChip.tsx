import { useLayoutEffect, useRef, useState } from 'react'
import ObjectIcon from './ObjectIcon.tsx'

/** One shared offscreen canvas measures every chip's label width. */
const measureCtx =
  typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null

/** Icon tile size inside a chip (px). */
const ICON = 22

interface Props {
  type: string
  name: string
  occupiable: boolean
  active: boolean
  disabled?: boolean
  onClick: () => void
}

/**
 * An object toggle chip showing the REAL board icon (the same renderer the legend and
 * editor palette use, via ObjectIcon) beside the name — so the generator matches the game.
 *
 * The content escalates only as far as it must, always staying on ONE line:
 *   1. icon + text (default),
 *   2. text only — if the name won't fit beside the icon,
 *   3. text truncated with "…" — only if it won't even fit on its own.
 * We never leave an icon alone on the first line with the text pushed underneath. The fit is
 * measured with a canvas so toggling the icon can't feed back into the measurement (it reads
 * the label's natural width, independent of the rendered layout).
 */
export default function ObjectChip({ type, name, occupiable, active, disabled, onClick }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const [mode, setMode] = useState<'icon' | 'text' | 'ellipsis'>('icon')

  useLayoutEffect(() => {
    const measure = () => {
      const btn = btnRef.current
      const label = labelRef.current
      if (!btn || !label || !measureCtx) return
      const cs = getComputedStyle(btn)
      const avail = btn.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const gap = parseFloat(cs.columnGap) || 0
      const ls = getComputedStyle(label)
      measureCtx.font = `${ls.fontWeight} ${ls.fontSize} ${ls.fontFamily}`
      const labelW = measureCtx.measureText(name).width
      if (ICON + gap + labelW <= avail) setMode('icon')
      else if (labelW <= avail) setMode('text')
      else setMode('ellipsis')
    }
    measure()
    // The grid column width drives the fit — re-measure whenever the chip resizes.
    const ro = new ResizeObserver(measure)
    if (btnRef.current) ro.observe(btnRef.current)
    // Web-font metrics differ from the fallback — re-measure once they're ready.
    document.fonts?.ready.then(measure).catch(() => {})
    return () => ro.disconnect()
  }, [name])

  return (
    <button
      ref={btnRef}
      type="button"
      className="mk-chip"
      data-active={active}
      data-mode={mode}
      disabled={disabled}
      onClick={onClick}
    >
      {mode === 'icon' && (
        <ObjectIcon type={type} occupiable={occupiable} size={ICON} className="mk-chip__ico" />
      )}
      <span ref={labelRef} className="mk-chip__label">
        {name}
      </span>
    </button>
  )
}
