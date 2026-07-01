import { describe, expect, it } from 'vitest'
import { THEME_IDS, themeRooms } from '../engine/generator/index.ts'
import { isWaterRoom } from '../engine/index.ts'
import { EDITOR_FLOOR_PATTERNS, floorPatternOf } from './floorArt.ts'

describe('floor patterns', () => {
  it('assigns a pattern to every theme room (water rooms have their own art)', () => {
    for (const id of THEME_IDS)
      for (const key of themeRooms(id)) {
        if (isWaterRoom(key)) continue
        expect(floorPatternOf(key), `${id}/${key} has no floor pattern`).not.toBeNull()
      }
  })

  it('keeps patterns unique within each theme', () => {
    for (const id of THEME_IDS) {
      const seen = new Map<string, string>()
      for (const key of themeRooms(id)) {
        if (isWaterRoom(key)) continue
        const p = floorPatternOf(key)
        if (!p) continue
        expect(seen.has(p), `${id}: ${key} and ${seen.get(p)} share pattern "${p}"`).toBe(false)
        seen.set(p, key)
      }
    }
  })

  it('rotates 15 unique defaults for editor placeholder rooms', () => {
    expect(new Set(EDITOR_FLOOR_PATTERNS).size).toBe(15)
    expect(floorPatternOf('room.editor1')).toBe(EDITOR_FLOOR_PATTERNS[0])
    expect(floorPatternOf('room.editor9')).toBe(EDITOR_FLOOR_PATTERNS[8])
    expect(floorPatternOf('room.editorA')).toBe(EDITOR_FLOOR_PATTERNS[9])
    expect(floorPatternOf('room.editorF')).toBe(EDITOR_FLOOR_PATTERNS[14])
  })

  it('leaves unknown room names plain', () => {
    expect(floorPatternOf('room.doesnotexist')).toBeNull()
    expect(floorPatternOf('')).toBeNull()
  })
})
