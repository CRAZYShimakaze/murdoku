/**
 * The catalog of board objects — the SINGLE source of truth shared by the editor
 * (which paints them) and the generator (which places them). Each entry has a map
 * char, a `type` (used as the i18n + glyph key), whether a person may stand on its
 * tile (`occupiable`), and which layer it sits on:
 *   - 'ground': drawn beneath people (carpet) — a person can share the tile;
 *   - 'top':    the tile's object (chair, table, …); occupiable ones (chair/bench/bed/
 *               car/boat/sled/gondola/horse/mud/oil/toilet/shower) let a person stand on
 *               them, the rest block.
 */
export interface ObjectDef {
  char: string
  type: string
  occupiable: boolean
  layer: 'ground' | 'top'
}

// Ordered by theme so the editor palette / generator list group sensibly:
// occupiable first (floor, seating, vehicle, ride-animal, terrain), then blocking
// grouped as furniture/appliances → containers → shop & gym → plants → animals →
// outdoor/decor. Chars are arbitrary, stable tokens (case-sensitive) for level maps.
export const OBJECT_CATALOG: ObjectDef[] = [
  // --- occupiable (a person can stand/sit on the tile), grouped by kind:
  //     floor → seats/lying → vehicles → camping → wellness/sanitary → lido → animal → terrain.
  //     (Letters are all taken — digits work exactly the same as map chars.)
  { char: 'r', type: 'carpet', occupiable: true, layer: 'ground' },
  { char: 'R', type: 'street', occupiable: true, layer: 'ground' },
  { char: '4', type: 'path', occupiable: true, layer: 'ground' }, // dirt trail (camping, castle)
  { char: 's', type: 'chair', occupiable: true, layer: 'top' },
  { char: '0', type: 'bench', occupiable: true, layer: 'top' }, // park bench (zoo, playground, garden)
  { char: 'D', type: 'deckchair', occupiable: true, layer: 'top' }, // sun lounger
  { char: 'J', type: 'throne', occupiable: true, layer: 'top' }, // one SITS on a throne
  { char: '@', type: 'wheelchair', occupiable: true, layer: 'top' }, // one sits IN it (hospital)
  { char: 'b', type: 'bed', occupiable: true, layer: 'top' },
  { char: 'c', type: 'car', occupiable: true, layer: 'top' },
  { char: '2', type: 'carriage', occupiable: true, layer: 'top' }, // 2-cell, one sits IN it
  { char: 'O', type: 'boat', occupiable: true, layer: 'top' }, // 2-cell, water only (like car/bed)
  { char: '&', type: 'sled', occupiable: true, layer: 'top' }, // one sits on it (ski resort)
  { char: '=', type: 'gondola', occupiable: true, layer: 'top' }, // cable car cabin, one sits IN it
  { char: 'Z', type: 'tent', occupiable: true, layer: 'top' },
  { char: '7', type: 'hammock', occupiable: true, layer: 'top' }, // one lies IN it
  { char: '8', type: 'hottub', occupiable: true, layer: 'top' }, // one sits IN it
  { char: 'S', type: 'shower', occupiable: true, layer: 'top' },
  { char: 'T', type: 'toilet', occupiable: true, layer: 'top' },
  { char: 'U', type: 'parasol', occupiable: true, layer: 'top' }, // one stands UNDER it
  { char: '^', type: 'paravent', occupiable: true, layer: 'top' }, // one stands BEHIND the folding screen
  { char: '~', type: 'gymmat', occupiable: true, layer: 'top' }, // one stands ON the gym mat
  { char: 'X', type: 'divingboard', occupiable: true, layer: 'top' }, // one stands ON it
  // ONE slide type: the renderer looks around — exiting into a water room it draws
  // the water slide (splashing in), otherwise the playground slide.
  { char: 'V', type: 'slide', occupiable: true, layer: 'top' },
  { char: 'h', type: 'horse', occupiable: true, layer: 'top' },
  { char: 'm', type: 'mud', occupiable: true, layer: 'top' },
  { char: 'j', type: 'oil', occupiable: true, layer: 'top' },
  { char: 'Y', type: 'waterlily', occupiable: true, layer: 'top' },
  // --- blocking: indoor furniture & appliances ---
  { char: 't', type: 'table', occupiable: false, layer: 'top' },
  { char: 'f', type: 'tv', occupiable: false, layer: 'top' },
  { char: 'g', type: 'shelf', occupiable: false, layer: 'top' },
  { char: 'd', type: 'pc', occupiable: false, layer: 'top' },
  { char: 'l', type: 'locker', occupiable: false, layer: 'top' },
  { char: 'W', type: 'washingmachine', occupiable: false, layer: 'top' },
  { char: 'F', type: 'fridge', occupiable: false, layer: 'top' },
  { char: 'L', type: 'lamp', occupiable: false, layer: 'top' },
  { char: 'P', type: 'piano', occupiable: false, layer: 'top' },
  // --- blocking: containers ---
  { char: 'x', type: 'box', occupiable: false, layer: 'top' },
  { char: 'n', type: 'crate', occupiable: false, layer: 'top' },
  { char: 'e', type: 'gift', occupiable: false, layer: 'top' },
  // --- blocking: shop / gym / station ---
  { char: 'K', type: 'cash', occupiable: false, layer: 'top' },
  { char: 'q', type: 'punchbag', occupiable: false, layer: 'top' },
  { char: 'v', type: 'fuelpump', occupiable: false, layer: 'top' },
  { char: 'w', type: 'trash', occupiable: false, layer: 'top' },
  // --- blocking: plants ---
  { char: 'p', type: 'plant', occupiable: false, layer: 'top' },
  { char: 'u', type: 'shrub', occupiable: false, layer: 'top' },
  { char: 'a', type: 'tree', occupiable: false, layer: 'top' },
  // --- blocking: animals (letters ran out — digits/symbols work the same) ---
  { char: 'k', type: 'cow', occupiable: false, layer: 'top' },
  { char: 'i', type: 'pig', occupiable: false, layer: 'top' },
  { char: 'H', type: 'chicken', occupiable: false, layer: 'top' },
  { char: '5', type: 'goat', occupiable: false, layer: 'top' }, // petting zoo
  { char: 'B', type: 'bear', occupiable: false, layer: 'top' },
  { char: '1', type: 'lion', occupiable: false, layer: 'top' }, // zoo
  { char: '3', type: 'monkey', occupiable: false, layer: 'top' }, // zoo
  { char: '%', type: 'elephant', occupiable: false, layer: 'top' }, // zoo
  { char: '6', type: 'parrot', occupiable: false, layer: 'top' }, // zoo aviary (on a stand)
  { char: '9', type: 'penguin', occupiable: false, layer: 'top' }, // zoo, water rooms only
  { char: '!', type: 'flamingo', occupiable: false, layer: 'top' }, // zoo, water rooms only
  // --- blocking: outdoor / decor ---
  { char: 'A', type: 'hay', occupiable: false, layer: 'top' }, // haystack (farm/camping)
  { char: 'y', type: 'statue', occupiable: false, layer: 'top' },
  { char: 'o', type: 'boulder', occupiable: false, layer: 'top' },
  { char: 'z', type: 'rubble', occupiable: false, layer: 'top' },
  // --- blocking: camping / wilderness ---
  { char: 'G', type: 'campfire', occupiable: false, layer: 'top' },
  { char: 'M', type: 'grill', occupiable: false, layer: 'top' },
  // --- blocking: ski resort / winter ---
  { char: '*', type: 'snowman', occupiable: false, layer: 'top' },
  { char: '+', type: 'skirack', occupiable: false, layer: 'top' },
  // --- blocking: school & clinic ---
  { char: '#', type: 'blackboard', occupiable: false, layer: 'top' },
  { char: '$', type: 'skeleton', occupiable: false, layer: 'top' }, // anatomy model on its stand
  { char: '?', type: 'ivdrip', occupiable: false, layer: 'top' }, // IV drip stand
  // --- blocking: castle ---
  { char: 'C', type: 'candle', occupiable: false, layer: 'top' }, // candelabra
  { char: 'E', type: 'fireplace', occupiable: false, layer: 'top' },
  { char: 'Q', type: 'barrel', occupiable: false, layer: 'top' },
  { char: 'I', type: 'armor', occupiable: false, layer: 'top' }, // suit of armor
  { char: 'N', type: 'weaponrack', occupiable: false, layer: 'top' },
]

