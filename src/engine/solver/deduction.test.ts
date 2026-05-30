import { describe, it, expect } from 'vitest'
import { loadLevel } from '../io/LevelLoader.ts'
import { DeductionEngine } from './DeductionEngine.ts'
import { SearchSolver } from './SearchSolver.ts'
import { findMurderer } from './murderer.ts'
import type { LevelJson } from '../io/LevelSchema.ts'

// Stable inline fixture (independent of the editable levels/ folder):
// the real murdoku.com "24-Hour Delivery" 6x6. Exercises uniqueOnObject,
// composite OR, naked groups, hidden singles and the full pipeline.
const DELIVERY: LevelJson = {
  schema: 1,
  id: '24h-delivery',
  size: { width: 6, height: 6 },
  rooms: {
    D: { nameKey: 'room.dining', color: '#e8d8b0' },
    B: { nameKey: 'room.bedroom', color: '#f3e6a8' },
    K: { nameKey: 'room.kitchen', color: '#f0c878' },
    P: { nameKey: 'room.porch', color: '#d8c090' },
    Y: { nameKey: 'room.frontyard', color: '#a8e0b0' },
  },
  objects: {
    s: { type: 'chair', occupiable: true },
    b: { type: 'bed', occupiable: true },
    r: { type: 'carpet', occupiable: true },
    t: { type: 'table', occupiable: false },
    p: { type: 'plant', occupiable: false },
    u: { type: 'shrub', occupiable: false },
    k: { type: 'box', occupiable: false },
  },
  roomMap: ['DDDBBB', 'DDDBBB', 'DDDKKK', 'DDDKKK', 'PPYYYY', 'PPYYYY'],
  groundMap: ['.....r', '.....r', '...rr.', '......', 'rr....', '......'],
  topMap: ['.s.bb.', 'st..p.', 'st....', 'p..tt.', '...u..', '.k..u.'],
  suspects: [
    { id: 'A', name: 'Alexander', clues: [{ type: 'nearObject', object: 'box' }] },
    { id: 'B', name: 'Bella', clues: [{ type: 'onObject', object: 'chair' }] },
    { id: 'C', name: 'Carol', clues: [{ type: 'uniqueOnObject', object: 'carpet' }] },
    { id: 'D', name: 'Dalia', clues: [{ type: 'inRoom', room: 'B' }] },
    {
      id: 'E',
      name: 'Evangeline',
      clues: [
        {
          type: 'or',
          clues: [
            { type: 'nearObject', object: 'shrub' },
            { type: 'nearObject', object: 'plant' },
          ],
        },
      ],
    },
  ],
  victim: { name: 'Viraj' },
}

describe('24h-delivery (6x6)', () => {
  const puzzle = loadLevel(DELIVERY)

  it('has exactly one solution', () => {
    expect(new SearchSolver(puzzle).countSolutions(2)).toBe(1)
  })

  it('identifies Carol as the murderer', () => {
    const solution = new SearchSolver(puzzle).firstSolution()
    expect(solution).not.toBeNull()
    expect(findMurderer(puzzle, solution!).suspectId).toBe('C')
  })

  it('solves by pure deduction and names the murderer', () => {
    const { solved, solution, steps } = new DeductionEngine(puzzle).solve()
    expect(solved).toBe(true)
    expect(steps.find((s) => s.technique === 'murderer')?.personId).toBe('C')
    // Carol on the carpet at (2,4); victim on the last free cell (3,5).
    expect(solution!.cellOf('C')).toBe(puzzle.board.idx(2, 4))
    expect(solution!.cellOf('victim')).toBe(puzzle.board.idx(3, 5))
  })
})

