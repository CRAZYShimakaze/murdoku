import { Rng } from './random.ts'
import { suspectPerson, victimPerson } from './names.ts'
import { loadLevel } from '../io/LevelLoader.ts'
import { Solution } from '../model/Solution.ts'
import { SearchSolver } from '../solver/SearchSolver.ts'
import { findMurderer } from '../solver/murderer.ts'
import { DeductionEngine } from '../solver/DeductionEngine.ts'
import { difficultyOf } from '../solver/DeductionStep.ts'
import { createClue } from '../clues/ClueFactory.ts'
import { createBoardClue } from '../clues/boardClues.ts'
import { MULTI_CELL_TYPES, VICTIM_ID } from '../model/types.ts'
import type { AttributeValue, Cell, PersonId, Side } from '../model/types.ts'
import { OBJECT_CATALOG, type ObjectDef } from '../model/objects.ts'
import type { Board } from '../model/Board.ts'
import type { Puzzle } from '../model/Puzzle.ts'
import type { BoardClueJson, LevelJson, SuspectJson } from '../io/LevelSchema.ts'
import type { ClueJson } from '../clues/ClueFactory.ts'

interface Theme {
  id: string
  rooms: string[]
  /** Outdoor rooms: where a car may stand AND what counts as "outside" for inside/outside clues. */
  outdoor: string[]
}

// The generator places from the shared object catalog (same one the editor paints).
const ALL_OBJECTS: readonly ObjectDef[] = OBJECT_CATALOG
const OCCUPIABLE: ObjectDef[] = ALL_OBJECTS.filter((o) => o.occupiable)
const BLOCKING: ObjectDef[] = ALL_OBJECTS.filter((o) => !o.occupiable)

/** Every placeable object type (for the UI's per-object toggles). */
export const GENERATOR_OBJECT_TYPES: string[] = ALL_OBJECTS.map((o) => o.type)

/** Object types that may occur by default; the rest are opt-in via `options.objects`. */
export const DEFAULT_OBJECT_TYPES: string[] = [
  'carpet',
  'chair',
  'bed',
  'table',
  'tv',
  'plant',
  'shelf',
  'box',
]

const THEMES: Theme[] = [
  {
    id: 'apartment',
    rooms: ['Badezimmer', 'Küche', 'Wohnzimmer', 'Gästezimmer', 'Flur', 'Kinderzimmer 1', 'Kinderzimmer 2', 'Arbeitszimmer', 'Garage', 'Schlafzimmer', 'Esszimmer', 'Balkon', 'Abstellkammer', 'Waschküche', 'Vorratskammer'],
    outdoor: ['Garage', 'Balkon'],
  },
  {
    id: 'crime-scene',
    rooms: ['Flur', 'Wohnzimmer', 'Küche', 'Bad', 'Schlafzimmer', 'Büro', 'Keller', 'Garage', 'Esszimmer', 'Dachboden', 'Gästezimmer', 'Abstellraum', 'Waschküche', 'Veranda', 'Kinderzimmer'],
    outdoor: ['Garage', 'Veranda'],
  },
  {
    id: 'auto-shop',
    rooms: ['Werkstatt', 'Lager', 'Büro', 'Wartebereich', 'Hof', 'Waschhalle', 'Ersatzteillager', 'Reifenlager', 'Empfang', 'Lackiererei', 'Montagehalle', 'Prüfstand', 'Sozialraum', 'Kasse', 'Tankstelle'],
    outdoor: ['Werkstatt', 'Hof', 'Waschhalle', 'Montagehalle', 'Lackiererei', 'Prüfstand', 'Tankstelle'],
  },
  {
    id: 'game-night',
    rooms: ['Wohnzimmer', 'Esszimmer', 'Küche', 'Flur', 'Balkon', 'Spielzimmer', 'Bar', 'Lounge', 'Terrasse', 'Bibliothek', 'Wintergarten', 'Diele', 'Vorratskammer', 'Gästebad', 'Arbeitszimmer'],
    outdoor: ['Balkon', 'Terrasse'],
  },
  {
    id: 'office',
    rooms: ['Großraumbüro', 'Besprechung', 'Küche', 'Empfang', 'Serverraum', 'Archiv', 'Chefbüro', 'Kopierraum', 'Teeküche', 'Lager', 'Konferenzraum', 'Lobby', 'Aufenthaltsraum', 'Poststelle', 'Druckerraum'],
    outdoor: [],
  },
  {
    id: 'mansion',
    rooms: ['Eingangshalle', 'Salon', 'Speisesaal', 'Bibliothek', 'Musikzimmer', 'Wintergarten', 'Galerie', 'Boudoir', 'Rauchzimmer', 'Ballsaal', 'Gewächshaus', 'Weinkeller', 'Bedienstetenzimmer', 'Ankleidezimmer', 'Kaminzimmer'],
    outdoor: [],
  },
  {
    id: 'hotel',
    rooms: ['Lobby', 'Rezeption', 'Restaurant', 'Bar', 'Suite', 'Konferenzraum', 'Spa', 'Fitnessraum', 'Küche', 'Gepäckraum', 'Frühstücksraum', 'Dachterrasse', 'Aufzug', 'Flur', 'Wäscherei'],
    outdoor: ['Dachterrasse'],
  },
  {
    id: 'school',
    rooms: ['Klassenzimmer', 'Aula', 'Turnhalle', 'Bibliothek', 'Lehrerzimmer', 'Sekretariat', 'Pausenhof', 'Chemieraum', 'Musiksaal', 'Mensa', 'Werkraum', 'Computerraum', 'Umkleide', 'Kunstraum', 'Flur'],
    outdoor: ['Pausenhof'],
  },
  {
    id: 'hospital',
    rooms: ['Empfang', 'Wartezimmer', 'OP-Saal', 'Station', 'Labor', 'Apotheke', 'Röntgen', 'Intensivstation', 'Aufenthaltsraum', 'Notaufnahme', 'Kreißsaal', 'Sterilisation', 'Büro', 'Cafeteria', 'Flur'],
    outdoor: [],
  },
  {
    id: 'museum',
    rooms: ['Eingangshalle', 'Hauptgalerie', 'Ausstellung', 'Tresor', 'Café', 'Sicherheitsraum', 'Werkstatt', 'Archiv', 'Garderobe', 'Sonderausstellung', 'Foyer', 'Bibliothek', 'Lager', 'Auditorium', 'Toilette'],
    outdoor: [],
  },
  {
    id: 'restaurant',
    rooms: ['Speisesaal', 'Küche', 'Bar', 'Weinkeller', 'Terrasse', 'Lager', 'Büro', 'Empfang', 'Spülküche', 'Vorbereitung', 'Kühlraum', 'Personalraum', 'Lounge', 'Toilette', 'Garderobe'],
    outdoor: ['Terrasse'],
  },
  {
    id: 'farm',
    rooms: ['Weide', 'Hof', 'Garten', 'Schuppen', 'Haus', 'Kuhstall', 'Schweinestall', 'Scheune', 'Hühnerstall', 'Pferdestall', 'Gewächshaus', 'Vorratskammer', 'Milchkammer', 'Feld', 'Teich'],
    outdoor: ['Weide', 'Hof', 'Garten', 'Feld', 'Teich'],
  },
  {
    id: 'supermarkt',
    rooms: ['Kasse', 'Snacks', 'Getränke', 'Wurstabteilung', 'Obstabteilung', 'Kühlregale', 'Spielzeugabteilung', 'Lagerraum', 'Bäckerei', 'Gemüseabteilung', 'Käsetheke', 'Tiefkühlung', 'Drogerie', 'Personalraum', 'Parkplatz'],
    outdoor: ['Parkplatz'],
  },
]
const ROOM_COLORS = ['#e8d8b0', '#b9d0e6', '#cfe0cf', '#d8c0c0', '#e6cda0', '#e6c0d2', '#c6c0e0', '#c0e0c8']

