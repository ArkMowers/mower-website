import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

// Exercise the actual application and framebuffer. Counting active canvases alone
// misses a canvas initialized while its popup is scaled, the original regression.
const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, '.taste-skill', 'lens-v2', 'regression')
const url = process.env.MOWER_VERIFY_URL || 'http://127.0.0.1:5180/'
const summary = { url, checks: [], screenshots: [], failures: [], warnings: [] }
const scenarios = [
  ...[1, 1.25, 2].map(dpr => ({ width: 2048, height: 950, dpr })),
  ...[1, 1.25, 2].map(dpr => ({ width: 390, height: 844, dpr })),
].filter(viewport => !process.env.MOWER_VERIFY_CASE || `${viewport.width}x${viewport.height}-dpr${viewport.dpr}` === process.env.MOWER_VERIFY_CASE)

async function screenshot(page, name) {
  const destination = path.join(output, `${name}.png`)
  await page.screenshot({ path: destination })
  summary.screenshots.push(destination)
}

async function settleChannels(page) {
  // Software WebGL can spend a long time per frame. Wait for the spring's
  // actual rest state instead of assuming 650 ms equals enough spring steps.
  await page.waitForFunction(() => [...document.querySelectorAll('.channel-indicator')].every(element => !element.classList.contains('jelly-moving')), null, { timeout: 6000 })
  await page.waitForTimeout(80)
  const alignment = await page.locator('.channel-switch').evaluateAll(groups => groups.map(group => {
    const indicator = group.querySelector('.channel-indicator').getBoundingClientRect()
    const selected = group.querySelector('[aria-checked=true]').getBoundingClientRect()
    return Math.max(...['left', 'right', 'top', 'bottom'].map(edge => Math.abs(indicator[edge] - selected[edge])))
  }))
  assert.ok(alignment.every(error => error <= 1), `Resting segment indicator misses selected radio: ${JSON.stringify(alignment)}`)
}

async function instrument(page) {
  await page.evaluate(async () => {
    // Vite adds an HMR timestamp to changed dependencies; importing the bare
    // path can create another class which the live app never instantiated.
    const resource = performance.getEntriesByType('resource').findLast(entry => new URL(entry.name).pathname === '/src/vendor/lens/internal/renderer.js')
    const { GlassRenderer } = await import(resource?.name || '/src/vendor/lens/internal/renderer.js')
    const render = GlassRenderer.prototype.render
    window.__verifyLensRenderers = []
    GlassRenderer.prototype.render = function (...args) {
      if (!window.__verifyLensRenderers.includes(this)) window.__verifyLensRenderers.push(this)
      return render.apply(this, args)
    }
  })
  // Pointer movement uses the runtime's public event path to render the existing
  // stages once after instrumentation, without recalculating their dimensions.
  await page.mouse.move(20, 20)
  await page.locator('.github-nav').hover()
  await page.mouse.move(20, 20)
  await page.waitForTimeout(120)
}

