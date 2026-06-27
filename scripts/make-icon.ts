/**
 * Generates the Android app icon source PNGs (1024×1024) into ./assets, then
 * `@capacitor/assets` turns them into every density. ONE source of truth: the
 * portrait is the real suspect avatar (`avatarSvg`), just without the corner
 * letter badge. Re-run with:  npx tsx scripts/make-icon.ts
 *
 * Character: female detective, long black braids, slim (rectangle) black glasses
 * — a brass medallion on a dark "case-file" ink gradient (palette from index.css).
 */
import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { avatarSvg } from '../src/game/avatar'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assetsDir = resolve(root, 'assets')
mkdirSync(assetsDir, { recursive: true })

// Palette (mirrors src/index.css :root)
const INK = { c0: '#2a2634', c1: '#191722', c2: '#131119' }
const BRASS = '#e2b75e'

// 1) Suspect-style portrait, brass backing — then strip the corner letter badge.
const attrs = {
  gender: 'f',
  glasses: true,
  glassesShape: 'rectangle', // "schmal" — slim frames
  glassesColor: 'black',
  hair: 'black',
  hairstyle: 'braids', // two braids
}
let portrait = avatarSvg(attrs, BRASS, 'M')
if (!/<circle cx="79"/.test(portrait)) {
  throw new Error('Badge marker not found — avatarSvg() changed, update make-icon.ts')
}
portrait = portrait.replace(/<circle cx="79"[\s\S]*?<\/text>/, '')
const innerRaw = portrait
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .trim()

// The avatar centres the COIN, but the face sits low inside it (empty crown on
// top, chin near the rim). Separate head from coin so we can lift the head to
// the centre — and keep it clear of any adaptive-icon mask crop. We drop the
// avatar's two backing circles + the white outline, then redraw the coin.
const drop = [
  `<circle cx="50" cy="50" r="49" fill="${BRASS}"/>`,
  `<circle cx="50" cy="57" r="49" fill="rgba(0,0,0,0.08)"/>`,
  `<circle cx="50" cy="50" r="49" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>`,
]
let head = innerRaw
for (const d of drop) {
  if (!head.includes(d)) throw new Error('Expected avatar layer not found: ' + d)
  head = head.replace(d, '')
}
head = head.trim()

const HEAD_RISE = 9 // viewBox units to lift the head toward the coin centre
const coin =
  `<circle cx="50" cy="50" r="49" fill="${BRASS}"/>` +
  `<circle cx="50" cy="57" r="49" fill="rgba(0,0,0,0.08)"/>` +
  `<g transform="translate(0,${-HEAD_RISE})">${head}</g>` +
  `<circle cx="50" cy="50" r="49" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>`

// A nested <svg> (viewBox 0..100) clips to its box so nothing bleeds past the coin.
const portraitBox = (size: number): string => {
  const t = (1024 - size) / 2
  return `<svg x="${t}" y="${t}" width="${size}" height="${size}" viewBox="0 0 100 100">${coin}</svg>`
}

const background = `<defs><radialGradient id="bg" cx="50%" cy="42%" r="75%">
    <stop offset="0%" stop-color="${INK.c0}"/>
    <stop offset="60%" stop-color="${INK.c1}"/>
    <stop offset="100%" stop-color="${INK.c2}"/>
  </radialGradient></defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="512" cy="512" r="470" fill="none" stroke="${BRASS}" stroke-opacity="0.12" stroke-width="6"/>`

const wrap = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`

const svgIconOnly = wrap(background + portraitBox(880)) // legacy square + round
const svgForeground = wrap(portraitBox(760)) // adaptive foreground (extra safe-zone margin)
const svgBackground = wrap(background) // adaptive background

async function png(svg: string, file: string): Promise<void> {
  await sharp(Buffer.from(svg)).png().toFile(resolve(assetsDir, file))
  console.log('wrote assets/' + file)
}

await png(svgIconOnly, 'icon-only.png')
await png(svgForeground, 'icon-foreground.png')
await png(svgBackground, 'icon-background.png')
