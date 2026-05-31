import { Rng } from './random.ts'
import { suspectPerson, victimPerson } from './names.ts'
import { loadLevel } from '../io/LevelLoader.ts'
import { Solution } from '../model/Solution.ts'
import { SearchSolver } from '../solver/SearchSolver.ts'
import { findMurderer } from '../solver/murderer.ts'
import { DeductionEngine } from '../solver/DeductionEngine.ts'
import { difficultyOf } from '../solver/DeductionStep.ts'
import { createClue } from '../clues/ClueFactory.ts'
import { VICTIM_ID } from '../model/types.ts'
import type { AttributeValue, Cell, PersonId, Side } from '../model/types.ts'
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
  { char: 'b', type: 'bed', occupiable: true },
]
const BLOCKING: ObjectDef[] = [
  { char: 't', type: 'table', occupiable: false },
  { char: 'p', type: 'plant', occupiable: false },
  { char: 'g', type: 'shelf', occupiable: false },
  { char: 'x', type: 'box', occupiable: false },
  { char: 'f', type: 'tv', occupiable: false },
  { char: 'u', type: 'shrub', occupiable: false },
]
const ALL_OBJECTS = [...OCCUPIABLE, ...BLOCKING]

/** Object types the generator can place (for the UI's per-object toggles). */
export const GENERATOR_OBJECT_TYPES: string[] = ALL_OBJECTS.map((o) => o.type)

const THEMES: Theme[] = [
  {
    id: 'crime-scene',
    rooms: ['Flur', 'Wohnzimmer', 'Küche', 'Bad', 'Schlafzimmer', 'Büro', 'Keller', 'Garage', 'Esszimmer', 'Dachboden', 'Gästezimmer', 'Abstellraum', 'Waschküche', 'Veranda', 'Kinderzimmer'],
  },
  {
    id: 'auto-shop',
    rooms: ['Werkstatt', 'Lager', 'Büro', 'Wartebereich', 'Hof', 'Waschhalle', 'Ersatzteillager', 'Reifenlager', 'Empfang', 'Lackiererei', 'Montagehalle', 'Prüfstand', 'Sozialraum', 'Kasse', 'Tankstelle'],
  },
  {
    id: 'game-night',
    rooms: ['Wohnzimmer', 'Esszimmer', 'Küche', 'Flur', 'Balkon', 'Spielzimmer', 'Bar', 'Lounge', 'Terrasse', 'Bibliothek', 'Wintergarten', 'Diele', 'Vorratskammer', 'Gästebad', 'Arbeitszimmer'],
  },
  {
    id: 'office',
    rooms: ['Großraumbüro', 'Besprechung', 'Küche', 'Empfang', 'Serverraum', 'Archiv', 'Chefbüro', 'Kopierraum', 'Teeküche', 'Lager', 'Konferenzraum', 'Lobby', 'Aufenthaltsraum', 'Poststelle', 'Druckerraum'],
  },
  {
    id: 'mansion',
    rooms: ['Eingangshalle', 'Salon', 'Speisesaal', 'Bibliothek', 'Musikzimmer', 'Wintergarten', 'Galerie', 'Boudoir', 'Rauchzimmer', 'Ballsaal', 'Gewächshaus', 'Weinkeller', 'Bedienstetenzimmer', 'Ankleidezimmer', 'Kaminzimmer'],
  },
  {
    id: 'hotel',
    rooms: ['Lobby', 'Rezeption', 'Restaurant', 'Bar', 'Suite', 'Konferenzraum', 'Spa', 'Fitnessraum', 'Küche', 'Gepäckraum', 'Frühstücksraum', 'Dachterrasse', 'Aufzug', 'Flur', 'Wäscherei'],
  },
  {
    id: 'school',
    rooms: ['Klassenzimmer', 'Aula', 'Turnhalle', 'Bibliothek', 'Lehrerzimmer', 'Sekretariat', 'Pausenhof', 'Chemieraum', 'Musiksaal', 'Mensa', 'Werkraum', 'Computerraum', 'Umkleide', 'Kunstraum', 'Flur'],
  },
  {
    id: 'hospital',
    rooms: ['Empfang', 'Wartezimmer', 'OP-Saal', 'Station', 'Labor', 'Apotheke', 'Röntgen', 'Intensivstation', 'Aufenthaltsraum', 'Notaufnahme', 'Kreißsaal', 'Sterilisation', 'Büro', 'Cafeteria', 'Flur'],
  },
  {
    id: 'museum',
    rooms: ['Eingangshalle', 'Hauptgalerie', 'Ausstellung', 'Tresor', 'Café', 'Sicherheitsraum', 'Werkstatt', 'Archiv', 'Garderobe', 'Sonderausstellung', 'Foyer', 'Bibliothek', 'Lager', 'Auditorium', 'Toilette'],
  },
  {
    id: 'restaurant',
    rooms: ['Speisesaal', 'Küche', 'Bar', 'Weinkeller', 'Terrasse', 'Lager', 'Büro', 'Empfang', 'Spülküche', 'Vorbereitung', 'Kühlraum', 'Personalraum', 'Lounge', 'Toilette', 'Garderobe'],
  },
]
const ROOM_COLORS = ['#e8d8b0', '#b9d0e6', '#cfe0cf', '#d8c0c0', '#e6cda0', '#e6c0d2', '#c6c0e0', '#c0e0c8']

