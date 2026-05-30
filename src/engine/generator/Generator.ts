import { Rng } from './random.ts'
import { suspectPerson, victimPerson } from './names.ts'
import { loadLevel } from '../io/LevelLoader.ts'
import { Solution } from '../model/Solution.ts'
import { SearchSolver } from '../solver/SearchSolver.ts'
import { DeductionEngine } from '../solver/DeductionEngine.ts'
import { difficultyOf } from '../solver/DeductionStep.ts'
import { createClue } from '../clues/ClueFactory.ts'
import { VICTIM_ID } from '../model/types.ts'
import type { AttributeValue, Cell, PersonId } from '../model/types.ts'
import type { Puzzle } from '../model/Puzzle.ts'
import type { LevelJson, SuspectJson } from '../io/LevelSchema.ts'
import type { ClueJson } from '../clues/ClueFactory.ts'

interface ObjectDef {
  char: string
  type: string
  occupiable: boolean
}

interface Theme {
  id: string
  rooms: string[]
}

const OCCUPIABLE: ObjectDef[] = [
  { char: 's', type: 'chair', occupiable: true },
  { char: 'r', type: 'carpet', occupiable: true },
]
const BLOCKING: ObjectDef[] = [
  { char: 't', type: 'table', occupiable: false },
  { char: 'p', type: 'plant', occupiable: false },
  { char: 'g', type: 'shelf', occupiable: false },
  { char: 'x', type: 'box', occupiable: false },
  { char: 'f', type: 'tv', occupiable: false },
]
const ALL_OBJECTS = [...OCCUPIABLE, ...BLOCKING]

const THEMES: Theme[] = [
  { id: 'crime-scene', rooms: ['Flur', 'Wohnzimmer', 'Küche', 'Bad', 'Schlafzimmer', 'Büro', 'Keller', 'Garage'] },
  { id: 'auto-shop', rooms: ['Werkstatt', 'Lager', 'Büro', 'Wartebereich', 'Hof', 'Waschhalle'] },
  { id: 'game-night', rooms: ['Wohnzimmer', 'Esszimmer', 'Küche', 'Flur', 'Balkon'] },
  { id: 'office', rooms: ['Großraumbüro', 'Besprechung', 'Küche', 'Empfang', 'Serverraum', 'Archiv'] },
]
const ROOM_COLORS = ['#e8d8b0', '#b9d0e6', '#cfe0cf', '#d8c0c0', '#e6cda0', '#e6c0d2', '#c6c0e0', '#c0e0c8']

export type GenDifficulty = 'easy' | 'medium' | 'hard'

export interface GenerateOptions {
  width: number
  height: number
  suspects: number
  seed?: number
  themeId?: string
  difficulty?: GenDifficulty
}

const HAIR_COLORS: AttributeValue[] = ['blond', 'brown', 'black', 'white']

/** Random traits: gender; men beard/bald; everyone glasses + hair colour. */
function makeAttributes(gender: 'm' | 'f', rng: Rng): Record<string, AttributeValue> {
  const attrs: Record<string, AttributeValue> = { gender }
  attrs.glasses = rng.chance(0.4)
  attrs.hair = rng.pick(HAIR_COLORS)
  attrs.beard = gender === 'm' && rng.chance(0.5)
  attrs.bald = gender === 'm' && rng.chance(0.3)
  return attrs
}

/** Forward-deduction tier; a level needing search (unique but not forward-
 *  solvable) is 'hard' — still fully logical (solvable by contradiction). */
function rateTier(level: LevelJson): GenDifficulty {
  const result = new DeductionEngine(loadLevel(level)).solve()
  if (!result.solved) return 'hard' // needs search — still logical (contradiction)
  const tier = difficultyOf(result.maxRank)
  return tier === 'expert' ? 'hard' : tier
}

/** Generate a uniquely-solvable level. Throws if no seed yields one. */
export function generateLevel(options: GenerateOptions): LevelJson {
  const { width, height, suspects } = options
  const baseSeed = options.seed ?? Math.floor(Math.random() * 1e9)

  const target = options.difficulty
  const deadline = performance.now() + 2800
  let best: LevelJson | null = null
  let bestScore = Infinity
  for (let attempt = 0; attempt < 80; attempt++) {
    const result = tryGenerate(options, new Rng(baseSeed + attempt * 7919), baseSeed + attempt)
    if (result) {
      const tier = rateTier(result.level)
      result.level.difficulty = tier
      const mismatch = target && tier !== target ? 1 : 0
      const score = result.pins * 1000 + mismatch // pin-free first, then difficulty
      if (score < bestScore) {
        best = result.level
        bestScore = score
      }
      if (result.pins === 0 && mismatch === 0) break // pin-free and right difficulty
    }
    if (best && performance.now() > deadline) break // stay within the time budget
  }
  if (!best) throw new Error(`Could not generate a ${width}x${height} level for ${suspects} suspects`)
  return best
}

