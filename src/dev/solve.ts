import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DeductionEngine,
  SearchSolver,
  findMurderer,
  loadLevel,
  type LevelJson,
  type Puzzle,
  type Solution,
} from '../engine/index.ts'
import { Renderer } from './format.ts'
import de from '../i18n/locales/de.json'

function printGrid(puzzle: Puzzle, solution: Solution | null): void {
  const board = puzzle.board
  const placed = new Map<number, string>()
  if (solution) {
    for (const [id, cell] of solution.entries()) {
      placed.set(cell, id === 'victim' ? 'O' : id)
    }
  }
  for (let row = 0; row < board.height; row++) {
    let line = ''
    for (let col = 0; col < board.width; col++) {
      const cell = board.idx(row, col)
      const who = placed.get(cell)
      line += who ? ` ${who} ` : board.isOccupiable(cell) ? ' · ' : ' # '
    }
    console.log(line)
  }
}

const path = process.argv[2] ?? 'levels/demo-4x4.json'
const json = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as LevelJson
const puzzle = loadLevel(json)
const renderer = new Renderer(de, puzzle)

console.log(`\nLevel: ${puzzle.id}  (${puzzle.board.width}x${puzzle.board.height})`)
console.log('Verdächtige:')
for (const suspect of puzzle.suspects) {
  const clues =
    suspect.clues.map((c) => renderer.render(c.describe(), { name: suspect.id })).join('  |  ') ||
    '(kein Hinweis)'
  console.log(`  ${suspect.id} = ${suspect.name}: ${clues}`)
}
console.log(`  Opfer = ${puzzle.victim.name}`)

console.log('\nDeduktion:')
const t0 = performance.now()
const result = new DeductionEngine(puzzle).solve()
const solveMs = performance.now() - t0
for (const step of result.steps) {
  console.log(`  - ${renderer.render(step.explanation)}`)
}

console.log(`\nGeloest (Deduktion): ${result.solved ? 'ja' : 'nein'}`)
console.log(`Schwierigkeit (Engine): ${result.difficulty} (Rang ${result.maxRank})`)
console.log(`Loesungszeit (reine Deduktion): ${solveMs.toFixed(3)} ms`)
const searcher = new SearchSolver(puzzle)
const tSol = performance.now()
const refSolution = searcher.firstSolution()
const solMs = performance.now() - tSol
const tUniq = performance.now()
const count = searcher.countSolutions(2)
const uniqMs = performance.now() - tUniq
console.log(`Loesung finden (Mörder): ${solMs.toFixed(2)} ms  (${searcher.nodes} Suchknoten)`)
console.log(
  `Eindeutig: ${count === 1 ? 'ja' : count >= 2 ? 'nein (mehrere Loesungen)' : 'nein (keine Loesung)'}  (Eindeutigkeits-Beweis ${uniqMs.toFixed(2)} ms)`,
)
if (refSolution) {
  const m = findMurderer(puzzle, refSolution)
  console.log(
    `Moerder: ${m.suspectId ? puzzle.nameOf(m.suspectId) : `uneindeutig (${m.suspectsInRoom.length} im Raum)`}`,
  )
  console.log('\nLoesung (Referenzloeser):')
  printGrid(puzzle, refSolution)
} else {
  console.log('Keine Loesung gefunden.')
}
console.log('')
