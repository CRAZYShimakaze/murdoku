/** Uniqueness census over EVERY bundled level — confirms the candidateCells widening
 *  didn't expose a previously-hidden ambiguity. Prints only the non-unique ones. */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadLevel, SearchSolver, type LevelJson } from '../engine/index.ts'

const dir = resolve(process.cwd(), 'levels')
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
let bad = 0
for (const file of files) {
  const json = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as LevelJson
  const count = new SearchSolver(loadLevel(json)).countSolutions(2)
  if (count !== 1) {
    bad++
    console.log(`${count >= 2 ? 'MEHRDEUTIG' : 'KEINE LÖSUNG'}  ${file}`)
  }
}
console.log(`\n${files.length} Level geprüft · ${bad} nicht-eindeutig`)
