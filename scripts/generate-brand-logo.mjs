import { readFile, writeFile } from 'node:fs/promises'

// Preserve the supplied logo exactly, including its original colors and alpha.
// A separate output name prevents cached recolored variants from being reused.
const source = new URL('../public/brand/mower-logo.png', import.meta.url)
const target = new URL('../public/brand/mower-logo-original.png', import.meta.url)
const original = await readFile(source)
await writeFile(target, original)

const png = original.toString('base64')
await writeFile(new URL('../public/favicon.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><image width="256" height="256" href="data:image/png;base64,${png}"/></svg>\n`)
console.log('Copied the original transparent logo and embedded the same PNG in the favicon.')
