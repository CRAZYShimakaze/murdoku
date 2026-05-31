import { VICTIM_ID, type Cell, type PersonId, type Puzzle, type Side } from '../engine/index.ts'
import { BOARD, suspectColor } from './palette.ts'
import { OBJECT_GLYPHS } from './glyphs.ts'

export interface RevealInfo {
  victimCell: Cell
  murdererId: PersonId | null
}

export interface BoardView {
  puzzle: Puzzle
  /** Cell size in CSS pixels. */
  cell: number
  /** Top-left of the grid in CSS pixels (within the already dpr-scaled ctx). */
  origin: { x: number; y: number }
  /** Resolve a room nameKey to a localized label. */
  roomName: (nameKey: string) => string
  /** suspect id → index (for stable colours and the badge letter). */
  suspectIndex: Map<PersonId, number>
  placements: Map<PersonId, Cell>
  marks: Map<Cell, Set<PersonId>>
  crosses: Set<Cell>
  highlight: Set<Cell> | null
  press: { cell: Cell; progress: number } | null
  reveal: RevealInfo | null
  /** Committed-suspect head avatars, keyed by id (drawn when loaded). */
  avatars?: Map<PersonId, HTMLImageElement>
  /** Cell under the cursor/finger → outlined yellow (occupiable) or red (blocked). */
  hover?: Cell | null
  /** Thumbnail mode: rooms + walls + object dots only. */
  preview?: boolean
}

function roomCentroids(puzzle: Puzzle): Map<string, { col: number; row: number; count: number }> {
  const acc = new Map<string, { col: number; row: number; count: number }>()
  const board = puzzle.board
  for (let cell = 0; cell < board.width * board.height; cell++) {
    const id = board.roomIdOf(cell)
    const { row, col } = board.rc(cell)
    const e = acc.get(id) ?? { col: 0, row: 0, count: 0 }
    e.col += col
    e.row += row
    e.count += 1
    acc.set(id, e)
  }
  return acc
}

