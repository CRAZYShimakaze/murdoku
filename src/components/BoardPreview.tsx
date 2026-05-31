import { useEffect, useMemo, useRef } from 'react'
import { loadLevel, type LevelJson } from '../engine/index.ts'
import { drawBoard } from '../game/boardRender.ts'

const BASE = 260

/** A small, non-interactive floor-plan thumbnail of a level. */
export default function BoardPreview({ json }: { json: LevelJson }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const puzzle = useMemo(() => loadLevel(json), [json])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    cv.width = BASE * dpr
    cv.height = BASE * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, BASE, BASE)

    const W = puzzle.board.width
    const H = puzzle.board.height
    const cell = Math.floor(BASE / Math.max(W, H))
    drawBoard(ctx, {
      puzzle,
      cell,
      origin: { x: (BASE - cell * W) / 2, y: (BASE - cell * H) / 2 },
      roomName: () => '',
      suspectIndex: new Map(),
      placements: new Map(),
      marks: new Map(),
      crosses: new Set(),
      highlight: null,
      press: null,
      reveal: null,
      preview: true,
    })
  }, [puzzle])

  return <canvas className="mk-card__preview" ref={canvasRef} />
}
