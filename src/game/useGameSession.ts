import { useCallback, useEffect, useMemo, useState } from 'react'
import { VICTIM_ID, type Board, type Cell, type PersonId, type Puzzle } from '../engine/index.ts'
import { clearProgress, loadProgress, saveProgress, type SavedState } from './storage.ts'

/** The player's mutable board state. */
export interface PlayState {
  /** Committed placements (suspects AND the victim): person → cell. */
  placements: Map<PersonId, Cell>
  /** Pencil-mark notes ("could be here"): cell → set of person ids. */
  marks: Map<Cell, Set<PersonId>>
  /** Cells the player has crossed out as impossible. */
  crosses: Set<Cell>
}

function emptyState(): PlayState {
  return { placements: new Map(), marks: new Map(), crosses: new Set() }
}

function clonePlay(s: PlayState): PlayState {
  return {
    placements: new Map(s.placements),
    marks: new Map([...s.marks].map(([c, set]) => [c, new Set(set)])),
    crosses: new Set(s.crosses),
  }
}

function toSaved(s: PlayState): SavedState {
  return {
    placements: [...s.placements],
    marks: [...s.marks].map(([c, set]) => [c, [...set]]),
    crosses: [...s.crosses],
  }
}

function fromSaved(s: SavedState): PlayState {
  return {
    placements: new Map(s.placements),
    marks: new Map(s.marks.map(([c, ids]) => [c, new Set(ids)])),
    crosses: new Set(s.crosses),
  }
}

/** If exactly one occupiable cell is still free, auto-place the victim there. */
function autoPlaceVictim(next: PlayState, board: Board): void {
  if (next.placements.has(VICTIM_ID)) return
  let free: Cell | null = null
  const occupied = new Set(next.placements.values())
  for (const c of board.occupiableCells()) {
    if (next.crosses.has(c) || occupied.has(c)) continue
    if (free !== null) return // more than one free → don't place yet
    free = c
  }
  if (free !== null) next.placements.set(VICTIM_ID, free)
}

export interface GameSession {
  state: PlayState
  occupantAt: (cell: Cell) => PersonId | undefined
  placeMark: (cell: Cell, personId: PersonId) => void
  commit: (cell: Cell, personId: PersonId) => void
  setCross: (cell: Cell, value: boolean) => void
  /** Remove a committed person from the board (long-press on their cell). */
  remove: (personId: PersonId) => void
  /** Full restart: clear all placements, marks and crosses (eraser "hold"). */
  resetAll: () => void
  undo: () => void
  /** Forget the saved progress for this level (call on a win). */
  clearSaved: () => void
  canUndo: boolean
  placedCount: number
  /** Every suspect AND the victim placed. */
  allPlaced: boolean
}

export function useGameSession(
  puzzle: Puzzle,
  levelId: string,
  fresh = false,
  autoVictim = false,
): GameSession {
  const board = puzzle.board
  const [hist, setHist] = useState<{ present: PlayState; past: PlayState[] }>(() => {
    const saved = fresh ? null : loadProgress(levelId)
    return { present: saved ? fromSaved(saved) : emptyState(), past: [] }
  })

  // Persist the current board whenever it changes.
  useEffect(() => {
    saveProgress(levelId, toSaved(hist.present))
  }, [levelId, hist.present])

  const apply = useCallback((mutate: (next: PlayState) => boolean | void) => {
    setHist((h) => {
      const next = clonePlay(h.present)
      if (mutate(next) === false) return h
      return { present: next, past: [...h.past, h.present] }
    })
  }, [])

  const occupantAt = useCallback(
    (cell: Cell): PersonId | undefined => {
      for (const [id, c] of hist.present.placements) if (c === cell) return id
      return undefined
    },
    [hist.present.placements],
  )

  const placeMark = useCallback(
    (cell: Cell, personId: PersonId) =>
      apply((next) => {
        if (!board.isOccupiable(cell)) return false
        for (const c of next.placements.values()) if (c === cell) return false
        const set = next.marks.get(cell) ?? new Set<PersonId>()
        if (set.has(personId)) set.delete(personId)
        else set.add(personId)
        if (set.size === 0) next.marks.delete(cell)
        else next.marks.set(cell, set)
      }),
    [apply, board],
  )

  const commit = useCallback(
    (cell: Cell, personId: PersonId) =>
      apply((next) => {
        if (!board.isOccupiable(cell)) return false
        for (const c of next.placements.values()) if (c === cell) return false
        next.placements.set(personId, cell)
        for (const [c, set] of [...next.marks]) {
          set.delete(personId)
          if (c === cell || set.size === 0) next.marks.delete(c)
        }
        next.crosses.delete(cell)
        const { row, col } = board.rc(cell)
        const occupied = new Set(next.placements.values())
        // Cross out the WHOLE row & column — including non-occupiable object
        // cells — so it's visually clear nobody else can be on that line.
        for (let c = 0; c < board.width * board.height; c++) {
          if (c === cell || occupied.has(c)) continue
          const rc = board.rc(c)
          if (rc.row === row || rc.col === col) {
            next.crosses.add(c)
            next.marks.delete(c) // an X'd cell can't hold anyone — drop its notes
          }
        }
        if (autoVictim) autoPlaceVictim(next, board)
      }),
    [apply, board, autoVictim],
  )

  const setCross = useCallback(
    (cell: Cell, value: boolean) =>
      apply((next) => {
        // Crossing a non-occupiable object cell is allowed — it shows the whole
        // row/column is excluded. Only an occupied cell can't be crossed.
        for (const c of next.placements.values()) if (c === cell) return false
        if (value) {
          if (next.crosses.has(cell) && !next.marks.has(cell)) return false
          next.crosses.add(cell)
          next.marks.delete(cell) // crossing a cell clears its pencil marks
        } else {
          if (!next.crosses.has(cell)) return false
          next.crosses.delete(cell)
        }
        if (autoVictim) autoPlaceVictim(next, board)
      }),
    [apply, board, autoVictim],
  )

  const remove = useCallback(
    (personId: PersonId) =>
      apply((next) => {
        if (!next.placements.has(personId)) return false
        next.placements.delete(personId)
      }),
    [apply],
  )

  const resetAll = useCallback(
    () =>
      apply((next) => {
        if (next.placements.size === 0 && next.marks.size === 0 && next.crosses.size === 0) {
          return false
        }
        next.placements.clear()
        next.marks.clear()
        next.crosses.clear()
      }),
    [apply],
  )

  const undo = useCallback(() => {
    setHist((h) =>
      h.past.length === 0 ? h : { present: h.past[h.past.length - 1], past: h.past.slice(0, -1) },
    )
  }, [])

  const clearSaved = useCallback(() => clearProgress(levelId), [levelId])

  const placedCount = hist.present.placements.size
  const allPlaced = useMemo(
    () =>
      puzzle.suspects.every((s) => hist.present.placements.has(s.id)) &&
      hist.present.placements.has(VICTIM_ID),
    [puzzle, hist.present.placements],
  )

  return {
    state: hist.present,
    occupantAt,
    placeMark,
    commit,
    setCross,
    remove,
    resetAll,
    undo,
    clearSaved,
    canUndo: hist.past.length > 0,
    placedCount,
    allPlaced,
  }
}
