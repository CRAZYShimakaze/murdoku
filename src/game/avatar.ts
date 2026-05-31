/**
 * Generates a recognizable head avatar as a self-contained SVG, used both by the
 * React clue cards (<img>) and the Canvas board (drawn via an Image). One source
 * of truth so both targets always match.
 *
 * Cues that matter for the clue logic: gender, beard, glasses. For variety we
 * also vary the hairstyle (5 per gender, picked deterministically from the id)
 * and the hair colour (from the `hair` attribute, else derived from the id).
 * Real artwork can replace this by swapping this one file.
 */

const SKIN = '#f0c6a0'
const FRAME = '#241f2b'
const MOUTH = '#9c5b4a'

export interface AvatarAttrs {
  gender?: unknown
  beard?: unknown
  glasses?: unknown
  hair?: unknown
}

const HAIR_PALETTE = ['#e3c36a', '#bd9446', '#6b4a2b', '#2a2420', '#9a4f2b', '#d2ccc1']

function hairColor(attrs: AvatarAttrs, hash: number): string {
  const named: Record<string, string> = {
    blond: '#e3c36a',
    darkblond: '#bd9446',
    'dark blond': '#bd9446',
    brown: '#6b4a2b',
    black: '#2a2420',
    white: '#d2ccc1',
    grey: '#b7b1a6',
    gray: '#b7b1a6',
    red: '#9a4f2b',
    auburn: '#7a3f24',
  }
  const key = String(attrs.hair ?? '').toLowerCase()
  return named[key] ?? HAIR_PALETTE[hash % HAIR_PALETTE.length]
}

/** Hair shapes drawn BEHIND the face (and a few details), per gender + style. */
function hairBack(female: boolean, style: number, H: string): string {
  if (female) {
    switch (style) {
      case 1: // bob
        return `<ellipse cx="50" cy="52" rx="30" ry="30" fill="${H}"/>`
      case 2: // ponytail
        return `<ellipse cx="50" cy="51" rx="29" ry="29" fill="${H}"/><path d="M75 42 Q92 56 86 84 Q80 64 69 56 Z" fill="${H}"/>`
      case 3: // bun
        return `<path d="M22 57 A28 28 0 0 1 78 57 Z" fill="${H}"/><circle cx="50" cy="23" r="10" fill="${H}"/>`
      case 4: // long, center part
        return `<ellipse cx="50" cy="58" rx="30" ry="34" fill="${H}"/>`
      default: // 0 long
        return `<ellipse cx="50" cy="57" rx="31" ry="34" fill="${H}"/>`
    }
  }
  switch (style) {
    case 1: // side part
      return `<path d="M19 60 Q19 27 47 25 Q74 25 81 52 L81 60 Z" fill="${H}"/>`
    case 2: // buzz / short
      return `<path d="M25 53 A25 23 0 0 1 75 53 Z" fill="${H}"/>`
    case 3: // quiff
      return `<path d="M19 58 A31 31 0 0 1 81 58 Z" fill="${H}"/><path d="M40 34 Q50 18 60 34 Z" fill="${H}"/>`
    case 4: // curly
      return `<circle cx="30" cy="44" r="11" fill="${H}"/><circle cx="44" cy="34" r="12" fill="${H}"/><circle cx="58" cy="34" r="12" fill="${H}"/><circle cx="70" cy="44" r="11" fill="${H}"/>`
    default: // 0 short cap
      return `<path d="M19 58 A31 31 0 0 1 81 58 Z" fill="${H}"/>`
  }
}

/** Details drawn OVER the face (parting), per style. */
function hairFront(female: boolean, style: number): string {
  if (female && style === 4) {
    return `<path d="M47 34 L50 47 L53 34 Z" fill="${SKIN}"/>` // center parting
  }
  return ''
}

export function avatarSvg(attrs: AvatarAttrs, color: string, letter: string): string {
  const female = attrs.gender !== 'm' // default female, matching the text Renderer
  const beard = attrs.beard === true
  const glasses = attrs.glasses === true
  const hash = letter.charCodeAt(0)
  const style = hash % 5
  const H = hairColor(attrs, hash * 7 + 3)
  const clip = `lf-${letter}`

  const face = `<ellipse cx="50" cy="60" rx="24" ry="26" fill="${SKIN}"/>`
  const beardShape = beard
    ? `<ellipse cx="50" cy="60" rx="24" ry="26" fill="${H}" clip-path="url(#${clip})"/>`
    : ''
  const eyes = `<circle cx="41" cy="56" r="3" fill="${FRAME}"/><circle cx="59" cy="56" r="3" fill="${FRAME}"/>`
  const glassesShape = glasses
    ? `<g fill="none" stroke="${FRAME}" stroke-width="2.6"><circle cx="41" cy="56" r="7"/><circle cx="59" cy="56" r="7"/><line x1="48" y1="56" x2="52" y2="56"/></g>`
    : ''
  const mouth = beard
    ? ''
    : `<path d="M44 71 Q50 75 56 71" fill="none" stroke="${MOUTH}" stroke-width="2.4" stroke-linecap="round"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <defs><clipPath id="${clip}"><rect x="18" y="64" width="64" height="40"/></clipPath></defs>
    <circle cx="50" cy="50" r="49" fill="${color}"/>
    <circle cx="50" cy="57" r="49" fill="rgba(0,0,0,0.08)"/>
    ${hairBack(female, style, H)}
    ${face}
    ${beardShape}
    ${hairFront(female, style)}
    ${eyes}
    ${glassesShape}
    ${mouth}
    <circle cx="50" cy="50" r="49" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
    <circle cx="79" cy="79" r="15" fill="${FRAME}"/>
    <text x="79" y="85" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="18" font-weight="700" fill="#fff">${letter}</text>
  </svg>`
}

export function avatarDataUri(attrs: AvatarAttrs, color: string, letter: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(attrs, color, letter))}`
}