async function inspect(page, label, { requirePanel = true, allowColdFallback = false } = {}) {
  const result = await page.evaluate(() => {
    const renderers = window.__verifyLensRenderers.filter(r => !r.destroyed && r.stage.isConnected)
    const seen = new Set()
    return renderers.map(r => {
      const canvas = r.canvas.getBoundingClientRect()
      const gl = r.gl
      const stage = r.stage.className
      const active = !r.suspended && !r.lost && !r.canvas.hidden && r.canvas.dataset.gpuState === 'active'
      const pixels = new Uint8Array(r.width * r.height * 4)
      if (active) {
        const original = gl.getParameter(gl.FRAMEBUFFER_BINDING)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.readPixels(0, 0, r.width, r.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        gl.bindFramebuffer(gl.FRAMEBUFFER, original)
      }
      const alpha = (x, y) => pixels[(Math.min(r.height - 1, Math.max(0, y)) * r.width + Math.min(r.width - 1, Math.max(0, x))) * 4 + 3]
      const worldX = x => canvas.left + x / r.width * canvas.width
      const worldY = y => canvas.bottom - y / r.height * canvas.height
      const geometry = r.geometry.map(g => {
        const target = g.el.getBoundingClientRect()
        const owner = g.el.closest('[data-lens-stage],.lg-stage')
        const duplicate = seen.has(g.el)
        seen.add(g.el)
        const rendered = { left: worldX(g.x), right: worldX(g.x + g.w), top: worldY(g.y + g.h), bottom: worldY(g.y) }
        const errors = ['left', 'right', 'top', 'bottom'].map(edge => Math.abs(rendered[edge] - target[edge]))
        const clipped = g.x < g.clip.left || g.x + g.w > g.clip.right || g.y < g.clip.bottom || g.y + g.h > g.clip.top
        let pixelEdges = null
        if (!clipped && g.w > 4 && g.h > 4) {
          const margin = Math.ceil(5 * r.dpr)
          const cx = Math.floor(g.x + g.w / 2), cy = Math.floor(g.y + g.h / 2)
          const xs = [], ys = []
          for (let x = Math.max(0, Math.floor(g.x) - margin); x <= Math.min(r.width - 1, Math.ceil(g.x + g.w) + margin); x++) if (alpha(x, cy) >= 128) xs.push(x)
          for (let y = Math.max(0, Math.floor(g.y) - margin); y <= Math.min(r.height - 1, Math.ceil(g.y + g.h) + margin); y++) if (alpha(cx, y) >= 128) ys.push(y)
          if (xs.length && ys.length) {
            pixelEdges = { left: worldX(xs[0]), right: worldX(xs.at(-1) + 1), top: worldY(ys.at(-1) + 1), bottom: worldY(ys[0]) }
          }
        }
        const pixelErrors = pixelEdges ? ['left', 'right', 'top', 'bottom'].map(edge => Math.abs(pixelEdges[edge] - target[edge])) : null
        return { kind: g.kind, text: g.el.textContent.trim(), ownerMatches: owner === r.stage, duplicate, target: target.toJSON(), rendered, maxError: Math.max(...errors), clipped, pixelEdges, maxPixelError: pixelErrors ? Math.max(...pixelErrors) : null }
      })
      const outside = []
      for (let y = 2; y < r.height - 2; y += Math.max(1, Math.floor(r.height / 12))) {
        for (let x = 2; x < r.width - 2; x += Math.max(1, Math.floor(r.width / 12))) {
          // Stay away from the physical surface, antialiasing, and any intended
          // optical halo; an opaque rectangular background still fails here.
          if (r.geometry.some(g => x >= g.x - 38 * r.dpr && x <= g.x + g.w + 38 * r.dpr && y >= g.y - 38 * r.dpr && y <= g.y + g.h + 38 * r.dpr)) continue
          outside.push(alpha(x, y))
        }
      }
      const style = getComputedStyle(r.canvas)
      const expectedSize = [Math.round(parseFloat(style.width) * r.dpr), Math.round(parseFloat(style.height) * r.dpr)]
      return { stage, active, size: [r.width, r.height], expectedSize, cssSize: [canvas.width, canvas.height], alphaEnabled: gl?.getContextAttributes()?.alpha, outsideSamples: outside.length, maxOutsideAlpha: Math.max(0, ...outside), geometry }
    })
  })
  const panels = await page.locator('.pm-panel').evaluateAll(elements => elements.map(element => {
    const canvas = element.querySelector(':scope > canvas')
    const indicator = element.querySelector('.channel-indicator')
    const bar = element.querySelector('.channel-bar')
    const box = indicator?.getBoundingClientRect(), boundary = bar?.getBoundingClientRect()
    const style = indicator && getComputedStyle(indicator)
    const materialVisible = Boolean(box?.width > 24 && box?.height > 12 && style.visibility === 'visible' && style.display !== 'none' && Number(style.opacity) > 0 && style.backgroundColor !== 'transparent' && style.backgroundColor !== 'rgba(0, 0, 0, 0)')
    const indicatorInsideBar = Boolean(box && boundary && box.left >= boundary.left - 1 && box.right <= boundary.right + 1 && box.top >= boundary.top - 1 && box.bottom <= boundary.bottom + 1)
    return { className: element.className, gpuState: canvas?.dataset.gpuState, canvasHidden: canvas?.hidden, fallback: element.classList.contains('fallback'), materialVisible, indicatorInsideBar }
  }))
  const check = { label, panels, renderers: result }
  summary.checks.push(check)
  const coldFallback = allowColdFallback && panels.length === 1 && panels[0].fallback && panels[0].canvasHidden && panels[0].materialVisible && panels[0].indicatorInsideBar
  if (coldFallback) summary.warnings.push(`${label}: cold GPU still compiling; visible CSS material remains inside the semantic control. Active framebuffer is required after the entrance settles.`)
  assert.ok(result.some(r => r.stage.includes('header-nav')), `${label}: missing header renderer`)
  assert.ok(result.some(r => r.stage.includes('download')), `${label}: missing download renderer`)
  if (requirePanel && !coldFallback) assert.ok(result.some(r => r.stage.includes('pm-panel')), `${label}: missing popup renderer without a usable CSS fallback`)
  for (const r of result) {
    if (coldFallback && r.stage.includes('pm-panel') && !r.active) continue
    assert.ok(r.active, `${label}: inactive ${r.stage}`)
    assert.deepEqual(r.size, r.expectedSize, `${label}: backing store differs from layout size at capped DPR ${r.stage}`)
    assert.equal(r.alphaEnabled, true, `${label}: opaque canvas context ${r.stage}`)
    assert.ok(r.outsideSamples >= 3, `${label}: too few transparency probes ${r.stage}`)
    assert.equal(r.maxOutsideAlpha, 0, `${label}: rectangular canvas hides DOM behind ${r.stage}`)
    assert.ok(r.geometry.length > 0, `${label}: no surfaces rendered in ${r.stage}`)
    for (const g of r.geometry) {
      assert.ok(g.ownerMatches && !g.duplicate, `${label}: nested stage owns the same surface twice`)
      assert.ok(g.maxError <= 1, `${label}: DOM/render geometry mismatch ${g.maxError.toFixed(3)} px on ${r.stage} ${g.kind}`)
      if (!g.clipped) {
        assert.ok(g.pixelEdges, `${label}: missing visible glass pixels on ${r.stage} ${g.kind}`)
        assert.ok(g.maxPixelError <= 1, `${label}: visible glass edge mismatch ${g.maxPixelError.toFixed(3)} px on ${r.stage} ${g.kind}`)
      }
    }
  }
  return check
}

async function run(browser, viewport) {
  const name = `${viewport.width}x${viewport.height}-dpr${viewport.dpr}`
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr, reducedMotion: 'no-preference' })
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 503, json: { message: 'Use bundled release data for deterministic UI verification' } }))
  await context.route('https://img.shields.io/**', route => route.fulfill({ status: 503, body: '' }))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(3200)
    await instrument(page)
    await inspect(page, `${name}/home`, { requirePanel: false })
    await screenshot(page, `${name}-home`)
    await page.locator('.pm-trigger').click()
    await page.waitForTimeout(100)
    // Cold shader compilation is hardware-dependent. The 100 ms contract is a
    // contained, visible material; once active, the framebuffer must align.
    await inspect(page, `${name}/opening100ms`, { allowColdFallback: true })
    await page.waitForTimeout(600)
    await page.waitForFunction(() => window.__verifyLensRenderers.some(renderer => renderer.stage.matches('.pm-panel') && !renderer.destroyed && !renderer.suspended && !renderer.canvas.hidden && renderer.geometry.length > 0), null, { timeout: 8000 })
    await inspect(page, `${name}/settled`)
    await screenshot(page, `${name}-menu`)
    const radios = page.locator('.pm-panel [role=radio]')
    // Every click must commit. These used to be independently moving press
    // surfaces; a fast switch could detach their glass from the semantic radio.
    for (const index of [1, 0, 1, 0, 1]) {
      await radios.nth(index).click({ delay: 0 })
      await page.waitForTimeout(25)
      assert.equal(await radios.nth(index).getAttribute('aria-checked'), 'true', `${name}: channel click did not commit`)
    }
    await settleChannels(page)
    await inspect(page, `${name}/rapid-channel-clicks`)
    await screenshot(page, `${name}-channel`)
    if (viewport.width === 2048 && viewport.dpr === 1.25) {
      // Capture the physical control while held; native navigation is canceled
      // only for this diagnostic gesture, keeping the destination untouched.
      await page.evaluate(() => document.querySelector('.lens-cta').addEventListener('click', event => event.preventDefault(), { once: true }))
      const button = await page.locator('.lens-cta').boundingBox()
      await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2)
      await page.mouse.down()
      await page.mouse.move(button.x + button.width / 2 + 14, button.y + button.height / 2 + 5, { steps: 5 })
      await page.waitForTimeout(100)
      await screenshot(page, `${name}-held`)
      await page.mouse.up()
      await page.waitForTimeout(1000)
      // Clicking the CTA closes the open popup via its outside-click handler.
      if (!(await page.locator('.pm-panel').count())) {
        await page.locator('.pm-trigger').click()
        await page.waitForTimeout(650)
      }
    }
    await page.setViewportSize({ width: viewport.width, height: viewport.width === 390 ? 600 : 520 })
    await page.waitForTimeout(650)
    await settleChannels(page)
    await inspect(page, `${name}/resize-short`)
    const scrolled = await page.locator('.pm-scroll').evaluate(element => {
      element.scrollTop = 110
      return { top: element.scrollTop, maximum: element.scrollHeight - element.clientHeight }
    })
    assert.ok(scrolled.top > 0 && scrolled.maximum > 0, `${name}: panel scroll was not exercised`)
    await page.waitForTimeout(200)
    await inspect(page, `${name}/scrolled`)
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.locator('.pm-scroll').evaluate(element => { element.scrollTop = 0 })
    await page.waitForTimeout(650)
    await settleChannels(page)
    await inspect(page, `${name}/resize-restored`)
    assert.deepEqual(errors, [], `${name}: browser runtime errors`)
    console.log(`PASS ${name}: active renderer, pixel alignment, transparent exterior, opening, switches, scroll, resize`)
  } catch (error) {
    summary.failures.push({ scenario: name, message: error.message })
    await screenshot(page, `${name}-failure`).catch(() => {})
    console.error(`FAIL ${name}: ${error.message}`)
  } finally {
    await context.close()
  }
}

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], ...(process.env.MOWER_BROWSER_EXECUTABLE ? { executablePath: process.env.MOWER_BROWSER_EXECUTABLE } : { channel: 'msedge' }) })
try {
  for (const viewport of scenarios) await run(browser, viewport)
} finally {
  await browser.close()
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(summary, null, 2))
}
if (summary.failures.length) process.exitCode = 1