function tryGenerate(
  options: GenerateOptions,
  rng: Rng,
  seedIndex: number,
): { level: LevelJson; pins: number } | null {
  const { width, height, suspects } = options
  const theme =
    THEMES.find((t) => t.id === options.themeId) ?? rng.pick(THEMES)

  const roomCount = Math.max(3, Math.min(theme.rooms.length, Math.round(suspects * 0.7)))
  const rooms = generateRooms(width, height, roomCount, rng)
  const roomOf = (cell: Cell): string => rooms.roomMap[Math.floor(cell / width)][cell % width]

  const suspectIds: PersonId[] = Array.from({ length: suspects }, (_, i) => String.fromCharCode(65 + i))
  const peopleIds = [...suspectIds, VICTIM_ID]

  const placed = generateSolution(width, height, roomOf, peopleIds, rng)
  if (!placed) return null

  const peopleCells = new Set<Cell>(placed.placement.values())
  const objects = placeObjects(width, height, peopleCells, rng)

  const usedName = new Set<string>()
  const suspectMeta: SuspectJson[] = suspectIds.map((id, i) => {
    const gender: 'm' | 'f' = rng.chance(0.5) ? 'm' : 'f'
    const person = suspectPerson(i, gender, usedName)
    return { id, name: person.name, attributes: makeAttributes(gender, rng), clues: [] }
  })

  const victim = victimPerson(rng)
  const victimMeta = { name: victim.name, attributes: makeAttributes(victim.gender, rng) }
  const base = buildLevel(theme, width, height, rooms, objects, suspectMeta, victimMeta, seedIndex)
  const basePuzzle = loadLevel(base)
  const solution = new Solution(placed.placement)

  const candidates = new Map<PersonId, ClueJson[]>()
  for (const id of suspectIds) {
    const others = suspectIds.filter((o) => o !== id)
    candidates.set(id, candidatesFor(id, solution, basePuzzle, others))
  }

  const chosen = selectClues(base, suspectIds, candidates, rng)
  if (!chosen) return null

  for (const meta of base.suspects) meta.clues = [chosen.get(meta.id)!]
  return { level: base, pins: countPins(chosen) }
}

// --- board ----------------------------------------------------------------

function generateRooms(
  width: number,
  height: number,
  roomCount: number,
  rng: Rng,
): { roomMap: string[]; ids: string[] } {
  const n = width * height
  const assign = new Array<number>(n).fill(-1)
  const neighbors = (cell: Cell): Cell[] => {
    const r = Math.floor(cell / width)
    const c = cell % width
    const out: Cell[] = []
    if (r > 0) out.push(cell - width)
    if (r < height - 1) out.push(cell + width)
    if (c > 0) out.push(cell - 1)
    if (c < width - 1) out.push(cell + 1)
    return out
  }

  const seeds = rng.shuffle([...Array(n).keys()]).slice(0, roomCount)
  const frontier: Array<[Cell, number]> = []
  const grow = (cell: Cell, room: number): void => {
    assign[cell] = room
    for (const nb of neighbors(cell)) if (assign[nb] < 0) frontier.push([nb, room])
  }
  seeds.forEach((cell, room) => grow(cell, room))
  while (frontier.length > 0) {
    const i = rng.int(frontier.length)
    const [cell, room] = frontier[i]
    frontier[i] = frontier[frontier.length - 1]
    frontier.pop()
    if (assign[cell] < 0) grow(cell, room)
  }

  const ids = seeds.map((_, room) => String(room + 1))
  const roomMap: string[] = []
  for (let r = 0; r < height; r++) {
    let line = ''
    for (let c = 0; c < width; c++) line += String(assign[r * width + c] + 1)
    roomMap.push(line)
  }
  return { roomMap, ids }
}

function generateSolution(
  width: number,
  height: number,
  roomOf: (cell: Cell) => string,
  peopleIds: PersonId[],
  rng: Rng,
): { placement: Map<PersonId, Cell>; murderer: PersonId } | null {
  const p = peopleIds.length
  for (let attempt = 0; attempt < 4000; attempt++) {
    const rows = rng.shuffle([...Array(height).keys()]).slice(0, p)
    const cols = rng.shuffle([...Array(width).keys()]).slice(0, p)
    const order = rng.shuffle([...peopleIds])
    const placement = new Map<PersonId, Cell>()
    for (let i = 0; i < p; i++) placement.set(order[i], rows[i] * width + cols[i])

    const victimRoom = roomOf(placement.get(VICTIM_ID)!)
    const inRoom = peopleIds.filter(
      (id) => id !== VICTIM_ID && roomOf(placement.get(id)!) === victimRoom,
    )
    if (inRoom.length === 1) return { placement, murderer: inRoom[0] }
  }
  return null
}

