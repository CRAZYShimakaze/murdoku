import type { LevelJson } from '../engine/index.ts'
import { themeFromRoomKeys } from '../engine/generator/index.ts'

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
  /** Base display name (the level's original-language title / id-derived fallback). */
  title: string
  /** Per-language title overrides from the JSON (e.g. { en: "…" }); resolved by
   *  {@link titleOf}, falling back to `title`. */
  titles?: Record<string, string>
  /** Optional level author, surfaced as a byline while playing (if set). */
  author?: string
  difficulty: Difficulty
  width: number
  height: number
  json: LevelJson
  /** True for player-generated levels (not part of the bundled set). */
  custom?: boolean
  /** Theme id guessed from the level's room nameKeys (best overlap; a level whose
   *  rooms all belong to one theme matches it exactly). Undefined when no room
   *  overlaps any theme (e.g. generic room.editor* slots) — such a level only
   *  appears with the theme filter on "all". */
  theme?: string
}

/** Theme id for a raw level JSON — the shared generator/editor guess, derived once
 *  at load time (the JSON itself carries no theme field). */
function themeOfJson(json: LevelJson): string | undefined {
  return themeFromRoomKeys(Object.values(json.rooms).map((r) => r.nameKey)) ?? undefined
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

/** What the difficulty filter can select: a real difficulty, or the pseudo-bucket
 *  `custom` = the player's own levels (editor-built or saved generated ones). */
export type DifficultyFilter = Difficulty | 'custom'

/** The level picker's filter selection (persisted so it survives navigation). */
export interface LevelFilter {
  difficulty: DifficultyFilter | 'all'
  size: string | 'all'
  status: LevelStatus
  theme: string | 'all'
}

export const DEFAULT_FILTER: LevelFilter = {
  difficulty: 'all',
  size: 'all',
  status: 'all',
  theme: 'all',
}

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
      (filter.difficulty === 'all' ||
        (filter.difficulty === 'custom' ? l.custom === true : l.difficulty === filter.difficulty)) &&
      (filter.size === 'all' || `${l.width}×${l.height}` === filter.size) &&
      (filter.status === 'all' || solved.has(l.id) === (filter.status === 'solved')) &&
      (filter.theme === 'all' || l.theme === filter.theme),
  )
}

/** The level author kept out of the picker until the player unlocks them with the
 *  secret toggle (five quick taps on the title). Off by default — see LevelSelect. */
export const HIDDEN_AUTHOR = 'Manuel Garand'

/** The picker's universe minus the hidden author, unless the player unlocked them.
 *  Drives both the level grid and the available filter options. */
export function authorVisibleLevels(levels: LevelMeta[], showHidden: boolean): LevelMeta[] {
  return showHidden ? levels : levels.filter((l) => l.author !== HIDDEN_AUTHOR)
}

/** Distinct "W×H" sizes present in `levels`, sorted by area — for the size filter. */
export function availableSizes(levels: LevelMeta[]): string[] {
  return [...new Map(levels.map((l) => [`${l.width}×${l.height}`, l.width * l.height])).entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label)
}

/** Distinct theme ids present in `levels` (unsorted — the picker sorts them by
 *  their localized labels, which this module can't know). */
export function availableThemes(levels: LevelMeta[]): string[] {
  return [...new Set(levels.map((l) => l.theme).filter((t): t is string => t !== undefined))]
}

/** Per filter key: the option values that still match at least one level. Drives
 *  the picker's chip pruning and the stale-selection fallback below. */
export interface FilterOptions {
  difficulty: Set<string>
  size: Set<string>
  status: Set<string>
  theme: Set<string>
}

export function availableFilterOptions(
  levels: LevelMeta[],
  solved: ReadonlySet<string>,
): FilterOptions {
  return {
    difficulty: new Set([
      ...DIFFICULTIES.filter((d) => levels.some((l) => l.difficulty === d)),
      // "Eigen": offered only while the player actually has own levels.
      ...(levels.some((l) => l.custom) ? ['custom'] : []),
    ]),
    size: new Set(availableSizes(levels)),
    status: new Set([
      ...(levels.some((l) => solved.has(l.id)) ? ['solved'] : []),
      ...(levels.some((l) => !solved.has(l.id)) ? ['unsolved'] : []),
    ]),
    theme: new Set(availableThemes(levels)),
  }
}

/** A stored filter selection whose option no longer exists (e.g. "Original" after
 *  re-hiding the author) falls back to "all". Derived rather than written back,
 *  so the player's pick returns if the option reappears. */
export function effectiveFilter(filter: LevelFilter, available: FilterOptions): LevelFilter {
  const keep = (k: keyof LevelFilter) =>
    filter[k] === 'all' || available[k].has(filter[k]) ? filter[k] : 'all'
  return {
    difficulty: keep('difficulty'),
    size: keep('size'),
    status: keep('status'),
    theme: keep('theme'),
  } as LevelFilter
}

/** Exactly the list the picker would show for this state: hidden author applied,
 *  stale selections dropped, filter applied. "Next level" after a win uses this
 *  too, so winning never leads to a level the picker wouldn't offer. */
export function pickerLevels(
  custom: LevelMeta[],
  filter: LevelFilter,
  solved: ReadonlySet<string>,
  showHidden: boolean,
): LevelMeta[] {
  const universe = authorVisibleLevels(allLevels(custom), showHidden)
  const effective = effectiveFilter(filter, availableFilterOptions(universe, solved))
  return filterLevels(universe, effective, solved)
}

/** The level to play after `current` within a (sorted) filtered list. Wraps
 *  around at the end; null when no other level matches the filter. */
export function nextLevel(current: LevelMeta, filtered: LevelMeta[]): LevelMeta | null {
  const others = filtered.filter((l) => l.id !== current.id)
  if (others.length === 0) return null
  return others.find((l) => compareLevels(current, l) < 0) ?? others[0]
}

/** The level to play before `current` within a (sorted) filtered list. Wraps
 *  around at the start; null when no other level matches the filter. */
export function prevLevel(current: LevelMeta, filtered: LevelMeta[]): LevelMeta | null {
  const others = filtered.filter((l) => l.id !== current.id)
  if (others.length === 0) return null
  // Closest level sorting BEFORE current (scan from the end); wrap to the last one.
  return [...others].reverse().find((l) => compareLevels(l, current) < 0) ?? others[others.length - 1]
}

/** Build a LevelMeta from a raw level (e.g. a freshly generated / saved one). */
export function levelMetaFromJson(json: LevelJson, custom = false): LevelMeta {
  return {
    id: json.id,
    title: json.title ?? titleFromId(json.id),
    titles: json.titles,
    author: json.author,
    difficulty: asDifficulty(json.difficulty),
    width: json.size.width,
    height: json.size.height,
    json,
    custom,
    theme: themeOfJson(json),
  }
}

/** The level's display title in the active language: a per-language override from the
 *  JSON's `titles` map when present, else the base `title`. `lang` may be a full locale
 *  ("en-US") — its base subtag is tried too. */
export function titleOf(meta: LevelMeta, lang: string): string {
  return meta.titles?.[lang] ?? meta.titles?.[lang.split('-')[0]] ?? meta.title
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
    titles: json.titles,
    author: json.author,
    difficulty: asDifficulty(json.difficulty),
    width: json.size.width,
    height: json.size.height,
    json,
    theme: themeOfJson(json),
  }))
  .sort(compareLevels)

export const DIFFICULTIES: Difficulty[] = ['tutorial', 'easy', 'medium', 'hard', 'original']
