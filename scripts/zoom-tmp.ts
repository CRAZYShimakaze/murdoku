import sharp from 'sharp'
import { avatarSvg } from '../src/game/avatar.ts'
async function main() {
  const out = process.argv[2]
  const items = [
    avatarSvg({ gender: 'm', hair: 'white', hairstyle: 'slick' }, '#c0566b', 'A'),
    avatarSvg({ gender: 'm', hair: 'grey', hairstyle: 'slick' }, '#4f8fb0', 'B'),
    avatarSvg({ gender: 'm', hair: 'blond', hairstyle: 'short' }, '#cfe0cf', 'C'),
    avatarSvg({ gender: 'm', hair: 'white', hairstyle: 'curtains' }, '#e8d8b0', 'D'),
  ]
  let body = ''
  items.forEach((s, i) => {
    body += `<svg x="${i * 300}" y="0" width="290" height="290" viewBox="0 0 100 100">${s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</svg>`
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300"><rect width="1200" height="300" fill="#f2ede2"/>${body}</svg>`
  await sharp(Buffer.from(svg)).png().toFile(`${out}/zoom.png`)
  console.log('ok')
}
void main()
