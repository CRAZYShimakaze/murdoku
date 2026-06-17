import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadLevel } from '../engine/io/LevelLoader.ts'
import { archetypeOf } from '../engine/generator/furnishing.ts'
import type { LevelJson } from '../engine/io/LevelSchema.ts'

/**
 * Intensive density audit of the HAND-BUILT levels, grouped by room archetype (the same
 * classifier the generator uses). For each archetype it reports how full those rooms are
 * (top-object fill %, carpet %) and the object-type histogram — the target the generator
 * should reproduce. Run with `npx tsx src/dev/furnish-stats.ts`.
 */
const dir = resolve(process.cwd(), 'levels')
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

interface Agg {
  rooms: number
  cells: number
  top: number
  carpet: number
  byType: Map<string, number>
  fills: number[] // per-room top-fill ratio
}
const agg = new Map<string, Agg>()
const get = (a: string): Agg => {
  let v = agg.get(a)
  if (!v) { v = { rooms: 0, cells: 0, top: 0, carpet: 0, byType: new Map(), fills: [] }; agg.set(a, v) }
  return v
}

for (const file of files) {
  let json: LevelJson
  try { json = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) } catch { continue }
  if (!json.size || !json.topMap) continue
  let puzzle
  try { puzzle = loadLevel(json) } catch { continue }
  const board = puzzle.board
  const N = board.width * board.height
  const cellsByRoom = new Map<string, number[]>()
  for (let c = 0; c < N; c++) {
    const id = board.roomIdOf(c)
    const list = cellsByRoom.get(id)
    if (list) list.push(c)
    else cellsByRoom.set(id, [c])
  }
  for (const [id, cells] of cellsByRoom) {
    const room = board.rooms.get(id)
    if (!room) continue
    const a = archetypeOf(room.nameKey, room.outside)
    const v = get(a)
    v.rooms++
    v.cells += cells.length
    let topHere = 0
    for (const c of cells) {
      const tile = board.tileAt(c)
      if (tile.top) { v.top++; topHere++; v.byType.set(tile.top.type, (v.byType.get(tile.top.type) ?? 0) + 1) }
      if (tile.ground?.type === 'carpet') v.carpet++
    }
    v.fills.push(topHere / cells.length)
  }
}

const pct = (n: number, d: number): string => (d ? Math.round((100 * n) / d) : 0).toString().padStart(3)
const rows = [...agg.entries()].sort((a, b) => b[1].cells - a[1].cells)
console.log('archetype'.padEnd(15), 'rooms', 'avgCells', 'top%', 'carpet%', '  top objects (per-room avg)')
for (const [a, v] of rows) {
  const hist = [...v.byType.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([t, n]) => `${t}:${(n / v.rooms).toFixed(1)}`)
    .join(' ')
  console.log(
    a.padEnd(15),
    String(v.rooms).padStart(5),
    (v.cells / v.rooms).toFixed(1).padStart(8),
    pct(v.top, v.cells),
    pct(v.carpet, v.cells).padStart(7),
    '  ' + hist,
  )
}