/** Theme ids the generator knows (for the UI's theme picker). */
export const THEME_IDS: string[] = THEMES.map((t) => t.id)

/** A theme's room names (used as nameKeys, same as generated levels). */
export function themeRooms(id: string): string[] {
  return (THEMES.find((t) => t.id === id) ?? THEMES[0]).rooms
}

/** A theme's outdoor room names (→ rooms[].outside for inside/outside clues). */
export function themeOutdoor(id: string): string[] {
  return (THEMES.find((t) => t.id === id) ?? THEMES[0]).outdoor
}

export type GenDifficulty = 'easy' | 'medium' | 'hard'

export interface GenerateOptions {
  width: number
  height: number
  suspects: number
  seed?: number
  themeId?: string
  difficulty?: GenDifficulty
  /** Object types allowed on the board (default: DEFAULT_OBJECT_TYPES). */
  objects?: string[]
  /** Allow windows (on by default); some levels then get 2–6 of them. */
  windows?: boolean
  /** Place a few doors between rooms (enables "beside a door" clues). */
  doors?: boolean
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

/** Cap on "was in row X / column Y" clues per level (rows + columns combined) for the
 *  random fill at medium/hard — they are coordinate-y and dull, so keep them scarce. */
const MAX_LINE_CLUES = 2

/** One generation attempt → a candidate level (with its pin count), or null. */
type Attempt = (rng: Rng, seedIndex: number) => { level: LevelJson; pins: number } | null

/** How far apart two difficulty tiers are (so a target prefers the nearest tier). */
const TIER_RANK: Record<GenDifficulty, number> = { easy: 0, medium: 1, hard: 2 }
const tierDistance = (a: string, b: GenDifficulty | undefined): number =>
  b && a in TIER_RANK ? Math.abs(TIER_RANK[a as GenDifficulty] - TIER_RANK[b]) : 0

interface PickOptions {
  /** Cap on attempts (default 80). */
  maxAttempts?: number
  /** Soft budget: once a candidate exists, stop hunting for a better one (default 2800ms). */
  timeBudgetMs?: number
  /** Hard cap: give up even with nothing found yet (default: none — keep trying to the
   *  attempt cap). The fixed-board fill sets this so a stubborn board can't hang. */
  hardTimeBudgetMs?: number
}

/**
 * Run many attempts and keep the best per the target difficulty:
 *  - 'hard': keep the HARDEST (most search nodes) until hard enough or out of budget;
 *  - else: prefer pin-free, then the NEAREST difficulty tier, then line-free.
 * Each attempt's `level.difficulty` is set to its rated tier. Returns null if none.
 */
function pickBestLevel(
  attempt: Attempt,
  baseSeed: number,
  target: GenDifficulty | undefined,
  opts: PickOptions = {},
): LevelJson | null {
  if (target === 'hard') {
    const deadline = performance.now() + HARD_TIME_BUDGET_MS
    let hardest: LevelJson | null = null
    let bestNodes = -1
    for (let a = 0; a < HARD_MAX_ATTEMPTS; a++) {
      const result = attempt(new Rng(baseSeed + a * 7919), baseSeed + a)
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
    return hardest
  }

  const maxAttempts = opts.maxAttempts ?? 80
  const softDeadline = performance.now() + (opts.timeBudgetMs ?? 2800)
  const hardDeadline = performance.now() + (opts.hardTimeBudgetMs ?? Infinity)
  let best: LevelJson | null = null
  let bestScore = Infinity
  for (let a = 0; a < maxAttempts; a++) {
    const result = attempt(new Rng(baseSeed + a * 7919), baseSeed + a)
    if (result) {
      const tier = rateTier(result.level)
      result.level.difficulty = tier
      const mismatch = tierDistance(tier, target)
      const lines = countLineClues(result.level)
      const score = result.pins * 1000 + mismatch * 10 + lines
      if (score < bestScore) {
        best = result.level
        bestScore = score
      }
      if (result.pins === 0 && mismatch === 0 && lines === 0) break
    }
    // Once we have a candidate, stop hunting at the soft deadline; with nothing yet,
    // keep trying until the hard cap (so the fill reliably returns *something*).
    if (best && performance.now() > softDeadline) break
    if (performance.now() > hardDeadline) break
  }
  return best
}

/** Generate a uniquely-solvable level. Throws if no seed yields one. */
export function generateLevel(options: GenerateOptions): LevelJson {
  const { width, height, suspects } = options
  const baseSeed = options.seed ?? Math.floor(Math.random() * 1e9)
  const level = pickBestLevel(
    (rng, seedIndex) => tryGenerate(options, rng, seedIndex),
    baseSeed,
    options.difficulty,
  )
  if (!level) throw new Error(`Could not generate a ${width}x${height} level for ${suspects} suspects`)
  return level
}

export interface FillBoardOptions {
  difficulty?: GenDifficulty
  seed?: number
}

/**
 * Keep a finished board (rooms / objects / windows / doors / global clues) EXACTLY
 * as given, but (re)generate the people: fresh names + traits and a clue per suspect
 * so the murder puzzle is uniquely solvable at the requested difficulty. Suspect ids
 * and count come from `board.suspects`. Clues are restricted to the editor's flat
 * vocabulary so the result round-trips into the editor. Returns the filled level, or
 * null if no unique arrangement exists on this board.
 */
export function fillBoardClues(board: LevelJson, options: FillBoardOptions = {}): LevelJson | null {
  const suspectIds = board.suspects.map((s) => s.id)
  if (suspectIds.length === 0) return null
  const baseSeed = options.seed ?? Math.floor(Math.random() * 1e9)

  // EASY: every successful attempt is ALREADY a valid easy puzzle (≤2 simple clues, no
  // contradiction). On a hard/uniform board such layouts are rare, so we just keep trying
  // fresh placements until one lands or a generous time budget runs out — taking the first
  // that works (the user chose "search longer" over a guaranteed result).
  if (options.difficulty === 'easy') {
    const deadline = performance.now() + 20000
    for (let a = 0; a < 200000 && performance.now() < deadline; a++) {
      const result = fillAttempt(board, suspectIds, new Rng(baseSeed + a * 7919), 'easy')
      if (result) {
        result.level.difficulty = rateTier(result.level)
        return result.level
      }
    }
    return null
  }

  // The board is fixed, so a fill is harder to land than free generation — give it
  // more attempts but a firm time bound (it runs in a worker with a cancel button).
  return pickBestLevel(
    (rng) => fillAttempt(board, suspectIds, rng, options.difficulty),
    baseSeed,
    options.difficulty,
    { maxAttempts: 400, timeBudgetMs: 5000, hardTimeBudgetMs: 20000 },
  )
}

/** One people-fill attempt on the fixed board: fresh identities, a valid hidden
 *  placement consistent with the board's global clues, and editor-safe clues. */
function fillAttempt(
  board: LevelJson,
  suspectIds: PersonId[],
  rng: Rng,
  difficulty?: GenDifficulty,
): { level: LevelJson; pins: number } | null {
  const usedName = new Set<string>()
  const suspectMeta: SuspectJson[] = suspectIds.map((id, i) => {
    const gender: 'm' | 'f' = rng.chance(0.5) ? 'm' : 'f'
    const person = suspectPerson(i, gender, usedName)
    return { id, name: person.name, attributes: makeAttributes(gender, rng), clues: [] }
  })
  const victim = victimPerson(rng)
  const victimMeta = { name: victim.name, attributes: makeAttributes(victim.gender, rng) }
  const base: LevelJson = { ...board, suspects: suspectMeta, victim: victimMeta }
  const basePuzzle = loadLevel(base)

  const placement = placeOnBoard(basePuzzle, suspectIds, rng)
  if (!placement) return null
  const solution = new Solution(placement)

  const candidates = new Map<PersonId, ClueJson[]>()
  for (const id of suspectIds) {
    const others = suspectIds.filter((o) => o !== id)
    candidates.set(id, candidatesFor(id, solution, basePuzzle, others, true))
  }

  // EASY is built by forward construction (place + pin each suspect in the shrinking board).
  // MEDIUM / HARD use natural clue selection, but the "was in row X / column Y" clue type
  // stays rare: at most TWO such clues across the whole level (rows and columns combined).
  const chosen =
    difficulty === 'easy'
      ? constructEasyClues(base, suspectIds, solution, candidates, rng)
      : selectClues(base, suspectIds, candidates, rng, difficulty, MAX_LINE_CLUES)
  if (!chosen) return null

  // Limit how many suspects are obvious from the START (their own clue pins one cell):
  // at most ONE for easy, and NONE from medium up — there you must cross something out
  // before anyone can be placed.
  const maxAnchors = difficulty === 'easy' ? 1 : 0
  if (countAnchors(chosen, suspectIds, basePuzzle.board) > maxAnchors) return null

  const level: LevelJson = {
    ...base,
    suspects: base.suspects.map((s) => ({ ...s, clues: [chosen.get(s.id)!] })),
  }
  const finalPuzzle = loadLevel(level)
  const finalSolution = new SearchSolver(finalPuzzle).firstSolution()
  if (!finalSolution || findMurderer(finalPuzzle, finalSolution).suspectId === null) return null
  if (difficulty === 'easy') {
    // Confirm the construction is genuinely unique and solvable by SHORT, simple steps —
    // hidden singles / "only one on X" / row-column cross-out (rank ≤ 2), no harder
    // technique and never a contradiction.
    if (new SearchSolver(finalPuzzle).countSolutions(2) !== 1) return null
    const ded = new DeductionEngine(finalPuzzle).solve()
    if (!ded.solved || ded.maxRank > 2) return null
  }
  return { level, pins: countPins(chosen) }
}

/**
 * A random hidden placement of the people. Like the played game, EVERY person sits on a
 * DISTINCT row AND a DISTINCT column (the Sudoku rule — the solver forbids a person's whole
 * row and column for the others), on an occupiable cell, with the victim sharing a room
 * with EXACTLY one suspect (a well-defined murderer) and every global board clue holding.
 * Returns null if no such arrangement turns up.
 */
function placeOnBoard(puzzle: Puzzle, suspectIds: PersonId[], rng: Rng): Map<PersonId, Cell> | null {
  const board = puzzle.board
  const W = board.width
  const H = board.height
  const people = [...suspectIds, VICTIM_ID]
  const p = people.length
  if (p > W || p > H) return null
  // Occupiable columns available in each row (for the distinct-row/column matching).
  const colsByRow: number[][] = []
  for (let r = 0; r < H; r++) {
    const cs: number[] = []
    for (let c = 0; c < W; c++) if (board.isOccupiable(r * W + c)) cs.push(c)
    colsByRow.push(cs)
  }

  for (let attempt = 0; attempt < 4000; attempt++) {
    const rows = rng.shuffle([...Array(H).keys()]).slice(0, p)
    // Backtracking match: give each chosen row a DISTINCT occupiable column.
    const cols = new Array<number>(p).fill(-1)
    const usedCols = new Set<number>()
    const match = (i: number): boolean => {
      if (i === p) return true
      for (const c of rng.shuffle([...colsByRow[rows[i]]])) {
        if (usedCols.has(c)) continue
        usedCols.add(c)
        cols[i] = c
        if (match(i + 1)) return true
        usedCols.delete(c)
      }
      return false
    }
    if (!match(0)) continue

    const order = rng.shuffle([...people])
    const placement = new Map<PersonId, Cell>()
    for (let i = 0; i < p; i++) placement.set(order[i], rows[i] * W + cols[i])
    const victimRoom = board.roomIdOf(placement.get(VICTIM_ID)!)
    const inRoom = suspectIds.filter((id) => board.roomIdOf(placement.get(id)!) === victimRoom)
    if (inRoom.length !== 1) continue
    const solution = new Solution(placement)
    if (puzzle.boardClues.every((bc) => bc.test(solution, puzzle))) return placement
  }
  return null
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
  const theme: Theme = {
    id: baseTheme.id,
    rooms: rng.shuffle([...baseTheme.rooms]),
    outdoor: baseTheme.outdoor,
  }

  const roomCount = Math.max(3, Math.min(theme.rooms.length, Math.round(suspects * 0.7)))
  const rooms = generateRooms(width, height, roomCount, rng)
  const roomOf = (cell: Cell): string => rooms.roomMap[Math.floor(cell / width)][cell % width]
  // Which room ids are outdoor/garage (mirrors buildLevel's name assignment).
  const outdoorIds = new Set<string>()
  rooms.ids.forEach((id, i) => {
    if (theme.outdoor.includes(theme.rooms[i % theme.rooms.length])) outdoorIds.add(id)
  })
  const isOutdoor = (cell: Cell): boolean => outdoorIds.has(roomOf(cell))

  const suspectIds: PersonId[] = Array.from({ length: suspects }, (_, i) => String.fromCharCode(65 + i))
  const peopleIds = [...suspectIds, VICTIM_ID]

  const placed = generateSolution(width, height, roomOf, peopleIds, rng)
  if (!placed) return null

  const peopleCells = new Set<Cell>(placed.placement.values())
  const allow = options.objects ?? DEFAULT_OBJECT_TYPES
  const occ = OCCUPIABLE.filter((o) => allow.includes(o.type))
  const blocking = BLOCKING.filter((o) => allow.includes(o.type))
  const objects = placeObjects(width, height, peopleCells, rng, occ, blocking, isOutdoor, roomOf)
  // Windows are on by default; when allowed, only some levels get them (then 2–6).
  const windows =
    options.windows === false ? [] : rng.chance(0.5) ? placeWindows(width, height, rng) : []
  // Doors are opt-in; when enabled, a few sit between adjacent rooms.
  const doors = options.doors ? placeDoors(width, height, rooms.roomMap, rng) : []

  const usedName = new Set<string>()
  const suspectMeta: SuspectJson[] = suspectIds.map((id, i) => {
    const gender: 'm' | 'f' = rng.chance(0.5) ? 'm' : 'f'
    const person = suspectPerson(i, gender, usedName)
    return { id, name: person.name, attributes: makeAttributes(gender, rng), clues: [] }
  })

  const victim = victimPerson(rng)
  const victimMeta = { name: victim.name, attributes: makeAttributes(victim.gender, rng) }
  const base = buildLevel(theme, width, height, rooms, objects, windows, doors, suspectMeta, victimMeta, seedIndex)
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
  // Now and then add a board-wide clue (consistent with the solution) as bonus
  // flavour. It is true for the unique solution, so uniqueness/murderer are kept.
  if (rng.chance(0.35)) {
    const bc = bonusBoardClue(finalPuzzle, solution, rng)
    if (bc) base.boardClues = [bc]
  }
  return { level: base, pins: countPins(chosen) }
}

/**
 * A board-wide clue that genuinely holds for `solution` (or null). Because it only
 * constrains the already-unique solution, adding it never changes the answer — it
 * is pure extra flavour: "exactly N people stood on a <object>" or "N rooms empty".
 */
function bonusBoardClue(puzzle: Puzzle, solution: Solution, rng: Rng): BoardClueJson | null {
  const board = puzzle.board
  const candidates: BoardClueJson[] = []

  for (const def of OCCUPIABLE) {
    if (board.cellsWithObject(def.type).size === 0) continue
    let n = 0
    for (const [, cell] of solution.entries()) {
      if (board.tileAt(cell).hasObjectType(def.type)) n++
    }
    if (n > 0) candidates.push({ type: 'countOnObject', object: def.type, count: n })
  }

  const occupied = new Set<string>()
  for (const [, cell] of solution.entries()) occupied.add(board.roomIdOf(cell))
  let empty = 0
  for (const id of board.rooms.keys()) if (!occupied.has(id)) empty++
  if (empty > 0) candidates.push({ type: 'emptyRooms', count: empty })

  const valid = candidates.filter((c) => createBoardClue(c).test(solution, puzzle))
  return valid.length ? rng.pick(valid) : null
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

  // Merge any room with fewer than 3 cells into a neighbouring room (tiny rooms
  // that can't hold anyone make no sense).
  const sizes = (): Map<number, number> => {
    const m = new Map<number, number>()
    for (const v of assign) m.set(v, (m.get(v) ?? 0) + 1)
    return m
  }
  for (let guard = 0; guard < n; guard++) {
    const sz = sizes()
    if (sz.size <= 1) break
    let small = -1
    for (const [room, count] of sz) {
      if (count < 3 && (small < 0 || count < sz.get(small)!)) small = room
    }
    if (small < 0) break
    let target = -1
    for (let cell = 0; cell < n && target < 0; cell++) {
      if (assign[cell] !== small) continue
      for (const nb of neighbors(cell)) {
        if (assign[nb] !== small) {
          target = assign[nb]
          break
        }
      }
    }
    if (target < 0) break
    for (let cell = 0; cell < n; cell++) if (assign[cell] === small) assign[cell] = target
  }

  // Remap remaining rooms to contiguous ids 1..k (some were merged away).
  const remap = new Map<number, number>()
  for (const v of assign) if (!remap.has(v)) remap.set(v, remap.size)
  for (let cell = 0; cell < n; cell++) assign[cell] = remap.get(assign[cell])!

  const ids = Array.from({ length: remap.size }, (_, room) => String(room + 1))
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
  isOutdoor: (cell: Cell) => boolean,
  roomOf: (cell: Cell) => string,
): { groundMap: string[]; topMap: string[] } {
  const ground: string[][] = Array.from({ length: height }, () => new Array<string>(width).fill('.'))
  const top: string[][] = Array.from({ length: height }, () => new Array<string>(width).fill('.'))
  const inB = (r: number, c: number) => r >= 0 && r < height && c >= 0 && c < width
  const free = (r: number, c: number) => inB(r, c) && top[r][c] === '.' && ground[r][c] === '.'

  /** Beds and cars occupy two adjacent tiles; the partner must be empty (and, for
   *  a car, both tiles outdoor). Returns true if the pair was placed. */
  const placePair = (r: number, c: number, def: ObjectDef): boolean => {
    for (const [dr, dc] of rng.shuffle([
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ])) {
      const r2 = r + dr
      const c2 = c + dc
      if (!free(r2, c2)) continue
      // A 2-cell object must lie within a single room.
      if (roomOf(r * width + c) !== roomOf(r2 * width + c2)) continue
      if (def.type === 'car' && !(isOutdoor(r * width + c) && isOutdoor(r2 * width + c2))) continue
      top[r][c] = def.char
      top[r2][c2] = def.char
      return true
    }
    return false
  }

  // Ground objects (carpet) sit under people; multi-cell ones (bed/car) span two
  // tiles; everything else is a single top object. A pair that won't fit is skipped
  // (no chair fallback) so the chosen object set is respected.
  const placeOcc = (r: number, c: number, def: ObjectDef): void => {
    if (def.layer === 'ground') ground[r][c] = def.char
    else if (MULTI_CELL_TYPES.has(def.type)) placePair(r, c, def)
    else top[r][c] = def.char
  }

  for (let cell = 0; cell < width * height; cell++) {
    const r = Math.floor(cell / width)
    const c = cell % width
    if (!free(r, c)) continue // already part of a placed bed/car
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

/**
 * Place a few doors (1–3) on interior walls between two adjacent, DIFFERENT rooms.
 * A door is anchored at the top/left cell of the shared edge (side 'S' or 'E'); the
 * loader registers it on both cells, so each side counts as "beside a door".
 */
function placeDoors(
  width: number,
  height: number,
  roomMap: string[],
  rng: Rng,
): { r: number; c: number; side: Side }[] {
  const edges: { r: number; c: number; side: Side }[] = []
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (r < height - 1 && roomMap[r][c] !== roomMap[r + 1][c]) edges.push({ r, c, side: 'S' })
      if (c < width - 1 && roomMap[r][c] !== roomMap[r][c + 1]) edges.push({ r, c, side: 'E' })
    }
  }
  if (edges.length === 0) return []
  const count = Math.min(edges.length, 1 + rng.int(3)) // 1..3
  return rng.shuffle(edges).slice(0, count)
}

// --- level json -----------------------------------------------------------

function buildLevel(
  theme: Theme,
  width: number,
  height: number,
  rooms: { roomMap: string[]; ids: string[] },
  objects: { groundMap: string[]; topMap: string[] },
  windows: { r: number; c: number; side: Side }[],
  doors: { r: number; c: number; side: Side }[],
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
    doors,
    suspects,
    victim,
  }
}

// --- clues ----------------------------------------------------------------

/**
 * Build the pool of clues that are TRUE for `suspectId` in this solution, tightest
 * first. Covers the full clue vocabulary; the test-filter keeps only true ones.
 * `editorSafe` drops the room-attribute family (roomAttribute / roomCompanion /
 * roomExists), which the editor's flat clue builder cannot round-trip.
 */
function candidatesFor(
  suspectId: PersonId,
  solution: Solution,
  puzzle: Puzzle,
  otherSuspects: PersonId[],
  editorSafe = false,
): ClueJson[] {
  const board = puzzle.board
  const cell = solution.cellOf(suspectId)
  const { row, col } = board.rc(cell)
  const room = board.roomIdOf(cell)
  const out: ClueJson[] = []

  // --- object: on / beside ---
  for (const obj of board.tileAt(cell).objects()) {
    if (obj.occupiable) {
      out.push({ type: 'onObject', object: obj.type })
      // "only person on a chair/carpet/…" — kept by the test-filter only if truly unique.
      out.push({ type: 'uniqueOnObject', object: obj.type })
    }
  }
  const nearTypes = new Set<string>()
  for (const nb of board.neighbors4(cell)) {
    if (board.roomIdOf(nb) === room) {
      for (const obj of board.tileAt(nb).objects()) nearTypes.add(obj.type)
    }
  }
  for (const type of nearTypes) out.push({ type: 'nearObject', object: type })

  // --- object: same line / direction (objects are fixed → deducible) ---
  for (const def of ALL_OBJECTS) {
    if (board.objectCells(def.type).length === 0) continue
    for (const line of ['col', 'row', 'either'] as const) {
      out.push({ type: 'sameLineAsObject', object: def.type, line, room: 'any' })
    }
    for (const dir of ['north', 'south', 'east', 'west'] as const) {
      out.push({ type: 'directionFromObject', object: def.type, dir, room: 'any' })
    }
  }

  // --- position ---
  out.push({ type: 'inRoom', room })
  out.push({ type: 'inRow', row })
  out.push({ type: 'inCol', col })
  if (board.isCorner(cell)) out.push({ type: 'corner' })
  if (board.isAtWall(cell)) out.push({ type: 'atWall' })
  if (board.hasWindow(cell)) {
    out.push({ type: 'nearWindow' })
    out.push({ type: 'uniqueNearWindow' }) // "only person beside a window" (test-filtered)
  }
  if (board.hasDoor(cell)) out.push({ type: 'nearDoor' })
  // inside/outside only when the board actually mixes indoor and outdoor rooms.
  if (board.cellsOutside(true).size > 0 && board.cellsOutside(false).size > 0) {
    out.push(board.isOutside(cell) ? { type: 'outside' } : { type: 'inside' })
    for (const id of otherSuspects) out.push({ type: 'insideXor', with: id })
  }

  // --- social: relative to other people ---
  const inRoomAll = puzzle.allIds().filter((id) => board.roomIdOf(solution.cellOf(id)) === room)
  if (inRoomAll.length > 1) out.push({ type: 'notAlone' })
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

  // --- room-attribute clues: "no one / some / everyone else in the room had X" ---
  // Boolean traits (beard/glasses/bald) round-trip to the editor, so they are offered
  // in BOTH modes — with excludeSelf in editor-safe mode to match the editor's flat
  // builder. Gender (valued) and the roomCompanion/roomExists clues have no editor
  // equivalent, so they stay generator-only.
  const attrPairs: { attribute: string; value: AttributeValue }[] = [
    { attribute: 'beard', value: true },
    { attribute: 'glasses', value: true },
    { attribute: 'bald', value: true },
  ]
  if (!editorSafe) {
    attrPairs.push({ attribute: 'gender', value: 'm' }, { attribute: 'gender', value: 'f' })
  }
  for (const { attribute, value } of attrPairs) {
    for (const quantifier of ['none', 'some', 'all'] as const) {
      out.push({ type: 'roomAttribute', quantifier, attribute, value, excludeSelf: editorSafe })
    }
  }
  if (!editorSafe) {
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
  }

  // --- negations ("NICHT neben einem Regal / an der Wand …") — the hand-made easy
  // levels use these for elimination. Only the editor-representable fill needs them. ---
  if (editorSafe) {
    const roomObjTypes = new Set<string>()
    for (let c = 0; c < board.width * board.height; c++) {
      if (board.roomIdOf(c) === room) for (const obj of board.tileAt(c).objects()) roomObjTypes.add(obj.type)
    }
    for (const t of roomObjTypes) {
      out.push({ type: 'not', clue: { type: 'nearObject', object: t } })
      out.push({ type: 'not', clue: { type: 'onObject', object: t } })
    }
    out.push({ type: 'not', clue: { type: 'atWall' } })
    out.push({ type: 'not', clue: { type: 'corner' } })
    out.push({ type: 'not', clue: { type: 'nearWindow' } })
  }

  // Keep only clues TRUE for this solution; sort tightest-first (tightness once each).
  const scored = out
    .filter((json) => createClue(json).test(suspectId, solution, puzzle))
    .map((json) => ({ json, t: tightness(json, puzzle) }))
  scored.sort((a, b) => a.t - b.t)
  return scored.map((s) => s.json)
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
    case 'notAlone':
      return 70
    case 'insideXor':
      return 90
    case 'direction':
      return 100
    default:
      return 60
  }
}

