import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Download only the three outfits used by the homepage, from a fixed revision.
// Asset rights and PMA rendering requirements are recorded alongside the files.
const revision = '8a3857c250a5c271429aefa82c660ff35803166e'
const upstream = `https://raw.githubusercontent.com/isHarryh/Ark-Models/${revision}`
const destination = fileURLToPath(new URL('../public/models/proviso/', import.meta.url))
const models = [
  {
    folder: 'default',
    id: '4032_provs',
    checksums: {
      atlas: '991e4a462c4c1615f385ce6cb15e90be6680d7d3f1778dfc6a5a0f3d487d8a12',
      png: 'd31d2164c18b3f979107e4666a8be67b0a198bd5c1a0a514f8864e46392b7078',
      skel: '394534f8bd802550605e7f74752cb5eeff63083295c2072a32e1596e70d76b4e',
    },
  },
  {
    folder: 'holiday',
    id: '4032_provs_summer#17',
    checksums: {
      atlas: 'b052d65da341c29e05a6ff31bd40bb05a1cb60293807a51734af47da7fea0046',
      png: 'dcab718648eb4572d6130143a11341d208bfb4811e30d4c9e3d14ac16b1296b5',
      skel: '1b02eee993f4b47a1f22bba00ff0390a860cc92a4921d2db455ac1f35a03afc4',
    },
  },
  {
    folder: 'autumn',
    id: '4032_provs_wild#7',
    checksums: {
      atlas: '35dc5f0962b119dad2257d60f9b42698f289c586d12bbab9f60412a5e33aecf9',
      png: '689c84f2b3b34c685e065c84734430ade448166ef04f367947fe918c6233ecd7',
      skel: '0a55e89dd4679e7f1316464dba9faf8a1bd7363c45cb585dce6d72b99fa26725',
    },
  },
]

for (const model of models) {
  const directory = path.join(destination, model.folder)
  await mkdir(directory, { recursive: true })

  for (const [extension, expected] of Object.entries(model.checksums)) {
    const filename = `build_char_${model.id}.${extension}`
    const url = `${upstream}/models/${encodeURIComponent(model.id)}/${encodeURIComponent(filename)}`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`)

    const bytes = Buffer.from(await response.arrayBuffer())
    const actual = createHash('sha256').update(bytes).digest('hex')
    if (actual !== expected) throw new Error(`Checksum mismatch: ${filename}`)

    // Vite's public-file lookup preserves an encoded '#' and falls back to HTML.
    // Keep the upstream checksum, then use portable local names and atlas pages.
    const localFilename = filename.replaceAll('#', '-')
    const output = extension === 'atlas'
      ? Buffer.from(bytes.toString('utf8').replaceAll(`build_char_${model.id}.png`, `build_char_${model.id.replaceAll('#', '-')}.png`))
      : bytes
    await writeFile(path.join(directory, localFilename), output)
    console.log(`${model.folder}/${localFilename}: ${output.length} bytes, upstream SHA-256 verified`)
  }
}
