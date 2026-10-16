import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, '.taste-skill/theme-toggle')
const summary = { checks: [], scenarios: [], browser: process.env.MOWER_BROWSER_EXECUTABLE || 'msedge' }
const toggle = page => page.getByRole('button', { name: '暗色模式', exact: true })

async function check(name, run) {
  try { summary.checks.push({ name, passed: true, details: await run() }); console.log(`PASS ${name}`) }
  catch (error) { summary.checks.push({ name, passed: false, error: error.stack || error.message }); console.log(`FAIL ${name}: ${error.message}`) }
}

async function contextFor(browser, options = {}) {
  const { blockStorage = false, ...contextOptions } = options
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...contextOptions })
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 503, json: {} }))
  await context.route('https://img.shields.io/**', route => route.fulfill({ status: 503, json: {} }))
  await context.addInitScript(blocked => {
    if (blocked) Object.defineProperty(window, 'localStorage', { configurable: true,
      get() { throw new DOMException('Storage intentionally denied by verification', 'SecurityError') } })
    globalThis.__themeProgramCreations = []
    const constructors = [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext].filter(Boolean)
    const originals = constructors.map(Type => [Type.prototype, Type.prototype.createProgram])
    for (const [prototype, original] of originals) prototype.createProgram = function (...args) {
      const program = original.apply(this, args)
      __themeProgramCreations.push({ canvas: this.canvas, program })
      return program
    }
  }, blockStorage)
  return context
}

