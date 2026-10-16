import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { createServer } from 'vite'

// Render the actual Spine scene so the fallback has the same scale and baseline.
// Originals, attribution, and the pinned download are documented in SOURCE.md.
const root = fileURLToPath(new URL('../', import.meta.url))
let server
let browser

try {
  server = await createServer({
    root,
    server: { port: 0, host: '127.0.0.1', hmr: false },
  })
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address === 'object')
  const origin = `http://127.0.0.1:${address.port}`

  browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.MOWER_BROWSER_EXECUTABLE
      ? { executablePath: process.env.MOWER_BROWSER_EXECUTABLE }
      : { channel: 'msedge' }),
  })
  const context = await browser.newContext({ deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.route(`${origin}/__operator_posters`, route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><title>Operator poster renderer</title></head><body></body></html>',
  }))
  await page.goto(`${origin}/__operator_posters`)

  const posters = await page.evaluate(async () => {
    const [{ SpineRenderer }, { OPERATOR_SKINS }] = await Promise.all([
      import('/src/components/operator-stage/spine-renderer.ts'),
      import('/src/components/operator-stage/models.ts'),
    ])
    const canvas = document.createElement('canvas')
    const renderer = new SpineRenderer(canvas)
    renderer.resize(128, 128, 84)
    const results = []
    try {
      for (const skin of OPERATOR_SKINS) {
        const loaded = await renderer.load(skin).catch(error => {
          throw new Error(`${skin.id}: ${error.message}`, { cause: error })
        })
        if (!loaded) throw new Error(`Failed to load ${skin.id}`)
        renderer.draw(0, 64, 1)
        // Capture in this same JS task: WebGL does not preserve its drawing buffer.
        results.push({ id: skin.id, png: canvas.toDataURL('image/png') })
      }
    } finally {
      renderer.dispose()
    }
    return results
  })

  for (const poster of posters) {
    assert.match(poster.id, /^(default|holiday|autumn)$/)
    assert.ok(poster.png.startsWith('data:image/png;base64,'))
    const png = Buffer.from(poster.png.split(',')[1], 'base64')
    const metadata = await sharp(png).metadata()
    const statistics = await sharp(png).stats()
    assert.equal(metadata.width, 256)
    assert.equal(metadata.height, 256)
    assert.equal(metadata.hasAlpha, true)
    assert.equal(statistics.channels[3].min, 0, 'The backdrop must be transparent')
    assert.ok(statistics.channels[3].max > 0, 'The rendered character must be visible')

    const output = path.join(root, 'public', 'models', 'proviso', poster.id, 'poster.webp')
    const info = await sharp(png).webp({ lossless: true, effort: 6 }).toFile(output)
    console.log(`${poster.id}/poster.webp: ${info.width} × ${info.height}, ${info.size} bytes`)
  }
} finally {
  if (browser) await browser.close()
  if (server) await server.close()
}
