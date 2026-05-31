/** localStorage persistence: which levels are solved + the in-progress board. */

const SOLVED_KEY = 'murdoku.solved.v1'
const PROGRESS_PREFIX = 'murdoku.progress.v1.'

/** A board state flattened to JSON-friendly arrays (Maps/Sets don't serialize). */
export interface SavedState {
  placements: [string, number][]
  marks: [number, string[]][]
  crosses: number[]
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
