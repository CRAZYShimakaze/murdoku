import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Cell, PersonId, Puzzle } from '../engine/index.ts'
import { drawBoard, type RevealInfo } from '../game/boardRender.ts'
import { onArtReady } from '../game/objectArt.ts'
import { avatarDataUri } from '../game/avatar.ts'
import { suspectColor } from '../game/palette.ts'
import type { PlayState } from '../game/useGameSession.ts'

/** Hold duration to commit a person (ms). Tune here. */
const LONGPRESS_MS = 1000
/** The progress ring only appears after this hold, so a quick tap shows no ring. */
const RING_DELAY_MS = 200

interface Props {
  puzzle: Puzzle
  state: PlayState
  suspectIndex: Map<PersonId, number>
  selectedSuspect: PersonId | null
  highlight: Set<Cell> | null
  highlightColor?: { wash: string; ring: string }
  /** Suspect whose notes pulse bigger (when hovering their clue card). */
  emphasize?: PersonId | null
  xTool: boolean
  reveal: RevealInfo | null
  roomName: (nameKey: string) => string
  occupantAt: (cell: Cell) => PersonId | undefined
  onPlaceMark: (cell: Cell, suspectId: PersonId) => void
  onCommit: (cell: Cell, suspectId: PersonId) => void
  onRemove: (personId: PersonId) => void
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
  const { t } = useTranslation()
  const W = puzzle.board.width
  const H = puzzle.board.height

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [layout, setLayout] = useState<Layout | null>(null)
  // Tooltip naming the placed person (if any) + object(s) under the cursor.
  const [objTip, setObjTip] = useState<{
    person?: string
    types: string[]
    x: number
    y: number
    left: boolean
  } | null>(null)

  // Latest props/layout, read by the rAF loop and async image loads.
  const propsRef = useRef(props)
  propsRef.current = props
  const layoutRef = useRef<Layout | null>(layout)
  layoutRef.current = layout

  const pressRef = useRef<{
    cell: Cell
    start: number
    mode: 'commit' | 'remove'
    personId?: PersonId
  } | null>(null)
  const rafRef = useRef<number | null>(null)
  const paintRef = useRef<{ value: boolean; visited: Set<Cell> } | null>(null)
  const hoverRef = useRef<Cell | null>(null)
  const avatarsRef = useRef<Map<PersonId, HTMLImageElement>>(new Map())
  const emphPulseRef = useRef(0)

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
      highlightColor: p.highlightColor,
      press,
      reveal: p.reveal,
      avatars: avatarsRef.current,
      hover: hoverRef.current,
      emphasizeMarks: p.emphasize ?? null,
      emphasizePulse: emphPulseRef.current,
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

  // Redraw once bundled board art (e.g. the armchair) finishes loading.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onArtReady(() => redraw(null)), [])

  // Pulse the hovered suspect's notes while their clue card is hovered.
  useEffect(() => {
    if (!props.emphasize) {
      emphPulseRef.current = 0
      redraw(null)
      return
    }
    let raf = 0
    const tick = (now: number) => {
      emphPulseRef.current = Math.sin(now / 350) * 0.5 + 0.5
      redraw(null)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      emphPulseRef.current = 0
      redraw(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.emphasize])

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
    const elapsed = now - press.start
    if (elapsed >= LONGPRESS_MS) {
      const p = propsRef.current
      cancelPress()
      if (press.mode === 'remove' && press.personId) p.onRemove(press.personId)
      else if (press.mode === 'commit' && p.selectedSuspect) p.onCommit(press.cell, p.selectedSuspect)
      redraw(null)
      return
    }
    // Show the progress ring only after a short hold, so a quick tap shows nothing.
    if (elapsed >= RING_DELAY_MS) {
      redraw({ cell: press.cell, progress: (elapsed - RING_DELAY_MS) / (LONGPRESS_MS - RING_DELAY_MS) })
    }
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

  /** Show/hide the "what's this object" tooltip beside the hovered cell. */
  function updateObjTip(cell: Cell | null) {
    const cv = canvasRef.current
    const L = layoutRef.current
    if (cell === null || !cv || !L) return setObjTip(null)
    const objs = puzzle.board.tileAt(cell).objects() // [ground, top] — stacked
    const occ = props.occupantAt(cell)
    const person = occ ? puzzle.nameOf(occ) : undefined
    if (objs.length === 0 && !person) return setObjTip(null)
    const rect = cv.getBoundingClientRect()
    const { row, col } = puzzle.board.rc(cell)
    const left = rect.left + col * L.cell
    const top = rect.top + row * L.cell
    const flip = left + L.cell + 140 > window.innerWidth
    setObjTip({
      person,
      types: objs.map((o) => o.type),
      x: flip ? left - 8 : left + L.cell + 8,
      y: top + 4,
      left: flip,
    })
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const cell = cellAt(e)
    if (cell === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setObjTip(null) // hide while interacting
    hoverRef.current = cell // show blocked outline on touch/press too

    if (props.xTool) {
      const value = !props.state.crosses.has(cell)
      paintRef.current = { value, visited: new Set([cell]) }
      props.onSetCross(cell, value)
      return
    }

    const occ = props.occupantAt(cell)
    if (occ !== undefined) {
      // occupied cell → tap selects the occupant, hold removes them
      pressRef.current = { cell, start: e.timeStamp, mode: 'remove', personId: occ }
      rafRef.current = requestAnimationFrame(tick)
      return
    }
    if (props.selectedSuspect && props.puzzle.board.isOccupiable(cell)) {
      pressRef.current = { cell, start: e.timeStamp, mode: 'commit' }
      rafRef.current = requestAnimationFrame(tick)
      return
    }
    redraw(null) // non-occupiable / empty without selection → just hover feedback
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
    // hover (desktop): outline cells + name the object under the cursor
    const cell = cellAt(e)
    if (cell !== hoverRef.current) {
      hoverRef.current = cell
      redraw(null)
      updateObjTip(cell)
    }
  }

  function endPointer(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (paintRef.current) {
      paintRef.current = null
    } else {
      const press = pressRef.current
      if (press) {
        const p = propsRef.current
        cancelPress()
        if (press.mode === 'remove' && press.personId) {
          p.onSelectSuspect(press.personId) // short tap on a token selects it
        } else if (press.mode === 'commit' && p.selectedSuspect) {
          p.onPlaceMark(press.cell, p.selectedSuspect) // released early → pencil mark
        }
      }
    }
    if (e.pointerType === 'touch') {
      hoverRef.current = null
      setObjTip(null)
    }
    redraw(null)
  }

  function onPointerLeave() {
    hoverRef.current = null
    setObjTip(null)
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
      {objTip &&
        createPortal(
          <span
            className="mk-tip"
            data-side={objTip.left ? 'left' : 'right'}
            style={{ left: objTip.x, top: objTip.y }}
          >
            {objTip.person && (
              <span style={{ display: 'block', fontWeight: 700, color: 'var(--brass)' }}>
                {objTip.person}
              </span>
            )}
            {objTip.types.map((ty) => (
              <span key={ty} style={{ display: 'block' }}>
                {t(`objName.${ty}`)}
              </span>
            ))}
          </span>,
          document.body,
        )}
    </div>
  )
}
