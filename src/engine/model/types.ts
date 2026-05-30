/** A cell is a flat index into the grid: `row * width + col`. */
export type Cell = number

/** Stable identifier of a person on the board (suspect id like "A", or the victim). */
export type PersonId = string

/** Internal id used for the victim person. */
export const VICTIM_ID: PersonId = 'victim'

/** Cardinal directions for relational clues ("south of X"). */
export type Direction = 'north' | 'south' | 'east' | 'west'

/** Which side of a tile an edge (e.g. a window) sits on. */
export type Side = 'N' | 'E' | 'S' | 'W'

/** Attribute values a suspect can carry (gender, beard, …). */
export type AttributeValue = string | number | boolean

/**
 * A renderable, language-independent description.
 * `key` is an i18n key; `params` are interpolated into the template.
 * Never contains hard-coded display text — the UI/runner resolves it.
 */
export interface Explanation {
  key: string
  params?: Record<string, string | number>
  /** Nested explanations for composite clues (and / or / not). */
  children?: Explanation[]
}
