import { OBJECT_CATALOG, VOID_ROOM, type AttributeValue, type BoardClueJson, type LevelJson, type ObjectDef, type Side, type SuspectJson } from '../engine/index.ts'
import { cluesToGroup, emptyClueGroup, groupToClues, type ClueGroup } from './editorClues.ts'
import { resolveHairstyle } from './avatar.ts'

/** Up to 15 room slots the editor can paint (matching a theme's room count). */
export const ROOM_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F']
export const ROOM_COLORS = [
  '#e8d8b0',
  '#b9d0e6',
  '#cfe0cf',
  '#d8c0c0',
  '#e6cda0',
  '#e6c0d2',
  '#c6c0e0',
  '#c0e0c8',
  '#e0c4a0',
  '#a8c8e0',
  '#d8e0a8',
  '#e0b0a8',
  '#c8b0d8',
  '#a8e0d0',
  '#ded0e6',
]

/** An object the editor can place. Aliased to the engine's shared catalog type. */
export type EditorObject = ObjectDef

/** Objects the editor can place — the engine-owned catalog (shared with the generator). */
export const EDITOR_OBJECTS: readonly EditorObject[] = OBJECT_CATALOG

export const GROUND_OBJECTS = EDITOR_OBJECTS.filter((o) => o.layer === 'ground')
export const TOP_OBJECTS = EDITOR_OBJECTS.filter((o) => o.layer === 'top')

export interface EditorWindow {
  r: number
  c: number
  side: Side
}

/** A suspect as edited: identity + visible traits + the flat clue builder.
 *  Style fields ('' = auto/derived) only render when their toggle is on. */
export interface EditorSuspect {
  id: string
  name: string
  gender: 'm' | 'f'
  beard: boolean
  glasses: boolean
  bald: boolean
  hair: string // '' = unset, else a colour name
  hairstyle?: string // '' = auto from id, else a style id
  beardStyle?: string // '' = full, else a beard style id
  glassesShape?: string // '' = round, else a glasses shape id
  glassesColor?: string // '' = black, else a glasses colour id
  clue: ClueGroup
}

export interface EditorVictim {
  name: string
  gender: 'm' | 'f'
}

export interface EditorState {
  size: number
  roomMap: string[]
  groundMap: string[]
  topMap: string[]
  windows: EditorWindow[]
  /** Doors (two-sided edges), same shape as windows. */
  doors: EditorWindow[]
  /** Board-wide clues (counts / empty rooms). */
  boardClues: BoardClueJson[]
  suspects: EditorSuspect[]
  victim: EditorVictim
  /** Display name (nameKey) per room slot 0..7 — usually picked from a theme. */
  roomNames: string[]
}

/** Fallback room names when no theme is supplied. */
const DEFAULT_ROOM_NAMES = ROOM_IDS.map((id) => `room.editor${id}`)

const EMPTY_ROW = (size: number, ch: string) => ch.repeat(size)

/** Suspect letters A, B, C … (board fits at most `size` people incl. victim). */
export const SUSPECT_LETTERS = 'ABCDEFGHIJKLMNO'.split('')

function makeSuspect(i: number): EditorSuspect {
  const id = SUSPECT_LETTERS[i] ?? `S${i + 1}`
  return {
    id,
    name: `Person ${id}`,
    gender: i % 2 === 0 ? 'm' : 'f',
    beard: false,
    glasses: false,
    bald: false,
    hair: '',
    hairstyle: '',
    beardStyle: '',
    glassesShape: '',
    glassesColor: '',
    clue: emptyClueGroup(),
  }
}

/** Resize the suspect list to `count`, preserving existing entries. */
export function fitSuspects(suspects: EditorSuspect[], count: number): EditorSuspect[] {
  const next = suspects.slice(0, count)
  for (let i = next.length; i < count; i++) next.push(makeSuspect(i))
  return next
}

export function emptyEditorState(size: number, roomNames: string[] = DEFAULT_ROOM_NAMES): EditorState {
  return {
    size,
    roomMap: Array.from({ length: size }, () => EMPTY_ROW(size, '1')),
    groundMap: Array.from({ length: size }, () => EMPTY_ROW(size, '.')),
    topMap: Array.from({ length: size }, () => EMPTY_ROW(size, '.')),
    windows: [],
    doors: [],
    boardClues: [],
    suspects: fitSuspects([], size - 1),
    victim: { name: 'Opfer', gender: 'm' },
    roomNames: ROOM_IDS.map((_, i) => roomNames[i] ?? DEFAULT_ROOM_NAMES[i]),
  }
}

/** Toggle a window on a cell's side (returns a new windows array). */
export function toggleWindow(windows: EditorWindow[], r: number, c: number, side: Side): EditorWindow[] {
  const i = windows.findIndex((w) => w.r === r && w.c === c && w.side === side)
  if (i >= 0) return windows.filter((_, j) => j !== i)
  return [...windows, { r, c, side }]
}

