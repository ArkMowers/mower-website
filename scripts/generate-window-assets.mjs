import sharp from 'sharp'
import { stat } from 'node:fs/promises'

async function generate() {
  const input = 'src/assets/cutouts/mower-dark.png'
  const trimmed = sharp(input).trim()

  // Save 1409w master webp
  const masterWebp = 'public/images/mower-window-1409.webp'
  await trimmed.clone().webp({ quality: 92, effort: 6 }).toFile(masterWebp)
  console.log(`1409w: ${Math.round((await stat(masterWebp)).size / 1024)} KB`)

  // Save 960w webp
  const midWebp = 'public/images/mower-window-960.webp'
  await trimmed.clone().resize({ width: 960 }).webp({ quality: 90, effort: 6 }).toFile(midWebp)
  console.log(`960w: ${Math.round((await stat(midWebp)).size / 1024)} KB`)

  // Save 640w webp for mobile
  const smallWebp = 'public/images/mower-window-640.webp'
  await trimmed.clone().resize({ width: 640 }).webp({ quality: 88, effort: 6 }).toFile(smallWebp)
  console.log(`640w: ${Math.round((await stat(smallWebp)).size / 1024)} KB`)

  // Also save master png for zoom dialog
  const masterPng = 'public/images/mower-window-master.png'
  await trimmed.clone().png({ quality: 95, compressionLevel: 9 }).toFile(masterPng)
  console.log(`master png: ${Math.round((await stat(masterPng)).size / 1024)} KB`)
}

generate().catch(console.error)
