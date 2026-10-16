import sharp from 'sharp'

async function inspectRegions() {
  const master = sharp('public/images/mower-window-master.png')
  const meta = await master.metadata()
  console.log('Master dimensions:', meta.width, meta.height)

  // In 1409 x 799:
  // Titlebar is roughly y: 0 to 30
  // Left sidebar is roughly x: 0 to 220, y: 30 to 799
  // Game emulator screen is roughly x: 230 to 760, y: 60 to 360
  // Schedule table is roughly x: 230 to 760, y: 360 to 570
  // Log area is roughly x: 230 to 760, y: 570 to 740
  // Bottom buttons: y: 740 to 790
  // Right artwork (Lumen): x: 700 to 1409, y: 30 to 799

  // Let's test crop the emulator screen
  // Game screen header in screenshot has MuMu12 window bar or game top bar (16301175 LMD, 2630 Orundum, 25 OP)
  await master.clone().extract({ left: 240, top: 55, width: 520, height: 300 }).toFile('dist/crop-emulator.png')
  console.log('Saved dist/crop-emulator.png')

  // Let's test crop the schedule table
  await master.clone().extract({ left: 240, top: 360, width: 520, height: 210 }).toFile('dist/crop-schedule.png')
  console.log('Saved dist/crop-schedule.png')

  // Let's test crop the left sidebar
  await master.clone().extract({ left: 10, top: 40, width: 220, height: 720 }).toFile('dist/crop-sidebar.png')
  console.log('Saved dist/crop-sidebar.png')

  // Let's test crop the bottom control bar
  await master.clone().extract({ left: 235, top: 735, width: 1140, height: 55 }).toFile('dist/crop-bottom-bar.png')
  console.log('Saved dist/crop-bottom-bar.png')
}

inspectRegions().catch(console.error)
