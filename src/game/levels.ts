import type { LevelJson } from '../engine/index.ts'

/** The difficulty buckets the level picker filters by. `original` is the curated,
 *  hand-built campaign — set only via the level JSON, never offered in the editor. */
export type Difficulty = 'tutorial' | 'easy' | 'medium' | 'hard' | 'original'

const DIFF_ORDER: Record<Difficulty, number> = {
  tutorial: 0,
  easy: 1,
  medium: 2,
  hard: 3,
  original: 4,
}

export interface LevelMeta {
  id: string
  /** Display name derived from the id (no title field in the JSON yet). */
  title: string
  /** Optional level author, surfaced as a byline while playing (if set). */
  author?: string
  difficulty: Difficulty
  width: number
  height: number
  json: LevelJson
  /** True for player-generated levels (not part of the bundled set). */
  custom?: boolean
}

/** Title for a generated level: theme name + a short seed suffix (so two
 *  same-theme/size levels stay distinguishable in the list). */
function titleFromId(id: string): string {
  const match = /^(.*?)-(\d+)$/.exec(id)
  return match ? `${humanize(match[1])} #${match[2].slice(-3)}` : humanize(id)
}

/** Sort order for the level list: difficulty first (tutorial→hard), then board
 *  size ascending (4×4, 5×5, …), then title. Custom levels sort in like any other. */
export function compareLevels(a: LevelMeta, b: LevelMeta): number {
  return (
    DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty] ||
    a.width * a.height - b.width * b.height ||
    a.title.localeCompare(b.title)
  )
}

/** Solved-status the picker can filter by. */
export type LevelStatus = 'all' | 'solved' | 'unsolved'

/** The level picker's filter selection (persisted so it survives navigation). */
export interface LevelFilter {
  difficulty: Difficulty | 'all'
  size: string | 'all'
  status: LevelStatus
}

export const DEFAULT_FILTER: LevelFilter = { difficulty: 'all', size: 'all', status: 'all' }

/** Bundled + custom levels, de-duped by id and sorted — the picker's universe. */
export function allLevels(custom: LevelMeta[]): LevelMeta[] {
  const seen = new Set<string>()
  return [...custom, ...LEVELS]
    .filter((l) => !seen.has(l.id) && seen.add(l.id) !== undefined)
    .sort(compareLevels)
}

/** Apply the picker's filter to a level list; `solved` drives the status filter. */
export function filterLevels(
  levels: LevelMeta[],
  filter: LevelFilter,
  solved: ReadonlySet<string>,
): LevelMeta[] {
  return levels.filter(
    (l) =>
      (filter.difficulty === 'all' || l.difficulty === filter.difficulty) &&
      (filter.size === 'all' || `${l.width}×${l.height}` === filter.size) &&
      (filter.status === 'all' || solved.has(l.id) === (filter.status === 'solved')),
  )
}

/** The level to play after `current` within a (sorted) filtered list. Wraps
 *  around at the end; null when no other level matches the filter. */
export function nextLevel(current: LevelMeta, filtered: LevelMeta[]): LevelMeta | null {
  const others = filtered.filter((l) => l.id !== current.id)
  if (others.length === 0) return null
  return others.find((l) => compareLevels(current, l) < 0) ?? others[0]
}

/** Build a LevelMeta from a raw level (e.g. a freshly generated / saved one). */
export function levelMetaFromJson(json: LevelJson, custom = false): LevelMeta {
  return {
    id: json.id,
    title: json.title ?? titleFromId(json.id),
    author: json.author,
    difficulty: asDifficulty(json.difficulty),
    width: json.size.width,
    height: json.size.height,
    json,
    custom,
  }
}

/** All bundled levels, eagerly imported from the project's /levels folder. */
const modules = import.meta.glob<{ default: LevelJson }>('/levels/*.json', { eager: true })

function humanize(id: string): string {
  return id
    .replace(/^gen-/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/(\d+)x(\d+)/i, '$1×$2')
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
}

function asDifficulty(value: string | undefined): Difficulty {
  if (
    value === 'tutorial' ||
    value === 'easy' ||
    value === 'medium' ||
    value === 'hard' ||
    value === 'original'
  ) {
    return value
  }
  return 'medium'
}

export const LEVELS: LevelMeta[] = Object.values(modules)
  .map((m) => m.default)
  .map((json) => ({
    id: json.id,
    title: json.title ?? humanize(json.id),
    author: json.author,
    difficulty: asDifficulty(json.difficulty),
    width: json.size.width,
    height: json.size.height,
    json,
  }))
  .sort(compareLevels)

/** Distinct "W×H" sizes present, sorted by area — for the size filter. */
export const LEVEL_SIZES: string[] = [
  ...new Map(LEVELS.map((l) => [`${l.width}×${l.height}`, l.width * l.height])).entries(),
]
  .sort((a, b) => a[1] - b[1])
  .map(([label]) => label)

export const DIFFICULTIES: Difficulty[] = ['tutorial', 'easy', 'medium', 'hard', 'original']
