import type { ClueJson } from '../engine/index.ts'
import type { AttributeValue, Direction8, LineKind, RoomRel } from '../engine/index.ts'

/**
 * The flat clue builder: a suspect's clue is a list of conditions joined by ONE
 * connector (UND/ODER), each optionally negated (NICHT). This module owns the
 * editor-side condition shape and turns it into engine `ClueJson`.
 */

export type CondKind =
  | 'inRoom'
  | 'onObject'
  | 'uniqueOnObject'
  | 'nearObject'
  | 'nearWindow'
  | 'uniqueNearWindow'
  | 'nearDoor'
  | 'inside'
  | 'outside'
  | 'inRow'
  | 'inCol'
  | 'corner'
  | 'atWall'
  | 'alone'
  | 'notAlone'
  | 'sameRoom'
  | 'direction'
  | 'insideXor'
  | 'roomAttribute'
  | 'sameLineAsObject'
  | 'directionFromObject'

/** Condition kinds the user can pick, in menu order. */
export const COND_KINDS: CondKind[] = [
  'inRoom',
  'onObject',
  'uniqueOnObject',
  'nearObject',
  'sameLineAsObject',
  'directionFromObject',
  'nearWindow',
  'uniqueNearWindow',
  'nearDoor',
  'inside',
  'outside',
  'inRow',
  'inCol',
  'corner',
  'atWall',
  'alone',
  'notAlone',
  'sameRoom',
  'direction',
  'insideXor',
  'roomAttribute',
]

/** Line a person can share with an object (column / row / either). */
export const LINE_KINDS: LineKind[] = ['col', 'row', 'either']
/** Room qualifier for object clues (no constraint / same / different room). */
export const ROOM_RELS: RoomRel[] = ['any', 'same', 'other']
/** Eight compass directions, offered by BOTH the person- and object-direction
 *  clues (cardinals = half-plane, diagonals = both cardinals at once). */
export const DIRECTIONS_8: Direction8[] = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
]

export type Quantifier = 'none' | 'some' | 'all'
export const QUANTIFIERS: Quantifier[] = ['none', 'some', 'all']

/** Attributes usable in a room-attribute clue → the value they imply. */
export type AttrKind = 'beard' | 'glasses' | 'bald' | 'hair'
export const ATTR_KINDS: AttrKind[] = ['beard', 'glasses', 'bald', 'hair']
export const HAIR_COLORS = ['blond', 'brown', 'black', 'red', 'grey', 'white']

/** One row in the builder. Optional fields apply only to the matching `kind`. */
export interface Condition {
  kind: CondKind
  not: boolean
  room?: string // inRoom — room id char
  object?: string // onObject / nearObject — object TYPE (e.g. "chair")
  index?: number // inRow / inCol — 0-based line index
  of?: string // sameRoom / direction — other suspect id
  dir?: Direction8 // direction / directionFromObject — 8 compass directions
  quantifier?: Quantifier // roomAttribute
  attribute?: AttrKind // roomAttribute
  hair?: string // roomAttribute, when attribute === "hair"
  line?: LineKind // sameLineAsObject — column / row / either
  roomRel?: RoomRel // sameLineAsObject / directionFromObject — room qualifier
}

export interface ClueGroup {
  connector: 'and' | 'or'
  conditions: Condition[]
}

export function emptyClueGroup(): ClueGroup {
  return { connector: 'and', conditions: [] }
}

/** The (attribute, value) a room-attribute condition encodes. */
function attrValue(c: Condition): { attribute: string; value: AttributeValue } {
  if (c.attribute === 'hair') return { attribute: 'hair', value: c.hair ?? 'blond' }
  return { attribute: c.attribute ?? 'beard', value: true }
}

/** Convert one condition to its engine clue JSON (sans the NICHT wrapper). */
function baseJson(c: Condition): ClueJson | null {
  switch (c.kind) {
    case 'inRoom':
      return c.room ? { type: 'inRoom', room: c.room } : null
    case 'onObject':
      return c.object ? { type: 'onObject', object: c.object } : null
    case 'uniqueOnObject':
      return c.object ? { type: 'uniqueOnObject', object: c.object } : null
    case 'nearObject':
      return c.object ? { type: 'nearObject', object: c.object } : null
    case 'nearWindow':
      return { type: 'nearWindow' }
    case 'uniqueNearWindow':
      return { type: 'uniqueNearWindow' }
    case 'nearDoor':
      return { type: 'nearDoor' }
    case 'inside':
      return { type: 'inside' }
    case 'outside':
      return { type: 'outside' }
    case 'inRow':
      return { type: 'inRow', row: c.index ?? 0 }
    case 'inCol':
      return { type: 'inCol', col: c.index ?? 0 }
    case 'corner':
      return { type: 'corner' }
    case 'atWall':
      return { type: 'atWall' }
    case 'alone':
      return { type: 'alone' }
    case 'notAlone':
      return { type: 'notAlone' }
    case 'sameRoom':
      return c.of ? { type: 'sameRoom', as: c.of } : null
    case 'sameLineAsObject':
      return c.object
        ? { type: 'sameLineAsObject', object: c.object, line: c.line ?? 'col', room: c.roomRel ?? 'any' }
        : null
    case 'directionFromObject':
      return c.object
        ? { type: 'directionFromObject', object: c.object, dir: c.dir ?? 'north', room: c.roomRel ?? 'any' }
        : null
    case 'direction':
      return c.of ? { type: 'direction', of: c.of, dir: c.dir ?? 'north' } : null
    case 'insideXor':
      return c.of ? { type: 'insideXor', with: c.of } : null
    case 'roomAttribute': {
      const { attribute, value } = attrValue(c)
      return {
        type: 'roomAttribute',
        quantifier: c.quantifier ?? 'some',
        attribute,
        value,
        excludeSelf: true,
      }
    }
  }
}

function condJson(c: Condition): ClueJson | null {
  const base = baseJson(c)
  if (!base) return null
  return c.not ? { type: 'not', clue: base } : base
}

/** Turn a builder group into the `clues` array of a SuspectJson (0 or 1 entries). */
export function groupToClues(group: ClueGroup): ClueJson[] {
  const parts = group.conditions.map(condJson).filter((j): j is ClueJson => j !== null)
  if (parts.length === 0) return []
  if (parts.length === 1) return [parts[0]]
  return [{ type: group.connector, clues: parts }]
}

/** A fresh condition of a given kind, with sensible defaults for its fields. */
export function defaultCondition(
  kind: CondKind,
  ctx: { rooms: string[]; objects: string[]; others: { id: string }[] },
): Condition {
  return {
    kind,
    not: false,
    room: ctx.rooms[0],
    object: ctx.objects[0],
    index: 0,
    of: ctx.others[0]?.id,
    dir: 'north',
    quantifier: 'some',
    attribute: 'beard',
    hair: 'blond',
    line: 'col',
    roomRel: 'any',
  }
}
