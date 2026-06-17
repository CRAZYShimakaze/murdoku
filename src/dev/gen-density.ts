import { generateLevel, themeDefaultObjects, THEME_IDS } from '../engine/generator/index.ts'
import { loadLevel } from '../engine/io/LevelLoader.ts'
import { archetypeOf } from '../engine/generator/furnishing.ts'

/**
 * Density of GENERATED levels per room archetype, to compare against the hand-built
 * target (dev/furnish-stats). Generates a few levels per theme and aggregates top-object
 * fill % + object histogram. Run with `npx tsx src/dev/gen-density.ts`.
 */
interface Agg { rooms: number; cells: number; top: number; carpet: number; byType: Map<string, number> }
const agg = new Map<string, Agg>()
const get = (a: string): Agg => {
  let v = agg.get(a)
  if (!v) { v = { rooms: 0, cells: 0, top: 0, carpet: 0, byType: new Map() }; agg.set(a, v) }
  return v
}

const themes = THEME_IDS
const seeds = [1, 2, 3]
for (const theme of themes) {
  for (const seed of seeds) {
    const level = generateLevel({ width: 9, height: 9, suspects: 8, difficulty: 'medium', seed, themeId: theme, objects: themeDefaultObjects(theme) })
    const board = loadLevel(level).board
    const N = board.width * board.height
    const byRoom = new Map<string, number[]>()
    for (let c = 0; c < N; c++) { const id = board.roomIdOf(c); (byRoom.get(id) ?? byRoom.set(id, []).get(id)!).push(c) }
    for (const [id, cells] of byRoom) {
      const room = board.rooms.get(id)!
      const v = get(archetypeOf(room.nameKey, room.outside))
      v.rooms++; v.cells += cells.length
      for (const c of cells) {
        const tile = board.tileAt(c)
        if (tile.top) { v.top++; v.byType.set(tile.top.type, (v.byType.get(tile.top.type) ?? 0) + 1) }
        if (tile.ground?.type === 'carpet') v.carpet++
      }
    }
  }
}

const pct = (n: number, d: number): string => (d ? Math.round((100 * n) / d) : 0).toString().padStart(3)
const rows = [...agg.entries()].sort((a, b) => b[1].cells - a[1].cells)
console.log('archetype'.padEnd(15), 'rooms', 'avgCells', 'top%', 'carp%', '  top objects (per-room avg)')
for (const [a, v] of rows) {
  const hist = [...v.byType.entries()].sort((x, y) => y[1] - x[1]).map(([t, n]) => `${t}:${(n / v.rooms).toFixed(1)}`).join(' ')
  console.log(a.padEnd(15), String(v.rooms).padStart(5), (v.cells / v.rooms).toFixed(1).padStart(8), pct(v.top, v.cells), pct(v.carpet, v.cells).padStart(5), '  ' + hist)
}