const SIDES: Side[] = ['N', 'S', 'W', 'E']
const STEP: Record<Side, [number, number]> = { N: [-1, 0], S: [1, 0], W: [0, -1], E: [0, 1] }

/** Perpendicular distance from a fractional click (fx,fy in [0,1]) to an edge. */
function edgeDist(side: Side, fx: number, fy: number): number {
  if (side === 'N') return fy
  if (side === 'S') return 1 - fy
  if (side === 'W') return fx
  return 1 - fx
}

function nearestSide(fx: number, fy: number): Side {
  return SIDES.reduce((a, b) => (edgeDist(b, fx, fy) < edgeDist(a, fx, fy) ? b : a))
}

/** Canonical key for a wall edge: anchored at the top/left cell, side S (down) or
 *  E (right), so a two-sided edge toggles the same whichever cell you click. */
function canonicalEdge(r: number, c: number, side: Side): { r: number; c: number; side: Side } {
  if (side === 'N') return { r: r - 1, c, side: 'S' }
  if (side === 'W') return { r, c: c - 1, side: 'E' }
  return { r, c, side }
}

/**
 * Toggle a window OR door on the wall edge nearest the click (fx,fy fractional 0..1).
 * Windows and doors share one mechanic: an interior edge is canonicalised (anchored
 * at the top/left cell) so clicking from either side hits the same edge and it counts
 * from both; a boundary/exterior edge keeps the click's own side (only one cell). They
 * differ only in look and which clue they trigger. Clicking the same edge removes it.
 */
export function toggleWallEdgeAt(
  edges: EditorWindow[],
  r: number,
  c: number,
  fx: number,
  fy: number,
): EditorWindow[] {
  const side = nearestSide(fx, fy)
  const e = canonicalEdge(r, c, side)
  // N/W boundary: the canonical anchor is off-board → keep the click's own side here.
  if (e.r < 0 || e.c < 0) return toggleWindow(edges, r, c, side)
  return toggleWindow(edges, e.r, e.c, e.side)
}

/**
 * Drop windows/doors that no longer sit on a wall after a room repaint. Both follow
 * the same rule: an edge survives where its two sides differ — between two rooms, or
 * on the board's outer boundary (one side is off-board / exterior).
 */
export function pruneWallEdges(
  roomMap: string[],
  size: number,
  windows: EditorWindow[],
  doors: EditorWindow[],
): { windows: EditorWindow[]; doors: EditorWindow[] } {
  const roomAt = (r: number, c: number): string | null =>
    r < 0 || r >= size || c < 0 || c >= size ? null : roomMap[r][c]
  const onWall = (e: EditorWindow): boolean => {
    const [dr, dc] = STEP[e.side]
    return roomAt(e.r, e.c) !== roomAt(e.r + dr, e.c + dc)
  }
  return { windows: windows.filter(onWall), doors: doors.filter(onWall) }
}

/** Set one character in a row-string array (returns a new array). */
export function setCell(map: string[], row: number, col: number, ch: string): string[] {
  const next = [...map]
  next[row] = next[row].slice(0, col) + ch + next[row].slice(col + 1)
  return next
}

/**
 * Build a LevelJson from the editor state. All room slots and object chars are
 * declared so any painted cell is valid; suspects/victim are placeholders for
 * board rendering (real ones are filled in later stages).
 */
export function buildEditorLevel(
  state: EditorState,
  suspects: SuspectJson[] = [],
  victim: { name: string; attributes?: Record<string, string | number | boolean> } = { name: '?' },
  title?: string,
  /** Room names that count as outdoors (from the theme) → rooms[].outside. */
  outdoorRooms: string[] = [],
): LevelJson {
  const outside = new Set(outdoorRooms)
  const rooms: LevelJson['rooms'] = {}
  ROOM_IDS.forEach((id, i) => {
    const nameKey = state.roomNames[i] ?? `room.editor${id}`
    rooms[id] = { nameKey, color: ROOM_COLORS[i], outside: outside.has(nameKey) }
  })
  const objects: LevelJson['objects'] = {}
  for (const o of EDITOR_OBJECTS) objects[o.char] = { type: o.type, occupiable: o.occupiable }

  return {
    schema: 1,
    id: 'editor-preview',
    title,
    size: { width: state.size, height: state.size },
    rooms,
    objects,
    roomMap: state.roomMap,
    groundMap: state.groundMap,
    topMap: state.topMap,
    windows: state.windows,
    doors: state.doors,
    suspects,
    victim,
    boardClues: state.boardClues,
  }
}

