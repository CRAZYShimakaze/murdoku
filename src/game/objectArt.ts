/**
 * Hand-drawn, top-down furniture for the board canvas (same spirit as the
 * bed/car vectors in bigObjects.ts). Tables and carpets AUTO-TILE: adjacent
 * same-room cells merge into one continuous surface (rows, L, 2×2, …), so a
 * block of tables reads as one big table.
 */

import armchairUrl from '../../assets/armchair.png'

type Ctx = CanvasRenderingContext2D

/** Which orthogonal neighbours belong to the same merged group. */
export interface Conn {
  n: boolean
  e: boolean
  s: boolean
  w: boolean
}

// Bitmap assets used by the board. Loaded once; canvases call onArtReady() to
// redraw when they finish (guarded so engine tests without a DOM don't break).
const armchairImg = typeof Image !== 'undefined' ? new Image() : null
let artReady = false
const artCallbacks = new Set<() => void>()
if (armchairImg) {
  armchairImg.onload = () => {
    artReady = true
    for (const cb of artCallbacks) cb()
  }
  armchairImg.src = armchairUrl
}

/** Register a callback fired when board art finishes loading (for a redraw). Returns an unsubscribe. */
export function onArtReady(cb: () => void): () => void {
  if (artReady) {
    cb()
    return () => {}
  }
  artCallbacks.add(cb)
  return () => artCallbacks.delete(cb)
}

/**
 * Path for one cell of a merged surface: flush with connected neighbours (so
 * pieces butt together seamlessly) and inset + rounded on outer edges. `ov`
 * overlaps connected edges slightly to hide anti-alias hairlines (use 0 for
 * translucent fills, which must not double up).
 */
function piecePath(
  ctx: Ctx,
  x: number,
  y: number,
  S: number,
  conn: Conn,
  inset: number,
  r: number,
  ov: number,
): void {
  const left = x + (conn.w ? -ov : inset)
  const right = x + S - (conn.e ? -ov : inset)
  const top = y + (conn.n ? -ov : inset)
  const bottom = y + S - (conn.s ? -ov : inset)
  const tl = !conn.n && !conn.w ? r : 0
  const tr = !conn.n && !conn.e ? r : 0
  const br = !conn.s && !conn.e ? r : 0
  const bl = !conn.s && !conn.w ? r : 0
  ctx.beginPath()
  ctx.roundRect(left, top, right - left, bottom - top, [tl, tr, br, bl])
}

/** One cell of a wooden table surface (auto-tiled). */
export function drawTableTile(ctx: Ctx, x: number, y: number, S: number, conn: Conn): void {
  const pad = S * 0.1
  const ow = Math.max(1.6, S * 0.06)
  const ov = Math.max(0.75, S * 0.02)
  // black outline (slightly larger), then the wood top — outline shows only on
  // the OUTER edges of the merged shape (connected sides meet seamlessly).
  ctx.fillStyle = '#1c1822'
  piecePath(ctx, x, y, S, conn, Math.max(0, pad - ow), S * 0.17, ov)
  ctx.fill()
  ctx.fillStyle = '#c8a063'
  piecePath(ctx, x, y, S, conn, pad, S * 0.12, ov)
  ctx.fill()
  // wood grain, clipped to the top
  ctx.save()
  piecePath(ctx, x, y, S, conn, pad, S * 0.13, ov)
  ctx.clip()
  ctx.strokeStyle = 'rgba(111, 77, 44, 0.22)'
  ctx.lineWidth = Math.max(1, S * 0.018)
  ctx.beginPath()
  for (const fx of [0.32, 0.62]) {
    ctx.moveTo(x + fx * S, y - 1)
    ctx.lineTo(x + fx * S, y + S + 1)
  }
  ctx.stroke()
  ctx.restore()
  // Only the bottom (front) of the surface gets detail: a darker front edge for
  // thickness and the two front legs peeking out below — exactly like the bed's
  // feet. In a slightly-tilted top-down view the two back legs are hidden under
  // the top, so we never draw all four (that looked like a box, not a table).
  if (!conn.s) {
    ctx.save()
    piecePath(ctx, x, y, S, conn, pad, S * 0.13, ov)
    ctx.clip()
    ctx.fillStyle = 'rgba(90, 61, 34, 0.3)'
    ctx.fillRect(x - 1, y + S - pad - S * 0.06, S + 2, S * 0.06)
    ctx.restore()

    ctx.fillStyle = '#5a3d22'
    ctx.strokeStyle = '#1c1822'
    ctx.lineWidth = Math.max(1, S * 0.02)
    const legW = S * 0.1
    const legH = S * 0.12
    const legY = y + S - pad - S * 0.015
    const drawLeg = (lx: number): void => {
      ctx.beginPath()
      ctx.roundRect(lx, legY, legW, legH, legW * 0.35)
      ctx.fill()
      ctx.stroke()
    }
    if (!conn.w) drawLeg(x + pad + S * 0.03)
    if (!conn.e) drawLeg(x + S - pad - S * 0.03 - legW)
  }
}

