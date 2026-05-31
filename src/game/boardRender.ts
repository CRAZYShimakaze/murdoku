import { VICTIM_ID, type Cell, type PersonId, type Puzzle, type Side } from '../engine/index.ts'
import { BOARD, ROOM_HL, suspectColor } from './palette.ts'
import { OBJECT_GLYPHS } from './glyphs.ts'
import { drawBigObject, drawSingleObject } from './bigObjects.ts'
import {
  drawArmchair,
  drawBookshelf,
  drawCarpetTile,
  drawTableTile,
  type Conn,
} from './objectArt.ts'

/** Object types drawn as detailed 2-cell vector images (instead of an emoji). */
const BIG_OBJECTS = new Set(['bed', 'car'])

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
  /** Suspect whose pencil notes should be emphasized (animated bigger) on the board. */
  emphasizeMarks?: PersonId | null
  /** 0..1 pulse value for the emphasized notes. */
  emphasizePulse?: number
  /** Override the candidate-highlight colours (default brass; tutorial uses blue). */
  highlightColor?: { wash: string; ring: string }
  /** Thumbnail mode: rooms + walls + object dots only. */
  preview?: boolean
}

/**
 * For each room, the widest contiguous column run on its BOTTOM-most row — the
 * name plate sits there and is sized to that run's width.
 */