/**
 * The attribute record a suspect contributes. Style values are folded in so a
 * clue can reference them and the puzzle stays consistent with the avatar: every
 * non-bald person has a concrete hairstyle (explicit or derived from the id),
 * bearded/bespectacled people carry their style/shape/colour.
 */
export function suspectAttributes(s: EditorSuspect): Record<string, AttributeValue> {
  const attrs: Record<string, AttributeValue> = { gender: s.gender }
  if (s.beard) {
    attrs.beard = true
    attrs.beardStyle = s.beardStyle || 'full'
  }
  if (s.glasses) {
    attrs.glasses = true
    attrs.glassesShape = s.glassesShape || 'round'
    attrs.glassesColor = s.glassesColor || 'black'
  }
  if (s.bald) attrs.bald = true
  else attrs.hairstyle = resolveHairstyle(s.gender, s.hairstyle, s.id)
  if (s.hair) attrs.hair = s.hair
  return attrs
}

function suspectToJson(s: EditorSuspect): SuspectJson {
  return { id: s.id, name: s.name, attributes: suspectAttributes(s), clues: groupToClues(s.clue) }
}

/** Inverse of `suspectToJson`: map a level's suspect (traits + clues) back into the
 *  editor's editable shape. Style fields absent from the attributes become '' (auto). */
function suspectFromJson(s: SuspectJson): EditorSuspect {
  const a = s.attributes ?? {}
  const str = (v: AttributeValue | undefined): string => (typeof v === 'string' ? v : '')
  return {
    id: s.id,
    name: s.name,
    gender: a.gender === 'f' ? 'f' : 'm',
    beard: a.beard === true,
    glasses: a.glasses === true,
    bald: a.bald === true,
    hair: str(a.hair),
    hairstyle: str(a.hairstyle),
    beardStyle: str(a.beardStyle),
    glassesShape: str(a.glassesShape),
    glassesColor: str(a.glassesColor),
    clue: cluesToGroup(s.clues),
  }
}

/** Pull the people (suspects + victim) out of a built level into editor state —
 *  used by the editor's "random" fill, which keeps the board and replaces the people. */
export function editorPeopleFromLevel(level: LevelJson): {
  suspects: EditorSuspect[]
  victim: EditorVictim
} {
  const va = level.victim.attributes ?? {}
  return {
    suspects: level.suspects.map(suspectFromJson),
    victim: { name: level.victim.name, gender: va.gender === 'f' ? 'f' : 'm' },
  }
}

/**
 * Reconstruct a full editor state from a finished level — for "open in the editor".
 * The level stores the very same room/object/window/door maps the editor uses, so the
 * board is a direct copy; the people and room names are reverse-mapped. Assumes a square
 * board (the editor's model); non-square levels fall back to the width.
 */
export function editorStateFromLevel(level: LevelJson): EditorState {
  const { suspects, victim } = editorPeopleFromLevel(level)
  const size = level.size.width
  const blank = Array.from({ length: level.size.height }, () => '.'.repeat(size))
  return {
    size,
    roomMap: [...level.roomMap],
    groundMap: level.groundMap ? [...level.groundMap] : blank,
    topMap: level.topMap ? [...level.topMap] : blank,
    windows: [...(level.windows ?? [])],
    doors: [...(level.doors ?? [])],
    boardClues: [...(level.boardClues ?? [])],
    suspects,
    victim,
    roomNames: ROOM_IDS.map((id, i) => level.rooms[id]?.nameKey ?? DEFAULT_ROOM_NAMES[i]),
  }
}

/** Build a fully playable level (real suspects + victim + clues) with a stable id. */
export function buildPlayableLevel(
  state: EditorState,
  id: string,
  title?: string,
  difficulty?: string,
  outdoorRooms: string[] = [],
): LevelJson {
  const level = buildEditorLevel(
    state,
    state.suspects.map(suspectToJson),
    { name: state.victim.name || '?', attributes: { gender: state.victim.gender } },
    title,
    outdoorRooms,
  )
  return difficulty ? { ...level, id, difficulty } : { ...level, id }
}

/** Distinct room ids actually painted on the board, in first-seen order
 *  (excluding empty/void cells, which are no room). */
export function usedRooms(state: EditorState): string[] {
  const seen: string[] = []
  for (const row of state.roomMap) {
    for (const ch of row) if (ch !== VOID_ROOM && !seen.includes(ch)) seen.push(ch)
  }
  return seen
}

/** Object TYPES present on the board (mapped from the painted chars). */
export function presentObjectTypes(state: EditorState): string[] {
  const byChar = new Map(EDITOR_OBJECTS.map((o) => [o.char, o.type]))
  const out: string[] = []
  for (const map of [state.groundMap, state.topMap]) {
    for (const row of map) {
      for (const ch of row) {
        const type = byChar.get(ch)
        if (type && !out.includes(type)) out.push(type)
      }
    }
  }
  return out
}
