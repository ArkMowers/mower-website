import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

// Exercise the real binary models, animation state and WebGL draw at both ends.
// The previous 72px hit target allowed Sleep's wider body to leave the canvas.
const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, '.taste-skill/operator-stage')
let server
let browser
let report
try {
  server = await createServer({ root, server: { port: 0, host: '127.0.0.1', hmr: false } })
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address === 'object')
  const origin = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.MOWER_BROWSER_EXECUTABLE
      ? { executablePath: process.env.MOWER_BROWSER_EXECUTABLE } : { channel: 'msedge' }) })
  const page = await browser.newPage()
  await page.route(`${origin}/__operator_poses`, route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><html><head><title>Operator pose regression</title></head><body></body></html>' }))
  await page.goto(`${origin}/__operator_poses`)
  report = await page.evaluate(async () => {
    const [{ SpineRenderer }, { OPERATOR_SKINS }] = await Promise.all([
      import('/src/components/operator-stage/spine-renderer.ts'),
      import('/src/components/operator-stage/models.ts'),
    ])
    const canvas = document.createElement('canvas')
    const renderer = new SpineRenderer(canvas)
    const gl = canvas.getContext('webgl')
    const failures = []
    const cases = []
    const anchors = []
    function pixels() {
      const data = new Uint8Array(canvas.width * canvas.height * 4)
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data)
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, count = 0
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] < 12) continue
        minX = Math.min(minX, x / 2); maxX = Math.max(maxX, x / 2)
        minY = Math.min(minY, y / 2); maxY = Math.max(maxY, y / 2); count++
      }
      return { minX, maxX, minY, maxY, count }
    }
    try {
      for (const skin of OPERATOR_SKINS) {
        await renderer.load(skin)
        const hasSpecial = Boolean(renderer.model.skeleton.data.findAnimation('Special'))
        if (hasSpecial !== skin.actions.includes('Special')) failures.push(`${skin.id}: action list does not match the model's Special support`)
        if (!hasSpecial && renderer.setAction('Special') !== 0) failures.push(`${skin.id}: unsupported Special must leave the current action unchanged`)
        renderer.resize(512, 224, 84, 36)
        renderer.setAction('Relax', true)
        renderer.draw(0, 256, 1)
        const standing = pixels()
        renderer.setAction('Sit', true)
        renderer.draw(0, 256, 1)
        const sitting = pixels()
        const drop = standing.minY - sitting.minY
        const skeleton = renderer.model.skeleton
        anchors.push({ skin: skin.id, standing, sitting, legDrop: drop,
          bones: skeleton.bones.filter(bone => /root|body|hip|pelvis|leg|foot/i.test(bone.data.name))
            .map(bone => ({ name: bone.data.name, x: bone.worldX, y: bone.worldY })) })
        if (drop < 12 || drop > 32) failures.push(`${skin.id}: Sit legs must hang 12–32px below the standing baseline; got ${drop.toFixed(1)}px`)
        for (const action of skin.actions) for (const facing of [-1, 1]) {
          const duration = renderer.setAction(action, true)
          let worstOverflow = 0
          let pixelsLost = 0
          let minY = Infinity, maxY = -Infinity
          const samples = action === 'Special' ? 60 : 12
          for (let frame = 0; frame <= samples; frame++) {
            // A taller reference also exposes outlines cut at the top/bottom
            // of the actual scene, rather than hiding the same crop twice.
            renderer.resize(512, 384, 84, 128)
            renderer.draw(frame ? duration / samples : 0, 256, facing)
            const reference = pixels()
            minY = Math.min(minY, reference.minY - 128)
            maxY = Math.max(maxY, reference.maxY - 128)
            const envelope = renderer.getHorizontalBounds?.(facing) ?? { min: -36, max: 36 }
            for (const edge of ['left', 'right']) {
              // Match the reference's raster phase, so antialiasing differences
              // cannot masquerade as pixels lost at the canvas boundary.
              const center = edge === 'left' ? Math.ceil(-envelope.min * 2) / 2
                : Math.floor((320 - envelope.max) * 2) / 2
              const overflow = Math.max(0, -(center + reference.minX - 256), center + reference.maxX - 256 - 320)
              worstOverflow = Math.max(worstOverflow, overflow)
              renderer.resize(320, 224, 84, 36)
              renderer.draw(0, center, facing)
              pixelsLost = Math.max(pixelsLost, reference.count - pixels().count)
            }
          }
          cases.push({ skin: skin.id, action, facing, worstOverflow, pixelsLost, minY, maxY })
          if (worstOverflow > 1 || pixelsLost > 8) failures.push(`${skin.id}/${action}/${facing}: body exceeds canvas edge by ${worstOverflow.toFixed(1)}px; loses ${pixelsLost} opaque pixels`)
          if (minY + 36 < 2 || maxY + 36 > 222) failures.push(`${skin.id}/${action}/${facing}: vertical envelope [${minY}, ${maxY}] exceeds the scene`)
        }
        const transitions = [['Sleep', 'Interact'], ['Interact', 'Sleep'], ['Move', 'Sit'], ['Sit', 'Move']]
        if (hasSpecial) transitions.push(['Special', 'Sleep'], ['Sleep', 'Special'], ['Special', 'Sit'], ['Sit', 'Special'])
        for (const [from, to] of transitions) {
          // Props can be absent near Special's start: also leave the animation
          // at its middle and late poses before testing the entire mix.
          const starts = from === 'Special' ? [0.25, 0.5, 0.75] : [null]
          for (const start of starts) for (const facing of [-1, 1]) {
            const duration = renderer.setAction(from, true)
            renderer.draw(start === null ? 0.3 : duration * start, 256, facing)
            renderer.setAction(to)
            let pixelsLost = 0
            for (let frame = 0; frame < 15; frame++) {
              renderer.resize(512, 384, 84, 128)
              renderer.draw(frame ? 1 / 60 : 0, 256, facing)
              const reference = pixels()
              const envelope = renderer.getHorizontalBounds?.(facing) ?? { min: -36, max: 36 }
              for (const edge of ['left', 'right']) {
                const center = edge === 'left' ? Math.ceil(-envelope.min * 2) / 2
                  : Math.floor((320 - envelope.max) * 2) / 2
                renderer.resize(320, 224, 84, 36)
                renderer.draw(0, center, facing)
                pixelsLost = Math.max(pixelsLost, reference.count - pixels().count)
              }
            }
            cases.push({ skin: skin.id, action: `${from} → ${to}`, start, facing, pixelsLost })
            if (pixelsLost > 8) failures.push(`${skin.id}/${from} → ${to}/${facing}: transition loses ${pixelsLost} opaque pixels`)
          }
        }
      }
    } finally { renderer.dispose() }
    return { failures, cases, anchors }
  })
} finally {
  if (browser) await browser.close()
  if (server) await server.close()
}
await mkdir(output, { recursive: true })
await writeFile(path.join(output, 'pose-verification.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ cases: report.cases.length, failures: report.failures, anchors: report.anchors.map(({ skin, legDrop }) => ({ skin, legDrop })) }, null, 2))
process.exitCode = report.failures.length ? 1 : 0
