import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { selectBestLevel } from './Generator.ts'
import type { LevelJson } from '../io/LevelSchema.ts'

// The worker pool's cross-worker pick must judge on the same scale the workers themselves
// used. Anchor it with two REAL levels at the opposite ends of the user's hard bars:
// museum (Ausdehnung 98%, the reference for "logisch aber echt hart") must beat the most
// cramped hand level regardless of input order.
const load = (name: string): LevelJson =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), 'levels', name), 'utf8')) as LevelJson

describe('selectBestLevel', () => {
  const museum = load('museum.json')
  const cramped = load('Der_Burgfall.json')

  it('returns null for an empty pool and the sole entry for a pool of one', () => {
    expect(selectBestLevel([], 'hard')).toBeNull()
    expect(selectBestLevel([museum], 'hard')).toBe(museum)
  })

  it('prefers the broad reference level over a cramped one, in either order', () => {
    expect(selectBestLevel([museum, cramped], 'hard')).toBe(museum)
    expect(selectBestLevel([cramped, museum], 'hard')).toBe(museum)
  })
})
