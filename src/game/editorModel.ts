import type { AttributeValue, LevelJson, Side, SuspectJson } from '../engine/index.ts'
import { emptyClueGroup, groupToClues, type ClueGroup } from './editorClues.ts'

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

export interface EditorObject {
  char: string
  type: string
  occupiable: boolean
  layer: 'ground' | 'top'
}

/** Objects the editor can place. Carpet is a ground layer; the rest sit on top. */
export const EDITOR_OBJECTS: EditorObject[] = [
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
]

export const GROUND_OBJECTS = EDITOR_OBJECTS.filter((o) => o.layer === 'ground')
export const TOP_OBJECTS = EDITOR_OBJECTS.filter((o) => o.layer === 'top')

export interface EditorWindow {
  r: number
  c: number
  side: Side
}

/** A suspect as edited: identity + visible traits + the flat clue builder. */
export interface EditorSuspect {
  id: string
  name: string
  gender: 'm' | 'f'
  beard: boolean
  glasses: boolean
  bald: boolean
  hair: string // '' = unset, else a colour name
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
/** Outer band (fraction of a cell) within which a click counts as "near an edge". */
const EDGE_BAND = 0.3

/** Perpendicular distance from a fractional click (fx,fy in [0,1]) to an edge. */
function edgeDist(side: Side, fx: number, fy: number): number {
  if (side === 'N') return fy
  if (side === 'S') return 1 - fy
  if (side === 'W') return fx
  return 1 - fx
}

function nearestBy(sides: Side[], fx: number, fy: number): Side {
  return sides.reduce((a, b) => (edgeDist(b, fx, fy) < edgeDist(a, fx, fy) ? b : a))
}

/**
 * Toggle a window from a click inside a cell (fx,fy are the fractional position
 * 0..1). Forgiving on removal: a tap near the centre removes the nearest existing
 * window, while a tap near a free edge adds one there — so you never have to hit a
 * precise quadrant, which matters on touch screens.
 */
export function toggleWindowAt(
  windows: EditorWindow[],
  r: number,
  c: number,
  fx: number,
  fy: number,
): EditorWindow[] {
  const here = windows.filter((w) => w.r === r && w.c === c).map((w) => w.side)
  const nearest = nearestBy(SIDES, fx, fy)
  // 1) the clicked edge already has a window → remove it
  if (here.includes(nearest)) return toggleWindow(windows, r, c, nearest)
  // 2) clearly near a free edge → add a window there
  if (edgeDist(nearest, fx, fy) < EDGE_BAND) return toggleWindow(windows, r, c, nearest)
  // 3) interior tap with existing window(s) → remove the nearest one
  if (here.length) return toggleWindow(windows, r, c, nearestBy(here, fx, fy))
  // 4) interior tap, no windows yet → add on the nearest edge
  return toggleWindow(windows, r, c, nearest)
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
): LevelJson {
  const rooms: LevelJson['rooms'] = {}
  ROOM_IDS.forEach((id, i) => {
    rooms[id] = { nameKey: state.roomNames[i] ?? `room.editor${id}`, color: ROOM_COLORS[i] }
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
    suspects,
    victim,
  }
}

/** The attribute record a suspect contributes (only set traits are included). */
export function suspectAttributes(s: EditorSuspect): Record<string, AttributeValue> {
  const attrs: Record<string, AttributeValue> = { gender: s.gender }
  if (s.beard) attrs.beard = true
  if (s.glasses) attrs.glasses = true
  if (s.bald) attrs.bald = true
  if (s.hair) attrs.hair = s.hair
  return attrs
}

function suspectToJson(s: EditorSuspect): SuspectJson {
  return { id: s.id, name: s.name, attributes: suspectAttributes(s), clues: groupToClues(s.clue) }
}

/** Build a fully playable level (real suspects + victim + clues) with a stable id. */
export function buildPlayableLevel(
  state: EditorState,
  id: string,
  title?: string,
  difficulty?: string,
): LevelJson {
  const level = buildEditorLevel(
    state,
    state.suspects.map(suspectToJson),
    { name: state.victim.name || '?', attributes: { gender: state.victim.gender } },
    title,
  )
  return difficulty ? { ...level, id, difficulty } : { ...level, id }
}

/** Distinct room ids actually painted on the board, in first-seen order. */
export function usedRooms(state: EditorState): string[] {
  const seen: string[] = []
  for (const row of state.roomMap) {
    for (const ch of row) if (!seen.includes(ch)) seen.push(ch)
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
