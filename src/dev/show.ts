import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadLevel, type LevelJson } from '../engine/index.ts'
import { Renderer } from './format.ts'
import de from '../i18n/locales/de.json'

const path = process.argv[2]
if (!path) throw new Error('Usage: npm run show levels/<file>.json')

const json = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as LevelJson
const puzzle = loadLevel(json)
const renderer = new Renderer(de, puzzle)

console.log(`\nLevel: ${puzzle.id}  (${puzzle.board.width}x${puzzle.board.height})`)

console.log('\nRäume (Zahl = Raum):')
for (const row of json.roomMap) console.log('  ' + row.split('').join(' '))
console.log('Räume-Legende:')
for (const [id, def] of Object.entries(json.rooms)) console.log(`  ${id} = ${def.nameKey}`)

const ground = json.groundMap ?? json.roomMap.map((r) => '.'.repeat(r.length))
const top = json.topMap ?? json.roomMap.map((r) => '.'.repeat(r.length))
console.log('\nObjekte:')
for (let r = 0; r < top.length; r++) {
  let line = ''
  for (let c = 0; c < top[r].length; c++) {
    const ch = top[r][c] !== '.' ? top[r][c] : ground[r][c]
    line += (ch === '.' ? '·' : ch) + ' '
  }
  console.log('  ' + line)
}
console.log('Objekt-Legende:')
for (const [char, def] of Object.entries(json.objects ?? {})) {
  console.log(`  ${char} = ${def.type} (${def.occupiable ? 'besetzbar' : 'fest'})`)
}

console.log('\nVerdächtige:')
for (const suspect of puzzle.suspects) {
  const gender = suspect.attributes.gender === 'm' ? '♂' : '♀'
  const clues = suspect.clues
    .map((clue) => renderer.render(clue.describe(), { name: suspect.id }))
    .join('  |  ')
  console.log(`  ${suspect.name} ${gender}: ${clues}`)
}
console.log(`  Opfer: ${puzzle.victim.name} (im letzten freien Feld)`)
console.log('\nFinde heraus, wer allein mit dem Opfer im Raum war.\n')
