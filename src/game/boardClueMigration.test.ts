import { describe, it, expect } from 'vitest'
import { normalizeBoardClue, normalizeBoardClues } from './editorModel.ts'
import { createBoardClue } from '../engine/index.ts'
import type { BoardClueJson } from '../engine/index.ts'

/**
 * Regression for a real crash: renaming a board-clue type broke the editor for anyone whose
 * localStorage draft still held the old one. The stale type reached `createBoardClue`, whose
 * switch had no `default` — so it returned `undefined`, and the failure only surfaced far
 * away as "Cannot read properties of undefined (reading 'describe')".
 *
 * Two guarantees are locked down here:
 *  1. every shape older data can carry is migrated, never dropped silently if it has a
 *     current equivalent;
 *  2. `createBoardClue` fails LOUDLY on a type it doesn't know, instead of handing back
 *     `undefined` for someone else to trip over.
 *
 * Persisted data outlives refactors — when a board-clue type is renamed or removed, add its
 * old shape to `normalizeBoardClue` AND a case here.
 */
describe('board clue migration', () => {
  it('everyRoomCount → roomOccupancy/exactly over people', () => {
    expect(normalizeBoardClue({ type: 'everyRoomCount', count: 2 })).toEqual({
      type: 'roomOccupancy',
      op: 'exactly',
      count: 2,
      scope: 'people',
    })
  })

  it('maxRoomOccupancy → roomOccupancy/atMost, keeping its scope', () => {
    const old = { type: 'maxRoomOccupancy', count: 3, scope: 'suspects' } as unknown as BoardClueJson
    expect(normalizeBoardClue(old)).toEqual({
      type: 'roomOccupancy',
      op: 'atMost',
      count: 3,
      scope: 'suspects',
    })
  })

  it('leaves current shapes untouched', () => {
    const current: BoardClueJson[] = [
      { type: 'countOnObject', object: 'chair', count: 1 },
      { type: 'emptyRooms', count: 0 },
      { type: 'roomOccupancy', op: 'notExactly', count: 1, scope: 'people' },
      { type: 'countWithAttr', attribute: 'gender', value: 'f', area: 'outside', count: 2, scope: 'people' },
    ]
    for (const bc of current) expect(normalizeBoardClue(bc)).toBe(bc)
    expect(normalizeBoardClues(current)).toEqual(current)
  })

  it('drops a type no build knows rather than breaking the editor forever', () => {
    const junk = { type: 'somethingRemovedLongAgo', count: 1 } as unknown as BoardClueJson
    expect(normalizeBoardClue(junk)).toBeNull()
    expect(normalizeBoardClues([junk, { type: 'emptyRooms', count: 1 }])).toEqual([
      { type: 'emptyRooms', count: 1 },
    ])
  })

  it('every migrated shape actually builds a clue (the crash, end to end)', () => {
    const stale = [
      { type: 'maxRoomOccupancy', count: 3, scope: 'people' },
      { type: 'everyRoomCount', count: 2 },
    ] as unknown as BoardClueJson[]
    for (const bc of normalizeBoardClues(stale)) {
      const clue = createBoardClue(bc)
      expect(clue).toBeDefined()
      // This is the exact call that crashed: SuspectsPanel maps over the board clues and
      // calls describe() on each.
      expect(clue.describe().key).toContain('boardClue.')
    }
  })

  it('createBoardClue throws loudly on an unknown type instead of returning undefined', () => {
    const junk = { type: 'nope', count: 1 } as unknown as BoardClueJson
    expect(() => createBoardClue(junk)).toThrow(/Unknown board clue type "nope"/)
  })
})
