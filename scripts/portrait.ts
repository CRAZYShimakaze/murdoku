/**
 * The Murdoku detective portrait (brass medallion, head lifted to centre), as the
 * INNER SVG of a 0..100 viewBox. Reuses the real suspect avatar (single source of
 * truth) and strips the corner letter badge. Shared by the app icon and the store
 * feature graphic.
 */
import { avatarSvg } from '../src/game/avatar'

// Palette (mirrors src/index.css :root)
export const INK = { c0: '#2a2634', c1: '#191722', c2: '#131119' }
export const BRASS = '#e2b75e'
export const BONE = '#ece6da'
export const BONE_DIM = '#a8a1b0'
export const CRIMSON = '#cf463c'

const ATTRS = {
  gender: 'f',
  glasses: true,
  glassesShape: 'rectangle', // slim frames
  glassesColor: 'black',
  hair: 'black',
  hairstyle: 'braids', // two braids
}

export function portraitCoin(): string {
  let portrait = avatarSvg(ATTRS, BRASS, 'M')
  if (!/<circle cx="79"/.test(portrait)) {
    throw new Error('Badge marker not found — avatarSvg() changed, update portrait.ts')
  }
  portrait = portrait.replace(/<circle cx="79"[\s\S]*?<\/text>/, '')
  const innerRaw = portrait
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim()

  // Separate head from coin so the head can be lifted to the coin centre.
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

  const RISE = 9
  return (
    `<circle cx="50" cy="50" r="49" fill="${BRASS}"/>` +
    `<circle cx="50" cy="57" r="49" fill="rgba(0,0,0,0.08)"/>` +
    `<g transform="translate(0,${-RISE})">${head}</g>` +
    `<circle cx="50" cy="50" r="49" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>`
  )
}
