import { describe, it, expect } from 'vitest'
import { ENGINE_VERSION } from './index.ts'

describe('engine', () => {
  it('exposes a semver version', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
