/**
 * Generates a recognizable head avatar as a self-contained SVG, used both by the
 * React clue cards (<img>) and the Canvas board (drawn via an Image). One source
 * of truth so both targets always match.
 *
 * Cues that matter for the clue logic: gender, beard, glasses, hair colour AND
 * now the concrete style (hairstyle / beardStyle / glassesShape / glassesColor).
 * Every catalog below is exported so the editor dropdowns and the clue builder
 * reuse exactly the values this renderer understands. When a style is unset we
 * fall back to a deterministic pick from the id, so old levels still vary nicely.
 */

const SKIN = '#f0c6a0'
const SKIN_SHADE = '#e0b48d'
const FRAME = '#241f2b'
const MOUTH = '#9c5b4a'
const LIP = '#c66b66'

export interface AvatarAttrs {
  gender?: unknown
  beard?: unknown
  glasses?: unknown
  bald?: unknown
  hair?: unknown
  hairstyle?: unknown
  beardStyle?: unknown
  glassesShape?: unknown
  glassesColor?: unknown
}

// ─── Catalogs (single source of truth, reused by editor + clue builder) ──────

/** Hairstyle ids per gender (≥10 each). Distinct silhouettes, female vs male. */
export const HAIRSTYLES_F = [
  'long',
  'longCenter',
  'bob',
  'wavy',
  'ponytailLeft',
  'ponytailRight',
  'braids',
  'bun',
  'updo',
  'pixie',
  'curly',
  'hime',
] as const
export const HAIRSTYLES_M = [
  'short',
  'sidePart',
  'buzz',
  'quiff',
  'slick',
  'curly',
  'combOver',
  'caesar',
  'afro',
  'manbun',
  'mohawk',
  'spiky',
] as const

/** Distinct union of all hairstyle ids (for the clue value picker). */
export const HAIRSTYLE_IDS = Array.from(new Set([...HAIRSTYLES_F, ...HAIRSTYLES_M]))

export const BEARD_STYLES = ['full', 'mustache', 'goatee', 'stubble', 'chinstrap'] as const
export const GLASSES_SHAPES = ['round', 'square', 'rectangle', 'oversized', 'cat', 'rimless'] as const
export const GLASSES_COLORS = ['black', 'brown', 'gold', 'red', 'blue', 'silver'] as const

const GLASSES_COLOR_HEX: Record<string, string> = {
  black: '#241f2b',
  brown: '#5b3a23',
  gold: '#c9a227',
  red: '#b5302a',
  blue: '#2f5d9e',
  silver: '#9aa3ad',
}

export function hairstylesFor(gender: unknown): readonly string[] {
  return gender === 'm' ? HAIRSTYLES_M : HAIRSTYLES_F
}

/**
 * The concrete hairstyle a suspect ends up with: the explicit choice if it is
 * valid for the gender, otherwise a deterministic pick from the letter. Shared
 * by the renderer AND `suspectAttributes`, so "what you see" == "what clues match".
 */
export function resolveHairstyle(gender: unknown, explicit: unknown, letter: string): string {
  const list = hairstylesFor(gender)
  const e = typeof explicit === 'string' ? explicit : ''
  if (e && list.includes(e)) return e
  return list[letter.charCodeAt(0) % list.length]
}

// ─── Colours ─────────────────────────────────────────────────────────────────

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

// ─── Head ────────────────────────────────────────────────────────────────────

/** Face outline — women narrower with a soft chin, men wider with a squarer jaw. */
function facePath(female: boolean): string {
  return female
    ? 'M50 34 C62 34 71 44 71 57 C71 73 62 88 50 88 C38 88 29 73 29 57 C29 44 38 34 50 34 Z'
    : 'M50 33 C64 33 73 43 74 56 C74 71 66 86 50 86 C34 86 26 71 26 56 C27 43 36 33 50 33 Z'
}

/** Eyebrows — soft thin arcs for women, heavier straight ones for men. */
function brows(female: boolean, H: string): string {
  return female
    ? `<path d="M34 49 Q40 46.5 46 48.5" fill="none" stroke="${H}" stroke-width="1.7" stroke-linecap="round"/>` +
        `<path d="M54 48.5 Q60 46.5 66 49" fill="none" stroke="${H}" stroke-width="1.7" stroke-linecap="round"/>`
    : `<path d="M33 48.5 Q40 45.5 47 48.5" fill="none" stroke="${H}" stroke-width="2.8" stroke-linecap="round"/>` +
        `<path d="M53 48.5 Q60 45.5 67 48.5" fill="none" stroke="${H}" stroke-width="2.8" stroke-linecap="round"/>`
}