export function drawBoard(ctx: CanvasRenderingContext2D, view: BoardView): void {
  const { puzzle, cell: S, origin, preview } = view
  const board = puzzle.board
  const W = board.width
  const H = board.height
  const ox = origin.x
  const oy = origin.y

  const xy = (c: Cell) => {
    const { row, col } = board.rc(c)
    return { x: ox + col * S, y: oy + row * S }
  }

  ctx.fillStyle = BOARD.mortar
  ctx.fillRect(ox - 1, oy - 1, W * S + 2, H * S + 2)

  // --- room fills + highlight wash ---------------------------------------
  for (let c = 0; c < W * H; c++) {
    const { x, y } = xy(c)
    const room = board.rooms.get(board.roomIdOf(c))
    ctx.fillStyle = room?.color ?? '#cfcfcf'
    ctx.fillRect(x, y, S, S)
    if (view.highlight?.has(c)) {
      ctx.fillStyle = BOARD.highlight
      ctx.fillRect(x, y, S, S)
    }
  }

  // --- carpet rug (occupiable ground layer) ------------------------------
  for (let c = 0; c < W * H; c++) {
    if (board.tileAt(c).ground?.type !== 'carpet') continue
    const { x, y } = xy(c)
    const pad = S * 0.13
    ctx.fillStyle = 'rgba(176, 116, 84, 0.42)'
    ctx.strokeStyle = 'rgba(120, 74, 52, 0.5)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x + pad, y + pad, S - 2 * pad, S - 2 * pad, S * 0.08)
    ctx.fill()
    ctx.stroke()
  }

  // --- room labels (behind objects) -------------------------------------
  if (!preview) {
    const centroids = roomCentroids(puzzle)
    ctx.save()
    ctx.fillStyle = BOARD.label
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const [id, e] of centroids) {
      const room = board.rooms.get(id)
      if (!room) continue
      const label = view.roomName(room.nameKey).toUpperCase()
      const size = Math.max(9, Math.min(S * 0.34, (S * Math.sqrt(e.count)) / Math.max(3, label.length) + 6))
      ctx.font = `800 ${size}px 'Fraunces', Georgia, serif`
      try {
        ctx.letterSpacing = `${size * 0.08}px`
      } catch {
        /* letterSpacing unsupported — ignore */
      }
      const cx = ox + (e.col / e.count + 0.5) * S
      const cy = oy + (e.row / e.count + 0.5) * S
      ctx.fillText(label, cx, cy)
    }
    ctx.restore()
  }

  // --- thin in-room grid lines, then thick walls -------------------------
  const thin = Math.max(1, S * 0.02)
  const thick = Math.max(2.5, S * 0.07)

  ctx.strokeStyle = BOARD.grid
  ctx.lineWidth = thin
  ctx.beginPath()
  for (let r = 0; r < H; r++) {
    for (let col = 0; col < W; col++) {
      const id = board.roomIdOf(board.idx(r, col))
      if (col + 1 < W && board.roomIdOf(board.idx(r, col + 1)) === id) {
        const x = Math.round(ox + (col + 1) * S) + 0.5
        ctx.moveTo(x, oy + r * S)
        ctx.lineTo(x, oy + (r + 1) * S)
      }
      if (r + 1 < H && board.roomIdOf(board.idx(r + 1, col)) === id) {
        const y = Math.round(oy + (r + 1) * S) + 0.5
        ctx.moveTo(ox + col * S, y)
        ctx.lineTo(ox + (col + 1) * S, y)
      }
    }
  }
  ctx.stroke()

  ctx.strokeStyle = BOARD.wall
  ctx.lineWidth = thick
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let r = 0; r < H; r++) {
    for (let col = 0; col < W; col++) {
      const id = board.roomIdOf(board.idx(r, col))
      if (col + 1 < W && board.roomIdOf(board.idx(r, col + 1)) !== id) {
        const x = ox + (col + 1) * S
        ctx.moveTo(x, oy + r * S)
        ctx.lineTo(x, oy + (r + 1) * S)
      }
      if (r + 1 < H && board.roomIdOf(board.idx(r + 1, col)) !== id) {
        const y = oy + (r + 1) * S
        ctx.moveTo(ox + col * S, y)
        ctx.lineTo(ox + (col + 1) * S, y)
      }
    }
  }
  ctx.stroke()
  ctx.strokeStyle = BOARD.outer
  ctx.lineWidth = thick * 1.1
  ctx.strokeRect(ox, oy, W * S, H * S)

  // --- windows (drawn on the wall they sit on) ---------------------------
  for (let c = 0; c < W * H; c++) {
    const sides = board.windowSides(c)
    if (sides.length === 0) continue
    const { x, y } = xy(c)
    for (const side of sides) drawWindow(ctx, x, y, S, side)
  }

  // --- object dots (preview only) ---------------------------------------
  if (preview) {
    for (let c = 0; c < W * H; c++) {
      const top = board.tileAt(c).top
      if (!top) continue
      const { x, y } = xy(c)
      ctx.fillStyle = 'rgba(30, 26, 38, 0.5)'
      ctx.beginPath()
      ctx.arc(x + S / 2, y + S / 2, S * 0.16, 0, Math.PI * 2)
      ctx.fill()
    }
    return
  }

  // --- object emoji (white tile ONLY behind blocking objects) ---
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let c = 0; c < W * H; c++) {
    const top = board.tileAt(c).top
    const glyph = top ? OBJECT_GLYPHS[top.type] : undefined
    if (!top || !glyph) continue
    const { x, y } = xy(c)
    if (!top.occupiable) {
      const pad = S * 0.08
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)'
      ctx.strokeStyle = 'rgba(40, 32, 48, 0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(x + pad, y + pad, S - 2 * pad, S - 2 * pad, S * 0.16)
      ctx.fill()
      ctx.stroke()
    }
    ctx.fillStyle = '#1c1822' // opaque, so any monochrome glyph stays bold (not faint)
    ctx.font = `${S * 0.66}px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`
    ctx.fillText(glyph, x + S / 2, y + S * 0.56)
  }

  // --- highlight ring on candidate cells --------------------------------
  if (view.highlight) {
    ctx.strokeStyle = BOARD.highlightRing
    ctx.lineWidth = Math.max(2, S * 0.05)
    for (const c of view.highlight) {
      const { x, y } = xy(c)
      const pad = S * 0.07
      ctx.beginPath()
      ctx.roundRect(x + pad, y + pad, S - 2 * pad, S - 2 * pad, S * 0.12)
      ctx.stroke()
    }
  }

  // --- crosses -----------------------------------------------------------
  ctx.strokeStyle = BOARD.cross
  ctx.lineWidth = Math.max(2, S * 0.09)
  ctx.lineCap = 'round'
  for (const c of view.crosses) {
    const { x, y } = xy(c)
    const m = S * 0.26
    ctx.beginPath()
    ctx.moveTo(x + m, y + m)
    ctx.lineTo(x + S - m, y + S - m)
    ctx.moveTo(x + S - m, y + m)
    ctx.lineTo(x + m, y + S - m)
    ctx.stroke()
  }

  // --- pencil marks (each id in ITS OWN suspect colour) ------------------
  const occupied = new Set(view.placements.values())
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = `700 ${S * 0.27}px 'Spline Sans', sans-serif`
  for (const [c, set] of view.marks) {
    if (occupied.has(c) || set.size === 0) continue
    const { x, y } = xy(c)
    let i = 0
    for (const id of set) {
      ctx.fillStyle = suspectColor(view.suspectIndex.get(id) ?? 0)
      ctx.fillText(id, x + S * 0.09 + i * S * 0.23, y + S * 0.07)
      i++
    }
  }

  // --- committed tokens (suspect avatar head, or victim skull) ----------
  for (const [id, c] of view.placements) {
    const { x, y } = xy(c)
    if (id === VICTIM_ID) {
      drawVictim(ctx, { x, y }, S)
      continue
    }
    if (view.reveal?.murdererId === id) {
      ctx.beginPath()
      ctx.arc(x + S / 2, y + S / 2, S * 0.47, 0, Math.PI * 2)
      ctx.strokeStyle = BOARD.victim
      ctx.lineWidth = S * 0.06
      ctx.stroke()
    }
    const img = view.avatars?.get(id)
    if (img && img.complete && img.naturalWidth > 0) {
      const size = S * 0.9
      ctx.drawImage(img, x + (S - size) / 2, y + (S - size) / 2, size, size)
    } else {
      drawToken(ctx, { x, y }, S, id, suspectColor(view.suspectIndex.get(id) ?? 0))
    }
  }

  // --- hover/press outline: yellow on occupiable, red on blocked --------
  if (view.hover != null) {
    const { x, y } = xy(view.hover)
    const occ = board.isOccupiable(view.hover)
    const pad = S * 0.06
    ctx.fillStyle = occ ? 'rgba(255, 216, 77, 0.16)' : 'rgba(207, 70, 60, 0.16)'
    ctx.strokeStyle = occ ? '#ffd84d' : BOARD.victim
    ctx.lineWidth = Math.max(2, S * 0.06)
    ctx.beginPath()
    ctx.roundRect(x + pad, y + pad, S - 2 * pad, S - 2 * pad, S * 0.12)
    ctx.fill()
    ctx.stroke()
  }

  // --- long-press progress ring -----------------------------------------
  if (view.press) {
    const { x, y } = xy(view.press.cell)
    const cx = x + S / 2
    const cy = y + S / 2
    ctx.fillStyle = BOARD.pressScrim
    ctx.fillRect(x, y, S, S)
    const radius = S * 0.34
    ctx.lineCap = 'round'
    ctx.lineWidth = S * 0.09
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = BOARD.press
    ctx.beginPath()
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * view.press.progress)
    ctx.stroke()
  }
}

