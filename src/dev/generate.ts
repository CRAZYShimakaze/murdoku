import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateLevel, type GenDifficulty } from '../engine/generator/index.ts'

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback
}

const size = Number(arg('size', '9'))
const width = Number(arg('width', String(size)))
const height = Number(arg('height', String(size)))
const suspects = Number(arg('suspects', String(Math.min(width, height) - 1)))
const seedArg = arg('seed')
const seed = seedArg !== undefined ? Number(seedArg) : undefined
const themeId = arg('theme')
const difficulty = arg('difficulty') as GenDifficulty | undefined

const t0 = performance.now()
const level = generateLevel({ width, height, suspects, seed, themeId, difficulty })
const ms = performance.now() - t0

const path = resolve(process.cwd(), `levels/${level.id}.json`)
writeFileSync(path, JSON.stringify(level, null, 2) + '\n', 'utf8')

console.log(`\nGeneriert in ${ms.toFixed(0)} ms → levels/${level.id}.json`)
console.log(`Größe ${width}x${height}, ${suspects} Verdächtige`)
console.log(`Spielen:  npm run show levels/${level.id}.json`)
console.log(`Lösung:   npm run solve levels/${level.id}.json`)
