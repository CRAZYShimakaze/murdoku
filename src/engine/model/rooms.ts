/**
 * Water rooms — a lake / sea / ocean area. They are drawn as a WATER surface with grassy
 * banks (see the board renderer) and furnished by the `lake` archetype, but mechanically
 * a water room is a perfectly NORMAL room: its empty floor is occupiable, so a person can
 * stand in the water just like on any floor (the legend states this as a global rule).
 *
 * This is the single source of truth shared by the generator (furnishing → archetype),
 * the board renderer (water look) and the legend (the "walkable" hint). `pond` is left
 * OUT on purpose — it stays a green garden, not open water.
 */
// moat (castle) and the two swimming pools (lido) count as water too — they get the
// water look and (except the pools, which use the sparse 'pool' recipe) lake furnishing.
const WATER_ROOM_KEYS: ReadonlySet<string> = new Set([
  'lake',
  'jetty',
  'sea',
  'ocean',
  'lagoon',
  'moat',
  'mainpool',
  'kidspool',
  'penguinpool', // zoo — penguins on their floes get the water look
  'flamingopond', // zoo — the ONE pond that IS water (the garden 'pond' stays green)
])

/** True when a room's nameKey (with or without the `room.` prefix) names a body of water. */
export function isWaterRoom(nameKey: string): boolean {
  const key = nameKey.replace(/^room\./, '').toLowerCase()
  return WATER_ROOM_KEYS.has(key) || /lake|ocean|lagoon|sea/.test(key)
}

/**
 * Winter rooms — snowed-in outdoor areas of the ski resort. Purely COSMETIC (unlike
 * water rooms they change no recipe on their own): the board renderer swaps the tree
 * and boulder art for their snowy variants there, exactly like the slide picks its
 * water look from context. The regex also catches German editor-typed room names
 * ("Piste", "Rodelbahn", "Schneewiese", …), so hand-built winter levels work too.
 */
const WINTER_ROOM_KEYS: ReadonlySet<string> = new Set([
  'piste',
  'beginnerhill',
  'sledrun',
  'icerink',
  'igloo',
  'valleystation',
  'topstation',
])

/** True when a room's nameKey (or editor-typed name) reads as a snowy winter area. */
export function isWinterRoom(nameKey: string): boolean {
  const key = nameKey.replace(/^room\./, '').toLowerCase()
  return WINTER_ROOM_KEYS.has(key) || /schnee|piste|rodel|iglu|gletscher|eisbahn|winter|snow|glacier/.test(key)
}