const EYES =
  `<ellipse cx="40" cy="55" rx="3" ry="3.4" fill="${FRAME}"/>` +
  `<ellipse cx="60" cy="55" rx="3" ry="3.4" fill="${FRAME}"/>` +
  `<circle cx="41" cy="54" r="0.9" fill="#fff"/><circle cx="61" cy="54" r="0.9" fill="#fff"/>`

const NOSE = `<path d="M50 57 L48 64 Q50 65.4 52 64" fill="none" stroke="${SKIN_SHADE}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`

function mouth(female: boolean): string {
  return female
    ? `<path d="M43 72 Q50 78 57 72 Q50 74.5 43 72 Z" fill="${LIP}"/>`
    : `<path d="M44 72.5 Q50 76 56 72.5" fill="none" stroke="${MOUTH}" stroke-width="2.3" stroke-linecap="round"/>`
}

// ─── Hair ────────────────────────────────────────────────────────────────────

/**
 * Full hair cap covering the whole upper head, closed off by a hairline running
 * from the right temple back to the left temple. `T` is the temple height (men
 * wear it a little higher) so the whole cap lifts together and the crown is never
 * bare — the *style* lives in the hairline shape, the parting and any extra
 * volume/length (drawn in `back`), not in how much scalp shows.
 */
function cap(H: string, T: number, hairline: string): string {
  return `<path d="M28 ${T} Q27 ${T - 20} 50 ${T - 23} Q73 ${T - 20} 72 ${T} ${hairline} Z" fill="${H}"/>`
}

