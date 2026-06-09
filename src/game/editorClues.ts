import { OCCUPIABLE_OBJECT_TYPES } from '../engine/index.ts'
import type { ClueJson } from '../engine/index.ts'
import type { AttributeValue, Direction, Direction8, LineKind, RoomRel } from '../engine/index.ts'
import { BEARD_STYLES, GLASSES_COLORS, GLASSES_SHAPES, HAIRSTYLE_IDS } from './avatar.ts'

/**
 * The flat clue builder: a suspect's clue is a list of conditions joined by ONE
 * connector (UND/ODER), each optionally negated (NICHT). This module owns the
 * editor-side condition shape and turns it into engine `ClueJson`.
 */

export type CondKind =
  | 'inRoom' // + optional "allein" (alone/notAlone in that room)
  | 'onObject' // + optional "einzige" (unique)
  | 'nearObject' // + optional "einzige"
  | 'portal' // window / door, + optional "einzige"
  | 'inout' // inside / outside, + optional "einzige"
  | 'line' // row / column + value
  | 'corner'
  | 'atWall'
  | 'sameRoom'
  | 'direction'
  | 'offset' // exactly N cells in a cardinal direction of a person
  | 'insideXor'
  | 'roomAttribute'
  | 'roomExists' // someone with a trait sat on an object in the subject's room
  | 'aloneWith' // alone with a named person + N others matching a trait
  | 'sameLineAsObject'
  | 'directionFromObject'
  | 'sameObject' // beside the same object instance as a person / trait / anyone
  // Round-trip only (not offered as fresh entries): the room-agnostic alone clues,
  // kept so older / generated levels using them still open in the editor.
  | 'alone'
  | 'notAlone'

/** Condition kinds the user can pick, in menu order. (`portal` is filtered out by
 *  the builder when the board has neither windows nor doors.) */
export const COND_KINDS: CondKind[] = [
  'inRoom',
  'onObject',
  'nearObject',
  'sameLineAsObject',
  'directionFromObject',
  'sameObject',
  'portal',
  'inout',
  'line',
  'corner',
  'atWall',
  'sameRoom',
  'direction',
  'offset',
  'insideXor',
  'roomAttribute',
  'roomExists',
  'aloneWith',
]

/** Window vs door, for the merged "Fenster/Tür" condition. */
export type PortalKind = 'window' | 'door'
/** Inside vs outside, for the merged "Drinnen/Draußen" condition. */
export type InOutKind = 'inside' | 'outside'
/** Row vs column, for the merged "Zeile/Spalte" condition. */
export type AxisKind = 'row' | 'col'
/** The four cardinal directions (offset / aloneWith-direction use these). */
export const CARDINALS: Direction[] = ['north', 'south', 'east', 'west']

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
export type AttrKind =
  | 'gender'
  | 'beard'
  | 'beardStyle'
  | 'glasses'
  | 'glassesShape'
  | 'glassesColor'
  | 'bald'
  | 'hair'
  | 'hairstyle'
export const ATTR_KINDS: AttrKind[] = [
  'gender',
  'beard',
  'beardStyle',
  'glasses',
  'glassesShape',
  'glassesColor',
  'bald',
  'hair',
  'hairstyle',
]
export const HAIR_COLORS = ['blond', 'brown', 'black', 'red', 'grey', 'white']
/** Boolean traits (no value to pick — they're either present or not). */
export const BOOL_ATTRS: AttrKind[] = ['beard', 'glasses', 'bald']

/**
 * Valued attributes → their allowed values + the i18n prefix for the short
 * dropdown labels. Boolean attributes (beard/glasses/bald) are absent here.
 * Single source for both the clue value picker and the suspect-editor dropdowns.
 */
export const VALUED_ATTRS: Record<string, { values: string[]; labelKey: string }> = {
  gender: { values: ['m', 'f'], labelKey: 'genderVal' },
  hair: { values: HAIR_COLORS, labelKey: 'hairColor' },
  hairstyle: { values: [...HAIRSTYLE_IDS], labelKey: 'hairstyle' },
  beardStyle: { values: [...BEARD_STYLES], labelKey: 'beardStyle' },
  glassesShape: { values: [...GLASSES_SHAPES], labelKey: 'glassesShape' },
  glassesColor: { values: [...GLASSES_COLORS], labelKey: 'glassesColor' },
}