/** Theme ids the generator knows (for the UI's theme picker). */
export const THEME_IDS: string[] = THEMES.map((t) => t.id)

export type GenDifficulty = 'easy' | 'medium' | 'hard'

export interface GenerateOptions {
  width: number
  height: number
  suspects: number
  seed?: number
  themeId?: string
  difficulty?: GenDifficulty
  /** Object types allowed on the board (default: all). */
  objects?: string[]
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

/** Search-tree nodes needed to prove uniqueness — our proxy for solving difficulty. */
function searchDifficulty(level: LevelJson): number {
  const searcher = new SearchSolver(loadLevel(level))
  searcher.countSolutions(2)
  return searcher.nodes
}

const HARD_MAX_ATTEMPTS = 500
const HARD_ENOUGH_NODES = 400 // early-exit once a level this hard turns up
const HARD_TIME_BUDGET_MS = 20000

/** Generate a uniquely-solvable level. Throws if no seed yields one. */
export function generateLevel(options: GenerateOptions): LevelJson {
  const { width, height, suspects } = options
  const baseSeed = options.seed ?? Math.floor(Math.random() * 1e9)
  const target = options.difficulty

  if (target === 'hard') {
    // Don't stop at the first hard level — keep the HARDEST one (most search
    // nodes), generating until it's hard enough or we run out of tries/time.
    const deadline = performance.now() + HARD_TIME_BUDGET_MS
    let hardest: LevelJson | null = null
    let bestNodes = -1
    for (let attempt = 0; attempt < HARD_MAX_ATTEMPTS; attempt++) {
      const result = tryGenerate(options, new Rng(baseSeed + attempt * 7919), baseSeed + attempt)
      if (result && result.pins === 0) {
        const nodes = searchDifficulty(result.level)
        if (nodes > bestNodes) {
          result.level.difficulty = rateTier(result.level)
          hardest = result.level
          bestNodes = nodes
        }
        if (bestNodes >= HARD_ENOUGH_NODES) break
      }
      if (hardest && performance.now() > deadline) break
    }
    if (!hardest) throw new Error(`Could not generate a hard ${width}x${height} level for ${suspects} suspects`)
    return hardest
  }

  const deadline = performance.now() + 2800
  let best: LevelJson | null = null
  let bestScore = Infinity
  for (let attempt = 0; attempt < 80; attempt++) {
    const result = tryGenerate(options, new Rng(baseSeed + attempt * 7919), baseSeed + attempt)
    if (result) {
      const tier = rateTier(result.level)
      result.level.difficulty = tier
      const mismatch = target && tier !== target ? 1 : 0
      const lines = countLineClues(result.level)
      // pin-free first, then right difficulty, then prefer line-free (variety).
      const score = result.pins * 1000 + mismatch * 10 + lines
      if (score < bestScore) {
        best = result.level
        bestScore = score
      }
      if (result.pins === 0 && mismatch === 0 && lines === 0) break
    }
    if (best && performance.now() > deadline) break // stay within the time budget
  }
  if (!best) throw new Error(`Could not generate a ${width}x${height} level for ${suspects} suspects`)
  return best
}

/** A single generation attempt for one seed — for tooling that runs many and
 *  keeps the hardest (see `dev/hardest.ts`). Returns null on a failed attempt. */
export function generateOnce(
  options: GenerateOptions,
  seed: number,
): { level: LevelJson; pins: number } | null {
  return tryGenerate(options, new Rng(seed), seed)
}

function tryGenerate(
  options: GenerateOptions,
  rng: Rng,
  seedIndex: number,
): { level: LevelJson; pins: number } | null {
  const { width, height, suspects } = options
  const baseTheme = THEMES.find((t) => t.id === options.themeId) ?? rng.pick(THEMES)
  // Shuffle the theme's room pool so each level uses a random subset → variety.
  const theme: Theme = { id: baseTheme.id, rooms: rng.shuffle([...baseTheme.rooms]) }

  const roomCount = Math.max(3, Math.min(theme.rooms.length, Math.round(suspects * 0.7)))
  const rooms = generateRooms(width, height, roomCount, rng)
  const roomOf = (cell: Cell): string => rooms.roomMap[Math.floor(cell / width)][cell % width]

  const suspectIds: PersonId[] = Array.from({ length: suspects }, (_, i) => String.fromCharCode(65 + i))
  const peopleIds = [...suspectIds, VICTIM_ID]

  const placed = generateSolution(width, height, roomOf, peopleIds, rng)
  if (!placed) return null

  const peopleCells = new Set<Cell>(placed.placement.values())
  const allow = options.objects
  const occ = allow ? OCCUPIABLE.filter((o) => allow.includes(o.type)) : OCCUPIABLE
  const blocking = allow ? BLOCKING.filter((o) => allow.includes(o.type)) : BLOCKING
  const objects = placeObjects(width, height, peopleCells, rng, occ, blocking)
  // Windows are optional — only some levels have them (and then 2–6).
  const windows = rng.chance(0.5) ? placeWindows(width, height, rng) : []

  const usedName = new Set<string>()
  const suspectMeta: SuspectJson[] = suspectIds.map((id, i) => {
    const gender: 'm' | 'f' = rng.chance(0.5) ? 'm' : 'f'
    const person = suspectPerson(i, gender, usedName)
    return { id, name: person.name, attributes: makeAttributes(gender, rng), clues: [] }
  })

  const victim = victimPerson(rng)
  const victimMeta = { name: victim.name, attributes: makeAttributes(victim.gender, rng) }
  const base = buildLevel(theme, width, height, rooms, objects, windows, suspectMeta, victimMeta, seedIndex)
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
  // Guard: the unique solution must leave the victim alone with exactly ONE
  // suspect (a well-defined murderer). Consistent semantics already guarantee
  // this; verifying ensures a murderer-less level can never slip through.
  const finalPuzzle = loadLevel(base)
  const finalSolution = new SearchSolver(finalPuzzle).firstSolution()
  if (!finalSolution || findMurderer(finalPuzzle, finalSolution).suspectId === null) return null
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
  occ: ObjectDef[],
  blocking: ObjectDef[],
): { groundMap: string[]; topMap: string[] } {
  const ground: string[][] = Array.from({ length: height }, () => new Array<string>(width).fill('.'))
  const top: string[][] = Array.from({ length: height }, () => new Array<string>(width).fill('.'))

  // Carpets are a ground layer; chairs/beds sit on top.
  const placeOcc = (r: number, c: number, def: ObjectDef): void => {
    if (def.type === 'carpet') ground[r][c] = def.char
    else top[r][c] = def.char
  }

  for (let cell = 0; cell < width * height; cell++) {
    const r = Math.floor(cell / width)
    const c = cell % width
    if (peopleCells.has(cell)) {
      if (occ.length > 0 && rng.next() < 0.5) placeOcc(r, c, rng.pick(occ))
      continue
    }
    const roll = rng.next()
    if (blocking.length > 0 && roll < 0.3) top[r][c] = rng.pick(blocking).char
    else if (occ.length > 0 && roll < 0.45) placeOcc(r, c, rng.pick(occ))
  }
  return {
    groundMap: ground.map((row) => row.join('')),
    topMap: top.map((row) => row.join('')),
  }
}

/**
 * Place a handful of windows on the outer wall (2–6), each owned by a border cell
 * on its outward side. Several windows keep "beside a window" non-unique.
 */
function placeWindows(
  width: number,
  height: number,
  rng: Rng,
): { r: number; c: number; side: Side }[] {
  const border: { r: number; c: number; sides: Side[] }[] = []
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const sides: Side[] = []
      if (r === 0) sides.push('N')
      if (r === height - 1) sides.push('S')
      if (c === 0) sides.push('W')
      if (c === width - 1) sides.push('E')
      if (sides.length > 0) border.push({ r, c, sides })
    }
  }
  const count = Math.min(border.length, 2 + rng.int(5)) // 2..6
  return rng
    .shuffle(border)
    .slice(0, count)
    .map((b) => ({ r: b.r, c: b.c, side: b.sides[rng.int(b.sides.length)] }))
}