function roomBottomRuns(puzzle: Puzzle): Map<string, { row: number; c0: number; c1: number }> {
  const board = puzzle.board
  const W = board.width
  const bottomRow = new Map<string, number>()
  for (let cell = 0; cell < W * board.height; cell++) {
    const id = board.roomIdOf(cell)
    const { row } = board.rc(cell)
    bottomRow.set(id, Math.max(bottomRow.get(id) ?? 0, row))
  }
  const runs = new Map<string, { row: number; c0: number; c1: number }>()
  for (const [id, br] of bottomRow) {
    let best = { c0: 0, c1: -1 }
    let start = -1
    const close = (end: number): void => {
      if (start >= 0 && end - start > best.c1 - best.c0) best = { c0: start, c1: end }
    }
    for (let col = 0; col < W; col++) {
      if (board.roomIdOf(board.idx(br, col)) === id) {
        if (start < 0) start = col
      } else {
        close(col - 1)
        start = -1
      }
    }
    close(W - 1)
    runs.set(id, { row: br, c0: best.c0, c1: best.c1 })
  }
  return runs
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

  /** Same-room orthogonal neighbours carrying the same object type, for auto-tiling. */
  const connOf = (c: Cell, layer: 'top' | 'ground', type: string): Conn => {
    const { row, col } = board.rc(c)
    const room = board.roomIdOf(c)
    const same = (r: number, cc: number): boolean => {
      if (!board.inBounds(r, cc)) return false
      const i = board.idx(r, cc)
      if (board.roomIdOf(i) !== room) return false
      const obj = layer === 'top' ? board.tileAt(i).top : board.tileAt(i).ground
      return obj?.type === type
    }
    return {
      n: same(row - 1, col),
      s: same(row + 1, col),
      w: same(row, col - 1),
      e: same(row, col + 1),
    }
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
      ctx.fillStyle = view.highlightColor?.wash ?? BOARD.highlight
      ctx.fillRect(x, y, S, S)
    }
  }

  // --- carpet rug (occupiable ground layer) — auto-tiled into one surface --
  for (let c = 0; c < W * H; c++) {
    if (board.tileAt(c).ground?.type !== 'carpet') continue
    const { x, y } = xy(c)
    drawCarpetTile(ctx, x, y, S, connOf(c, 'ground', 'carpet'))
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

  // Big objects (bed/car) span 2 adjacent tiles OF THE SAME ROOM; draw once at the
  // left/top cell. A pair straddling two rooms renders as two single 1-tile objects.
  const sameType = (type: string, room: string, r: number, c: number) =>
    board.inBounds(r, c) &&
    board.tileAt(board.idx(r, c)).top?.type === type &&
    board.roomIdOf(board.idx(r, c)) === room
  const drawBig = (type: string, c: Cell): void => {
    const { row, col } = board.rc(c)
    const { x, y } = xy(c)
    const room = board.roomIdOf(c)
    if (sameType(type, room, row, col - 1) || sameType(type, room, row - 1, col)) return // secondary
    if (sameType(type, room, row, col + 1)) drawBigObject(ctx, type, x, y, S, false)
    else if (sameType(type, room, row + 1, col)) drawBigObject(ctx, type, x, y, S, true)
    else drawSingleObject(ctx, type, x, y, S) // isolated / cross-room → single 1-tile
  }

  // --- merged table surface (auto-tiles with adjacent same-room tables) ---
  for (let c = 0; c < W * H; c++) {
    if (board.tileAt(c).top?.type !== 'table') continue
    const { x, y } = xy(c)
    drawTableTile(ctx, x, y, S, connOf(c, 'top', 'table'))
  }

  // --- per-cell objects: bed/car + armchair/shelf as vectors, the rest emoji
  for (let c = 0; c < W * H; c++) {
    const top = board.tileAt(c).top
    if (!top || top.type === 'table') continue // table drawn in the merged pass
    const { x, y } = xy(c)
    if (BIG_OBJECTS.has(top.type)) {
      drawBig(top.type, c)
      continue
    }
    if (top.type === 'chair') {
      drawArmchair(ctx, x, y, S)
      continue
    }
    if (top.type === 'shelf') {
      drawBookshelf(ctx, x, y, S)
      continue
    }
    const glyph = OBJECT_GLYPHS[top.type]
    if (!glyph) continue
    if (!preview && !top.occupiable) {
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
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `${S * (preview ? 0.72 : 0.66)}px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`
    ctx.fillText(glyph, x + S / 2, y + S * 0.56)
  }

  if (preview) return

  // --- room name plates: a small white rounded pill sitting ON the room's
  //     bottom wall, placed in the widest window-free gap so it covers nothing.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const [id, run] of roomBottomRuns(puzzle)) {
    const room = board.rooms.get(id)
    if (!room || run.c1 < run.c0) continue
    // A column is blocked if its bottom wall carries a window (either side).
    const windowed = (col: number): boolean =>
      board.windowSides(board.idx(run.row, col)).includes('S') ||
      (run.row + 1 < H && board.windowSides(board.idx(run.row + 1, col)).includes('N'))
    // widest window-free sub-run within [c0, c1]
    let bc0 = run.c0
    let bc1 = run.c0 - 1
    let start = -1
    const close = (end: number): void => {
      if (start >= 0 && end - start > bc1 - bc0) {
        bc0 = start
        bc1 = end
      }
    }
    for (let col = run.c0; col <= run.c1; col++) {
      if (!windowed(col)) {
        if (start < 0) start = col
      } else {
        close(col - 1)
        start = -1
      }
    }
    close(run.c1)
    if (bc1 < bc0) continue // no window-free spot → skip rather than cover a window

    const label = view.roomName(room.nameKey).toUpperCase()
    const maxW = (bc1 - bc0 + 1) * S - S * 0.12
    // Fit the font to the gap (text width scales ~linearly, so one rescale lands it).
    let font = S * 0.155
    const required = (f: number): number => {
      ctx.font = `700 ${f}px 'Spline Sans', system-ui, sans-serif`
      return ctx.measureText(label).width + 2 * f * 0.5
    }
    if (required(font) > maxW) font = Math.max(6, (font * maxW) / required(font))
    ctx.font = `700 ${font}px 'Spline Sans', system-ui, sans-serif`
    const pillW = Math.min(maxW, ctx.measureText(label).width + 2 * font * 0.5)
    const pillH = font * 1.55
    const cx = ox + ((bc0 + bc1 + 1) / 2) * S
    const pillY = oy + (run.row + 1) * S - pillH // bottom edge sits on the wall
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#1c1822'
    ctx.lineWidth = Math.max(1.4, S * 0.022)
    ctx.beginPath()
    ctx.roundRect(cx - pillW / 2, pillY, pillW, pillH, pillH / 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#1c1822'
    ctx.fillText(label, cx, pillY + pillH / 2)
  }

  // --- highlight ring on candidate cells --------------------------------
  if (view.highlight) {
    ctx.strokeStyle = view.highlightColor?.ring ?? BOARD.highlightRing
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

  // --- pencil marks (each id in ITS OWN suspect colour; hovered suspect bigger) ---
  const occupied = new Set(view.placements.values())
  for (const [c, set] of view.marks) {
    if (occupied.has(c) || set.size === 0) continue
    const { x, y } = xy(c)
    if (view.emphasizeMarks && set.has(view.emphasizeMarks)) {
      const scale = 1 + 0.4 * (view.emphasizePulse ?? 0)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `800 ${S * 0.44 * scale}px 'Spline Sans', sans-serif`
      ctx.fillStyle = suspectColor(view.suspectIndex.get(view.emphasizeMarks) ?? 0)
      ctx.fillText(view.emphasizeMarks, x + S / 2, y + S / 2)
    } else {
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.font = `700 ${S * 0.27}px 'Spline Sans', sans-serif`
      let i = 0
      for (const id of set) {
        ctx.fillStyle = suspectColor(view.suspectIndex.get(id) ?? 0)
        ctx.fillText(id, x + S * 0.09 + i * S * 0.23, y + S * 0.07)
        i++
      }
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

  // --- hover: outline the whole room (blue, inside the walls) -----------
  if (view.hover != null) {
    const room = board.roomIdOf(view.hover)
    const wall = (r: number, c: number) =>
      !board.inBounds(r, c) || board.roomIdOf(board.idx(r, c)) !== room
    const ri = S * 0.11
    ctx.strokeStyle = ROOM_HL
    ctx.lineWidth = Math.max(1.5, S * 0.04)
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let c = 0; c < W * H; c++) {
      if (board.roomIdOf(c) !== room) continue
      const { row, col } = board.rc(c)
      const { x, y } = xy(c)
      if (wall(row - 1, col)) {
        ctx.moveTo(x + ri, y + ri)
        ctx.lineTo(x + S - ri, y + ri)
      }
      if (wall(row + 1, col)) {
        ctx.moveTo(x + ri, y + S - ri)
        ctx.lineTo(x + S - ri, y + S - ri)
      }
      if (wall(row, col - 1)) {
        ctx.moveTo(x + ri, y + ri)
        ctx.lineTo(x + ri, y + S - ri)
      }
      if (wall(row, col + 1)) {
        ctx.moveTo(x + S - ri, y + ri)
        ctx.lineTo(x + S - ri, y + S - ri)
      }
    }
    ctx.stroke()
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