function placeObjects(
  width: number,
  height: number,
  peopleCells: Set<Cell>,
  rng: Rng,
): { groundMap: string[]; topMap: string[] } {
  const ground: string[][] = Array.from({ length: height }, () => new Array<string>(width).fill('.'))
  const top: string[][] = Array.from({ length: height }, () => new Array<string>(width).fill('.'))

  for (let cell = 0; cell < width * height; cell++) {
    const r = Math.floor(cell / width)
    const c = cell % width
    if (peopleCells.has(cell)) {
      const roll = rng.next()
      if (roll < 0.4) top[r][c] = 's'
      else if (roll < 0.6) ground[r][c] = 'r'
      continue
    }
    const roll = rng.next()
    if (roll < 0.3) top[r][c] = rng.pick(BLOCKING).char
    else if (roll < 0.45) {
      if (rng.chance(0.5)) top[r][c] = 's'
      else ground[r][c] = 'r'
    }
  }
  return {
    groundMap: ground.map((row) => row.join('')),
    topMap: top.map((row) => row.join('')),
  }
}

// --- level json -----------------------------------------------------------

function buildLevel(
  theme: Theme,
  width: number,
  height: number,
  rooms: { roomMap: string[]; ids: string[] },
  objects: { groundMap: string[]; topMap: string[] },
  suspects: SuspectJson[],
  victim: { name: string; attributes: Record<string, AttributeValue> },
  seedIndex: number,
): LevelJson {
  const roomDefs: Record<string, { nameKey: string; color: string }> = {}
  rooms.ids.forEach((id, i) => {
    roomDefs[id] = { nameKey: theme.rooms[i % theme.rooms.length], color: ROOM_COLORS[i % ROOM_COLORS.length] }
  })
  const objectDefs: Record<string, { type: string; occupiable: boolean }> = {}
  for (const obj of ALL_OBJECTS) objectDefs[obj.char] = { type: obj.type, occupiable: obj.occupiable }

  return {
    schema: 1,
    id: `gen-${theme.id}-${seedIndex}`,
    difficulty: 'generated',
    size: { width, height },
    rooms: roomDefs,
    objects: objectDefs,
    roomMap: rooms.roomMap,
    groundMap: objects.groundMap,
    topMap: objects.topMap,
    suspects,
    victim,
  }
}

// --- clues ----------------------------------------------------------------

function candidatesFor(
  suspectId: PersonId,
  solution: Solution,
  puzzle: Puzzle,
  otherSuspects: PersonId[],
): ClueJson[] {
  const board = puzzle.board
  const cell = solution.cellOf(suspectId)
  const { row, col } = board.rc(cell)
  const room = board.roomIdOf(cell)
  const out: ClueJson[] = []

  for (const obj of board.tileAt(cell).objects()) {
    if (obj.occupiable) out.push({ type: 'onObject', object: obj.type })
  }
  const nearTypes = new Set<string>()
  for (const nb of board.neighbors4(cell)) {
    if (board.roomIdOf(nb) === room) {
      for (const obj of board.tileAt(nb).objects()) nearTypes.add(obj.type)
    }
  }
  for (const type of nearTypes) out.push({ type: 'nearObject', object: type })

  out.push({ type: 'inRoom', room })
  out.push({ type: 'inRow', row })
  out.push({ type: 'inCol', col })
  if (board.isCorner(cell)) out.push({ type: 'corner' })

  const sameRoom = otherSuspects.filter((id) => board.roomIdOf(solution.cellOf(id)) === room)
  if (sameRoom.length === 0) out.push({ type: 'alone' })
  for (const id of sameRoom) out.push({ type: 'sameRoom', as: id })

  for (const id of otherSuspects) {
    const o = board.rc(solution.cellOf(id))
    if (row < o.row) out.push({ type: 'direction', of: id, dir: 'north' })
    else if (row > o.row) out.push({ type: 'direction', of: id, dir: 'south' })
    else if (col < o.col) out.push({ type: 'direction', of: id, dir: 'west' })
    else if (col > o.col) out.push({ type: 'direction', of: id, dir: 'east' })
  }

  // attribute-based clues (gender / beard / glasses) — true for this solution
  const inRoom = puzzle.allIds().filter((id) => board.roomIdOf(solution.cellOf(id)) === room)
  const othersInRoom = inRoom.filter((id) => id !== suspectId)
  for (const attr of ['beard', 'glasses']) {
    if (!inRoom.some((id) => puzzle.attributesOf(id)[attr] === true)) {
      out.push({ type: 'roomAttribute', quantifier: 'none', attribute: attr, value: true })
    }
  }
  if (othersInRoom.length === 1) {
    const gender = puzzle.attributesOf(othersInRoom[0]).gender
    out.push({ type: 'roomCompanion', count: 1, attribute: 'gender', value: gender })
  }
  for (const id of inRoom) {
    const gender = puzzle.attributesOf(id).gender
    for (const obj of board.tileAt(solution.cellOf(id)).objects()) {
      if (obj.occupiable) out.push({ type: 'roomExists', attribute: 'gender', value: gender, object: obj.type })
    }
  }

  const trueClues = out.filter((json) => createClue(json).test(suspectId, solution, puzzle))
  return trueClues.sort((a, b) => tightness(a, puzzle) - tightness(b, puzzle))
}

