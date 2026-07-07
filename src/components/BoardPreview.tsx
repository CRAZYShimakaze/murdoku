import { useEffect, useRef, useState } from 'react'
import { loadLevel, type LevelJson } from '../engine/index.ts'
import { drawBoard } from '../game/boardRender.ts'

const BASE = 260

/** Rendered thumbnails kept across re-mounts (filter changes, leaving and returning to
 *  the picker) so they don't redraw. An LRU bounded by a ~32 MB budget — at high DPR each
 *  tile is bigger, so fewer are kept; on a normal display many fit. */
const cache = new Map<string, HTMLCanvasElement>()
const cacheCap = (dpr: number): number =>
  Math.max(12, Math.floor(24_000_000 / (BASE * BASE * dpr * dpr * 4)))

/**
 * A small, non-interactive floor-plan thumbnail of a level. To keep the picker snappy
 * with many levels it (1) renders LAZILY — the card shows instantly and the board is only
 * drawn once it scrolls near the viewport — (2) draws each level at most once and reuses
 * the cached bitmap on later mounts, and (3) loads the board WITHOUT the puzzle's clues.
 */
export default function BoardPreview({ json }: { json: LevelJson }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)

  // Draw only once the card is (nearly) on screen — off-screen cards stay blank tiles.
  useEffect(() => {
    if (visible) return
    const cv = canvasRef.current
    if (!cv) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '300px' }, // start a little before it enters view, so it's ready
    )
    io.observe(cv)
    return () => io.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const px = Math.round(BASE * dpr)
    cv.width = px // also resets the context (identity transform, cleared)
    cv.height = px

    const key = `${json.id}@${dpr}`
    const hit = cache.get(key)
    if (hit) {
      cache.delete(key) // LRU: re-insert to mark most-recently-used
      cache.set(key, hit)
      ctx.drawImage(hit, 0, 0)
      return
    }

    // Fresh render — board only (the thumbnail never needs the clues).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, BASE, BASE)
    const puzzle = loadLevel(json, { skipClues: true })
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
      reveal: null,
      preview: true,
    })

    // Cache an offscreen copy for cheap re-mounts; evict oldest beyond the budget.
    const off = document.createElement('canvas')
    off.width = px
    off.height = px
    off.getContext('2d')?.drawImage(cv, 0, 0)
    cache.set(key, off)
    for (const oldest of cache.keys()) {
      if (cache.size <= cacheCap(dpr)) break
      cache.delete(oldest)
    }
  }, [visible, json])

  return <canvas className="mk-card__preview" ref={canvasRef} />
}