/** One row in the builder. Optional fields apply only to the matching `kind`. */
export interface Condition {
  kind: CondKind
  not: boolean
  room?: string // inRoom — room id char
  object?: string // onObject / nearObject / sameRoom(object variant) — object TYPE
  index?: number // line — 0-based row/column index
  of?: string // sameRoom(person variant) / direction / insideXor — other suspect id
  dir?: Direction8 // direction / directionFromObject — 8 compass directions
  quantifier?: Quantifier // roomAttribute
  attribute?: AttrKind // roomAttribute / sameRoom(attr variant)
  value?: string // valued attribute (gender, hair, hairstyle, …)
  hair?: string // legacy roomAttribute value (read for old drafts; new ones use `value`)
  line?: LineKind // sameLineAsObject — column / row / either
  roomRel?: RoomRel // sameLineAsObject / directionFromObject — room qualifier
  alone?: boolean // sameRoom / inRoom — also requires being alone (no one else in the room)
  unique?: boolean // onObject / nearObject / portal / inout — the ONLY person there
  portal?: PortalKind // portal — window or door
  side?: InOutKind // inout — inside or outside
  axis?: AxisKind // line — row or column
  roomTarget?: 'person' | 'object' | 'attr' // sameRoom — what the room is shared with
  dist?: number // offset — exact distance (≥1) in the cardinal direction
  objects?: string[] // nearObject — beside one of these object TYPES (1 = single, ≥2 = any)
  extraCount?: number // aloneWith — how many extra matching people share the room
  aloneDir?: 'none' | Direction // aloneWith — one extra is in this cardinal direction
  objTarget?: 'any' | 'person' | 'attr' // sameObject — who else is beside the same object
  objDir?: 'none' | Direction8 // sameObject — optional direction of the mate from subject
}

export interface ClueGroup {
  connector: 'and' | 'or'
  conditions: Condition[]
}

export function emptyClueGroup(): ClueGroup {
  return { connector: 'and', conditions: [] }
}

/** The (attribute, value) a room-attribute / companion condition encodes. */
function attrValue(c: Condition): { attribute: string; value: AttributeValue } {
  const attribute = c.attribute ?? 'beard'
  const spec = VALUED_ATTRS[attribute]
  if (spec) return { attribute, value: c.value ?? c.hair ?? spec.values[0] }
  return { attribute, value: true } // boolean traits: beard / glasses / bald
}

/** Convert one condition to its engine clue JSON (sans the NICHT wrapper).
 *  NOTE: `inRoom` folds its own NICHT in (see `condJson`). */
function baseJson(c: Condition): ClueJson | null {
  switch (c.kind) {
    case 'inRoom': {
      if (!c.room) return null
      // "allein" on → alone/not-alone in the room (NICHT flips which); off → plain
      // room membership (the wrapper applies NICHT as "not in the room").
      if (c.alone) return { type: 'inRoom', room: c.room, occupancy: c.not ? 'notAlone' : 'alone' }
      return { type: 'inRoom', room: c.room }
    }
    case 'onObject':
      if (!c.object) return null
      return c.unique
        ? { type: 'uniqueOnObject', object: c.object }
        : { type: 'onObject', object: c.object }
    case 'nearObject': {
      // Multi-select: one object → nearObject (with optional "einzige"); several →
      // nearObjectAny ("beside one of these"). Avoids a separate clue type.
      const objs = c.objects ?? []
      if (objs.length === 0) return null
      if (objs.length === 1) {
        return c.unique
          ? { type: 'uniqueNearObject', object: objs[0] }
          : { type: 'nearObject', object: objs[0] }
      }
      return { type: 'nearObjectAny', objects: objs }
    }
    case 'portal':
      return c.portal === 'door'
        ? c.unique
          ? { type: 'uniqueNearDoor' }
          : { type: 'nearDoor' }
        : c.unique
          ? { type: 'uniqueNearWindow' }
          : { type: 'nearWindow' }
    case 'inout':
      return c.side === 'outside'
        ? c.unique
          ? { type: 'uniqueOutside' }
          : { type: 'outside' }
        : c.unique
          ? { type: 'uniqueInside' }
          : { type: 'inside' }
    case 'line':
      return c.axis === 'col'
        ? { type: 'inCol', col: c.index ?? 0 }
        : { type: 'inRow', row: c.index ?? 0 }
    case 'corner':
      return { type: 'corner' }
    case 'atWall':
      return { type: 'atWall' }
    case 'alone':
      return { type: 'alone' }
    case 'notAlone':
      return { type: 'notAlone' }
    case 'sameRoom': {
      // One dropdown offers people, objects AND attributes ("a woman", "someone with
      // glasses", …). The optional `alone` flag tightens it to "only the two of them".
      const alone = c.alone ? { alone: true as const } : {}
      const target = c.roomTarget ?? (c.object ? 'object' : 'person')
      if (target === 'attr') {
        const { attribute, value } = attrValue(c)
        return c.alone
          ? { type: 'roomCompanion', count: 1, attribute, value }
          : { type: 'roomAttribute', quantifier: 'some', attribute, value, excludeSelf: true }
      }
      if (target === 'object') {
        return c.object ? { type: 'sameRoomAsObject', object: c.object, ...alone } : null
      }
      return c.of ? { type: 'sameRoom', as: c.of, ...alone } : null
    }
    case 'sameLineAsObject':
      return c.object
        ? { type: 'sameLineAsObject', object: c.object, line: c.line ?? 'col', room: c.roomRel ?? 'any' }
        : null
    case 'directionFromObject':
      return c.object
        ? { type: 'directionFromObject', object: c.object, dir: c.dir ?? 'north', room: c.roomRel ?? 'any' }
        : null
    case 'sameObject': {
      if (!c.object) return null
      const kind = c.objTarget ?? 'any'
      const dir = c.objDir && c.objDir !== 'none' ? c.objDir : undefined
      const mate =
        kind === 'person'
          ? c.of
            ? ({ kind: 'person', of: c.of } as const)
            : null
          : kind === 'attr'
            ? ({ kind: 'attr', ...attrValue(c) } as const)
            : ({ kind: 'any' } as const)
      if (!mate) return null
      return { type: 'besideSameObject', object: c.object, mate, ...(dir ? { dir } : {}) }
    }
    case 'direction':
      return c.of ? { type: 'direction', of: c.of, dir: c.dir ?? 'north' } : null
    case 'offset':
      return c.of
        ? { type: 'offset', of: c.of, dir: (c.dir as Direction) ?? 'east', distance: Math.max(1, c.dist ?? 1) }
        : null
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
    case 'roomExists': {
      const { attribute, value } = attrValue(c)
      return c.object ? { type: 'roomExists', attribute, value, object: c.object } : null
    }
    case 'aloneWith': {
      if (!c.of) return null
      const { attribute, value } = attrValue(c)
      const dir = c.aloneDir && c.aloneDir !== 'none' ? c.aloneDir : undefined
      return {
        type: 'aloneWith',
        people: [c.of],
        attribute,
        value,
        extraCount: Math.max(0, c.extraCount ?? 1),
        ...(dir ? { dir } : {}),
      }
    }
  }
}