function tightness(json: ClueJson, puzzle: Puzzle): number {
  const cells = createClue(json).candidateCells(puzzle.board)
  if (cells) return cells.size
  switch (json.type) {
    case 'roomCompanion':
      return 6
    case 'alone':
      return 8
    case 'offset':
      return 12
    case 'roomAttribute':
      return 35
    case 'sameRoom':
      return 40
    case 'direction':
      return 100
    default:
      return 60
  }
}

function selectClues(
  base: LevelJson,
  suspectIds: PersonId[],
  candidates: Map<PersonId, ClueJson[]>,
  rng: Rng,
): Map<PersonId, ClueJson> | null {
  for (const id of suspectIds) if (candidates.get(id)!.length === 0) return null

  // Each suspect's clue = the AND of their natural candidates at these indices.
  const used = new Map<PersonId, number[]>(suspectIds.map((id) => [id, [0]]))

  const hasCoordPair = (id: PersonId): boolean => {
    const list = candidates.get(id)!
    const types = used.get(id)!.map((i) => list[i].type)
    return types.includes('inRow') && types.includes('inCol')
  }
  const clueOf = (id: PersonId): ClueJson => {
    const parts = used.get(id)!.map((i) => candidates.get(id)![i])
    return parts.length === 1 ? parts[0] : { type: 'and', clues: parts }
  }
  const unique = (): boolean =>
    isUnique(base, new Map(suspectIds.map((id) => [id, clueOf(id)])))

  // Tighten: add a natural clue (never inRow+inCol together) until unique.
  for (let guard = 0; guard < 300 && !unique(); guard++) {
    const order = rng
      .shuffle([...suspectIds])
      .sort((a, b) => used.get(a)!.length - used.get(b)!.length)
    let added = false
    for (const id of order) {
      const list = candidates.get(id)!
      const u = used.get(id)!
      for (let i = 0; i < list.length; i++) {
        if (u.includes(i)) continue
        u.push(i)
        if (hasCoordPair(id)) {
          u.pop()
          continue
        }
        added = true
        break
      }
      if (added) break
    }
    if (!added) return null // cannot reach uniqueness with natural clues
  }
  if (!unique()) return null

  // Loosen for difficulty: drop extra ANDed clues, then widen single clues.
  for (const id of suspectIds) {
    const u = used.get(id)!
    for (let k = u.length - 1; k >= 0 && u.length > 1; k--) {
      const removed = u.splice(k, 1)[0]
      if (!unique()) u.splice(k, 0, removed)
    }
  }
  for (const id of rng.shuffle([...suspectIds])) {
    const u = used.get(id)!
    if (u.length !== 1) continue
    const list = candidates.get(id)!
    const current = u[0]
    for (let j = list.length - 1; j > current; j--) {
      u[0] = j
      if (unique()) break
      u[0] = current
    }
  }

  return new Map(suspectIds.map((id) => [id, clueOf(id)]))
}

/** Count "exact cell" coordinate pins (inRow AND inCol) — must be 0. */
function countPins(assignment: Map<PersonId, ClueJson>): number {
  let pins = 0
  for (const clue of assignment.values()) {
    if (
      clue.type === 'and' &&
      clue.clues.some((c) => c.type === 'inRow') &&
      clue.clues.some((c) => c.type === 'inCol')
    ) {
      pins++
    }
  }
  return pins
}

function isUnique(base: LevelJson, assignment: Map<PersonId, ClueJson>): boolean {
  const level: LevelJson = {
    ...base,
    suspects: base.suspects.map((s) => ({ ...s, clues: [assignment.get(s.id)!] })),
  }
  return new SearchSolver(loadLevel(level)).countSolutions(2) === 1
}
