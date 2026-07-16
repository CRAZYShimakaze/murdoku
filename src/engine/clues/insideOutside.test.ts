import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadLevel } from '../io/LevelLoader.ts'
import { usesInsideOutside } from './clueRefs.ts'
import type { ClueJson } from './ClueFactory.ts'
import type { BoardClueJson, LevelJson } from '../io/LevelSchema.ts'

/**
 * `outside` is a per-room FLAG that NOTHING on the board reveals — the floor art is chosen
 * from the room's name. So a clue leaning on it is only solvable if the panels also list the
 * outdoor rooms, which they do iff `usesInsideOutside` says so. Missing a clue type here
 * means shipping an unsolvable level, so every shape that depends on the split is pinned
 * down — including the two this check used to miss:
 *   - `UniqueOutsideClue` does NOT extend `OutsideClue` (separate hierarchy);
 *   - board clues weren't consulted at all, so "exactly 2 men were inside" showed no legend.
 */
const dir = resolve(process.cwd(), 'levels')
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
const readLevel = (f: string): LevelJson => JSON.parse(readFileSync(resolve(dir, f), 'utf8'))

/** A bundled board that actually has both indoor and outdoor rooms. */
const outdoorFile = files.find((f) => {
  const l = readLevel(f)
  return Object.values(l.rooms).some((r) => r.outside) && Object.values(l.rooms).some((r) => !r.outside)
})

const withClue = (base: LevelJson, clue: ClueJson): LevelJson => ({
  ...base,
  suspects: base.suspects.map((s, i) => (i === 0 ? { ...s, clues: [clue] } : s)),
})
const withBoardClue = (base: LevelJson, bc: BoardClueJson): LevelJson => ({ ...base, boardClues: [bc] })

describe('usesInsideOutside', () => {
  it('a board with indoor AND outdoor rooms is bundled (else this proves nothing)', () => {
    expect(outdoorFile).toBeDefined()
  })

  const base = (): LevelJson => ({ ...readLevel(outdoorFile!), boardClues: [] })

  it('false when no clue touches the split', () => {
    const level = withClue(base(), { type: 'corner' })
    expect(usesInsideOutside(loadLevel(level))).toBe(false)
  })

  for (const [name, clue] of [
    ['inside', { type: 'inside' }],
    ['outside', { type: 'outside' }],
    ['uniqueOutside', { type: 'uniqueOutside' }],
    ['uniqueInside', { type: 'uniqueInside' }],
    ['negiert', { type: 'not', clue: { type: 'outside' } }],
    ['in einem AND', { type: 'and', clues: [{ type: 'corner' }, { type: 'inside' }] }],
  ] as [string, ClueJson][]) {
    it(`true for a suspect clue: ${name}`, () => {
      expect(usesInsideOutside(loadLevel(withClue(base(), clue)))).toBe(true)
    })
  }

  it('true for insideXor', () => {
    const b = base()
    const other = b.suspects[1].id
    expect(usesInsideOutside(loadLevel(withClue(b, { type: 'insideXor', with: other })))).toBe(true)
  })

  it('true for the countWithAttr BOARD clue ("2 men were inside")', () => {
    const level = withBoardClue(base(), {
      type: 'countWithAttr',
      attribute: 'gender',
      value: 'm',
      area: 'inside',
      count: 2,
      scope: 'people',
    })
    expect(usesInsideOutside(loadLevel(level))).toBe(true)
  })

  it('false for a board clue that does NOT name an area', () => {
    const level = withBoardClue(base(), { type: 'emptyRooms', count: 1 })
    expect(usesInsideOutside(loadLevel(level))).toBe(false)
  })

  it('every bundled level that leans on the split has outdoor rooms to list', () => {
    // If a level used inside/outside but had no room flagged `outside`, the legend would be
    // empty and the clue unreadable.
    for (const f of files) {
      const puzzle = loadLevel(readLevel(f))
      if (!usesInsideOutside(puzzle)) continue
      const outside = [...puzzle.board.rooms.values()].filter((r) => r.outside)
      expect(outside.length, `${f}: leans on inside/outside but no room is flagged outside`).toBeGreaterThan(0)
    }
  })
})
