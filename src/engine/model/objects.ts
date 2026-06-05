/**
 * The catalog of board objects — the SINGLE source of truth shared by the editor
 * (which paints them) and the generator (which places them). Each entry has a map
 * char, a `type` (used as the i18n + glyph key), whether a person may stand on its
 * tile (`occupiable`), and which layer it sits on:
 *   - 'ground': drawn beneath people (carpet) — a person can share the tile;
 *   - 'top':    the tile's object (chair, table, …); occupiable ones (chair/bed/
 *               car/horse/mud/oil) let a person sit on them, the rest block the tile.
 */
export interface ObjectDef {
  char: string
  type: string
  occupiable: boolean
  layer: 'ground' | 'top'
}

export const OBJECT_CATALOG: ObjectDef[] = [
  { char: 'r', type: 'carpet', occupiable: true, layer: 'ground' },
  { char: 's', type: 'chair', occupiable: true, layer: 'top' },
  { char: 'b', type: 'bed', occupiable: true, layer: 'top' },
  { char: 'c', type: 'car', occupiable: true, layer: 'top' },
  { char: 't', type: 'table', occupiable: false, layer: 'top' },
  { char: 'f', type: 'tv', occupiable: false, layer: 'top' },
  { char: 'p', type: 'plant', occupiable: false, layer: 'top' },
  { char: 'g', type: 'shelf', occupiable: false, layer: 'top' },
  { char: 'x', type: 'box', occupiable: false, layer: 'top' },
  { char: 'u', type: 'shrub', occupiable: false, layer: 'top' },
  { char: 'y', type: 'statue', occupiable: false, layer: 'top' },
  { char: 'z', type: 'rubble', occupiable: false, layer: 'top' },
  { char: 'h', type: 'horse', occupiable: true, layer: 'top' },
  { char: 'm', type: 'mud', occupiable: true, layer: 'top' },
  { char: 'k', type: 'cow', occupiable: false, layer: 'top' },
  { char: 'i', type: 'pig', occupiable: false, layer: 'top' },
  { char: 'o', type: 'boulder', occupiable: false, layer: 'top' },
  { char: 'e', type: 'gift', occupiable: false, layer: 'top' },
  { char: 'd', type: 'pc', occupiable: false, layer: 'top' },
  { char: 'l', type: 'locker', occupiable: false, layer: 'top' },
  { char: 'q', type: 'punchbag', occupiable: false, layer: 'top' },
  { char: 'v', type: 'fuelpump', occupiable: false, layer: 'top' },
  { char: 'a', type: 'tree', occupiable: false, layer: 'top' },
  { char: 'w', type: 'trash', occupiable: false, layer: 'top' },
  { char: 'j', type: 'oil', occupiable: true, layer: 'top' },
  { char: 'K', type: 'cash', occupiable: false, layer: 'top' },
  { char: 'n', type: 'crate', occupiable: false, layer: 'top' },
]

/** Object types a person can stand on (carpet, chair, bed, car, horse, mud, oil). */
export const OCCUPIABLE_OBJECT_TYPES: string[] = OBJECT_CATALOG.filter((o) => o.occupiable).map(
  (o) => o.type,
)
/** Object types that block their tile (table, plant, shelf, …). */
export const BLOCKING_OBJECT_TYPES: string[] = OBJECT_CATALOG.filter((o) => !o.occupiable).map(
  (o) => o.type,
)
