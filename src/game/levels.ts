import type { LevelJson } from '../engine/index.ts'

/** The difficulty buckets the level picker filters by. */
export type Difficulty = 'tutorial' | 'easy' | 'medium' | 'hard'

const DIFF_ORDER: Record<Difficulty, number> = {
  tutorial: 0,
  easy: 1,
  medium: 2,
  hard: 3,
}

export interface LevelMeta {
  id: string
  /** Display name derived from the id (no title field in the JSON yet). */
  title: string
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

/** Build a LevelMeta from a raw level (e.g. a freshly generated / saved one). */
export function levelMetaFromJson(json: LevelJson, custom = false): LevelMeta {
  return {
    id: json.id,
    title: json.title ?? titleFromId(json.id),
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
  if (value === 'tutorial' || value === 'easy' || value === 'medium' || value === 'hard') {
    return value
  }
  return 'medium'
}

export const LEVELS: LevelMeta[] = Object.values(modules)
  .map((m) => m.default)
  .map((json) => ({
    id: json.id,
    title: humanize(json.id),
    difficulty: asDifficulty(json.difficulty),
    width: json.size.width,
    height: json.size.height,
    json,
  }))
  .sort(
    (a, b) =>
      DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty] ||
      a.width * a.height - b.width * b.height ||
      a.title.localeCompare(b.title),
  )

/** Distinct "W×H" sizes present, sorted by area — for the size filter. */
export const LEVEL_SIZES: string[] = [
  ...new Map(LEVELS.map((l) => [`${l.width}×${l.height}`, l.width * l.height])).entries(),
]
  .sort((a, b) => a[1] - b[1])
  .map(([label]) => label)

export const DIFFICULTIES: Difficulty[] = ['tutorial', 'easy', 'medium', 'hard']
