import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadLevel } from '../io/LevelLoader.ts'
import { Solution } from '../model/Solution.ts'
import { VICTIM_ID } from '../model/types.ts'
import {
  AdjacentRoomsClue,
  InRoomAdjacentToClue,
  NeighborRoomCountClue,
  NeighborRoomEmptyClue,
} from './index.ts'
import type { Clue } from './Clue.ts'
import type { Board } from '../model/Board.ts'
import type { Puzzle } from '../model/Puzzle.ts'
import type { Cell, PersonId } from '../model/types.ts'
import type { LevelJson } from '../io/LevelSchema.ts'

const dir = resolve(process.cwd(), 'levels')
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
const readLevel = (f: string): LevelJson => JSON.parse(readFileSync(resolve(dir, f), 'utf8'))

/** A few real boards of different sizes — enough variety without a slow full sweep. */
const sample = ['4x4', '6x6', '9x9']
  .map((size) => {
    const [w, h] = size.split('x').map(Number)
    return files.find((f) => {
      const l = readLevel(f)
      return l.size.width === w && l.size.height === h
    })
  })
  .filter((f): f is string => f !== undefined)

/** Deterministic PRNG so a failure is reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/**
 * A random placement obeying the game's core rule: every person on a DISTINCT row AND
 * column, on an occupiable cell. (The murder rule is deliberately NOT enforced — a clue's
 * candidateCells must be a superset for every row/column-legal placement, not just the
 * murder-legal ones, because the solver seeds domains before it knows the murderer.)
 */
function randomPlacement(board: Board, ids: PersonId[], rand: () => number): Map<PersonId, Cell> | null {
  const shuffle = <T,>(xs: T[]): T[] => {
    const a = [...xs]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const rows = shuffle([...Array(board.height).keys()])
  const usedCols = new Set<number>()
  const out = new Map<PersonId, Cell>()
  for (let i = 0; i < ids.length; i++) {
    const row = rows[i]
    if (row === undefined) return null
    const cols = shuffle([...Array(board.width).keys()]).filter(
      (c) => !usedCols.has(c) && board.isOccupiable(board.idx(row, c)),
    )
    if (cols.length === 0) return null
    usedCols.add(cols[0])
    out.set(ids[i], board.idx(row, cols[0]))
  }
  return out
}

/**
 * THE soundness contract (see CLAUDE.md): `candidateCells` must be a SUPERSET of every cell
 * where `test` can be true. A too-narrow set silently hides legal placements — and with them
 * second solutions, so an ambiguous level would pass as unique.
 */
function assertSuperset(clue: Clue, puzzle: Puzzle, subject: PersonId, seed: number): void {
  const board = puzzle.board
  const candidates = clue.candidateCells(board)
  if (!candidates) return // purely relational — nothing to check
  const rand = rng(seed)
  const ids = puzzle.allIds()
  for (let iter = 0; iter < 400; iter++) {
    const placement = randomPlacement(board, ids, rand)
    if (!placement) continue
    const solution = new Solution(placement)
    if (!clue.test(subject, solution, puzzle)) continue
    const cell = solution.cellOf(subject)
    expect(
      candidates.has(cell),
      `${clue.constructor.name}: test() is true at cell ${cell} but candidateCells excludes it`,
    ).toBe(true)
  }
}

describe('Board.roomNeighbors', () => {
  const board = loadLevel(readLevel(sample[0])).board

  it('is symmetric and never contains the room itself', () => {
    for (const id of board.rooms.keys()) {
      for (const n of board.roomNeighbors(id)) {
        expect(n).not.toBe(id)
        expect([...board.roomNeighbors(n)]).toContain(id)
      }
    }
  })

  it('matches a brute-force scan over shared wall edges', () => {
    const expected = new Map<string, Set<string>>()
    for (const id of board.rooms.keys()) expected.set(id, new Set())
    for (let cell = 0; cell < board.width * board.height; cell++) {
      const a = board.roomIdOf(cell)
      if (!expected.has(a)) continue
      for (const nb of board.neighbors4(cell)) {
        const b = board.roomIdOf(nb)
        if (b !== a && expected.has(b)) expected.get(a)!.add(b)
      }
    }
    for (const [id, want] of expected) {
      expect([...board.roomNeighbors(id)].sort()).toEqual([...want].sort())
    }
  })

  it('cellsInRoomsAdjacentTo never returns a cell of the room itself', () => {
    for (const id of board.rooms.keys()) {
      for (const cell of board.cellsInRoomsAdjacentTo(id)) {
        expect(board.roomIdOf(cell)).not.toBe(id)
        expect(board.isOccupiable(cell)).toBe(true)
      }
    }
  })
})

describe('room-adjacency clue soundness (candidateCells ⊇ test)', () => {
  for (const file of sample) {
    describe(file, () => {
      const puzzle = loadLevel(readLevel(file))
      const board = puzzle.board
      const subject = puzzle.suspects[0].id
      const rooms = [...board.rooms.keys()]

      it('InRoomAdjacentToClue', () => {
        rooms.forEach((room, i) => assertSuperset(new InRoomAdjacentToClue(room), puzzle, subject, 7 + i))
      })

      it('NeighborRoomEmptyClue', () => {
        assertSuperset(new NeighborRoomEmptyClue(), puzzle, subject, 11)
      })

      it('NeighborRoomCountClue (with and without a direction)', () => {
        let seed = 21
        for (const count of [0, 1, 2]) {
          assertSuperset(new NeighborRoomCountClue(count), puzzle, subject, seed++)
          for (const dir of ['north', 'south', 'east', 'west'] as const) {
            assertSuperset(new NeighborRoomCountClue(count, dir), puzzle, subject, seed++)
          }
        }
      })

      it('AdjacentRoomsClue is purely relational (no candidate set to get wrong)', () => {
        const other = puzzle.suspects[1]?.id ?? VICTIM_ID
        expect(new AdjacentRoomsClue(other).candidateCells(board)).toBeNull()
      })
    })
  }
})

describe('room-adjacency clue semantics', () => {
  const puzzle = loadLevel(readLevel(sample[1] ?? sample[0]))
  const board = puzzle.board

  it('InRoomAdjacentTo excludes the named room itself', () => {
    for (const room of board.rooms.keys()) {
      const cells = new InRoomAdjacentToClue(room).candidateCells(board)!
      for (const c of cells) expect(board.roomIdOf(c)).not.toBe(room)
    }
  })

  it('AdjacentRooms is never satisfied by two people in the SAME room', () => {
    const [a, b] = puzzle.suspects.map((s) => s.id)
    const cell = board.occupiableCells()[0]
    const mate = board.occupiableCells().find((c) => c !== cell && board.roomIdOf(c) === board.roomIdOf(cell))
    if (mate === undefined) return
    const solution = new Solution(new Map([[a, cell], [b, mate]]))
    expect(new AdjacentRoomsClue(b).test(a, solution, puzzle)).toBe(false)
  })

  it('neighborRoomCount direction means the room lies ENTIRELY that way', () => {
    const clue = new NeighborRoomCountClue(1, 'south')
    for (const cell of board.occupiableCells()) {
      const { row } = board.rc(cell)
      for (const room of clue.targetRooms(board, cell)) {
        const bounds = board.roomBounds(room)!
        // Every cell of the room is strictly below the subject's row.
        expect(bounds.minRow).toBeGreaterThan(row)
      }
    }
  })
})
