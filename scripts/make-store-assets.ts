/**
 * Generates the Google Play store graphics into ./assets:
 *   - store-icon-512.png      (512×512, language-neutral)
 *   - feature-graphic-de.png  (1024×500, German tagline)
 *   - feature-graphic-en.png  (1024×500, English tagline)
 * Run with:  npx tsx scripts/make-store-assets.ts
 *
 * Wordmark uses Georgia (the app's Fraunces fallback) and the tagline Courier New
 * (the Special-Elite fallback) — both ship with Windows, so this renders reliably.
 */
import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { portraitCoin, INK, BRASS, BONE, BONE_DIM, CRIMSON } from './portrait'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assetsDir = resolve(root, 'assets')
mkdirSync(assetsDir, { recursive: true })

// 1) Store icon 512×512 — downscale the finished 1024 launcher icon (DRY).
await sharp(resolve(assetsDir, 'icon-only.png'))
  .resize(512, 512)
  .png()
  .toFile(resolve(assetsDir, 'store-icon-512.png'))
console.log('wrote assets/store-icon-512.png')

// 2) Feature graphic 1024×500 (one per language).
const coin = portraitCoin()

function featureSvg(line1: string, line2: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
    <defs>
      <radialGradient id="bg" cx="74%" cy="46%" r="85%">
        <stop offset="0%" stop-color="${INK.c0}"/>
        <stop offset="58%" stop-color="${INK.c1}"/>
        <stop offset="100%" stop-color="${INK.c2}"/>
      </radialGradient>
    </defs>
    <rect width="1024" height="500" fill="url(#bg)"/>
    <!-- a faint red "case thread" behind the scene -->
    <line x1="40" y1="60" x2="980" y2="440" stroke="${CRIMSON}" stroke-width="1" opacity="0.18"/>
    <line x1="980" y1="60" x2="60" y2="440" stroke="${CRIMSON}" stroke-width="1" opacity="0.12"/>
    <!-- detective portrait medallion, right side (kept clear of the wordmark) -->
    <svg x="700" y="110" width="284" height="284" viewBox="0 0 100 100">${coin}</svg>
    <!-- wordmark with the crimson O, like the app -->
    <text x="70" y="232" font-family="Georgia, 'Times New Roman', serif" font-weight="800"
          font-size="104" letter-spacing="2" fill="${BONE}">MURD<tspan fill="${CRIMSON}">O</tspan>KU</text>
    <text x="74" y="292" font-family="'Courier New', monospace" font-size="31"
          letter-spacing="1" fill="${BRASS}">${line1}</text>
    <text x="74" y="336" font-family="'Courier New', monospace" font-size="23"
          letter-spacing="1" fill="${BONE_DIM}">${line2}</text>
  </svg>`
}

async function feature(file: string, line1: string, line2: string): Promise<void> {
  await sharp(Buffer.from(featureSvg(line1, line2)))
    .png()
    .toFile(resolve(assetsDir, file))
  console.log('wrote assets/' + file)
}

await feature('feature-graphic-de.png', 'Mörderjagd trifft Sudoku', '90+ Fälle · Editor · Generator')
await feature('feature-graphic-en.png', 'Manhunt meets Sudoku', '90+ cases · Editor · Generator')
