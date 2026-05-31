import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { loadLevel, type Cell } from '../engine/index.ts'
import { drawBoard } from '../game/boardRender.ts'
import { onArtReady } from '../game/objectArt.ts'
import { buildEditorLevel, type EditorState } from '../game/editorModel.ts'

interface Props {
  state: EditorState
  onPaint: (cell: Cell) => void
  /** In window mode, a click toggles a window; fx,fy are the fractional position in the cell. */
  windowMode?: boolean
  onPaintWindow?: (cell: Cell, fx: number, fy: number) => void
}

interface Layout {
  cell: number
  w: number
  h: number
}

function roomName(key: string): string {
  const m = /^room\.editor(\d+)$/.exec(key)
  return m ? `Raum ${m[1]}` : key
}

/** The editable board: live preview of the editor state + click/drag to paint. */
export default function EditorBoard({ state, onPaint, windowMode, onPaintWindow }: Props) {
  const W = state.size
  const H = state.size
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [artTick, setArtTick] = useState(0)
  const painting = useRef(false)
  const lastCell = useRef<Cell | null>(null)

  const puzzle = useMemo(() => {
    try {
      return loadLevel(buildEditorLevel(state))
    } catch {
      return null
    }
  }, [state])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const measure = () => {
      const aw = wrap.clientWidth
      const ah = wrap.clientHeight
      if (aw <= 0 || ah <= 0) return
      const cell = Math.max(14, Math.floor(Math.min(aw / W, ah / H)))
      setLayout({ cell, w: cell * W, h: cell * H })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [W, H])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !layout || !puzzle) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    cv.width = Math.round(layout.w * dpr)
    cv.height = Math.round(layout.h * dpr)
    cv.style.width = `${layout.w}px`
    cv.style.height = `${layout.h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, layout.w, layout.h)
    drawBoard(ctx, {
      puzzle,
      cell: layout.cell,
      origin: { x: 0, y: 0 },
      roomName,
      suspectIndex: new Map(),
      placements: new Map(),
      marks: new Map(),
      crosses: new Set(),
      highlight: null,
      press: null,
      reveal: null,
    })
  }, [layout, puzzle, artTick])

  // Redraw when bundled board art (e.g. the armchair) finishes loading.
  useEffect(() => onArtReady(() => setArtTick((t) => t + 1)), [])

  const cellAt = (e: ReactPointerEvent<HTMLCanvasElement>): Cell | null => {
    if (!layout) return null
    const rect = e.currentTarget.getBoundingClientRect()
    const col = Math.floor((e.clientX - rect.left) / layout.cell)
    const row = Math.floor((e.clientY - rect.top) / layout.cell)
    if (col < 0 || col >= W || row < 0 || row >= H) return null
    return row * W + col
  }

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const cell = cellAt(e)
    if (cell === null || !layout) return
    e.currentTarget.setPointerCapture(e.pointerId)
    if (windowMode) {
      const rect = e.currentTarget.getBoundingClientRect()
      const fx = (e.clientX - rect.left) / layout.cell - (cell % W)
      const fy = (e.clientY - rect.top) / layout.cell - Math.floor(cell / W)
      onPaintWindow?.(cell, fx, fy)
      return
    }
    painting.current = true
    lastCell.current = cell
    onPaint(cell)
  }
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!painting.current) return
    const cell = cellAt(e)
    if (cell === null || cell === lastCell.current) return
    lastCell.current = cell
    onPaint(cell)
  }
  const up = () => {
    painting.current = false
    lastCell.current = null
  }

  return (
    <div
      ref={wrapRef}
      style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', minWidth: 0, minHeight: 0 }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
    </div>
  )
}