/** Hair as { back: behind face (length/volume), front: the cap over the head }. */
function hair(id: string, female: boolean, H: string): { back: string; front: string } {
  const T = female ? 50 : 47 // temple hairline height — men a touch higher
  const round = `Q50 ${T - 10} 28 ${T}` // standard rounded hairline
  const sleek = `Q50 ${T - 8} 28 ${T}` // hair pulled back / flat
  const partCenter = `<path d="M48 ${T - 21} L50 ${T - 7} L52 ${T - 21} Z" fill="${SKIN}"/>`
  const partSide = `<path d="M42 ${T - 21} Q39 ${T - 12} 39 ${T - 3} L42 ${T - 3} Q43 ${T - 12} 45 ${T - 20} Z" fill="${SKIN}"/>`
  const curtainLong =
    `<path d="M28 44 Q16 68 24 93 Q35 82 34 52 Z" fill="${H}"/>` +
    `<path d="M72 44 Q84 68 76 93 Q65 82 66 52 Z" fill="${H}"/>`
  const curtainBob =
    `<path d="M28 46 Q20 64 31 72 Q36 62 34 52 Z" fill="${H}"/>` +
    `<path d="M72 46 Q80 64 69 72 Q64 62 66 52 Z" fill="${H}"/>`

  switch (id) {
    // ── female ────────────────────────────────────────────────────────────
    case 'long':
      return { back: curtainLong, front: cap(H, T, round) }
    case 'longCenter':
      return { back: curtainLong, front: cap(H, T, round) + partCenter }
    case 'bob':
      return { back: curtainBob, front: cap(H, T, round) }
    case 'wavy':
      return {
        back:
          `<path d="M28 46 Q16 62 23 84 Q26 78 29 84 Q32 78 34 54 Z" fill="${H}"/>` +
          `<path d="M72 46 Q84 62 77 84 Q74 78 71 84 Q68 78 66 54 Z" fill="${H}"/>`,
        front: cap(H, T, `Q50 ${T - 12} 28 ${T}`),
      }
    case 'ponytailLeft':
      return {
        back:
          `<path d="M33 38 Q8 46 11 84 Q24 62 39 47 Z" fill="${H}"/>` +
          `<ellipse cx="30" cy="44" rx="3.6" ry="3.4" fill="${SKIN_SHADE}" opacity="0.3"/>`,
        front: cap(H, T, sleek),
      }
    case 'ponytailRight':
      return {
        back:
          `<path d="M67 38 Q92 46 89 84 Q76 62 61 47 Z" fill="${H}"/>` +
          `<ellipse cx="70" cy="44" rx="3.6" ry="3.4" fill="${SKIN_SHADE}" opacity="0.3"/>`,
        front: cap(H, T, sleek),
      }
    case 'braids':
      return {
        back:
          `<path d="M28 52 Q17 72 22 92 L31 92 Q30 70 35 56 Z" fill="${H}"/>` +
          `<path d="M72 52 Q83 72 78 92 L69 92 Q70 70 65 56 Z" fill="${H}"/>` +
          `<path d="M23 70 L30 72 M22 80 L30 82 M70 72 L77 70 M70 82 L78 80" stroke="${SKIN_SHADE}" stroke-width="1.1" opacity="0.4"/>`,
        front: cap(H, T, round) + partCenter,
      }
    case 'bun':
      return { back: `<circle cx="50" cy="18" r="9" fill="${H}"/>`, front: cap(H, T, sleek) }
    case 'updo':
      return { back: `<ellipse cx="50" cy="19" rx="14" ry="9" fill="${H}"/>`, front: cap(H, T, sleek) }
    case 'pixie':
      return {
        back: '',
        front: cap(H, T, `Q50 ${T - 12} 28 ${T}`) + `<path d="M41 31 Q64 33 69 48 Q55 41 44 43 Z" fill="${H}"/>`,
      }
    case 'curly':
      if (female)
        return {
          back:
            `<circle cx="25" cy="48" r="10" fill="${H}"/><circle cx="75" cy="48" r="10" fill="${H}"/>` +
            `<circle cx="29" cy="64" r="9" fill="${H}"/><circle cx="71" cy="64" r="9" fill="${H}"/>`,
          front:
            cap(H, T, round) +
            `<circle cx="35" cy="31" r="8" fill="${H}"/><circle cx="50" cy="27" r="9" fill="${H}"/><circle cx="65" cy="31" r="8" fill="${H}"/>`,
        }
      return {
        back: `<circle cx="27" cy="44" r="8" fill="${H}"/><circle cx="73" cy="44" r="8" fill="${H}"/>`,
        front:
          cap(H, T, round) +
          `<circle cx="37" cy="${T - 18}" r="7" fill="${H}"/><circle cx="50" cy="${T - 21}" r="7.5" fill="${H}"/><circle cx="63" cy="${T - 18}" r="7" fill="${H}"/>`,
      }
    case 'hime':
      return {
        back:
          `<path d="M28 46 Q25 72 28 91 L36 91 Q35 66 35 52 Z" fill="${H}"/>` +
          `<path d="M72 46 Q75 72 72 91 L64 91 Q65 66 65 52 Z" fill="${H}"/>` +
          `<path d="M28 44 L35 44 L35 64 L28 64 Z" fill="${H}"/>` +
          `<path d="M72 44 L65 44 L65 64 L72 64 Z" fill="${H}"/>`,
        front: cap(H, T, `L72 ${T - 5} L28 ${T - 5} L28 ${T}`),
      }

    // ── male ──────────────────────────────────────────────────────────────
    case 'short':
      // Natural short cut with a small side-swept fringe over the forehead.
      return {
        back: '',
        front:
          cap(H, T, `Q50 ${T - 9} 28 ${T}`) +
          `<path d="M30 ${T - 5} Q35 ${T - 15} 49 ${T - 12} Q41 ${T - 8} 33 ${T - 3} Z" fill="${H}"/>`,
      }
    case 'sidePart':
      return { back: '', front: cap(H, T, `Q50 ${T - 11} 28 ${T}`) + partSide }
    case 'buzz': {
      // Very short / shaved: a low cap hugging the skull, muted with stubble specks.
      const speck = (x: number, y: number) =>
        `<circle cx="${x}" cy="${T - y}" r="0.7" fill="${SKIN_SHADE}" opacity="0.4"/>`
      return {
        back: '',
        front:
          `<path d="M28 ${T} Q27 ${T - 15} 50 ${T - 17} Q73 ${T - 15} 72 ${T} Q50 ${T - 3} 28 ${T} Z" fill="${H}" opacity="0.9"/>` +
          speck(38, 9) + speck(46, 12) + speck(54, 10) + speck(61, 13) + speck(34, 11) + speck(50, 14),
      }
    }
    case 'quiff':
      // Tall pompadour swept up and back at the front.
      return {
        back: '',
        front:
          cap(H, T, `Q50 ${T - 7} 28 ${T}`) +
          `<path d="M31 ${T - 12} Q34 ${T - 33} 54 ${T - 31} Q70 ${T - 29} 63 ${T - 10} Q53 ${T - 20} 42 ${T - 16} Z" fill="${H}"/>`,
      }
    case 'slick':
      // Slicked straight back: flatter crown, higher (receded) hairline, comb lines.
      return {
        back: '',
        front:
          `<path d="M28 ${T - 3} Q28 ${T - 21} 50 ${T - 22} Q72 ${T - 21} 72 ${T - 3} Q60 ${T - 10} 50 ${T - 9} Q40 ${T - 10} 28 ${T - 3} Z" fill="${H}"/>` +
          `<g fill="none" stroke="${SKIN_SHADE}" stroke-width="0.9" opacity="0.5"><path d="M34 ${T - 18} Q50 ${T - 22} 66 ${T - 16}"/><path d="M32 ${T - 13} Q50 ${T - 17} 68 ${T - 11}"/><path d="M31 ${T - 8} Q50 ${T - 12} 69 ${T - 6}"/></g>`,
      }
    case 'combOver':
      return {
        back: '',
        front:
          cap(H, T, `Q50 ${T - 9} 28 ${T}`) +
          `<path d="M37 ${T - 18} Q34 ${T - 8} 35 ${T + 1} L38 ${T + 1} Q38 ${T - 8} 40 ${T - 17} Z" fill="${SKIN}"/>`,
      }
    case 'caesar':
      return { back: '', front: cap(H, T, `L72 ${T - 5} Q50 ${T - 7} 28 ${T - 5} L28 ${T}`) }
    case 'afro':
      return { back: `<circle cx="50" cy="36" r="28" fill="${H}"/>`, front: cap(H, T, round) }
    case 'manbun':
      return { back: `<circle cx="50" cy="17" r="7" fill="${H}"/>`, front: cap(H, T, sleek) }
    case 'mohawk':
      // Shaved sides (skin shows); a central strip ending well above the brows.
      return { back: '', front: `<path d="M44 13 Q50 9 56 13 L54 ${T - 4} Q50 ${T - 2} 46 ${T - 4} Z" fill="${H}"/>` }
    case 'spiky': {
      // Solid hair base with thin spikes rooted deep in the hair (not floating).
      const sp = (x: number, tip: number) =>
        `<path d="M${x - 3.5} ${T - 9} L${x} ${T - tip} L${x + 3.5} ${T - 9} Z" fill="${H}"/>`
      return {
        back: '',
        front:
          cap(H, T, round) +
          sp(32, 30) + sp(39, 35) + sp(46, 31) + sp(53, 34) + sp(60, 36) + sp(67, 29),
      }
    }

    default:
      return { back: '', front: cap(H, T, round) }
  }
}

