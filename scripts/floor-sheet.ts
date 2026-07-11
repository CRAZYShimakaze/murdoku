/**
 * Renders every floor pattern as a 4×4-tile swatch to a PNG contact sheet
 * (via a tiny Canvas2D→SVG recorder + sharp) for visual review without a browser.
 * Usage: npx tsx scripts/floor-sheet.ts <outDir>
 */
import sharp from 'sharp'
import { drawFloorTile, type FloorPattern } from '../src/game/floorArt.ts'

const PATTERNS: FloorPattern[] = [
  'checker', 'checkerDiag', 'tileGrid', 'tileSmall', 'hexTile', 'diamond',
  'planksH', 'planksV', 'planksOld', 'herringbone', 'parquet', 'deck',
  'marble', 'flagstone', 'cobble', 'concrete', 'asphalt', 'gravel',
  'grass', 'meadow', 'furrows', 'dirt', 'straw', 'leaves', 'sand',
  'carpet', 'carpetDiag', 'rubber', 'lino', 'terrazzo', 'splatter',
  'snow', 'ice', 'snowtracks',
]
const ROOM_COLORS = ['#e8d8b0', '#b9d0e6', '#cfe0cf', '#d8c0c0', '#e6cda0', '#e6c0d2', '#c6c0e0', '#c0e0c8']

/** Minimal Canvas2D→SVG recorder covering exactly what floorArt uses. */
class SvgCtx {
  out: string[] = []
  fillStyle = '#000'
  strokeStyle = '#000'
  lineWidth = 1
  lineCap = 'butt'
  private d = ''
  private open = 0
  private saves: number[] = []
  private clipId = 0

  save(): void {
    this.saves.push(this.open)
  }
  restore(): void {
    const target = this.saves.pop() ?? 0
    while (this.open > target) {
      this.out.push('</g>')
      this.open--
    }
  }
  beginPath(): void {
    this.d = ''
  }
  moveTo(x: number, y: number): void {
    this.d += `M${x} ${y}`
  }
  lineTo(x: number, y: number): void {
    this.d += `L${x} ${y}`
  }
  closePath(): void {
    this.d += 'Z'
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.d += `Q${cx} ${cy} ${x} ${y}`
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.d += `C${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y}`
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.d += `M${x} ${y}H${x + w}V${y + h}H${x}Z`
  }
  roundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.d +=
      `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
      `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
      `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  }
  arc(cx: number, cy: number, r: number, _a0: number, _a1: number): void {
    this.d += `M${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}Z`
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, rot: number, _a0: number, _a1: number): void {
    const deg = (rot * 180) / Math.PI
    const sx = cx + rx * Math.cos(rot)
    const sy = cy + rx * Math.sin(rot)
    const ex = cx - rx * Math.cos(rot)
    const ey = cy - rx * Math.sin(rot)
    this.d += `M${sx} ${sy}A${rx} ${ry} ${deg} 1 1 ${ex} ${ey}A${rx} ${ry} ${deg} 1 1 ${sx} ${sy}Z`
  }
  clip(): void {
    const id = `c${this.clipId++}`
    this.out.push(`<clipPath id="${id}"><path d="${this.d}"/></clipPath><g clip-path="url(#${id})">`)
    this.open++
  }
  fill(): void {
    this.out.push(`<path d="${this.d}" fill="${this.fillStyle}"/>`)
  }
  stroke(): void {
    this.out.push(
      `<path d="${this.d}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}" stroke-linecap="${this.lineCap}"/>`,
    )
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${this.fillStyle}"/>`)
  }
  svg(): string {
    return this.out.join('') + '</g>'.repeat(this.open)
  }
}

async function main(): Promise<void> {
  const outDir = process.argv[2] ?? '.'
  const S = 44
  const TILES = 4
  const SW = S * TILES
  const COLS = 6
  const GAP = 26
  const rows = Math.ceil(PATTERNS.length / COLS)
  const W = COLS * (SW + GAP) + GAP
  const H = rows * (SW + GAP + 16) + GAP
  let body = ''
  PATTERNS.forEach((p, i) => {
    const gx = GAP + (i % COLS) * (SW + GAP)
    const gy = GAP + Math.floor(i / COLS) * (SW + GAP + 16)
    const color = ROOM_COLORS[i % ROOM_COLORS.length]
    const ctx = new SvgCtx()
    for (let r = 0; r < TILES; r++)
      for (let c = 0; c < TILES; c++)
        drawFloorTile(ctx as unknown as CanvasRenderingContext2D, c * S, r * S, S, r, c, p)
    body +=
      `<g transform="translate(${gx},${gy})">` +
      `<rect width="${SW}" height="${SW}" fill="${color}"/>` +
      ctx.svg() +
      `<rect width="${SW}" height="${SW}" fill="none" stroke="#333" stroke-width="1"/>` +
      `</g>` +
      `<text x="${gx + SW / 2}" y="${gy + SW + 13}" text-anchor="middle" font-family="Arial" font-size="12" fill="#222">${p}</text>`
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f4f1ea"/>${body}</svg>`
  await sharp(Buffer.from(svg)).png().toFile(`${outDir}/floor-sheet.png`)
  console.log('wrote floor-sheet.png')
}
void main()
