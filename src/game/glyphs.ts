/**
 * Placeholder emoji glyphs for game objects. Real artwork replaces these later;
 * the mapping stays the single source of truth so swapping art is one edit here.
 *
 * `carpet` is intentionally absent — it is an occupiable ground layer rendered as
 * a tinted rug rectangle by the board renderer, not as a centred glyph.
 */
export const OBJECT_GLYPHS: Record<string, string> = {
  table: '🍽️',
  chair: '🪑',
  tv: '📺',
  bed: '🛏️',
  plant: '🪴',
  shrub: '🌿',
  shelf: '📚',
  box: '📦',
  statue: '🗿',
  rubble: '🧱',
  window: '🪟',
  door: '🚪',
  car: '🚗',
  cow: '🐄',
  horse: '🐎',
  pig: '🐖',
  mud: '🟤', // legend chip only — the board draws a hand-painted puddle
  boulder: '🪨',
  gift: '🎁',
  pc: '🖥️',
  fuelpump: '⛽',
  tree: '🌳',
  trash: '🗑️',
  locker: '🗄️', // legend chip only — the board draws a hand-painted locker
  punchbag: '🥊', // legend chip only — the board draws a hand-painted punching bag
  oil: '🛢️', // legend chip only — the board draws a hand-painted oil slick
  cash: '💰', // legend chip only — the board draws a hand-painted cash register
  crate: '🪵', // legend chip only — the board draws a hand-painted wooden crate
  toilet: '🚽',
  chicken: '🐓', // full-body bird (🐔 is only a head) to match the cow/pig/horse glyphs
  lamp: '💡', // generator/dropdown chip only — the board draws a hand-painted floor lamp
  washingmachine: '🧺', // generator/dropdown chip only — the board draws a hand-painted washer
  fridge: '🧊', // generator/dropdown chip only — the board draws a hand-painted fridge
}

/** Small chips shown on suspect cards so attribute clues are playable. */
export const ATTR_CHIPS: Record<string, (value: unknown) => string | null> = {
  beard: (v) => (v === true ? '🧔 ' : null),
  glasses: (v) => (v === true ? '👓' : null),
  bald: (v) => (v === true ? '🧑‍🦲' : null),
  gender: (v) => (v === 'f' ? '♀' : v === 'm' ? '♂' : null),
}
