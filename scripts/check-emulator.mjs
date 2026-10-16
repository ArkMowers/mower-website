import sharp from 'sharp'

async function checkEmulatorCoords() {
  const master = sharp('public/images/mower-window-master.png')
  await master.clone().extract({ left: 244, top: 56, width: 512, height: 288 }).png().toFile('dist/emulator-16x9.png')
  console.log('Saved dist/emulator-16x9.png')
}

checkEmulatorCoords().catch(console.error)
