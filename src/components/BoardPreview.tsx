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

/** Previews draw through a small frame-budgeted queue instead of synchronously in the
 *  IntersectionObserver callback — drawing boards MID-SCROLL was the jank. Each step
 *  draws at least two previews and keeps going while it stays under a ~6ms budget
 *  (cache hits are near-free, fresh boards take a slot or two); the rest follows on
 *  the next step. Returns a cancel for unmounts. */
const drawQueue: (() => void)[] = []
let pumping = false
function pumpStep(): void {
  const t0 = performance.now()
  let n = 0
  while (drawQueue.length && (n < 2 || performance.now() - t0 < 6)) {
    drawQueue.shift()!()
    n++
  }
  if (drawQueue.length) armPump()
  else pumping = false
}
/** Re-arm the pump: rAF paces the steps with real frames while the tab is visible;
 *  the timer keeps the queue draining when rAF stalls (hidden/background tab). */
function armPump(): void {
  let done = false
  const go = (): void => {
    if (done) return
    done = true
    pumpStep()
  }
  const raf = requestAnimationFrame(go)
  window.setTimeout(() => {
    cancelAnimationFrame(raf)
    go()
  }, 50)
}
function scheduleDraw(job: () => void): () => void {
  drawQueue.push(job)
  if (!pumping) {
    pumping = true
    armPump()
  }
  return () => {
    const i = drawQueue.indexOf(job)
    if (i >= 0) drawQueue.splice(i, 1)
  }
}

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
    // Observe the CARD, not the canvas: the card sits under `content-visibility: auto`,
    // which skips layout of off-screen card CONTENT — a skipped canvas has no reliable
    // rect for the observer. The card's own box is always laid out (contain-intrinsic-
    // size), so its rect is trustworthy.
    const target = cv.closest('.mk-card') ?? cv
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      // Generous head start: with the budgeted queue the board is usually finished
      // BEFORE its card scrolls into view, so the user never sees it pop in. The root
      // must be the actual scroll container (.mk-screen): rootMargin only expands the
      // ROOT's rect — against the default viewport root, the inner scroller's clipping
      // still applied and the margin never did anything.
      { root: cv.closest('.mk-screen'), rootMargin: '600px' },
    )
    io.observe(target)
    return () => io.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    // Queued, not drawn inline: the IO callback fires mid-scroll, and boards must
    // never steal scroll frames. Cancelled if the card unmounts before its turn.
    return scheduleDraw(() => {
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
    })
  }, [visible, json])

  return <canvas className="mk-card__preview" ref={canvasRef} />
}
