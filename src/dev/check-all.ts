import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadLevel, SearchSolver, findMurderer, type LevelJson } from '../engine/index.ts'

const dir = resolve(process.cwd(), 'levels')
const prefix = process.argv[2] ?? 'gen'
const files = readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.json'))

let allUnique = true
for (const file of files) {
  const json = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as LevelJson
  const puzzle = loadLevel(json)
  const searcher = new SearchSolver(puzzle)
  const count = searcher.countSolutions(2)
  const solution = searcher.firstSolution()
  const murderer = solution ? findMurderer(puzzle, solution).suspectId : null
  const verdict = count === 1 ? 'eindeutig' : count >= 2 ? 'MEHRDEUTIG' : 'KEINE LÖSUNG'
  if (count !== 1) allUnique = false
  console.log(
    `${count === 1 ? '✓' : '✗'} ${file.padEnd(30)} ${verdict.padEnd(13)} Mörder: ${murderer ? puzzle.nameOf(murderer) : '—'}`,
  )
}
console.log(
  allUnique ? `\nAlle ${files.length} Level sind eineindeutig ✓` : '\n⚠ Nicht alle eindeutig!',
)
