import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect as playwrightExpect } from '@playwright/test'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, '.taste-skill/theme-operator')
const baselineOnly = process.argv.includes('--baseline-only')
const expect = playwrightExpect.configure({ timeout: 2000 })
const report = { mode: baselineOnly ? 'baseline-only' : 'full', checks: [], screenshots: [] }
const pet = page => page.locator('.operator-pet')
const themeButton = page => page.locator('.theme-toggle')
const menu = page => page.getByRole('dialog', { name: '但书动作与时装', exact: true })

async function check(name, run) {
  try { report.checks.push({ name, passed: true, details: await run() }); console.log(`PASS ${name}`) }
  catch (error) { report.checks.push({ name, passed: false, error: error.stack || error.message }); console.log(`FAIL ${name}: ${error.message}`) }
}

async function contextFor(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...options })
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 503, json: {} }))
  await context.route('https://img.shields.io/**', route => route.fulfill({ status: 503, json: {} }))
  // Deterministic choice still exercises the actual state machine and models.
  await context.addInitScript(() => {
    Math.random = () => 0.5
    globalThis.__operatorDraws = new WeakMap()
    globalThis.__operatorActions = []
    const original = WebGLRenderingContext.prototype.drawElements
    WebGLRenderingContext.prototype.drawElements = function (...args) {
      if (this.canvas.classList.contains('operator-pet-canvas')) __operatorDraws.set(this.canvas, (__operatorDraws.get(this.canvas) || 0) + 1)
      return original.apply(this, args)
    }
    new MutationObserver(records => {
      for (const record of records) if (record.target.matches?.('.operator-pet') && record.attributeName === 'data-action') {
        __operatorActions.push({ time: performance.now(), action: record.target.dataset.action })
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-action'] })
  })
  return context
}

async function open(page, theme = 'light') {
  await page.goto(`${report.url}/?theme=${theme}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelector('.operator-pet')?.dataset.state === 'ready', null, { timeout: 15000 })
  await page.evaluate(() => document.fonts.ready)
}

async function state(page) {
  return pet(page).evaluate(element => ({ theme: document.documentElement.dataset.theme,
    action: element.dataset.action, skin: element.dataset.skin, state: element.dataset.state,
    motion: element.dataset.motion, busy: element.getAttribute('aria-busy') }))
}

async function setTheme(page, value) {
  if (await page.locator('html').getAttribute('data-theme') !== value) await themeButton(page).click()
  await page.waitForFunction(theme => document.documentElement.dataset.theme === theme
    && document.querySelector('.site-shell')?.dataset.theme === theme, value)
  await expect(pet(page)).toHaveAttribute('data-action', value === 'dark' ? 'Sleep' : 'Relax')
}

async function openMenu(page) {
  if (!await menu(page).isVisible()) {
    await pet(page).hover()
    await page.locator('.operator-menu-trigger').click()
  }
  await menu(page).waitFor({ state: 'visible' })
}

async function chooseSkin(page, name, id) {
  await openMenu(page)
  await menu(page).getByRole('button', { name, exact: true }).click()
  await playwrightExpect(pet(page)).toHaveAttribute('data-skin', id, { timeout: 15000 })
  await expect(pet(page)).toHaveAttribute('aria-busy', 'false')
}

async function retainContext(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('.operator-pet-canvas')
    globalThis.__operatorContext = { canvas, gl: canvas.getContext('webgl') }
  })
}

async function sameContext(page) {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('.operator-pet-canvas'), gl = canvas.getContext('webgl'), saved = __operatorContext
    return { sameCanvas: canvas === saved.canvas, sameContext: gl === saved.gl, lost: gl.isContextLost(), draws: __operatorDraws.get(canvas) || 0 }
  })
  assert.ok(result.sameCanvas && result.sameContext && !result.lost && result.draws > 0, JSON.stringify(result))
  return result
}

async function layout(page) {
  const result = await page.evaluate(() => {
    const rect = selector => {
      const r = document.querySelector(selector).getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
    }
    return { width: innerWidth, height: innerHeight, scrollY, documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight, pet: rect('.operator-pet'), footer: rect('.site-footer'),
      preview: rect('.stage-window'), hiddenScroll: [...document.querySelectorAll('html,body,#root,.site-shell,.hero,.stage')]
        .filter(element => /hidden|clip/.test(getComputedStyle(element).overflowY) && element.scrollTop > 1).length }
  })
  assert.ok(result.documentWidth <= result.width + 1 && result.documentHeight <= result.height + 1
    && result.scrollY === 0 && result.hiddenScroll === 0, JSON.stringify(result))
  for (const name of ['pet', 'footer', 'preview']) {
    const r = result[name]
    assert.ok(r.width > 0 && r.height > 0 && r.x >= -1 && r.y >= -1 && r.right <= result.width + 1 && r.bottom <= result.height + 1, JSON.stringify(result))
  }
  return result
}

async function smallFrameHash(page) {
  const clip = await pet(page).evaluate(element => {
    const r = element.getBoundingClientRect(), x = Math.max(0, r.x - 64), y = Math.max(0, r.y - 42)
    return { x, y, width: Math.min(224, innerWidth - x), height: Math.min(180, innerHeight - y), scale: 1 }
  })
  const cdp = await page.context().newCDPSession(page)
  try {
    const capture = await cdp.send('Page.captureScreenshot', { format: 'png', clip, fromSurface: true, captureBeyondViewport: false })
    return { hash: createHash('sha256').update(capture.data).digest('hex'), clip }
  } finally { await cdp.detach() }
}

async function screenshot(page, name) {
  const client = await page.context().newCDPSession(page)
  try {
    const capture = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
    const destination = path.join(output, `${name}.png`)
    await writeFile(destination, Buffer.from(capture.data, 'base64'))
    report.screenshots.push(destination)
  } finally { await client.detach() }
}

async function verifyReduced(browser) {
  const context = await contextFor(browser), page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await open(page, 'dark')
    await retainContext(page)
    await check('Reduced motion: dark Sleep is a static rendered pose', async () => {
      await expect(pet(page)).toHaveAttribute('data-action', 'Sleep')
      await expect(pet(page)).toHaveAttribute('data-motion', 'reduced')
      await page.mouse.move(1, 1)
      await page.waitForTimeout(200)
      const first = await smallFrameHash(page), before = await sameContext(page)
      await page.waitForTimeout(700)
      const second = await smallFrameHash(page), after = await sameContext(page)
      assert.equal(second.hash, first.hash, 'Reduced Sleep pixels changed without interaction')
      assert.equal(after.draws, before.draws, 'Reduced Sleep continued drawing animation frames')
      await screenshot(page, 'dark-sleep-desktop')
      return { first, second, before, after }
    })
    await check('Dark skin changes finish sleeping; light/dark switching preserves the selected skin and WebGL context', async () => {
      const skins = []
      for (const [name, id] of [['悠然假日 HD78', 'holiday'], ['秋高气爽', 'autumn']]) {
        await chooseSkin(page, name, id)
        await expect(pet(page)).toHaveAttribute('data-action', 'Sleep')
        await setTheme(page, 'light')
        await expect(pet(page)).toHaveAttribute('data-skin', id)
        await setTheme(page, 'dark')
        await expect(pet(page)).toHaveAttribute('data-skin', id)
        skins.push(await state(page))
      }
      return { skins, context: await sameContext(page), layout: await layout(page) }
    })
    await check('Reduced motion: a requested dark action finishes in static Sleep', async () => {
      await openMenu(page)
      await menu(page).getByRole('button', { name: '互动', exact: true }).click()
      await expect(pet(page)).toHaveAttribute('data-action', 'Interact')
      await playwrightExpect(pet(page)).toHaveAttribute('data-action', 'Sleep', { timeout: 9000 })
      await expect(pet(page)).toHaveAttribute('data-motion', 'reduced')
      return { state: await state(page), context: await sameContext(page) }
    })
    await check('Returning to light wakes immediately and requested actions return to Relax', async () => {
      await setTheme(page, 'light')
      await openMenu(page)
      await menu(page).getByRole('button', { name: '互动', exact: true }).click()
      await expect(pet(page)).toHaveAttribute('data-action', 'Interact')
      await playwrightExpect(pet(page)).toHaveAttribute('data-action', 'Relax', { timeout: 9000 })
      await screenshot(page, 'light-relax-desktop')
      return { state: await state(page), context: await sameContext(page) }
    })
    await check('Reduced theme/action/skin changes raise no browser exceptions', async () => { assert.deepEqual(errors, []); return { errors } })
  } finally { await context.close() }
}

async function verifyNormal(browser) {
  const context = await contextFor(browser, { reducedMotion: 'no-preference' }), page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await open(page, 'dark')
    await retainContext(page)
    await check('Normal motion: dark stays Sleep beyond the previous random sleep timeout', async () => {
      await expect(pet(page)).toHaveAttribute('data-action', 'Sleep')
      await page.mouse.move(1, 1)
      const offset = await page.evaluate(() => __operatorActions.length)
      await page.waitForTimeout(13200)
      const changes = await page.evaluate(start => __operatorActions.slice(start), offset)
      assert.ok(changes.every(item => item.action === 'Sleep'), JSON.stringify(changes))
      await expect(pet(page)).toHaveAttribute('data-action', 'Sleep')
      return { observedMs: 13200, changes, state: await state(page), context: await sameContext(page) }
    })
    await check('Normal motion: clicking the character triggers a temporary random action then returns to Sleep', async () => {
      await pet(page).click()
      await expect(pet(page)).not.toHaveAttribute('data-action', 'Sleep')
      const requested = await state(page)
      await playwrightExpect(pet(page)).toHaveAttribute('data-action', 'Sleep', { timeout: 9000 })
      return { requested, finished: await state(page), context: await sameContext(page) }
    })
    await check('Normal motion: menu action finishes back in dark Sleep', async () => {
      await openMenu(page)
      await menu(page).getByRole('button', { name: '互动', exact: true }).click()
      await expect(pet(page)).toHaveAttribute('data-action', 'Interact')
      await playwrightExpect(pet(page)).toHaveAttribute('data-action', 'Sleep', { timeout: 9000 })
      return { state: await state(page), context: await sameContext(page) }
    })
    await check('Normal motion: light wakes to Relax and resumes autonomous behavior', async () => {
      await setTheme(page, 'light')
      await page.mouse.move(1, 1)
      await themeButton(page).blur()
      await playwrightExpect(pet(page)).not.toHaveAttribute('data-action', 'Relax', { timeout: 9000 })
      await setTheme(page, 'dark')
      return { state: await state(page), context: await sameContext(page), layout: await layout(page) }
    })
    await check('Normal theme/action changes raise no browser exceptions', async () => { assert.deepEqual(errors, []); return { errors } })
  } finally { await context.close() }
}

async function verifyLoading(browser) {
  const context = await contextFor(browser), page = await context.newPage()
  let releaseInitial, signalInitial
  const initialGate = new Promise(resolve => { releaseInitial = resolve })
  const initialStarted = new Promise(resolve => { signalInitial = resolve })
  let releaseSkin, signalSkin
  const skinGate = new Promise(resolve => { releaseSkin = resolve })
  const skinStarted = new Promise(resolve => { signalSkin = resolve })
  await context.route('**/models/proviso/default/*.skel', async route => { signalInitial(); await initialGate; await route.continue() })
  await context.route('**/models/proviso/holiday/*.skel', async route => { signalSkin(); await skinGate; await route.continue() })
  try {
    await page.goto(`${report.url}/?theme=light`, { waitUntil: 'domcontentloaded' })
    await initialStarted
    await check('Rapid theme changes during initial model loading settle in the latest dark theme', async () => {
      await retainContext(page)
      for (const value of ['dark', 'light', 'dark']) {
        await themeButton(page).click()
        assert.equal(await page.locator('html').getAttribute('data-theme'), value)
      }
      assert.equal(await pet(page).getAttribute('data-state'), 'loading')
      releaseInitial()
      await playwrightExpect(pet(page)).toHaveAttribute('data-state', 'ready', { timeout: 15000 })
      await expect(pet(page)).toHaveAttribute('data-action', 'Sleep')
      return { state: await state(page), context: await sameContext(page) }
    })
    await check('Theme changes while a skin is loading use the latest theme and preserve that skin', async () => {
      await openMenu(page)
      await menu(page).getByRole('button', { name: '悠然假日 HD78', exact: true }).click()
      await skinStarted
      await expect(pet(page)).toHaveAttribute('aria-busy', 'true')
      for (const value of ['light', 'dark', 'light']) {
        await themeButton(page).click()
        assert.equal(await page.locator('html').getAttribute('data-theme'), value)
      }
      releaseSkin()
      await playwrightExpect(pet(page)).toHaveAttribute('data-skin', 'holiday', { timeout: 15000 })
      await expect(pet(page)).toHaveAttribute('aria-busy', 'false')
      await expect(pet(page)).toHaveAttribute('data-action', 'Relax')
      await setTheme(page, 'dark')
      await expect(pet(page)).toHaveAttribute('data-skin', 'holiday')
      return { state: await state(page), context: await sameContext(page) }
    })
  } finally { releaseInitial(); releaseSkin(); await context.close() }
}

async function verifyMobile(browser) {
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const context = await contextFor(browser, { viewport, isMobile: true, hasTouch: true }), page = await context.newPage()
    try {
      await open(page, 'dark')
      await check(`${viewport.width}px mobile keeps theme-aware character and footer inside one screen`, async () => {
        await expect(pet(page)).toHaveAttribute('data-action', 'Sleep')
        const dark = await layout(page)
        await setTheme(page, 'light')
        const light = await layout(page)
        await setTheme(page, 'dark')
        return { dark, light, state: await state(page) }
      })
    } finally { await context.close() }
  }
}

let server, browser
try {
  await mkdir(output, { recursive: true })
  server = await createServer({ root, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  report.url = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.MOWER_BROWSER_EXECUTABLE ? { executablePath: process.env.MOWER_BROWSER_EXECUTABLE } : { channel: 'msedge' }) })
  for (const initialTheme of ['dark', 'light']) {
    const context = await contextFor(browser), page = await context.newPage()
    try {
      await open(page, initialTheme)
      await check(`${initialTheme} initializes ${initialTheme === 'dark' ? 'Sleep' : 'Relax'}`, async () => {
        await expect(pet(page)).toHaveAttribute('data-action', initialTheme === 'dark' ? 'Sleep' : 'Relax')
        return state(page)
      })
    } finally { await context.close() }
  }
  if (!baselineOnly) {
    await verifyReduced(browser)
    await verifyNormal(browser)
    await verifyLoading(browser)
    await verifyMobile(browser)
  }
} catch (error) { report.checks.push({ name: 'Verification setup', passed: false, error: error.stack || error.message }) }
finally { if (browser) await browser.close(); if (server) await server.close() }
report.passed = report.checks.filter(check => check.passed).length
report.failed = report.checks.filter(check => !check.passed).length
await writeFile(path.join(output, baselineOnly ? 'baseline.json' : 'verification.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, failures: report.checks.filter(check => !check.passed), output }, null, 2))
process.exitCode = report.failed ? 1 : 0
