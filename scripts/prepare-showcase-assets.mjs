import sharp from 'sharp'
import { access, copyFile, mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// The originals remain local. Public assets contain anonymous, authentic UI;
// ImageGen supplied only the small opaque account plate, never replacement UI.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicImages = join(project, 'public', 'images')
const originals = join(project, '.screenshots.local', 'original-public')
const review = join(project, '.taste-skill', 'showcase', 'assets')
const accountPatch = join(project, 'scripts', 'assets', 'account-redaction.png')
const publicNames = new Set([
  'mower-screenshot-light-clean.webp', 'mower-screenshot-light-clean-960.webp',
  'mower-screenshot-dark-clean.webp', 'mower-screenshot-dark-clean-960.webp',
  'mower-schedule-light.webp', 'mower-schedule-light-960.webp',
  'mower-schedule-dark.webp', 'mower-schedule-dark-960.webp',
  'mower-lumen-backdrop.webp', 'mower-emulator-screen.webp',
])

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

function withinProject(path) {
  const absolute = resolve(path)
  if (!absolute.startsWith(`${project}${sep}`)) throw new Error(`Path outside project: ${absolute}`)
  return absolute
}

// Preserve every previous public image before replacing or retiring it. This
// intentionally moves individual verified files; it never recursively deletes.
async function archivePublicImages() {
  await mkdir(originals, { recursive: true })
  await mkdir(publicImages, { recursive: true })
  for (const entry of await readdir(publicImages, { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error(`Unexpected directory in public/images: ${entry.name}`)
    const source = withinProject(join(publicImages, entry.name))
    let target = withinProject(join(originals, entry.name))
    if (publicNames.has(entry.name)) {
      if (!(await exists(target))) await copyFile(source, target)
    } else {
      if (await exists(target)) target = withinProject(join(originals, `${Date.now()}-${entry.name}`))
      await rename(source, target)
    }
  }
}

function repairLightCorners(data, info) {
  // The 13 px window corners were captured over a green screen. Recover their
  // coverage exactly as the previous light-image preparation did.
  const cornerSize = 13
  for (let y = 0; y < info.height; y += 1) {
    if (y >= cornerSize && y < info.height - cornerSize) continue
    for (let x = 0; x < info.width; x += 1) {
      if (x >= cornerSize && x < info.width - cornerSize) continue
      const offset = (y * info.width + x) * 4
      const bottomRight = x >= info.width - cornerSize && y >= info.height - cornerSize
      const surface = bottomRight ? [255, 255, 255] : [250, 249, 247]
      const alpha = Math.min(255, Math.round((data[offset + 2] / surface[2]) * 255))
      data[offset] = surface[0]
      data[offset + 1] = surface[1]
      data[offset + 2] = surface[2]
      data[offset + 3] = alpha
    }
  }
}

function regionContains(region, x, y) {
  return x >= region.left && x < region.left + region.width && y >= region.top && y < region.top + region.height
}

function verifyUnchangedUI(before, after, info, regions) {
  let changedOutsideRegions = 0
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4
      if (regions.some(region => regionContains(region, x, y))) {
        if (after[offset + 3] !== 255) throw new Error('An anonymous patch contains transparent pixels')
      } else {
        for (let channel = 0; channel < 4; channel += 1) {
          if (before[offset + channel] !== after[offset + channel]) {
            changedOutsideRegions += 1
            break
          }
        }
      }
    }
  }
  if (changedOutsideRegions) throw new Error(`Unexpected UI changes outside anonymous regions: ${changedOutsideRegions}`)
  return { changedOutsideRegions, anonymousRegionsOpaque: true }
}

const outputs = []
async function encodeWebP(data, info, name, width) {
  const target = join(publicImages, name)
  const output = await sharp(data, { raw: info })
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 92, effort: 6, alphaQuality: 100 })
    .toFile(target)
  outputs.push({ file: name, width: output.width, height: output.height, bytes: (await stat(target)).size })
}

async function prepareMain(theme, source, crop, account) {
  let pipeline = sharp(source)
  if (crop) pipeline = pipeline.extract(crop)
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (theme === 'light') repairLightCorners(data, info)
  const before = Buffer.from(data)

  const patch = await sharp(accountPatch)
    .flatten({ background: '#303532' })
    .resize(account.width, account.height, { fit: 'fill' })
    .ensureAlpha().raw().toBuffer()
  for (let y = 0; y < account.height; y += 1) {
    const start = ((account.top + y) * info.width + account.left) * 4
    patch.copy(data, start, y * account.width * 4, (y + 1) * account.width * 4)
  }
  const invariants = verifyUnchangedUI(before, data, info, [account])
  await sharp(data, { raw: info }).png().toFile(join(review, `mower-${theme}-anonymous-review.png`))
  for (const width of [info.width, 960]) {
    const suffix = width === info.width ? '' : '-960'
    await encodeWebP(data, info, `mower-screenshot-${theme}-clean${suffix}.webp`, width)
  }
  return { theme, data, info, account, invariants }
}

async function prepareSchedule(theme, name) {
  const { data, info } = await sharp(join(project, name))
    .extract({ left: 376, top: 74, width: 1470, height: 700 })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (const width of [1470, 960]) {
    const suffix = width === 1470 ? '' : '-960'
    await encodeWebP(data, info, `mower-schedule-${theme}${suffix}.webp`, width)
  }
}

await access(accountPatch)
await archivePublicImages()
await mkdir(review, { recursive: true })

const light = await prepareMain('light', join(originals, 'mower-light-source.png'),
  { left: 326, top: 42, width: 1924, height: 1084 },
  { left: 358, top: 285, width: 88, height: 39 })
const dark = await prepareMain('dark', join(project, '运行日志-dark.png'), null,
  { left: 354, top: 283, width: 87, height: 40 })
await prepareSchedule('light', '排版编辑-light.png')
await prepareSchedule('dark', '排班编辑-dark.png')

// Historical components still use this standalone game view. Derive it from the
// already-anonymous dark frame, so it cannot reintroduce the original account.
const emulator = await sharp(dark.data, { raw: dark.info })
  .extract({ left: 331, top: 70, width: 720, height: 405 })
  .webp({ quality: 92, effort: 6 }).toFile(join(publicImages, 'mower-emulator-screen.webp'))
outputs.push({ file: 'mower-emulator-screen.webp', width: emulator.width, height: emulator.height, bytes: emulator.size })

const servedNames = await readdir(publicImages)
const unexpected = servedNames.filter(name => !publicNames.has(name))
if (unexpected.length) throw new Error(`Unapproved public screenshot files: ${unexpected.join(', ')}`)
const report = {
  accountPatch: 'scripts/assets/account-redaction.png',
  imagegen: 'Built-in ImageGen; opaque charcoal plate with two anonymous gray bars, no text or digits.',
  pixelInvariants: [light, dark].map(({ theme, account, invariants }) => ({ theme, account, ...invariants })),
  outputs,
  servedFiles: servedNames.sort(),
  localOriginals: '.screenshots.local/original-public/',
}
await writeFile(join(review, 'asset-preparation.json'), `${JSON.stringify(report, null, 2)}\n`)
for (const output of outputs) console.log(`${output.file}: ${output.width}×${output.height}, ${Math.round(output.bytes / 1024)} KB`)
console.log('Verified: no UI pixels changed outside the anonymous game-account region; original titlebar information is preserved.')