// --- level json -----------------------------------------------------------

function buildLevel(
  theme: Theme,
  width: number,
  height: number,
  rooms: { roomMap: string[]; ids: string[] },
  objects: { groundMap: string[]; topMap: string[] },
  windows: { r: number; c: number; side: Side }[],
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
    windows,
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
  if (board.hasWindow(cell)) out.push({ type: 'nearWindow' })

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

  // "Niemand im Raum hatte X" counts EVERYONE in the room (incl. subject + victim).
  const inRoomAll = puzzle.allIds().filter((id) => board.roomIdOf(solution.cellOf(id)) === room)
  for (const attr of ['beard', 'glasses']) {
    if (!inRoomAll.some((id) => puzzle.attributesOf(id)[attr] === true)) {
      out.push({ type: 'roomAttribute', quantifier: 'none', attribute: attr, value: true })
    }
  }
  // "allein mit …" / "in seinem Raum saß …" are about OTHER SUSPECTS only — never the
  // subject, never the victim (else they would reveal the murderer beside the body).
  const othersInRoom = otherSuspects.filter((id) => board.roomIdOf(solution.cellOf(id)) === room)
  if (othersInRoom.length === 1) {
    const gender = puzzle.attributesOf(othersInRoom[0]).gender
    out.push({ type: 'roomCompanion', count: 1, attribute: 'gender', value: gender })
  }
  for (const id of othersInRoom) {
    const gender = puzzle.attributesOf(id).gender
    for (const obj of board.tileAt(solution.cellOf(id)).objects()) {
      if (obj.occupiable) out.push({ type: 'roomExists', attribute: 'gender', value: gender, object: obj.type })
    }
  }

  const trueClues = out.filter((json) => createClue(json).test(suspectId, solution, puzzle))
  return trueClues.sort((a, b) => tightness(a, puzzle) - tightness(b, puzzle))
}