/**
 * Types the editor can paint but the GENERATOR must NOT scatter. A street or a path
 * has to be laid as one CONTINUOUS run (it must connect up), so they are placed by
 * hand in the editor only; auto-furnishing would drop disconnected tiles everywhere.
 */
export const EDITOR_ONLY_TYPES: ReadonlySet<string> = new Set(['street', 'path'])

/**
 * Object types whose orthogonally-adjacent same-room cells form ONE object instance:
 * a table surface auto-merges into one big table, a bed/car/boat/carriage spans two
 * cells, a carpet/street/path is one continuous surface. Everything else — chairs
 * above all — is COUNTED INDIVIDUALLY (two chairs side by side are two chairs, never
 * "the same chair"). Shared by "beside the same object" instances AND by "beside an
 * object" (standing ON an instance never makes you "beside" THAT instance, but a
 * second instance right next door does).
 */
export const MERGE_INSTANCE_TYPES: ReadonlySet<string> = new Set([
  'table',
  'bed',
  'car',
  'carriage',
  'boat',
  'carpet',
  'street',
  'path',
])

/** Object types a person can stand on (carpet, chair, bed, car, horse, mud, oil). */
export const OCCUPIABLE_OBJECT_TYPES: string[] = OBJECT_CATALOG.filter((o) => o.occupiable).map(
  (o) => o.type,
)
/** Object types that block their tile (table, plant, shelf, …). */
export const BLOCKING_OBJECT_TYPES: string[] = OBJECT_CATALOG.filter((o) => !o.occupiable).map(
  (o) => o.type,
)