/** One cell of a soft rug (auto-tiled, translucent so the room colour shows). */
export function drawCarpetTile(ctx: Ctx, x: number, y: number, S: number, conn: Conn): void {
  const pad = S * 0.11
  ctx.fillStyle = 'rgba(176, 116, 84, 0.5)'
  piecePath(ctx, x, y, S, conn, pad, S * 0.14, 0)
  ctx.fill()
  // a lighter inner inset, also merged, for a woven-rug look
  ctx.fillStyle = 'rgba(214, 168, 132, 0.4)'
  piecePath(ctx, x, y, S, conn, pad + S * 0.06, S * 0.1, 0)
  ctx.fill()
}

/** A plush armchair (occupiable seat), drawn from the bundled armchair.png. */
export function drawArmchair(ctx: Ctx, x: number, y: number, S: number): void {
  // soft contact shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)'
  ctx.beginPath()
  ctx.ellipse(x + S / 2, y + S * 0.8, S * 0.26, S * 0.08, 0, 0, Math.PI * 2)
  ctx.fill()

  if (armchairImg && armchairImg.complete && armchairImg.naturalWidth > 0) {
    const size = S * 0.65 // smaller than the tile, centred
    const off = (S - size) / 2
    ctx.drawImage(armchairImg, x + off, y + off, size, size)
    return
  }
  // fallback before the image loads: a soft neutral cushion
  ctx.fillStyle = '#cbd2da'
  ctx.beginPath()
  ctx.roundRect(x + S * 0.16, y + S * 0.16, S * 0.68, S * 0.68, S * 0.16)
  ctx.fill()
}

const BOOK_COLORS = ['#9a4f3a', '#5f7392', '#76895a', '#b0813f', '#7d5f8e', '#9a6b52']

/** A wooden bookshelf filled with colourful book spines (blocking). */
export function drawBookshelf(ctx: Ctx, x: number, y: number, S: number): void {
  const pad = S * 0.1
  const left = x + pad
  const top = y + pad
  const w = S - 2 * pad
  const h = S - 2 * pad
  const wood = '#c39a5e'
  const dark = '#5e4326'

  ctx.fillStyle = wood
  ctx.strokeStyle = dark
  ctx.lineWidth = Math.max(1.4, S * 0.05)
  ctx.beginPath()
  ctx.roundRect(left, top, w, h, S * 0.06)
  ctx.fill()
  ctx.stroke()

  const ib = S * 0.05
  const iL = left + ib
  const iT = top + ib
  const iW = w - 2 * ib
  const iH = h - 2 * ib
  ctx.fillStyle = '#ece0c6'
  ctx.beginPath()
  ctx.roundRect(iL, iT, iW, iH, S * 0.03)
  ctx.fill()

  const rows = 3
  const rowH = iH / rows
  const board = Math.max(1, S * 0.022)
  ctx.save()
  ctx.beginPath()
  ctx.rect(iL, iT, iW, iH)
  ctx.clip()
  for (let r = 0; r < rows; r++) {
    const shelfY = iT + r * rowH + rowH - board
    ctx.fillStyle = dark
    ctx.fillRect(iL, shelfY, iW, board)
    let bx = iL + S * 0.02
    let i = 0
    while (bx < iL + iW - S * 0.03) {
      const bw = S * (0.05 + 0.018 * ((i * 7 + r * 3) % 3))
      const bh = rowH * (0.62 + 0.12 * ((i * 5 + r) % 3))
      ctx.fillStyle = BOOK_COLORS[(i + r * 2) % BOOK_COLORS.length]
      const by = shelfY - bh
      ctx.fillRect(bx, by, bw, bh)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)'
      ctx.lineWidth = 1
      ctx.strokeRect(bx, by, bw, bh)
      bx += bw + S * 0.012
      i++
    }
  }
  ctx.restore()
}

/** An occupiable mud puddle: an organic brown blob with a dark rim and ripples. */
export function drawMud(ctx: Ctx, x: number, y: number, S: number): void {
  const cx = x + S / 2
  const cy = y + S * 0.54
  const rx = S * 0.42
  const ry = S * 0.32
  // wobbly outline (deterministic, so it doesn't shimmer between redraws)
  const pts = 14
  ctx.beginPath()
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2
    const wob = 0.82 + 0.16 * Math.sin(a * 3 + 1.3) + 0.06 * Math.cos(a * 5)
    const px = cx + Math.cos(a) * rx * wob
    const py = cy + Math.sin(a) * ry * wob
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.save()
  ctx.fillStyle = '#3f2c18' // dark muddy rim
  ctx.fill()
  ctx.clip()
  ctx.fillStyle = '#6b4a28'
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx * 0.92, ry * 0.92, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#7d5832'
  ctx.beginPath()
  ctx.ellipse(cx, cy - ry * 0.08, rx * 0.6, ry * 0.55, 0, 0, Math.PI * 2)
  ctx.fill()
  // ripple ring + a couple of light glints
  ctx.strokeStyle = 'rgba(180, 140, 90, 0.5)'
  ctx.lineWidth = Math.max(1, S * 0.02)
  ctx.beginPath()
  ctx.ellipse(cx - rx * 0.12, cy - ry * 0.1, rx * 0.32, ry * 0.24, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(214, 184, 140, 0.55)'
  ctx.beginPath()
  ctx.ellipse(cx + rx * 0.3, cy + ry * 0.22, S * 0.045, S * 0.028, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