// Real murdoku.com "Barbershop" 8x8 — exercises alone, roomAttribute (beard),
// and(nearObject, inRoom) and the full-permutation logic. Murderer: Adonis.
const BARBERSHOP: LevelJson = {
  schema: 1,
  id: 'barbershop',
  size: { width: 8, height: 8 },
  rooms: {
    S: { nameKey: 'room.storage', color: '#cfe8d8' },
    T: { nameKey: 'room.staffroom', color: '#d8e8b0' },
    M: { nameKey: 'room.main', color: '#e6b9cd' },
    N: { nameKey: 'room.entrance', color: '#cab0d8' },
    W: { nameKey: 'room.waiting', color: '#c2b8e4' },
  },
  objects: {
    s: { type: 'chair', occupiable: true },
    r: { type: 'carpet', occupiable: true },
    g: { type: 'shelf', occupiable: false },
    x: { type: 'box', occupiable: false },
    t: { type: 'table', occupiable: false },
    f: { type: 'tv', occupiable: false },
  },
  roomMap: [
    'SSSSTTTT',
    'SSSSTTTT',
    'SSMMMMMM',
    'MMMMMMMM',
    'MMMMMNNN',
    'MMMMMNNN',
    'WWWWWWWW',
    'WWWWWWWW',
  ],
  groundMap: [
    '........',
    '........',
    '........',
    '.rrrrrr.',
    '.r......',
    '.r......',
    '.rr.....',
    '.r......',
  ],
  topMap: [
    'gxx..st.',
    '...xf..s',
    '.gttt...',
    '..s.s.st',
    'ts......',
    't..f.t..',
    '........',
    'g.sssfs.',
  ],
  suspects: [
    {
      id: 'A',
      name: 'Adonis',
      attributes: { beard: true },
      clues: [
        {
          type: 'and',
          clues: [
            { type: 'nearObject', object: 'table' },
            { type: 'inRoom', room: 'N' },
          ],
        },
      ],
    },
    {
      id: 'B',
      name: 'Bryson',
      attributes: { beard: false },
      clues: [{ type: 'roomAttribute', quantifier: 'none', attribute: 'beard', value: true }],
    },
    { id: 'C', name: 'Craig', attributes: { beard: true }, clues: [{ type: 'onObject', object: 'chair' }] },
    {
      id: 'D',
      name: 'Dylan',
      attributes: { beard: false },
      clues: [{ type: 'and', clues: [{ type: 'nearObject', object: 'tv' }, { type: 'alone' }] }],
    },
    { id: 'E', name: 'Edison', attributes: { beard: false }, clues: [{ type: 'nearObject', object: 'box' }] },
    { id: 'F', name: 'Floyd', attributes: { beard: true }, clues: [{ type: 'onObject', object: 'carpet' }] },
    {
      id: 'G',
      name: 'Grant',
      attributes: { beard: true },
      clues: [
        {
          type: 'and',
          clues: [
            { type: 'nearObject', object: 'shelf' },
            { type: 'inRoom', room: 'W' },
          ],
        },
      ],
    },
  ],
  victim: { name: 'Vasiliy', attributes: { beard: true } },
}

describe('barbershop (8x8)', () => {
  const puzzle = loadLevel(BARBERSHOP)

  it('has exactly one solution', () => {
    expect(new SearchSolver(puzzle).countSolutions(2)).toBe(1)
  })

  it('identifies Adonis as the murderer (alone excludes the victim)', () => {
    const solution = new SearchSolver(puzzle).firstSolution()
    expect(solution).not.toBeNull()
    expect(findMurderer(puzzle, solution!).suspectId).toBe('A')
    expect(solution!.cellOf('A')).toBe(puzzle.board.idx(5, 6))
    expect(solution!.cellOf('victim')).toBe(puzzle.board.idx(4, 7))
  })
})

// Tiny level driven by relational clues (direction chain): A north of B north of
// the victim, pinned to columns 0/1 → A(0,0), B(1,1), victim(2,2); murderer B.
const RELATIONAL: LevelJson = {
  schema: 1,
  id: 'relational-demo',
  size: { width: 3, height: 3 },
  rooms: {
    U: { nameKey: 'room.living', color: '#eee' },
    D: { nameKey: 'room.bedroom', color: '#ddd' },
  },
  roomMap: ['UUU', 'DDD', 'DDD'],
  suspects: [
    {
      id: 'A',
      name: 'Aria',
      clues: [
        {
          type: 'and',
          clues: [
            { type: 'inCol', col: 0 },
            { type: 'direction', of: 'B', dir: 'north' },
          ],
        },
      ],
    },
    {
      id: 'B',
      name: 'Bryn',
      clues: [
        {
          type: 'and',
          clues: [
            { type: 'inCol', col: 1 },
            { type: 'direction', of: 'victim', dir: 'north' },
          ],
        },
      ],
    },
  ],
  victim: { name: 'Vince' },
}

describe('relational clues', () => {
  const puzzle = loadLevel(RELATIONAL)

  it('solves uniquely with relational propagation (murderer Bryn)', () => {
    const { solved, solution, steps } = new DeductionEngine(puzzle).solve()
    expect(solved).toBe(true)
    expect(steps.some((s) => s.technique === 'relational')).toBe(true)
    expect(solution!.cellOf('A')).toBe(puzzle.board.idx(0, 0))
    expect(solution!.cellOf('B')).toBe(puzzle.board.idx(1, 1))
    expect(solution!.cellOf('victim')).toBe(puzzle.board.idx(2, 2))
    expect(steps.find((s) => s.technique === 'murderer')?.personId).toBe('B')
  })
})

describe('difficulty rating', () => {
  it('rates 24h-delivery as easy', () => {
    expect(new DeductionEngine(loadLevel(DELIVERY)).solve().difficulty).toBe('easy')
  })

  it('rates the relational level as medium', () => {
    expect(new DeductionEngine(loadLevel(RELATIONAL)).solve().difficulty).toBe('medium')
  })
})

describe('hint API', () => {
  const puzzle = loadLevel(DELIVERY)
  const engine = new DeductionEngine(puzzle)

  it('gives a next step from an empty board', () => {
    expect(engine.nextHint(new Map())).not.toBeNull()
  })

  it('has no hint once everything is placed', () => {
    const solution = new SearchSolver(puzzle).firstSolution()
    const placed = new Map([...solution!.entries()])
    expect(engine.nextHint(placed)).toBeNull()
  })
})