function tightness(json: ClueJson, puzzle: Puzzle): number {
  // Row/column clues are a last resort — prefer object/room/relational clues.
  if (json.type === 'inRow' || json.type === 'inCol') return 150
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

  const MAX_LINE = 1 // ≤1 line clue; generateLevel further prefers line-free levels
  const isLine = (clue: ClueJson): boolean => clue.type === 'inRow' || clue.type === 'inCol'
  const lineSuspects = (): number => {
    let n = 0
    for (const id of suspectIds) {
      if (used.get(id)!.some((i) => isLine(candidates.get(id)![i]))) n++
    }
    return n
  }

  // Tighten: add a natural clue (never inRow+inCol together, ≤1 line clue) until unique.
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
        if (hasCoordPair(id) || lineSuspects() > MAX_LINE) {
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
      if (lineSuspects() <= MAX_LINE && unique()) break
      u[0] = current
    }
  }

  return new Map(suspectIds.map((id) => [id, clueOf(id)]))
}

/** How many suspects use a row/column clue — minimised for variety. */
function countLineClues(level: LevelJson): number {
  let n = 0
  for (const s of level.suspects) {
    const clues = s.clues ?? []
    const flat = clues.flatMap((c) => (c.type === 'and' ? c.clues : [c]))
    if (flat.some((c) => c.type === 'inRow' || c.type === 'inCol')) n++
  }
  return n
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
