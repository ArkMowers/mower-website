import sharp from 'sharp'

async function makeEmulator() {
  await sharp('dist/emulator-16x9.png')
    .webp({ quality: 95 })
    .toFile('public/images/mower-emulator-screen.webp')
  console.log('Saved public/images/mower-emulator-screen.webp')
}

makeEmulator().catch(console.error)
