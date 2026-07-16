import { useCallback, useEffect, useMemo, useState } from 'react'
import { VICTIM_ID, type Board, type Cell, type PersonId, type Puzzle } from '../engine/index.ts'
import { clearProgress, loadProgress, saveProgress, type SavedState } from './storage.ts'
// SavedProgress is the on-disk shape { present, past } — persisted so Undo survives a reload.

/** The player's mutable board state. */
export interface PlayState {
  /** Committed placements (suspects AND the victim): person → cell. */
  placements: Map<PersonId, Cell>
  /** Pencil-mark notes ("could be here"): cell → set of person ids. */
  marks: Map<Cell, Set<PersonId>>
  /** Cells the player has crossed out as impossible. */
  crosses: Set<Cell>
  /** Subset of `crosses` the player set by hand (X-tool). The rest are auto-X's
   *  from placing a figure, which removing that figure may clear again. */
  manualCrosses: Set<Cell>
}

function emptyState(): PlayState {
  return { placements: new Map(), marks: new Map(), crosses: new Set(), manualCrosses: new Set() }
}

function clonePlay(s: PlayState): PlayState {
  return {
    placements: new Map(s.placements),
    marks: new Map([...s.marks].map(([c, set]) => [c, new Set(set)])),
    crosses: new Set(s.crosses),
    manualCrosses: new Set(s.manualCrosses),
  }
}

function toSaved(s: PlayState): SavedState {
  return {
    placements: [...s.placements],
    marks: [...s.marks].map(([c, set]) => [c, [...set]]),
    crosses: [...s.crosses],
    manualCrosses: [...s.manualCrosses],
  }
}

function fromSaved(s: SavedState): PlayState {
  return {
    placements: new Map(s.placements),
    marks: new Map(s.marks.map(([c, ids]) => [c, new Set(ids)])),
    crosses: new Set(s.crosses),
    manualCrosses: new Set(s.manualCrosses ?? []),
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
  /** Add (`on`) or remove a single pencil note explicitly — for drag-painting notes. */
  setMark: (cell: Cell, personId: PersonId, on: boolean) => void
  /** Remove a committed person from the board (long-press on their cell). */
  remove: (personId: PersonId) => void
  /** Eraser "tap": wipe ONE cell — its notes, its cross and any figure on it — in a single
   *  undo step. */
  eraseCell: (cell: Cell) => void
  /** Eraser "hold": clear all placements, marks and crosses at once. */
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
    // Restore the undo history too, so step-back keeps working after a reload.
    return saved
      ? { present: fromSaved(saved.present), past: saved.past.map(fromSaved) }
      : { present: emptyState(), past: [] }
  })

  // Persist the current board AND the undo stack whenever either changes.
  useEffect(() => {
    saveProgress(levelId, { present: toSaved(hist.present), past: hist.past.map(toSaved) })
  }, [levelId, hist])

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
        // An X'd cell is ruled out — no pencil notes on it (crossing already cleared
        // any, and you can't add new ones until it's un-crossed).
        if (next.crosses.has(cell)) return false
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
        next.manualCrosses.delete(cell) // cell now occupied — no cross of any kind
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
          // No-op only if already a *manual* cross with nothing to clear; an
          // auto-X gets upgraded to manual here (the player vouches for it).
          if (next.crosses.has(cell) && next.manualCrosses.has(cell) && !next.marks.has(cell)) {
            return false
          }
          next.crosses.add(cell)
          next.manualCrosses.add(cell) // user-set via the X-tool
          next.marks.delete(cell) // crossing a cell clears its pencil marks
        } else {
          if (!next.crosses.has(cell)) return false
          next.crosses.delete(cell)
          next.manualCrosses.delete(cell)
        }
        if (autoVictim) autoPlaceVictim(next, board)
      }),
    [apply, board, autoVictim],
  )

  const setMark = useCallback(
    (cell: Cell, personId: PersonId, on: boolean) =>
      apply((next) => {
        const set = next.marks.get(cell) ?? new Set<PersonId>()
        if (on) {
          // Can't note on a non-occupiable, crossed, or occupied cell; already there = no-op.
          if (!board.isOccupiable(cell) || next.crosses.has(cell)) return false
          for (const c of next.placements.values()) if (c === cell) return false
          if (set.has(personId)) return false
          set.add(personId)
        } else {
          if (!set.has(personId)) return false
          set.delete(personId)
        }
        if (set.size === 0) next.marks.delete(cell)
        else next.marks.set(cell, set)
      }),
    [apply, board],
  )

  /** Take `personId` off the board and clear the auto-X's they had stamped. Shared by
   *  `remove` and the eraser, so both leave the crosses in exactly the same state. */
  const liftFigure = useCallback(
    (next: PlayState, personId: PersonId): boolean => {
      const cell = next.placements.get(personId)
      if (cell === undefined) return false
      next.placements.delete(personId)
      const { row, col } = board.rc(cell)
      // Any remaining occupant (suspect OR victim) still blocks its own row &
      // column, so a cross sharing a line with one stays justified.
      const coveredByOther = (x: Cell): boolean => {
        const xr = board.rc(x)
        for (const c of next.placements.values()) {
          const rc = board.rc(c)
          if (rc.row === xr.row || rc.col === xr.col) return true
        }
        return false
      }
      // Clear the auto-X's this figure had stamped across its row/column — but
      // keep any the player set by hand, and any another figure still blocks.
      for (const x of [...next.crosses]) {
        const xr = board.rc(x)
        if (xr.row !== row && xr.col !== col) continue // not on this figure's lines
        if (next.manualCrosses.has(x)) continue // user-set → keep
        if (coveredByOther(x)) continue // another figure still excludes it → keep
        next.crosses.delete(x)
      }
      return true
    },
    [board],
  )

  /**
   * The eraser: wipe everything the player put on ONE cell — pencil notes, a cross, and any
   * figure standing there — as a single undo step. A figure is lifted through the shared
   * `liftFigure`, so its auto-X's go with it instead of being left behind as orphans.
   * Returns false (no history entry) when the cell was already blank.
   */
  const eraseCell = useCallback(
    (cell: Cell) =>
      apply((next) => {
        let changed = false
        // Collect first — liftFigure deletes from `placements`, and mutating a Map while
        // iterating it is a trap waiting for the day two people can share a cell.
        const here = [...next.placements].filter(([, c]) => c === cell).map(([id]) => id)
        for (const id of here) if (liftFigure(next, id)) changed = true
        if (next.marks.delete(cell)) changed = true
        // Drops an auto-X too — the X-tool already allows that (setCross(cell,false)), so the
        // eraser must not be pickier than the tool it replaces for the player.
        if (next.crosses.delete(cell)) changed = true
        next.manualCrosses.delete(cell)
        if (!changed) return false
        if (autoVictim) autoPlaceVictim(next, board)
      }),
    [apply, board, autoVictim, liftFigure],
  )

  const remove = useCallback(
    (personId: PersonId) => apply((next) => liftFigure(next, personId)),
    [apply, liftFigure],
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
        next.manualCrosses.clear()
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
    setMark,
    remove,
    eraseCell,
    resetAll,
    undo,
    clearSaved,
    canUndo: hist.past.length > 0,
    placedCount,
    allPlaced,
  }
}