function condJson(c: Condition): ClueJson | null {
  const base = baseJson(c)
  if (!base) return null
  // "im Raum + allein" folds NICHT into alone/notAlone already — don't double-negate.
  if (c.kind === 'inRoom' && c.alone) return base
  return c.not ? { type: 'not', clue: base } : base
}

/** Turn a builder group into the `clues` array of a SuspectJson (0 or 1 entries). */
export function groupToClues(group: ClueGroup): ClueJson[] {
  const parts = group.conditions.map(condJson).filter((j): j is ClueJson => j !== null)
  if (parts.length === 0) return []
  if (parts.length === 1) return [parts[0]]
  return [{ type: group.connector, clues: parts }]
}

/** Reverse of `condJson`: turn one engine clue back into a builder condition.
 *  Returns null for clue types the flat builder can't represent (roomExists,
 *  aloneWith, offset, nearObjectAny, nested and/or). */
function jsonToCondition(json: ClueJson): Condition | null {
  let not = false
  let c: ClueJson = json
  if (c.type === 'not') {
    not = true
    c = c.clue
  }
  const make = (kind: CondKind, extra: Partial<Condition> = {}): Condition => ({
    kind,
    not,
    dir: 'north',
    line: 'col',
    roomRel: 'any',
    quantifier: 'some',
    attribute: 'beard',
    value: 'blond',
    index: 0,
    unique: false,
    portal: 'window',
    side: 'inside',
    axis: 'row',
    dist: 1,
    objects: [],
    extraCount: 1,
    aloneDir: 'none',
    objTarget: 'any',
    objDir: 'none',
    ...extra,
  })
  switch (c.type) {
    case 'inRoom':
      if (!c.occupancy) return make('inRoom', { room: c.room })
      return make('inRoom', { room: c.room, alone: true, not: c.occupancy === 'notAlone' })
    case 'onObject':
      return make('onObject', { object: c.object, unique: false })
    case 'uniqueOnObject':
      return make('onObject', { object: c.object, unique: true })
    case 'nearObject':
      return make('nearObject', { objects: [c.object], unique: false })
    case 'uniqueNearObject':
      return make('nearObject', { objects: [c.object], unique: true })
    case 'sameLineAsObject':
      return make('sameLineAsObject', { object: c.object, line: c.line, roomRel: c.room })
    case 'directionFromObject':
      return make('directionFromObject', { object: c.object, dir: c.dir, roomRel: c.room })
    case 'besideSameObject': {
      const m = c.mate
      return make('sameObject', {
        object: c.object,
        objTarget: m.kind,
        of: m.kind === 'person' ? m.of : undefined,
        attribute: m.kind === 'attr' ? (m.attribute as AttrKind) : undefined,
        value: m.kind === 'attr' && typeof m.value === 'string' ? m.value : undefined,
        objDir: c.dir ?? 'none',
      })
    }
    case 'sameRoomAsObject':
      return make('sameRoom', { roomTarget: 'object', object: c.object, alone: c.alone })
    case 'nearWindow':
      return make('portal', { portal: 'window', unique: false })
    case 'uniqueNearWindow':
      return make('portal', { portal: 'window', unique: true })
    case 'nearDoor':
      return make('portal', { portal: 'door', unique: false })
    case 'uniqueNearDoor':
      return make('portal', { portal: 'door', unique: true })
    case 'inside':
      return make('inout', { side: 'inside', unique: false })
    case 'outside':
      return make('inout', { side: 'outside', unique: false })
    case 'uniqueInside':
      return make('inout', { side: 'inside', unique: true })
    case 'uniqueOutside':
      return make('inout', { side: 'outside', unique: true })
    case 'inRow':
      return make('line', { axis: 'row', index: c.row })
    case 'inCol':
      return make('line', { axis: 'col', index: c.col })
    case 'corner':
      return make('corner')
    case 'atWall':
      return make('atWall')
    case 'alone':
      return make('alone')
    case 'notAlone':
      return make('notAlone')
    case 'sameRoom':
      return make('sameRoom', { roomTarget: 'person', of: c.as, alone: c.alone })
    case 'roomCompanion':
      // "alone with a <attribute>" → the attribute target of "same room as …".
      if (c.count !== 1) return null
      return make('sameRoom', {
        roomTarget: 'attr',
        alone: true,
        attribute: c.attribute as AttrKind,
        value: typeof c.value === 'string' ? c.value : undefined,
      })
    case 'direction':
      return make('direction', { of: c.of, dir: c.dir })
    case 'offset':
      return make('offset', { of: c.of, dir: c.dir, dist: c.distance })
    case 'insideXor':
      return make('insideXor', { of: c.with })
    case 'roomAttribute':
      return make('roomAttribute', {
        quantifier: c.quantifier,
        attribute: c.attribute as AttrKind,
        value: typeof c.value === 'string' ? c.value : undefined,
      })
    case 'roomExists':
      return make('roomExists', {
        attribute: c.attribute as AttrKind,
        value: typeof c.value === 'string' ? c.value : undefined,
        object: c.object,
      })
    case 'aloneWith':
      return make('aloneWith', {
        of: c.people[0],
        attribute: c.attribute as AttrKind,
        value: typeof c.value === 'string' ? c.value : undefined,
        extraCount: c.extraCount,
        aloneDir: c.dir ?? 'none',
      })
    case 'nearObjectAny':
      return make('nearObject', { objects: c.objects })
    default:
      return null
  }
}

