/**
 * Detailed vector drawings for 2-cell objects (bed, car) — 2:1 aspect.
 * Drawn across two adjacent tiles; vertical pairs reuse the horizontal drawing
 * rotated 90°. Kept here so artwork is one place to refine.
 */

type Ctx = CanvasRenderingContext2D

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

/** Horizontal bed in box (bx,by, w=2u, h=u). Head (pillow) on the left. */
function bedH(ctx: Ctx, bx: number, by: number, w: number, h: number): void {
  rr(ctx, bx + 0.03 * w, by + 0.12 * h, 0.94 * w, 0.8 * h, 0.1 * h, '#7a5230') // frame
  rr(ctx, bx + 0.06 * w, by + 0.2 * h, 0.88 * w, 0.62 * h, 0.08 * h, '#efe7d6') // mattress
  // blanket (foot end, right)
  rr(ctx, bx + 0.38 * w, by + 0.2 * h, 0.56 * w, 0.62 * h, 0.07 * h, '#6f93c4')
  rr(ctx, bx + 0.38 * w, by + 0.2 * h, 0.05 * w, 0.62 * h, 0, '#5a7da8') // fold line
  // pillow (head, left)
  rr(ctx, bx + 0.1 * w, by + 0.27 * h, 0.22 * w, 0.46 * h, 0.06 * h, '#ffffff')
  ctx.strokeStyle = 'rgba(120,100,80,0.5)'
  ctx.lineWidth = Math.max(1, h * 0.02)
  ctx.strokeRect(bx + 0.1 * w, by + 0.27 * h, 0.22 * w, 0.46 * h)
  // feet
  rr(ctx, bx + 0.04 * w, by + 0.86 * h, 0.06 * w, 0.12 * h, 1, '#5a3d22')
  rr(ctx, bx + 0.9 * w, by + 0.86 * h, 0.06 * w, 0.12 * h, 1, '#5a3d22')
}

/** Vertical bed in box (bx,by, w=u, h=2u). Pillow on top, feet at the bottom. */
function bedV(ctx: Ctx, bx: number, by: number, w: number, h: number): void {
  rr(ctx, bx + 0.1 * w, by + 0.04 * h, 0.8 * w, 0.92 * h, 0.06 * w, '#7a5230') // frame
  rr(ctx, bx + 0.17 * w, by + 0.07 * h, 0.66 * w, 0.86 * h, 0.05 * w, '#efe7d6') // mattress
  rr(ctx, bx + 0.17 * w, by + 0.34 * h, 0.66 * w, 0.59 * h, 0.04 * w, '#6f93c4') // blanket
  rr(ctx, bx + 0.17 * w, by + 0.34 * h, 0.66 * w, 0.04 * h, 0, '#5a7da8') // fold line
  rr(ctx, bx + 0.27 * w, by + 0.1 * h, 0.46 * w, 0.16 * h, 0.04 * w, '#ffffff') // pillow
  ctx.strokeStyle = 'rgba(120,100,80,0.5)'
  ctx.lineWidth = Math.max(1, w * 0.03)
  ctx.strokeRect(bx + 0.27 * w, by + 0.1 * h, 0.46 * w, 0.16 * h)
  rr(ctx, bx + 0.13 * w, by + 0.92 * h, 0.12 * w, 0.06 * h, 1, '#5a3d22') // feet (bottom)
  rr(ctx, bx + 0.75 * w, by + 0.92 * h, 0.12 * w, 0.06 * h, 1, '#5a3d22')
}

/** Top-down car in box (bx,by, w=2u, h=u) — front (headlights) on the right. */
function carH(ctx: Ctx, bx: number, by: number, w: number, h: number): void {
  const color = '#d24b4b'
  // four wheels on the long sides
  const ww = 0.09 * w
  const wh = 0.15 * h
  for (const wx of [bx + 0.24 * w, bx + 0.67 * w]) {
    rr(ctx, wx, by + 0.05 * h, ww, wh, wh * 0.4, '#222')
    rr(ctx, wx, by + 0.8 * h, ww, wh, wh * 0.4, '#222')
  }
  // body
  rr(ctx, bx + 0.06 * w, by + 0.15 * h, 0.88 * w, 0.7 * h, 0.2 * h, color)
  // roof / cabin
  rr(ctx, bx + 0.33 * w, by + 0.24 * h, 0.42 * w, 0.52 * h, 0.14 * h, '#ab3a36')
  // windshield (front, right) + rear window (left)
  rr(ctx, bx + 0.63 * w, by + 0.3 * h, 0.12 * w, 0.4 * h, 0.05 * h, '#bfe2f2')
  rr(ctx, bx + 0.31 * w, by + 0.3 * h, 0.1 * w, 0.4 * h, 0.05 * h, '#bfe2f2')
  // headlights (front, right end)
  rr(ctx, bx + 0.9 * w, by + 0.24 * h, 0.04 * w, 0.14 * h, 1, '#ffe08a')
  rr(ctx, bx + 0.9 * w, by + 0.62 * h, 0.04 * w, 0.14 * h, 1, '#ffe08a')
  // hood/trunk seams
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = Math.max(1, h * 0.02)
  ctx.beginPath()
  ctx.moveTo(bx + 0.06 * w, by + 0.5 * h)
  ctx.lineTo(bx + 0.31 * w, by + 0.5 * h)
  ctx.moveTo(bx + 0.75 * w, by + 0.5 * h)
  ctx.lineTo(bx + 0.94 * w, by + 0.5 * h)
  ctx.stroke()
}

/**
 * Draw a 2-cell object at its primary (left/top) cell. `vertical` spans down;
 * otherwise it spans right. `x,y,S` are the primary cell box.
 */
export function drawBigObject(
  ctx: Ctx,
  type: string,
  x: number,
  y: number,
  S: number,
  vertical: boolean,
): void {
  // Shrink to ~82% about the 2-cell footprint's centre so a carpet underneath stays visible.
  const cx = vertical ? x + S / 2 : x + S
  const cy = vertical ? y + S : y + S / 2
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(0.82, 0.82)
  ctx.translate(-cx, -cy)
  // The bed has a real up/down (pillow/feet), so it gets a dedicated vertical
  // drawing. The car is top-down, so rotating it 90° is fine.
  if (type === 'bed') {
    if (vertical) bedV(ctx, x, y, S, 2 * S)
    else bedH(ctx, x, y, 2 * S, S)
  } else if (vertical) {
    ctx.translate(x + S / 2, y + S)
    ctx.rotate(Math.PI / 2)
    carH(ctx, -S, -S / 2, 2 * S, S)
  } else {
    carH(ctx, x, y, 2 * S, S)
  }
  ctx.restore()
}

/** Single-cell version (for legacy 1-tile beds): the same drawing in one cell. */
export function drawSingleObject(ctx: Ctx, type: string, x: number, y: number, S: number): void {
  const draw = type === 'car' ? carH : bedH
  draw(ctx, x + S * 0.04, y + S * 0.18, S * 0.92, S * 0.64)
}
