import { useEffect, useRef, useState } from 'react'
import { drawDoor, drawObjectIcon, drawWindow } from '../game/boardRender.ts'
import { onArtReady } from '../game/objectArt.ts'

/** Board-room pastel behind each chip, so an icon reads like a real board cell. */
const TILE_BG = '#e8d8b0'

interface Props {
  /** An object type, or one of the special tiles 'floor' | 'window' | 'door'. */
  type: string
  occupiable: boolean
  /** Square tile size in CSS px. */
  size?: number
  className?: string
}

/**
 * One object drawn by the very same renderer the board uses, on a little
 * board-style tile — so the legend and the editor palette always match exactly
 * what gets painted. 'floor' is an empty occupiable tile; 'window'/'door' are
 * the wall pieces (drawn centred across the tile).
 */
export default function ObjectIcon({ type, occupiable, size = 30, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [tick, setTick] = useState(0)
  // Redraw once the bundled art (armchair) loads, like the board does.
  useEffect(() => onArtReady(() => setTick((n) => n + 1)), [])

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    cv.width = Math.round(size * dpr)
    cv.height = Math.round(size * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    // a board-style cell: rounded pastel tile with the art clipped inside it
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(0.5, 0.5, size - 1, size - 1, 5)
    ctx.clip()
    ctx.fillStyle = TILE_BG
    ctx.fillRect(0, 0, size, size)
    if (type === 'window') drawWindow(ctx, 0, -size / 2, size, 'S')
    else if (type === 'door') drawDoor(ctx, 0, -size / 2, size, 'S')
    else if (type !== 'floor') drawObjectIcon(ctx, type, 0, 0, size, occupiable)
    ctx.restore()
    ctx.strokeStyle = 'rgba(20, 18, 26, 0.5)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(0.5, 0.5, size - 1, size - 1, 5)
    ctx.stroke()
  }, [type, occupiable, size, tick])

  // data-occupiable lets callers ring the tile green/red (used by the editor palette).
  return (
    <canvas
      ref={ref}
      className={className}
      data-occupiable={occupiable}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}
