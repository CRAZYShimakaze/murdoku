/**
 * Drill into ONE generated level whose honest (test-based) solution count differs from
 * its candidateCells-restricted count — i.e. some clue's candidateCells is UNSOUND
 * (excludes a cell where its own test() returns true). Prints the two solutions and
 * pinpoints the offending suspect + clue.
 *
 *   npx tsx src/dev/drill.ts <difficulty> <size> <seed>
 */
import { generateLevel } from '../engine/generator/index.ts'
import { loadLevel } from '../engine/io/LevelLoader.ts'
import { Solution } from '../engine/model/Solution.ts'
import type { Person } from '../engine/model/Puzzle.ts'
import type { Cell, PersonId } from '../engine/model/types.ts'
import type { GenDifficulty } from '../engine/generator/index.ts'

const diff = (process.argv[2] ?? 'hard') as GenDifficulty
const size = Number(process.argv[3] ?? 6)
const seed = Number(process.argv[4] ?? 6)

const level = generateLevel({ width: size, height: size, suspects: size - 1, difficulty: diff, seed })
const puzzle = loadLevel(level)
const board = puzzle.board
const people: Person[] = puzzle.people()

function fmt(cell: Cell): string {
  const { row, col } = board.rc(cell)
  return `Z${row + 1}/S${col + 1}(${board.roomIdOf(cell)})`
}

// brute force WITHOUT candidateCells — only row/col distinct + leaf clue test.
function allSolutions(limit: number): Map<PersonId, Cell>[] {
  const victim = people.find((p) => p.isVictim)!
  const order = [...people]
  const placement = new Map<PersonId, Cell>()
  const usedRow = new Set<number>()
  const usedCol = new Set<number>()
  const out: Map<PersonId, Cell>[] = []
  const cells = [...board.occupiableCells()]
  const leafValid = (): boolean => {
    const sol = new Solution(new Map(placement))
    for (const p of people) for (const c of p.clues) if (!c.test(p.id, sol, puzzle)) return false
    const vr = board.roomIdOf(placement.get(victim.id)!)
    let w = 0
    for (const p of people) if (!p.isVictim && board.roomIdOf(placement.get(p.id)!) === vr) w++
    if (w !== 1) return false
    for (const bc of puzzle.boardClues) if (!bc.test(sol, puzzle)) return false
    return true
  }
  const rec = (i: number): void => {
    if (out.length >= limit) return
    if (i === order.length) {
      if (leafValid()) out.push(new Map(placement))
      return
    }
    for (const cell of cells) {
      const { row, col } = board.rc(cell)
      if (usedRow.has(row) || usedCol.has(col)) continue
      usedRow.add(row); usedCol.add(col); placement.set(order[i].id, cell)
      rec(i + 1)
      placement.delete(order[i].id); usedRow.delete(row); usedCol.delete(col)
    }
  }
  rec(0)
  return out
}

const sols = allSolutions(5)
console.log(`Level: ${diff} ${size}x${size} #${seed} — id=${level.id}`)
console.log(`Honest solution count (test-based, no candidateCells): ${sols.length}\n`)

for (const s of puzzle.suspects) {
  console.log(`  ${s.id} (${s.name}) attrs=${JSON.stringify(puzzle.attributesOf(s.id))}`)
  for (const clue of s.clues) {
    const cc = clue.candidateCells(board)
    console.log(`      clue ${clue.constructor.name}  desc=${JSON.stringify(clue.describe())}`)
    console.log(`      candidateCells=${cc ? [...cc].map(fmt).join(' ') : 'null'}`)
  }
}

sols.forEach((sol, k) => {
  console.log(`\n=== Solution ${k + 1} ===`)
  for (const p of people) console.log(`  ${p.id.padEnd(2)} -> ${fmt(sol.get(p.id)!)}`)
})

// Pinpoint: which suspect/clue has a solution cell OUTSIDE its candidateCells?
console.log('\n=== candidateCells soundness vs each honest solution ===')
sols.forEach((sol, k) => {
  for (const p of puzzle.suspects) {
    const cell = sol.get(p.id)!
    const solObj = new Solution(sol)
    for (const clue of p.clues) {
      const cc = clue.candidateCells(board)
      const passesTest = clue.test(p.id, solObj, puzzle)
      if (cc && !cc.has(cell) && passesTest) {
        console.log(
          `  ✗ Sol${k + 1}: ${p.id}'s ${clue.constructor.name} test()=TRUE on ${fmt(cell)} but candidateCells EXCLUDES it`,
        )
        console.log(`     clue: ${JSON.stringify(clue.describe())}`)
      }
    }
  }
})