// ─── Beard ───────────────────────────────────────────────────────────────────

function beardShape(style: string, H: string): string {
  const moustache = `<path d="M40 67 Q50 63 60 67 Q57 70.5 50 69.5 Q43 70.5 40 67 Z" fill="${H}"/>`
  switch (style) {
    case 'mustache':
      return moustache
    case 'goatee':
      return moustache + `<path d="M44 76 Q44 87 50 88 Q56 87 56 76 Q50 79 44 76 Z" fill="${H}"/>`
    case 'stubble':
      return (
        `<path d="M29 60 Q31 84 50 88 Q69 84 71 60 Q69 72 50 74 Q31 72 29 60 Z" fill="${H}" opacity="0.32"/>` +
        `<path d="M40 67 Q50 64 60 67 Q57 70 50 69 Q43 70 40 67 Z" fill="${H}" opacity="0.32"/>`
      )
    case 'chinstrap':
      return `<path d="M30 55 Q31 83 50 88 Q69 83 70 55" fill="none" stroke="${H}" stroke-width="3.4" stroke-linecap="round"/>`
    default: // full
      return (
        `<path d="M28 57 Q29 84 50 89 Q71 84 72 57 Q69 73 50 75 Q31 73 28 57 Z" fill="${H}"/>` +
        `<path d="M28 50 L31 50 L31 62 L28 62 Z" fill="${H}"/><path d="M72 50 L69 50 L69 62 L72 62 Z" fill="${H}"/>` +
        moustache
      )
  }
}

