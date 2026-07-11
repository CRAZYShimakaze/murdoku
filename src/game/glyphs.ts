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
  hay: '🌾', // palette/dropdown chip only — the board draws a hand-painted haystack
  candle: '🕯️', // chip only — the board draws a hand-painted candelabra
  fireplace: '🔥', // chip only — the board draws a hand-painted stone hearth
  barrel: '🛢️', // chip only — the board draws a hand-painted wooden barrel
  armor: '🛡️', // chip only — the board draws a hand-painted suit of armor
  weaponrack: '⚔️', // chip only — the board draws a hand-painted weapon rack
  throne: '👑', // chip only — the board draws a hand-painted throne
  deckchair: '🏖️', // chip only — the board draws a hand-painted sun lounger
  parasol: '⛱️', // chip only — the board draws a hand-painted top-down parasol
  slide: '🛝', // chip only — the board draws a hand-painted water slide
  divingboard: '🏊', // chip only — the board draws a hand-painted springboard
  carriage: '🛺', // chip only — the board draws a hand-painted horse-drawn coach
  hottub: '🛁', // chip only — the board draws a hand-painted top-down hot tub
  hammock: '🛌', // chip only — the board draws a hand-painted hammock
  street: '🛣️', // editor palette chip only — the board draws a hand-painted asphalt road
  path: '🛤️', // editor palette chip only — the board draws a hand-painted dirt trail
  waterlily: '🪷', // palette/dropdown chip only — the board draws hand-painted lily pads
  bench: '🛋️', // chip only (no bench emoji exists) — the board draws a hand-painted park bench
  lion: '🦁', // chip only — the board draws a hand-painted lion
  monkey: '🐒', // chip only — the board draws a hand-painted monkey
  goat: '🐐', // chip only — the board draws a hand-painted goat
  parrot: '🦜', // chip only — the board draws a hand-painted macaw on its stand
  penguin: '🐧', // chip only — the board draws a hand-painted penguin on an ice floe
  flamingo: '🦩', // chip only — the board draws a hand-painted flamingo in shallow water
  elephant: '🐘', // chip only — the board draws a hand-painted elephant
  sled: '🛷', // chip only — the board draws a hand-painted Davos sled
  gondola: '🚠', // chip only — the board draws a hand-painted cable-car cabin
  snowman: '⛄', // chip only — the board draws a hand-painted snowman
  skirack: '🎿', // chip only — the board draws a hand-painted ski rack
  blackboard: '🟩', // chip only (no blackboard emoji) — the board draws a hand-painted easel board
  skeleton: '💀', // chip only — the board draws a hand-painted anatomy skeleton
  gymmat: '🟦', // chip only — the board draws a hand-painted top-down gym mat
  wheelchair: '♿', // chip only — the board draws a hand-painted wheelchair
  ivdrip: '💉', // chip only — the board draws a hand-painted IV drip stand
  paravent: '🚧', // chip only (closest match) — the board draws a hand-painted folding screen
}