/** Easy-clue palette: simple, self-contained clue types (or their negation) — the same
 *  ones the hand-made easy levels use. No abstract "same line / direction of" or attribute. */
const EASY_ALLOWED_TYPES = new Set<string>([
  'onObject', 'uniqueOnObject', 'nearObject', 'inRoom', 'nearWindow', 'uniqueNearWindow',
  'nearDoor', 'corner', 'atWall', 'inside', 'outside', 'inCol', 'inRow',
])
const easyInnerType = (c: ClueJson): string => (c.type === 'not' ? c.clue.type : c.type)
const isLineClue = (c: ClueJson): boolean => {
  const t = easyInnerType(c)
  return t === 'inCol' || t === 'inRow'
}

/**
 * Build an EASY puzzle by FORWARD CONSTRUCTION instead of random search: place suspects
 * one at a time, each pinned to their cell by ≤2 SIMPLE clues that single them out among
 * the cells STILL AVAILABLE — the rows and columns of already-placed people are gone (the
 * Sudoku rule the game enforces). So it solves step by step ("this cell is forced, so that
 * one is too"), with no contradiction and mostly a single clue each. Returns null if some
 * suspect can't be pinned that way on this layout (then a different placement is tried).
 */
function constructEasyClues(
  base: LevelJson,
  suspectIds: PersonId[],
  solution: Solution,
  candidates: Map<PersonId, ClueJson[]>,
  rng: Rng,
): Map<PersonId, ClueJson> | null {
  const puzzle = loadLevel(base)
  const board = puzzle.board
  // How naturally a clue reads (object/room first; bare "column/row N" only as a last
  // resort; a negation slightly less preferred than its positive).
  const CLARITY: Record<string, number> = {
    onObject: 0, uniqueOnObject: 0, nearObject: 0, inRoom: 0,
    corner: 1, atWall: 1, nearWindow: 1, uniqueNearWindow: 1, nearDoor: 1, inside: 1, outside: 1,
    inCol: 2, inRow: 2,
  }
  const clarityOf = (c: ClueJson): number => (CLARITY[easyInnerType(c)] ?? 3) + (c.type === 'not' ? 0.3 : 0)
  // Per-suspect easy candidates: clearest type first, then sharpest (fewest cells).
  const cand = new Map<PersonId, { json: ClueJson; cells: Set<Cell> }[]>()
  for (const id of suspectIds) {
    const list: { json: ClueJson; cells: Set<Cell> }[] = []
    for (const json of candidates.get(id)!) {
      if (!EASY_ALLOWED_TYPES.has(easyInnerType(json))) continue
      const cells = createClue(json).candidateCells(board)
      if (cells) list.push({ json, cells })
    }
    list.sort((a, b) => clarityOf(a.json) - clarityOf(b.json) || a.cells.size - b.cells.size)
    cand.set(id, list)
  }

  // Suspects never share the victim's row/column (one person per row & column).
  const vr = board.rc(solution.cellOf(VICTIM_ID))
  const availRows = new Set<number>()
  const availCols = new Set<number>()
  for (let r = 0; r < board.height; r++) if (r !== vr.row) availRows.add(r)
  for (let c = 0; c < board.width; c++) if (c !== vr.col) availCols.add(c)
  const inAvail = (cell: Cell): boolean => {
    const { row, col } = board.rc(cell)
    return availRows.has(row) && availCols.has(col)
  }

  const chosen = new Map<PersonId, ClueJson>()
  const remaining = new Set(suspectIds)
  while (remaining.size > 0) {
    let pinnedId: PersonId | null = null
    let pinnedClue: ClueJson | null = null
    for (const id of rng.shuffle([...remaining])) {
      const cell = solution.cellOf(id)
      const list = cand.get(id)!
      const avail = list.map((e) => {
        const s = new Set<Cell>()
        for (const x of e.cells) if (inAvail(x)) s.add(x)
        return s
      })
      // 1) a single clue whose available cells are exactly {cell}.
      let idx: number[] | null = null
      for (let i = 0; i < list.length; i++) {
        if (avail[i].size === 1 && avail[i].has(cell)) {
          idx = [i]
          break
        }
      }
      // 2) else a PAIR whose available cells intersect to exactly {cell} — but never a
      //    column+row pair (that is a bare coordinate pin, which reads ugly).
      for (let i = 0; i < list.length && !idx; i++) {
        if (!avail[i].has(cell)) continue
        for (let j = i + 1; j < list.length; j++) {
          if (!avail[j].has(cell)) continue
          if (isLineClue(list[i].json) && isLineClue(list[j].json)) continue
          let extra = false
          for (const x of avail[i]) {
            if (x !== cell && avail[j].has(x)) {
              extra = true
              break
            }
          }
          if (!extra) {
            idx = [i, j]
            break
          }
        }
      }
      if (idx) {
        pinnedId = id
        pinnedClue = idx.length === 1 ? list[idx[0]].json : { type: 'and', clues: idx.map((k) => list[k].json) }
        break
      }
    }
    if (!pinnedId || !pinnedClue) return null // nobody pinnable with ≤2 simple clues — give up
    chosen.set(pinnedId, pinnedClue)
    const { row, col } = board.rc(solution.cellOf(pinnedId))
    availRows.delete(row)
    availCols.delete(col)
    remaining.delete(pinnedId)
  }

  // The cascade pins everyone DIRECTLY — that is too easy. Loosen most suspects so they
  // need a SHORT elimination chain: give each a clue that leaves only a FEW cells open (so
  // 1–2 cross-outs resolve them), while keeping the WHOLE puzzle solvable by simple forward
  // deduction (hidden singles / "only one on X" / row-column cross-out — rank ≤ 2, never a
  // hard technique or contradiction). Natural object/room clues are preferred over a bare
  // column/row; suspects with no short-chain option stay direct (the anchors).
  const SHORT_CHAIN_CELLS = 4
  const solvableChain = (): boolean => {
    const lvl = { ...base, suspects: base.suspects.map((s) => ({ ...s, clues: [chosen.get(s.id)!] })) }
    const res = new DeductionEngine(loadLevel(lvl)).solve()
    return res.solved && res.maxRank <= 2
  }
  for (const id of rng.shuffle([...suspectIds])) {
    const current = chosen.get(id)!
    const opts = cand
      .get(id)!
      .filter((e) => e.cells.size >= 2 && e.cells.size <= SHORT_CHAIN_CELLS) // a few open cells
      .sort((a, b) => {
        const la = isLineClue(a.json) ? 1 : 0
        const lb = isLineClue(b.json) ? 1 : 0
        return la - lb || b.cells.size - a.cells.size // natural & loosest-within-cap first
      })
    for (const e of opts) {
      if (e.json === current) continue
      chosen.set(id, e.json)
      if (solvableChain()) break
      chosen.set(id, current)
    }
  }
  return chosen
}

