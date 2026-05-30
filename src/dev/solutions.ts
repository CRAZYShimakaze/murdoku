import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SearchSolver,
  findMurderer,
  loadLevel,
  type LevelJson,
  type Puzzle,
  type Solution,
} from '../engine/index.ts'

// Usage: npm run solutions levels/<file>.json [limit]
const path = process.argv[2] ?? 'levels/barbershop.json'
const limit = Number(process.argv[3] ?? 100)
const json = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as LevelJson
const puzzle = loadLevel(json)

function printGrid(puzzle: Puzzle, solution: Solution): void {
  const board = puzzle.board
  const placed = new Map<number, string>()
  for (const [id, cell] of solution.entries()) placed.set(cell, id === 'victim' ? 'O' : id)
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

const solutions = new SearchSolver(puzzle).allSolutions(limit)
console.log(`\nLevel: ${puzzle.id}  (${puzzle.board.width}x${puzzle.board.height})`)
console.log(`Gefundene Lösungen: ${solutions.length}${solutions.length >= limit ? `+ (Limit ${limit})` : ''}\n`)

solutions.forEach((solution, i) => {
  const m = findMurderer(puzzle, solution)
  const murderer = m.suspectId
    ? puzzle.nameOf(m.suspectId)
    : `KEIN eindeutiger Mörder (${m.suspectsInRoom.length} im Opfer-Raum)`
  const order = puzzle.suspects
    .map((s) => {
      const { row, col } = puzzle.board.rc(solution.cellOf(s.id))
      return `${s.id}@Z${row + 1}/S${col + 1}`
    })
    .join('  ')
  const v = puzzle.board.rc(solution.cellOf('victim'))
  console.log(`Lösung ${i + 1}: Mörder ${murderer}`)
  console.log(`  ${order}  Opfer@Z${v.row + 1}/S${v.col + 1}`)
  printGrid(puzzle, solution)
  console.log('')
})
