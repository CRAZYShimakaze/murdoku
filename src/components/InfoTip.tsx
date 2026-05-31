import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Pos {
  x: number
  y: number
  side: 'right' | 'left' | 'below'
}

const TIP_W = 236
const GAP = 10

/**
 * Wraps inline content; on hover/tap shows a small tooltip beside the anchor box
 * (an ancestor matching `anchor`, e.g. the clue card — so the tooltip sits next
 * to the hint box, not jittering by the cursor). Rendered into <body> via a
 * portal so the scrollable clue panel never clips it.
 */
export default function InfoTip({
  content,
  children,
  className,
  anchor,
}: {
  content: ReactNode
  children: ReactNode
  className?: string
  anchor?: string
}) {
  const [pos, setPos] = useState<Pos | null>(null)

  const show = (e: { currentTarget: Element }) => {
    const el = (anchor && e.currentTarget.closest(anchor)) || e.currentTarget
    const r = el.getBoundingClientRect()
    if (r.right + TIP_W + GAP <= window.innerWidth) {
      setPos({ x: r.right + GAP, y: r.top + 6, side: 'right' })
    } else if (r.left - TIP_W - GAP >= 0) {
      setPos({ x: r.left - GAP, y: r.top + 6, side: 'left' })
    } else {
      setPos({ x: r.left, y: r.bottom + GAP, side: 'below' })
    }
  }
  const hide = () => setPos(null)

  return (
    <span className={className} onPointerEnter={show} onPointerLeave={hide} onPointerDown={show}>
      {children}
      {pos &&
        createPortal(
          <span className="mk-tip" data-side={pos.side} style={{ left: pos.x, top: pos.y }}>
            {content}
          </span>,
          document.body,
        )}
    </span>
  )
}