/** How many suspects are directly placeable from their OWN clue alone (their clues pin a
 *  single cell, with no need to cross anything out first). */
function countAnchors(
  chosen: Map<PersonId, ClueJson>,
  suspectIds: PersonId[],
  board: Board,
): number {
  let anchors = 0
  for (const id of suspectIds) {
    const cc = createClue(chosen.get(id)!).candidateCells(board)
    if (cc && cc.size === 1) anchors++
  }
  return anchors
}

function selectClues(
  base: LevelJson,
  suspectIds: PersonId[],
  candidates: Map<PersonId, ClueJson[]>,
  rng: Rng,
  difficulty?: GenDifficulty,
  maxLineClues = 1,
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

  const MAX_LINE = maxLineClues // how many suspects may use a row/column clue
  const isLine = (clue: ClueJson): boolean => clue.type === 'inRow' || clue.type === 'inCol'
  const lineSuspects = (): number => {
    let n = 0
    for (const id of suspectIds) {
      if (used.get(id)!.some((i) => isLine(candidates.get(id)![i]))) n++
    }
    return n
  }

  // Tighten: add a natural clue (never inRow+inCol together, ≤1 line clue) until unique.
  // (Easy never reaches here — it is built by forward construction in fillAttempt.)
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

  // MEDIUM / HARD / unspecified: start minimal-unique and loosen for difficulty — drop
  // redundant ANDed clues (all), then (hard / free generator only) widen single clues to
  // looser candidates. Medium stays minimal-unique, so it can need a little search.
  for (const id of suspectIds) {
    const u = used.get(id)!
    for (let k = u.length - 1; k >= 0 && u.length > 1; k--) {
      const removed = u.splice(k, 1)[0]
      if (!unique()) u.splice(k, 0, removed)
    }
  }
  if (difficulty !== 'medium') {
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
