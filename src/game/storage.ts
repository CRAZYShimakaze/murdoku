/** localStorage persistence: solved levels, in-progress board, saved levels. */
import type { LevelJson } from '../engine/index.ts'
import type { LevelFilter } from './levels.ts'

const SOLVED_KEY = 'murdoku.solved.v1'
const PROGRESS_PREFIX = 'murdoku.progress.v1.'
const CUSTOM_KEY = 'murdoku.custom.v1'
const EDITOR_DRAFT_KEY = 'murdoku.editordraft.v1'
const FILTER_KEY = 'murdoku.filter.v1'
const SHOW_HIDDEN_AUTHOR_KEY = 'murdoku.showhiddenauthor.v1'
const GEN_SETTINGS_KEY = 'murdoku.gensettings.v1'

/** A board state flattened to JSON-friendly arrays (Maps/Sets don't serialize). */
export interface SavedState {
  placements: [string, number][]
  marks: [number, string[]][]
  crosses: number[]
  /** Subset of `crosses` set by hand (X-tool); optional for back-compat. */
  manualCrosses?: number[]
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable / full — ignore */
  }
}

export function loadSolved(): Set<string> {
  return new Set(read<string[]>(SOLVED_KEY, []))
}

/** The level picker's last filter selection. Pass DEFAULT_FILTER as the fallback. */
export function loadFilter(fallback: LevelFilter): LevelFilter {
  return read<LevelFilter>(FILTER_KEY, fallback)
}

export function saveFilter(filter: LevelFilter): void {
  write(FILTER_KEY, filter)
}

/** Secret toggle (five quick taps on the picker title): reveal the hidden author's
 *  levels. Off by default, so those levels stay hidden until the player unlocks them. */
export function loadShowHiddenAuthor(): boolean {
  return read<boolean>(SHOW_HIDDEN_AUTHOR_KEY, false)
}

export function saveShowHiddenAuthor(value: boolean): void {
  write(SHOW_HIDDEN_AUTHOR_KEY, value)
}

/** The generator form's last selection (size, difficulty, theme, objects, openings). */
export interface GenSettings {
  size: number
  difficulty: string
  theme: string
  objects: string[]
  windows: boolean
  doors: boolean
}

/** Pass the form defaults as the fallback for a first-time visitor. */
export function loadGenSettings(fallback: GenSettings): GenSettings {
  return { ...fallback, ...read<Partial<GenSettings>>(GEN_SETTINGS_KEY, {}) }
}

export function saveGenSettings(settings: GenSettings): void {
  write(GEN_SETTINGS_KEY, settings)
}

export function markSolved(id: string): void {
  const solved = loadSolved()
  solved.add(id)
  write(SOLVED_KEY, [...solved])
}

export function loadProgress(id: string): SavedState | null {
  return read<SavedState | null>(PROGRESS_PREFIX + id, null)
}

export function saveProgress(id: string, state: SavedState): void {
  write(PROGRESS_PREFIX + id, state)
}

export function clearProgress(id: string): void {
  try {
    localStorage.removeItem(PROGRESS_PREFIX + id)
  } catch {
    /* ignore */
  }
}

/** Player-kept generated levels, newest first. */
export function loadCustomLevels(): LevelJson[] {
  return read<LevelJson[]>(CUSTOM_KEY, [])
}

export function saveCustomLevel(level: LevelJson): void {
  const list = loadCustomLevels().filter((l) => l.id !== level.id)
  list.unshift(level)
  write(CUSTOM_KEY, list)
}

export function isCustomSaved(id: string): boolean {
  return loadCustomLevels().some((l) => l.id === id)
}

/** The in-progress editor draft (so leaving the editor to test-play never loses work). */
export function loadEditorDraft<T>(): T | null {
  return read<T | null>(EDITOR_DRAFT_KEY, null)
}

export function saveEditorDraft(draft: unknown): void {
  write(EDITOR_DRAFT_KEY, draft)
}

export function clearEditorDraft(): void {
  try {
    localStorage.removeItem(EDITOR_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

/** Trigger a download of a level as a .json file (named after its title/id). */
export function exportLevelJson(level: LevelJson): void {
  const base = (level.title ?? level.id).trim().replace(/[^\w-]+/g, '_') || level.id
  const blob = new Blob([JSON.stringify(level, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${base}.json`
  a.click()
  URL.revokeObjectURL(url)
}
