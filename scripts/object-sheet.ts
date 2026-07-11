/**
 * Renders the hand-drawn board objects as a PNG contact sheet (via a tiny
 * Canvas2D→SVG recorder + sharp) for visual review without a browser.
 * Usage: npx tsx scripts/object-sheet.ts <outDir> [type ...]
 * Without explicit types it renders the zoo/ski additions + the bear for
 * style comparison and the two winter skins.
 */
import sharp from 'sharp'
import { registerHooks } from 'node:module'

// objectArt.ts imports a .png (vite handles that in the app); under tsx we stub
// image modules out, THEN load the drawing code dynamically.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.png')) return { format: 'module', source: 'export default ""', shortCircuit: true }
    return nextLoad(url, context)
  },
})
const { drawObjectIcon } = await import('../src/game/boardRender.ts')
const { drawSnowBoulder, drawWinterFir } = await import('../src/game/objectArt.ts')
const { OBJECT_CATALOG } = await import('../src/engine/index.ts')

const DEFAULT_TYPES = [
  'bench', 'lion', 'monkey', 'goat', 'parrot',
  'penguin', 'flamingo', 'elephant', 'bear', 'sled',
  'gondola', 'snowman', 'skirack', '~wintertree', '~snowboulder',
]

/** Minimal Canvas2D→SVG recorder covering what the object art uses. */
class SvgCtx {
  out: string[] = []
  fillStyle = '#000'
  strokeStyle = '#000'
  lineWidth = 1
  lineCap = 'butt'
  lineJoin = 'miter'
  globalAlpha = 1
  font = ''
  textAlign = ''
  textBaseline = ''
  private dash: number[] = []
  setLineDash(segments: number[]): void {
    this.dash = segments
  }
  private d = ''
  private open = 0
  private saves: { open: number; alpha: number }[] = []
  private clipId = 0

  save(): void {
    this.saves.push({ open: this.open, alpha: this.globalAlpha })
  }
  restore(): void {
    const s = this.saves.pop()
    if (!s) return
    this.globalAlpha = s.alpha
    while (this.open > s.open) {
      this.out.push('</g>')
      this.open--
    }
  }
  translate(): void {}
  scale(): void {}
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
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw = false): void {
    if (Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6) {
      this.d += `M${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}Z`
      return
    }
    const sx = cx + r * Math.cos(a0)
    const sy = cy + r * Math.sin(a0)
    const ex = cx + r * Math.cos(a1)
    const ey = cy + r * Math.sin(a1)
    let delta = a1 - a0
    if (!ccw && delta < 0) delta += Math.PI * 2
    if (ccw && delta > 0) delta -= Math.PI * 2
    const large = Math.abs(delta) > Math.PI ? 1 : 0
    const sweep = ccw ? 0 : 1
    this.d += `M${sx} ${sy}A${r} ${r} 0 ${large} ${sweep} ${ex} ${ey}`
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
  private alpha(): string {
    return this.globalAlpha < 1 ? ` opacity="${this.globalAlpha}"` : ''
  }
  fill(): void {
    this.out.push(`<path d="${this.d}" fill="${this.fillStyle}"${this.alpha()}/>`)
  }
  stroke(): void {
    const dash = this.dash.length ? ` stroke-dasharray="${this.dash.join(' ')}"` : ''
    this.out.push(
      `<path d="${this.d}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}"` +
        ` stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"${dash}${this.alpha()}/>`,
    )
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${this.fillStyle}"${this.alpha()}/>`)
  }
  fillText(): void {}
  svg(): string {
    return this.out.join('') + '</g>'.repeat(this.open)
  }
}

const OCCUPIABLE = new Map(OBJECT_CATALOG.map((o) => [o.type, o.occupiable]))
const FLOOR: Record<string, string> = { default: '#cfe0cf', sand: '#e8d8b0', snow: '#dfe9f2', water: '#b9d0e6' }
const FLOOR_OF: Record<string, string> = {
  lion: 'sand', elephant: 'sand', goat: 'sand', penguin: 'water', flamingo: 'water',
  sled: 'snow', gondola: 'snow', snowman: 'snow', skirack: 'snow', '~wintertree': 'snow', '~snowboulder': 'snow',
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const outDir = args[0] ?? '.'
  const types = args.length > 1 ? args.slice(1) : DEFAULT_TYPES
  const S = 120
  const COLS = 5
  const GAP = 22
  const rows = Math.ceil(types.length / COLS)
  const W = COLS * (S + GAP) + GAP
  const H = rows * (S + GAP + 16) + GAP
  let body = ''
  types.forEach((t, i) => {
    const gx = GAP + (i % COLS) * (S + GAP)
    const gy = GAP + Math.floor(i / COLS) * (S + GAP + 16)
    const ctx = new SvgCtx()
    const cast = ctx as unknown as CanvasRenderingContext2D
    if (t === '~wintertree' || t === '~snowboulder') {
      ctx.fillStyle = 'rgba(255,255,255,0.78)'
      ctx.beginPath()
      ctx.roundRect(S * 0.08, S * 0.08, S * 0.84, S * 0.84, S * 0.09)
      ctx.fill()
      if (t === '~wintertree') drawWinterFir(cast, 0, 0, S)
      else drawSnowBoulder(cast, 0, 0, S)
    } else {
      drawObjectIcon(cast, t, 0, 0, S, OCCUPIABLE.get(t) ?? false)
    }
    const color = FLOOR[FLOOR_OF[t] ?? 'default']
    body +=
      `<g transform="translate(${gx},${gy})">` +
      `<rect width="${S}" height="${S}" fill="${color}"/>` +
      ctx.svg() +
      `<rect width="${S}" height="${S}" fill="none" stroke="#333" stroke-width="1.5"/>` +
      `</g>` +
      `<text x="${gx + S / 2}" y="${gy + S + 13}" text-anchor="middle" font-family="Arial" font-size="12" fill="#222">${t.replace('~', '')}</text>`
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f4f1ea"/>${body}</svg>`
  await sharp(Buffer.from(svg)).png().toFile(`${outDir}/object-sheet.png`)
  console.log('wrote object-sheet.png')
}
void main()