/** A light-blue window straddling one wall of a cell. */
function drawWindow(ctx: CanvasRenderingContext2D, x: number, y: number, S: number, side: Side): void {
  const t = S * 0.16
  const inset = S * 0.16
  let rx: number, ry: number, rw: number, rh: number, vertical: boolean
  switch (side) {
    case 'N':
      rx = x + inset; ry = y - t / 2; rw = S - 2 * inset; rh = t; vertical = false
      break
    case 'S':
      rx = x + inset; ry = y + S - t / 2; rw = S - 2 * inset; rh = t; vertical = false
      break
    case 'W':
      rx = x - t / 2; ry = y + inset; rw = t; rh = S - 2 * inset; vertical = true
      break
    case 'E':
      rx = x + S - t / 2; ry = y + inset; rw = t; rh = S - 2 * inset; vertical = true
      break
  }
  ctx.fillStyle = BOARD.window
  ctx.strokeStyle = '#3f6378'
  ctx.lineWidth = Math.max(1.2, S * 0.025)
  ctx.beginPath()
  ctx.roundRect(rx, ry, rw, rh, t * 0.28)
  ctx.fill()
  ctx.stroke()
  // mullion across the middle
  ctx.beginPath()
  if (vertical) {
    ctx.moveTo(rx, ry + rh / 2)
    ctx.lineTo(rx + rw, ry + rh / 2)
  } else {
    ctx.moveTo(rx + rw / 2, ry)
    ctx.lineTo(rx + rw / 2, ry + rh)
  }
  ctx.stroke()
}

/** The victim token: a crimson disc with a skull. */
function drawVictim(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }, S: number): void {
  const cx = pos.x + S / 2
  const cy = pos.y + S / 2
  ctx.beginPath()
  ctx.arc(cx, cy, S * 0.37, 0, Math.PI * 2)
  ctx.fillStyle = BOARD.victim
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = S * 0.16
  ctx.shadowOffsetY = S * 0.03
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${S * 0.44}px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`
  ctx.fillText('💀', cx, cy + S * 0.02)
}

function drawToken(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  S: number,
  letter: string,
  color: string,
): void {
  const cx = pos.x + S / 2
  const cy = pos.y + S / 2
  const r = S * 0.36
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = S * 0.14
  ctx.shadowOffsetY = S * 0.03
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.lineWidth = Math.max(1.5, S * 0.03)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 ${S * 0.42}px 'Fraunces', Georgia, serif`
  ctx.fillText(letter, cx, cy + S * 0.02)
}