// ─── Glasses ─────────────────────────────────────────────────────────────────

function glassesShapeSvg(shape: string, colorId: string): string {
  const c = GLASSES_COLOR_HEX[colorId] ?? FRAME
  const temples = `<path d="M32 55 H27 M68 55 H73" fill="none" stroke="${c}" stroke-linecap="round"/>`
  switch (shape) {
    case 'square':
      return `<g fill="none" stroke="${c}" stroke-width="2.8" stroke-linejoin="round"><rect x="31" y="48.5" width="16" height="13" rx="3"/><rect x="53" y="48.5" width="16" height="13" rx="3"/><path d="M47 55 H53"/>${temples}</g>`
    case 'rectangle':
      return `<g fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"><rect x="31" y="51" width="16" height="8" rx="2.5"/><rect x="53" y="51" width="16" height="8" rx="2.5"/><path d="M47 55 H53"/>${temples}</g>`
    case 'oversized':
      return `<g stroke="${c}" stroke-width="3.6"><circle cx="39" cy="55" r="9" fill="rgba(0,0,0,0.05)"/><circle cx="61" cy="55" r="9" fill="rgba(0,0,0,0.05)"/><path d="M48 55 H52" fill="none"/><path d="M30 55 H26 M70 55 H74" fill="none" stroke-linecap="round"/></g>`
    case 'cat':
      return `<g fill="none" stroke="${c}" stroke-width="2.6" stroke-linejoin="round"><path d="M30 50 Q40 47 49 52 Q49 61 39 61 Q30 60 30 50 Z"/><path d="M70 50 Q60 47 51 52 Q51 61 61 61 Q70 60 70 50 Z"/><path d="M49 54 H51"/>${temples}</g>`
    case 'rimless':
      return `<g fill="none" stroke="${c}" stroke-width="1.3" stroke-linejoin="round"><rect x="32" y="51" width="15" height="8" rx="3.5"/><rect x="53" y="51" width="15" height="8" rx="3.5"/><path d="M47 55 H53"/>${temples}</g>`
    default: // round
      return `<g fill="none" stroke="${c}" stroke-width="2.6"><circle cx="40" cy="55" r="7.5"/><circle cx="60" cy="55" r="7.5"/><path d="M47.5 55 H52.5"/>${temples}</g>`
  }
}

// ─── Assemble ────────────────────────────────────────────────────────────────

export function avatarSvg(attrs: AvatarAttrs, color: string, letter: string): string {
  const female = attrs.gender !== 'm' // default female, matching the text Renderer
  const beard = attrs.beard === true
  const glasses = attrs.glasses === true
  const bald = attrs.bald === true
  const hash = letter.charCodeAt(0)
  const H = hairColor(attrs, hash * 7 + 3)

  const styleId = resolveHairstyle(attrs.gender, attrs.hairstyle, letter)
  const { back, front } = hair(styleId, female, H)
  const beardSvg = beard ? beardShape(String(attrs.beardStyle ?? 'full'), H) : ''
  const glassesSvg = glasses
    ? glassesShapeSvg(String(attrs.glassesShape ?? 'round'), String(attrs.glassesColor ?? 'black'))
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="49" fill="${color}"/>
    <circle cx="50" cy="57" r="49" fill="rgba(0,0,0,0.08)"/>
    ${bald ? '' : back}
    <path d="${facePath(female)}" fill="${SKIN}"/>
    ${bald ? `<path d="M34 44 Q50 32 66 44 Q50 40 34 44 Z" fill="rgba(255,255,255,0.18)"/>` : ''}
    ${beardSvg}
    ${bald ? '' : front}
    ${brows(female, H)}
    ${EYES}
    ${NOSE}
    ${glassesSvg}
    ${mouth(female)}
    <circle cx="50" cy="50" r="49" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
    <circle cx="79" cy="79" r="15" fill="${FRAME}"/>
    <text x="79" y="85" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="18" font-weight="700" fill="#fff">${letter}</text>
  </svg>`
}

export function avatarDataUri(attrs: AvatarAttrs, color: string, letter: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(attrs, color, letter))}`
}
