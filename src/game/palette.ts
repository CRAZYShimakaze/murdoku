/** Canvas colours — kept in sync with the CSS "Case File" tokens (Canvas can't
 *  read CSS variables). Used only by the board renderer. */
export const BOARD = {
  mortar: '#16141d', // gaps / board background behind tiles
  wall: '#16141d', // thick room walls
  grid: 'rgba(20, 18, 26, 0.35)', // thin in-room tile lines
  outer: '#0d0c12',
  label: 'rgba(28, 22, 40, 0.30)', // room name text
  cross: 'rgba(20, 16, 26, 0.92)', // eliminated-cell X (dark, drawn over a white halo)
  crossOutline: '#ffffff', // white rim around the X so it pops on dark rooms
  markOutline: '#0d0c12', // black outline behind pencil-mark letters (legibility)
  markHalo: '#ffffff', // hairline white rim outside the black mark outline (dark rooms)
  highlight: 'rgba(226, 183, 94, 0.34)', // candidate wash
  highlightRing: '#e2b75e',
  window: '#8fc6e0',
  press: '#e2b75e',
  pressScrim: 'rgba(226, 183, 94, 0.20)',
  victim: '#cf463c',
  grass: '#86b15a', // grassy bank shown around a water room's lake surface
} as const

/** Distinguishable, on-theme token colours assigned to suspects by index. */
export const SUSPECT_COLORS = [
  '#c0566b', // rose
  '#4f8fb0', // steel blue
  '#cf8a3c', // amber
  '#5f9e7a', // sage
  '#9b6fb0', // plum
  '#c2724a', // terracotta
  '#5b8fa8', // slate
  '#b0934a', // brass
  '#7a86c2', // periwinkle
  '#a05a8f', // mauve
  '#5aa0a0', // teal
  '#bf6f5a', // clay
] as const

export function suspectColor(index: number): string {
  return SUSPECT_COLORS[index % SUSPECT_COLORS.length]
}

/** Candidate-cell highlight (used everywhere now — selecting a suspect, tutorial). */
export const CANDIDATE_BLUE = { wash: 'rgba(58, 99, 217, 0.26)', ring: '#3a63d9' }
/** Reduced-help reference marks of NEGATED clues ("not here") — crimson. */
export const REF_RED = { wash: 'rgba(207, 70, 60, 0.26)', ring: '#cf463c' }
/** Hint highlight — a black ring, clearly distinct from the blue selection. */
export const HINT_BLACK = { wash: 'rgba(0, 0, 0, 0.16)', ring: '#000' }
/** Room outline drawn inside the walls of the hovered cell's room. */
export const ROOM_HL = '#5a8be0'
/** Opacity a candidate highlight fades to when it is no longer a real option — the
 *  suspect is already placed, or the cell is crossed off / taken by another figure. A
 *  flat factor (never stacked) so live candidates stand out. Single source of truth. */
export const HIGHLIGHT_DIM = 0.7
