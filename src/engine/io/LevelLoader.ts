import { Board } from '../model/Board.ts'
import { GameObject } from '../model/GameObject.ts'
import { Tile } from '../model/Tile.ts'
import { Room } from '../model/Room.ts'
import { Suspect } from '../model/Suspect.ts'
import { Victim } from '../model/Victim.ts'
import { Puzzle } from '../model/Puzzle.ts'
import { VICTIM_ID, VOID_ROOM } from '../model/types.ts'
import type { Cell, Side } from '../model/types.ts'
import { createClue } from '../clues/ClueFactory.ts'
import { createBoardClue } from '../clues/boardClues.ts'
import type { LevelJson } from './LevelSchema.ts'

const EMPTY_CHAR = '.'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid level: ${message}`)
}

function buildObjectDefs(level: LevelJson): Map<string, GameObject> {
  const defs = new Map<string, GameObject>()
  for (const [char, def] of Object.entries(level.objects ?? {})) {
    assert(char.length === 1, `object key "${char}" must be a single char`)
    assert(char !== EMPTY_CHAR, `object key "${EMPTY_CHAR}" is reserved for empty`)
    defs.set(char, new GameObject(def.type, def.occupiable))
  }
  return defs
}

function charAt(map: string[] | undefined, row: number, col: number): string {
  if (!map) return EMPTY_CHAR
  return map[row][col]
}

function lookupObject(
  defs: Map<string, GameObject>,
  char: string,
  where: string,
): GameObject | null {
  if (char === EMPTY_CHAR) return null
  const obj = defs.get(char)
  assert(obj, `unknown object char "${char}" in ${where}`)
  return obj
}

function validateMap(
  map: string[] | undefined,
  name: string,
  width: number,
  height: number,
): void {
  if (!map) return
  assert(map.length === height, `${name} must have ${height} rows`)
  for (const row of map) {
    assert(row.length === width, `${name} rows must be ${width} chars wide`)
  }
}

/** Parse and validate a level JSON object into a Puzzle. */
export function loadLevel(level: LevelJson): Puzzle {
  assert(level.schema === 1, `unsupported schema ${level.schema}`)
  const { width, height } = level.size
  assert(width > 0 && height > 0, 'size must be positive')

  validateMap(level.roomMap, 'roomMap', width, height)
  validateMap(level.groundMap, 'groundMap', width, height)
  validateMap(level.topMap, 'topMap', width, height)

  const rooms = new Map<string, Room>()
  for (const [id, def] of Object.entries(level.rooms)) {
    rooms.set(id, new Room(id, def.nameKey, def.color, def.outside ?? false))
  }

  const objectDefs = buildObjectDefs(level)

  const tiles: Tile[] = []
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const roomChar = level.roomMap[row][col]
      // VOID_ROOM marks a cell that belongs to no room (empty exterior) — it has
      // no Room entry and is never occupiable; everything else must be declared.
      assert(
        roomChar === VOID_ROOM || rooms.has(roomChar),
        `unknown room "${roomChar}" at ${row},${col}`,
      )
      const ground = lookupObject(objectDefs, charAt(level.groundMap, row, col), 'groundMap')
      const top = lookupObject(objectDefs, charAt(level.topMap, row, col), 'topMap')
      tiles.push(new Tile(row, col, roomChar, ground, top))
    }
  }

  const windows = new Map<Cell, Set<Side>>()
  for (const w of level.windows ?? []) {
    assert(
      w.r >= 0 && w.r < height && w.c >= 0 && w.c < width,
      `window out of bounds at ${w.r},${w.c}`,
    )
    const cell = w.r * width + w.c
    const sides = windows.get(cell) ?? new Set<Side>()
    sides.add(w.side)
    windows.set(cell, sides)
  }

  // Doors are two-sided: register each on its cell AND the neighbour across the edge.
  const doors = new Map<Cell, Set<Side>>()
  const addDoor = (r: number, c: number, side: Side): void => {
    if (r < 0 || r >= height || c < 0 || c >= width) return
    const cell = r * width + c
    const set = doors.get(cell) ?? new Set<Side>()
    set.add(side)
    doors.set(cell, set)
  }
  const opposite: Record<Side, Side> = { N: 'S', S: 'N', E: 'W', W: 'E' }
  const step: Record<Side, [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] }
  for (const d of level.doors ?? []) {
    assert(
      d.r >= 0 && d.r < height && d.c >= 0 && d.c < width,
      `door out of bounds at ${d.r},${d.c}`,
    )
    addDoor(d.r, d.c, d.side)
    const [dr, dc] = step[d.side]
    addDoor(d.r + dr, d.c + dc, opposite[d.side])
  }

  const board = new Board(width, height, tiles, rooms, windows, doors)

  const seen = new Set<string>()
  const suspects = level.suspects.map((s) => {
    assert(s.id !== VICTIM_ID, `suspect id "${s.id}" is reserved`)
    assert(!seen.has(s.id), `duplicate suspect id "${s.id}"`)
    seen.add(s.id)
    const clues = (s.clues ?? []).map(createClue)
    return new Suspect(s.id, s.name, s.attributes ?? {}, clues)
  })

  const victim = new Victim(level.victim.name, level.victim.attributes ?? {})
  const globalClues = (level.globalClues ?? []).map(createClue)
  const boardClues = (level.boardClues ?? []).map(createBoardClue)

  return new Puzzle(level.id, board, suspects, victim, globalClues, boardClues)
}
