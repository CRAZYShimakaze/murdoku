/** Renders avatar contact sheets as PNGs (via sharp) for visual self-review. */
import sharp from 'sharp'
import { avatarSvg, HAIRSTYLES_F, HAIRSTYLES_M, BEARD_STYLES } from '../src/game/avatar.ts'

const OUT = process.argv[2] ?? '.'
const CELL = 130
const COIN = '#c0566b'
const COIN2 = '#4f8fb0'

function sheet(items: { svg: string; label: string }[], cols: number): string {
  const rows = Math.ceil(items.length / cols)
  const W = cols * CELL
  const HH = rows * (CELL + 18)
  let body = ''
  items.forEach((it, i) => {
    const x = (i % cols) * CELL
    const y = Math.floor(i / cols) * (CELL + 18)
    body += `<svg x="${x + 5}" y="${y + 2}" width="${CELL - 10}" height="${CELL - 10}" viewBox="0 0 100 100">${it.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</svg>`
    body += `<text x="${x + CELL / 2}" y="${y + CELL + 6}" text-anchor="middle" font-family="Arial" font-size="12" fill="#222">${it.label}</text>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HH}"><rect width="${W}" height="${HH}" fill="#f2ede2"/>${body}</svg>`
}

async function save(name: string, svg: string): Promise<void> {
  await sharp(Buffer.from(svg), { density: 96 }).png().toFile(`${OUT}/${name}.png`)
  console.log('wrote', name)
}

async function main(): Promise<void> {
// Sheet 1: all female styles (brown + black)
await save('sheet-f', sheet(
  HAIRSTYLES_F.flatMap((s) => [
    { svg: avatarSvg({ gender: 'f', hair: 'blond', hairstyle: s }, COIN, 'A'), label: s },
    { svg: avatarSvg({ gender: 'f', hair: 'white', hairstyle: s }, COIN2, 'B'), label: s },
  ]),
  8,
))

// Sheet 2: all male styles (brown + blond)
await save('sheet-m', sheet(
  HAIRSTYLES_M.flatMap((s) => [
    { svg: avatarSvg({ gender: 'm', hair: 'white', hairstyle: s }, COIN, 'C'), label: s },
    { svg: avatarSvg({ gender: 'm', hair: 'grey', hairstyle: s }, COIN2, 'D'), label: s },
  ]),
  8,
))

// Sheet 3: colours — the white vs grey check (both genders), on two coin colours
const COLORS = ['blond', 'darkblond', 'brown', 'black', 'red', 'auburn', 'grey', 'white']
await save('sheet-colors', sheet(
  COLORS.flatMap((c) => [
    { svg: avatarSvg({ gender: 'f', hair: c, hairstyle: 'long' }, COIN, 'E'), label: c },
    { svg: avatarSvg({ gender: 'm', hair: c, hairstyle: 'short', beard: true, beardStyle: 'full' }, '#cfe0cf', 'F'), label: c },
  ]),
  8,
))

// Sheet 4: beards (+ bald, glasses)
await save('sheet-beards', sheet(
  [
    ...BEARD_STYLES.map((b) => ({
      svg: avatarSvg({ gender: 'm', hair: 'brown', hairstyle: 'sidePart', beard: true, beardStyle: b }, COIN2, 'G'),
      label: b,
    })),
    { svg: avatarSvg({ gender: 'm', hair: 'grey', bald: true, beard: true, beardStyle: 'full' }, COIN, 'H'), label: 'bald+full' },
    { svg: avatarSvg({ gender: 'm', hair: 'black', hairstyle: 'quiff', glasses: true, glassesShape: 'square' }, '#e8d8b0', 'I'), label: 'glasses' },
    { svg: avatarSvg({ gender: 'f', hair: 'white', hairstyle: 'bun', glasses: true, glassesShape: 'cat', glassesColor: 'red' }, '#b9d0e6', 'J'), label: 'white+cat' },
  ],
  8,
))
}
void main()