async function open(page, suffix = '') {
  await page.goto(`${summary.url}${suffix}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await toggle(page).waitFor({ state: 'visible' })
  await page.waitForFunction(() => document.querySelector('.operator-stage')?.dataset.state === 'ready')
  if (await page.evaluate(() => !matchMedia('(prefers-reduced-motion: reduce)').matches)) await page.waitForTimeout(3400)
}

async function theme(page, expected) {
  await page.waitForFunction(value => document.documentElement.dataset.theme === value
    && document.querySelector('.site-shell')?.dataset.theme === value, expected, { timeout: 5000 })
  assert.equal(await toggle(page).getAttribute('aria-pressed'), String(expected === 'dark'))
  assert.equal(await toggle(page).getAttribute('title'), expected === 'dark' ? '切换到亮色模式' : '切换到暗色模式')
}

async function sampleField(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.light-field-canvas')
    const gl = canvas?.getContext('webgl2')
    if (!gl || gl.isContextLost()) throw new Error('Background WebGL is unavailable')
    const colors = [], pixel = new Uint8Array(4)
    for (let row = 1; row <= 5; row++) for (let column = 1; column <= 5; column++) {
      gl.readPixels(Math.floor(canvas.width * column / 6), Math.floor(canvas.height * row / 6), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
      colors.push([...pixel])
    }
    const luminance = colors.reduce((sum, rgb) => sum + (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255, 0) / colors.length
    return { luminance, colors, backingWidth: canvas.width, backingHeight: canvas.height }
  })
}

async function retainRenderers(page) {
  await page.evaluate(() => {
    const field = document.querySelector('.light-field-canvas')
    const lens = [...document.querySelectorAll('.header-nav > .lg-canvas, .download > .lg-canvas')]
    const nodes = [field, ...lens]
    globalThis.__themeOriginalRenderers = { field, lens,
      programs: __themeProgramCreations.filter(entry => nodes.includes(entry.canvas)).length }
  })
}

async function assertRenderersRetained(page) {
  const result = await page.evaluate(() => {
    const saved = __themeOriginalRenderers
    const lens = [...document.querySelectorAll('.header-nav > .lg-canvas, .download > .lg-canvas')]
    const nodes = [saved.field, ...saved.lens]
    return { fieldSame: saved.field === document.querySelector('.light-field-canvas'),
      lensSame: lens.length === saved.lens.length && lens.every((node, index) => node === saved.lens[index]),
      lensCount: lens.length, initialPrograms: saved.programs,
      currentPrograms: __themeProgramCreations.filter(entry => nodes.includes(entry.canvas)).length }
  })
  assert.ok(result.fieldSame && result.lensSame && result.lensCount >= 2, JSON.stringify(result))
  assert.equal(result.currentPrograms, result.initialPrograms, `Theme switch recreated GPU programs: ${JSON.stringify(result)}`)
  return result
}

async function screenshot(page, name) {
  const session = await page.context().newCDPSession(page)
  try {
    const capture = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
    await writeFile(path.join(output, `${name}.png`), Buffer.from(capture.data, 'base64'))
  } finally { await session.detach() }
}

async function layout(page) {
  const result = await page.evaluate(() => {
    const box = selector => {
      const element = document.querySelector(selector), r = element?.getBoundingClientRect()
      return r ? { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom } : null
    }
    return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scrollY },
      documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
      boxes: Object.fromEntries(['.brand', '.pm-trigger', '.docs-nav', '.github-nav', '.theme-toggle', '.site-footer'].map(selector => [selector, box(selector)])) }
  })
  assert.ok(result.documentWidth <= result.viewport.width + 1 && result.documentHeight <= result.viewport.height + 1,
    `Theme added scrolling: ${JSON.stringify(result)}`)
  for (const [selector, rect] of Object.entries(result.boxes)) assert.ok(rect && rect.width > 0 && rect.height > 0
    && rect.x >= -1 && rect.y >= -1 && rect.right <= result.viewport.width + 1 && rect.bottom <= result.viewport.height + 1,
  `${selector} is clipped: ${JSON.stringify(result)}`)
  const controls = Object.entries(result.boxes).filter(([selector]) => selector !== '.site-footer')
  for (let a = 0; a < controls.length; a++) for (let b = a + 1; b < controls.length; b++) {
    const [nameA, rectA] = controls[a], [nameB, rectB] = controls[b]
    assert.ok(Math.min(rectA.right, rectB.right) - Math.max(rectA.x, rectB.x) <= 1
      || Math.min(rectA.bottom, rectB.bottom) - Math.max(rectA.y, rectB.y) <= 1,
    `Header controls overlap: ${nameA} / ${nameB}: ${JSON.stringify(result)}`)
  }
  return result
}

async function styleOf(locator) {
  return locator.evaluate(element => {
    const css = getComputedStyle(element)
    return { color: css.color, backgroundColor: css.backgroundColor, text: element.textContent }
  })
}

async function portalStyles(page, expected) {
  const collected = {}
  await page.locator('.operator-pet').hover()
  await page.locator('.operator-menu-trigger').click()
  const operator = page.getByRole('dialog', { name: '但书动作与时装', exact: true })
  await operator.waitFor({ state: 'visible' })
  collected.operator = await styleOf(operator)
  await operator.getByRole('button', { name: '坐下', exact: true }).click()
  assert.equal(await page.locator('.operator-pet').getAttribute('data-action'), 'Sit')
  await page.locator('.site-footer-license-trigger').click()
  const legal = page.getByRole('dialog', { name: '第三方许可与素材来源', exact: true })
  await legal.waitFor({ state: 'visible' })
  collected.legal = await styleOf(legal)
  await screenshot(page, `${expected}-legal`)
  await page.keyboard.press('Escape')
  await legal.waitFor({ state: 'hidden' })
  await theme(page, expected)
  return collected
}

let server, browser
try {
  await mkdir(output, { recursive: true })
  server = await createServer({ root, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  summary.url = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.MOWER_BROWSER_EXECUTABLE ? { executablePath: process.env.MOWER_BROWSER_EXECUTABLE } : { channel: 'msedge' }) })

  for (const reducedMotion of ['reduce', 'no-preference']) {
    const context = await contextFor(browser, { reducedMotion })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await open(page)
      await check(`${reducedMotion}: default is light and header fits`, async () => { await theme(page, 'light'); return layout(page) })
      await screenshot(page, `${reducedMotion}-light`)
      await retainRenderers(page)
      const light = await sampleField(page)
      await check(`${reducedMotion}: click switches actual WebGL pixels and retains renderers`, async () => {
        await toggle(page).click()
        await theme(page, 'dark')
        await page.waitForTimeout(250)
        const dark = await sampleField(page)
        assert.ok(light.luminance - dark.luminance > 0.2, `Actual background did not darken: ${JSON.stringify({ light, dark })}`)
        assert.equal(await page.evaluate(() => localStorage.getItem('mower-theme')), 'dark')
        const renderers = await assertRenderersRetained(page)
        await screenshot(page, `${reducedMotion}-dark`)
        return { light, dark, renderers }
      })
      await check(`${reducedMotion}: keyboard Space and Enter switch state`, async () => {
        await toggle(page).focus()
        await page.keyboard.press('Space')
        await theme(page, 'light')
        await page.keyboard.press('Enter')
        await theme(page, 'dark')
        return assertRenderersRetained(page)
      })
      if (reducedMotion === 'reduce') {
        await check('Portal operator menu and legal dialog follow both themes and actions remain usable', async () => {
          const dark = await portalStyles(page, 'dark')
          await toggle(page).click()
          await theme(page, 'light')
          const light = await portalStyles(page, 'light')
          for (const kind of ['operator', 'legal']) {
            assert.notEqual(light[kind].backgroundColor, dark[kind].backgroundColor, `${kind} portal background ignored theme`)
            assert.notEqual(light[kind].color, dark[kind].color, `${kind} portal text ignored theme`)
          }
          return { light, dark }
        })
        await check('Open platform menu permits theme switch, reopening and channel selection', async () => {
          await page.locator('.pm-trigger').click()
          await page.getByRole('dialog', { name: '选择平台与版本', exact: true }).waitFor({ state: 'visible' })
          await toggle(page).click()
          await theme(page, 'dark')
          const panel = page.getByRole('dialog', { name: '选择平台与版本', exact: true })
          if (!await panel.isVisible()) await page.locator('.pm-trigger').click()
          await panel.waitFor({ state: 'visible' })
          const style = await styleOf(panel)
          await panel.getByRole('radio', { name: '测试版', exact: true }).click()
          assert.equal(await panel.getByRole('radio', { name: '测试版', exact: true }).getAttribute('aria-checked'), 'true')
          await page.keyboard.press('Escape')
          return { style, renderers: await assertRenderersRetained(page) }
        })
        await check('Theme choice survives reload', async () => {
          await page.reload({ waitUntil: 'networkidle' })
          await theme(page, 'dark')
          return { saved: await page.evaluate(() => localStorage.getItem('mower-theme')) }
        })
        await check('Query overrides saved theme; click replaces query and survives reload', async () => {
          await open(page, '?theme=light')
          await theme(page, 'light')
          const historyLength = await page.evaluate(() => history.length)
          await toggle(page).click()
          await theme(page, 'dark')
          assert.equal(new URL(page.url()).searchParams.get('theme'), 'dark')
          assert.equal(await page.evaluate(() => history.length), historyLength, 'Theme click added a history entry')
          await page.reload({ waitUntil: 'networkidle' })
          await theme(page, 'dark')
          await page.evaluate(() => localStorage.setItem('mower-theme', 'light'))
          await open(page, '?theme=dark')
          await theme(page, 'dark')
          await toggle(page).click()
          await theme(page, 'light')
          assert.equal(new URL(page.url()).searchParams.get('theme'), 'light')
          await page.reload({ waitUntil: 'networkidle' })
          await theme(page, 'light')
        })
      }
      await check(`${reducedMotion}: no browser exceptions`, async () => { assert.deepEqual(errors, []); return { errors } })
    } finally { await context.close() }
  }

  await check('Denied localStorage permits default, clicks, reload and query initialization', async () => {
    const context = await contextFor(browser, { blockStorage: true }), page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await open(page)
      await theme(page, 'light')
      await toggle(page).click()
      await theme(page, 'dark')
      await page.reload({ waitUntil: 'networkidle' })
      await theme(page, 'light')
      await open(page, '?theme=dark')
      await theme(page, 'dark')
      await toggle(page).click()
      await theme(page, 'light')
      assert.equal(new URL(page.url()).searchParams.get('theme'), 'light')
      assert.deepEqual(errors, [])
      return { errors }
    } finally { await context.close() }
  })

  const viewports = [25, 100, 200].map(percent => ({ name: `os150-browser${percent}`, percent,
    width: Math.round(2560 / (1.5 * percent / 100)), height: Math.round(1187 / (1.5 * percent / 100)), dpr: 1.5 * percent / 100,
    method: 'Equivalent CSS viewport and DPR for 2560×1187 physical content and 150% OS scale; not browser UI zoom' }))
    .concat([{ name: 'mobile-320x568', width: 320, height: 568, dpr: 1, mobile: true, method: 'Native mobile layout viewport' }])
  for (const spec of viewports) await check(`${spec.name}: theme control remains visible and header has no collisions`, async () => {
    const context = await contextFor(browser, { viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: spec.dpr,
      isMobile: Boolean(spec.mobile), hasTouch: Boolean(spec.mobile) })
    const page = await context.newPage()
    try {
      await open(page)
      await theme(page, 'light')
      const light = await layout(page)
      await toggle(page).click()
      await theme(page, 'dark')
      const dark = await layout(page)
      await screenshot(page, `${spec.name}-dark`)
      await toggle(page).click()
      await theme(page, 'light')
      await screenshot(page, `${spec.name}-light`)
      summary.scenarios.push({ ...spec, light, dark })
      return { ...spec, light, dark }
    } finally { await context.close() }
  })
} catch (error) { summary.checks.push({ name: 'Verification setup', passed: false, error: error.stack || error.message }) }
finally { if (browser) await browser.close(); if (server) await server.close() }
summary.passed = summary.checks.filter(check => check.passed).length
summary.failed = summary.checks.filter(check => !check.passed).length
await writeFile(path.join(output, 'verification.json'), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, failures: summary.checks.filter(check => !check.passed), output }, null, 2))
process.exitCode = summary.failed ? 1 : 0
