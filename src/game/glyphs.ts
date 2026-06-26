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
  boat: '🛶', // palette/dropdown chip only — the board draws a hand-painted rowing boat
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
  shower: '🚿', // generator/dropdown chip only — the board draws a hand-painted shower
  piano: '🎹', // generator/dropdown chip only — the board draws a hand-painted piano
  bear: '🐻', // generator/dropdown chip only — the board draws a hand-painted bear
  chicken: '🐓', // full-body bird (🐔 is only a head) to match the cow/pig/horse glyphs
  lamp: '💡', // generator/dropdown chip only — the board draws a hand-painted floor lamp
  washingmachine: '🧺', // generator/dropdown chip only — the board draws a hand-painted washer
  fridge: '🧊', // generator/dropdown chip only — the board draws a hand-painted fridge
  tent: '⛺', // palette/dropdown chip only — the board draws a hand-painted tent
  campfire: '🔥', // palette/dropdown chip only — the board draws a hand-painted campfire
  grill: '🍖', // palette/dropdown chip only — the board draws a hand-painted kettle grill
  street: '🛣️', // editor palette chip only — the board draws a hand-painted asphalt road
  waterlily: '🪷', // palette/dropdown chip only — the board draws hand-painted lily pads
}