/** Turn a SuspectJson `clues` array back into a builder group (inverse of
 *  `groupToClues`). Unrepresentable parts are dropped. */
export function cluesToGroup(clues: ClueJson[] | undefined): ClueGroup {
  if (!clues || clues.length === 0) return emptyClueGroup()
  const top = clues[0]
  if (top.type === 'and' || top.type === 'or') {
    const conditions = top.clues.map(jsonToCondition).filter((x): x is Condition => x !== null)
    return { connector: top.type, conditions }
  }
  const one = jsonToCondition(top)
  return { connector: 'and', conditions: one ? [one] : [] }
}

/** A fresh condition of a given kind, with sensible defaults for its fields. */
export function defaultCondition(
  kind: CondKind,
  ctx: {
    rooms: string[]
    objects: string[]
    others: { id: string }[]
    hasWindows?: boolean
    hasDoors?: boolean
  },
): Condition {
  return {
    kind,
    not: false,
    room: ctx.rooms[0],
    // "on object" / roomExists clues need a tile a person can stand ON; pre-pick an
    // occupiable object for those.
    object:
      kind === 'onObject' || kind === 'roomExists'
        ? (ctx.objects.find((o) => OCCUPIABLE_OBJECT_TYPES.includes(o)) ?? ctx.objects[0])
        : ctx.objects[0],
    index: 0,
    of: ctx.others[0]?.id,
    dir: 'north',
    quantifier: 'some',
    attribute: 'beard',
    value: 'blond',
    line: 'col',
    roomRel: 'any',
    alone: false,
    unique: false,
    portal: ctx.hasWindows === false && ctx.hasDoors ? 'door' : 'window',
    side: 'inside',
    axis: 'row',
    roomTarget: 'person',
    dist: 1,
    objects: kind === 'nearObject' && ctx.objects[0] ? [ctx.objects[0]] : [],
    extraCount: 1,
    aloneDir: 'none',
    objTarget: 'any',
    objDir: 'none',
  }
}
