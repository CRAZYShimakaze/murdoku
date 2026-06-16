import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadLevel, type LevelJson } from '../engine/index.ts'
import { SolveContext } from '../engine/solver/SolveContext.ts'
import { createForwardTechniques, propagate } from '../engine/solver/forward.ts'

/** Print the candidate MATRIX after running the human pipeline to a fixpoint: each
 *  occupiable cell shows which suspects (A,B,…) can still stand there, 'o' = victim,
 *  '#' = blocked. Run: npx tsx src/dev/matrix.ts levels/museum.json */
const path = process.argv[2] ?? 'levels/museum.json'
const json = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as LevelJson
const puzzle = loadLevel(json)
const ctx = SolveContext.create(puzzle)

// Seed domains from clues (same as DeductionEngine.seedDomains).
const occ = ctx.board.occupiableCells()
for (const person of ctx.people) {
  const d = new Set<number>(occ)
  for (const clue of person.clues) {
    const cells = clue.candidateCells(ctx.board)
    if (cells) for (const c of [...d]) if (!cells.has(c)) d.delete(c)
  }
  ctx.state.setDomain(person.id, d)
}

const steps = propagate(ctx, createForwardTechniques(puzzle))
const victimId = puzzle.victim.id
const sym = (id: string) => (id === victimId ? 'o' : id)

// Per cell: placed person, or the set of people whose domain contains it.
const W = ctx.board.width
const H = ctx.board.height
const cellText = (cell: number): string => {
  for (const [id, c] of ctx.state.placed) if (c === cell) return '[' + sym(id) + ']'
  if (!ctx.board.isOccupiable(cell)) return '#'
  const who: string[] = []
  for (const person of ctx.people) {
    if (person.id === victimId || ctx.state.placed.has(person.id)) continue // suspects only
    if (ctx.state.domain(person.id).has(cell)) who.push(sym(person.id))
  }
  return who.join('') || '·'
}

const grid: string[][] = []
let width = 1
for (let r = 0; r < H; r++) {
  const row: string[] = []
  for (let c = 0; c < W; c++) {
    const t = cellText(r * W + c)
    width = Math.max(width, t.length)
    row.push(t)
  }
  grid.push(row)
}

const pad = (s: string) => s.padEnd(width, ' ')
let header = '     '
for (let c = 0; c < W; c++) header += pad('S' + (c + 1)) + ' '
console.log(header)
for (let r = 0; r < H; r++) {
  let line = ('Z' + (r + 1)).padEnd(4, ' ') + ' '
  for (let c = 0; c < W; c++) line += pad(grid[r][c]) + ' '
  console.log(line)
}

const placed = [...ctx.state.placed.keys()].map(sym).sort().join(',')
console.log(`\nPlatziert: ${placed || '(keine)'} · offen: ${ctx.state.unplaced().length}`)
const last = steps[steps.length - 1]
console.log('Letzter Schritt:', last ? last.technique : '(keiner)')
