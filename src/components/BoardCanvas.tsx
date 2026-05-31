import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Cell, PersonId, Puzzle } from '../engine/index.ts'
import { drawBoard, type RevealInfo } from '../game/boardRender.ts'
import { avatarDataUri } from '../game/avatar.ts'
import { suspectColor } from '../game/palette.ts'
import type { PlayState } from '../game/useGameSession.ts'

/** Hold duration to commit a person (ms). Tune here. */
const LONGPRESS_MS = 1000

interface Props {
  puzzle: Puzzle
  state: PlayState
  suspectIndex: Map<PersonId, number>
  selectedSuspect: PersonId | null
  highlight: Set<Cell> | null
  xTool: boolean
  reveal: RevealInfo | null
  roomName: (nameKey: string) => string
  occupantAt: (cell: Cell) => PersonId | undefined
  onPlaceMark: (cell: Cell, suspectId: PersonId) => void
  onCommit: (cell: Cell, suspectId: PersonId) => void
  onSetCross: (cell: Cell, value: boolean) => void
  onSelectSuspect: (id: PersonId | null) => void
}

interface Layout {
  cell: number
  w: number
  h: number
}

export default function BoardCanvas(props: Props) {
  const { puzzle } = props
  const W = puzzle.board.width
  const H = puzzle.board.height

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [layout, setLayout] = useState<Layout | null>(null)

  // Latest props/layout, read by the rAF loop and async image loads.
  const propsRef = useRef(props)
  propsRef.current = props
  const layoutRef = useRef<Layout | null>(layout)
  layoutRef.current = layout

  const pressRef = useRef<{ cell: Cell; start: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const paintRef = useRef<{ value: boolean; visited: Set<Cell> } | null>(null)
  const hoverRef = useRef<Cell | null>(null)
  const avatarsRef = useRef<Map<PersonId, HTMLImageElement>>(new Map())

  function redraw(press: { cell: Cell; progress: number } | null) {
    const cv = canvasRef.current
    const L = layoutRef.current
    if (!cv || !L) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const p = propsRef.current
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, L.cell * W, L.cell * H)
    drawBoard(ctx, {
      puzzle: p.puzzle,
      cell: L.cell,
      origin: { x: 0, y: 0 },
      roomName: p.roomName,
      suspectIndex: p.suspectIndex,
      placements: p.state.placements,
      marks: p.state.marks,
      crosses: p.state.crosses,
      highlight: p.highlight,
      press,
      reveal: p.reveal,
      avatars: avatarsRef.current,
      hover: hoverRef.current,
    })
  }

  // Build head-avatar images for the suspects; redraw as each loads.
  useEffect(() => {
    const map = new Map<PersonId, HTMLImageElement>()
    puzzle.suspects.forEach((s, i) => {
      const img = new Image()
      img.onload = () => redraw(null)
      img.src = avatarDataUri(s.attributes, suspectColor(i), s.id)
      map.set(s.id, img)
    })
    avatarsRef.current = map
    redraw(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle])

  // Fit the board to the available space.
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

  // Size the backing store and redraw on any input change.
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !layout) return
    const dpr = window.devicePixelRatio || 1
    cv.width = Math.round(layout.w * dpr)
    cv.height = Math.round(layout.h * dpr)
    cv.style.width = `${layout.w}px`
    cv.style.height = `${layout.h}px`
    redraw(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, props.state, props.selectedSuspect, props.highlight, props.reveal])

  useEffect(() => () => cancelPress(), [])

  function cancelPress() {
    pressRef.current = null
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  function tick(now: number) {
    const press = pressRef.current
    if (!press) return
    const progress = Math.min(1, (now - press.start) / LONGPRESS_MS)
    if (progress >= 1) {
      const sel = propsRef.current.selectedSuspect
      cancelPress()
      if (sel) propsRef.current.onCommit(press.cell, sel)
      redraw(null)
      return
    }
    redraw({ cell: press.cell, progress })
    rafRef.current = requestAnimationFrame(tick)
  }

  function cellAt(e: ReactPointerEvent<HTMLCanvasElement>): Cell | null {
    const L = layoutRef.current
    if (!L) return null
    const rect = e.currentTarget.getBoundingClientRect()
    const col = Math.floor((e.clientX - rect.left) / L.cell)
    const row = Math.floor((e.clientY - rect.top) / L.cell)
    if (col < 0 || col >= W || row < 0 || row >= H) return null
    return row * W + col
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const cell = cellAt(e)
    if (cell === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    hoverRef.current = cell // show blocked outline on touch/press too

    if (props.xTool) {
      const value = !props.state.crosses.has(cell)
      paintRef.current = { value, visited: new Set([cell]) }
      props.onSetCross(cell, value)
      return
    }

    const occ = props.occupantAt(cell)
    if (props.selectedSuspect) {
      if (occ) {
        props.onSelectSuspect(occ)
        return
      }
      pressRef.current = { cell, start: e.timeStamp }
      rafRef.current = requestAnimationFrame(tick)
      redraw({ cell, progress: 0 })
      return
    }
    if (occ) {
      props.onSelectSuspect(occ)
    } else {
      redraw(null) // refresh blocked outline
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (paintRef.current) {
      const cell = cellAt(e)
      if (cell !== null && !paintRef.current.visited.has(cell)) {
        paintRef.current.visited.add(cell)
        props.onSetCross(cell, paintRef.current.value)
      }
      return
    }
    if (pressRef.current) {
      const cell = cellAt(e)
      if (cell !== pressRef.current.cell) {
        cancelPress()
        redraw(null)
      }
      return
    }
    // hover (desktop): outline non-occupiable cells in red
    const cell = cellAt(e)
    if (cell !== hoverRef.current) {
      hoverRef.current = cell
      redraw(null)
    }
  }

  function endPointer(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (paintRef.current) {
      paintRef.current = null
    } else {
      const press = pressRef.current
      if (press) {
        const sel = propsRef.current.selectedSuspect
        cancelPress()
        if (sel) props.onPlaceMark(press.cell, sel) // released early → pencil mark
      }
    }
    if (e.pointerType === 'touch') {
      hoverRef.current = null
    }
    redraw(null)
  }

  function onPointerLeave() {
    hoverRef.current = null
    redraw(null)
  }

  return (
    <div
      ref={wrapRef}
      style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', minWidth: 0, minHeight: 0 }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={onPointerLeave}
      />
    </div>
  )
}
