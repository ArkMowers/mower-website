import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

// Browser zoom changes both the layout viewport and DPR. These contexts reproduce
// those two inputs for a fixed physical content area. This is NOT pinch zoom or
// Page.setPageScaleFactor, and is explicitly recorded as equivalent emulation.
// Run: node scripts/verify-zoom-layout.mjs
// Baseline before adding the footer: add --allow-missing-footer.
// Recheck only same-page transitions without overwriting matrix: add --live-only.
const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, '.taste-skill', 'zoom')
const allowMissingFooter = process.argv.includes('--allow-missing-footer')
const liveOnly = process.argv.includes('--live-only')
const legalName = '第三方许可与素材来源'
const expectedLegal = {
  software: 'https://github.com/ArkMowers/arknights-mower/blob/main/LICENSE',
  notice: 'https://arkmowers.github.io/arknights-mower/former-manual/manualV2/notice/',
  model: 'https://github.com/isHarryh/Ark-Models/blob/8a3857c250a5c271429aefa82c660ff35803166e/README.md#版权声明',
}
const report = { method: 'Equivalent CSS layout viewport and DPR; not actual browser zoom',
  browser: process.env.MOWER_BROWSER_EXECUTABLE || 'msedge', cases: [], shortcutProbe: null }
const cases = [75, 100, 125, 150, 175, 200].map(percent => ({
  name: `1440x900-${percent}percent`, physicalWidth: 1440, physicalHeight: 900, zoom: percent / 100,
})).concat([
  { name: '1920x1080-200percent', physicalWidth: 1920, physicalHeight: 1080, zoom: 2 },
  { name: '1366x768-200percent', physicalWidth: 1366, physicalHeight: 768, zoom: 2 },
  { name: '1280x720-200percent', physicalWidth: 1280, physicalHeight: 720, zoom: 2 },
  { name: 'mobile-390x844', physicalWidth: 390, physicalHeight: 844, zoom: 1, mobile: true },
])

async function metrics(page) {
  return page.evaluate(() => {
    const rect = element => {
      if (!element) return null
      const r = element.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
    }
    const style = selector => {
      const element = document.querySelector(selector)
      if (!element) return null
      const css = getComputedStyle(element)
      return { rect: rect(element), overflowX: css.overflowX, overflowY: css.overflowY,
        height: css.height, minHeight: css.minHeight, scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight, scrollTop: element.scrollTop }
    }
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
        visualWidth: visualViewport?.width, visualHeight: visualViewport?.height,
        visualScale: visualViewport?.scale, scrollX, scrollY },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        bodyWidth: document.body.scrollWidth, bodyHeight: document.body.scrollHeight },
      layout: Object.fromEntries(['html', 'body', '#root', '.site-shell', '.hero', '.hero-copy',
        '.hero-action-row', '.lens-cta', '.channel-bar', '.stage', '.stage-window', '.operator-stage',
        '.operator-pet', '.site-footer'].map(selector => [selector, style(selector)])),
    }
  })
}

async function reachable(page, selector, { minimumHeight = 1, whole = true } = {}) {
  const target = page.locator(selector).first()
  assert.equal(await target.count(), 1, `${selector} missing`)
  // Never scroll a fully visible target just to center it: overflow:hidden can
  // programmatically scroll even when the user cannot, inventing a false failure.
  await target.evaluate((element, options) => {
    const r = element.getBoundingClientRect()
    const neededHeight = options.whole ? r.height : options.minimumHeight
    if (r.top < 0 || r.top + neededHeight > innerHeight || r.left < 0 || r.right > innerWidth) {
      if (options.whole) element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
      else {
        // Only require the preview's top strip, not the entire illustration.
        element.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' })
      }
    }
  }, { minimumHeight, whole })
  await page.waitForTimeout(80)
  const result = await target.evaluate((element, options) => {
    const r = element.getBoundingClientRect()
    let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right)
    let top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom)
    const clippers = []
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent), bounds = parent.getBoundingClientRect()
      const clipX = /hidden|clip|auto|scroll/.test(css.overflowX)
      const clipY = /hidden|clip|auto|scroll/.test(css.overflowY)
      if (clipX) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right) }
      if (clipY) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom) }
      if (clipX || clipY) clippers.push({ tag: parent.tagName, className: parent.className,
        overflowX: css.overflowX, overflowY: css.overflowY, scrollTop: parent.scrollTop,
        scrollLeft: parent.scrollLeft, height: bounds.height })
    }
    const hiddenScroll = clippers.filter(parent =>
      (/hidden|clip/.test(parent.overflowY) && parent.scrollTop > 1)
      || (/hidden|clip/.test(parent.overflowX) && parent.scrollLeft > 1))
    const visibleWidth = Math.max(0, right - left), visibleHeight = Math.max(0, bottom - top)
    return { rect: { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom },
      visibleWidth, visibleHeight, hiddenScroll, clippers,
      passes: r.height >= options.minimumHeight && visibleHeight >= options.minimumHeight - 1
        && visibleWidth >= r.width - 2 && (!options.whole || visibleHeight >= r.height - 2)
        && hiddenScroll.length === 0 }
  }, { minimumHeight, whole })
  assert.ok(result.passes, `${selector} is clipped or only programmatically reachable: ${JSON.stringify(result)}`)
  return result
}

async function check(record, name, fn) {
  try { record.checks.push({ name, passed: true, details: await fn() }) }
  catch (error) { record.checks.push({ name, passed: false, error: error.message }) }
}

async function legalDialog(page, name) {
  const trigger = page.getByRole('button', { name: legalName, exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: legalName, exact: true })
  await dialog.waitFor({ state: 'visible' })
  const bounds = await dialog.boundingBox()
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  assert.ok(bounds && bounds.x >= -1 && bounds.y >= -1
    && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1,
  `Legal dialog overflows viewport: ${JSON.stringify({ bounds, viewport })}`)
  assert.equal(await dialog.locator('a[href="/licenses/lens-MIT.txt"]').count(), 1)
  assert.equal(await dialog.locator('a[href="/licenses/spine-runtimes.txt"]').count(), 1)
  assert.equal(await dialog.getByRole('link', { name: '查看素材来源与版权声明', exact: true }).getAttribute('href'), expectedLegal.model)
  const last = dialog.locator('a').last()
  await last.scrollIntoViewIfNeeded()
  const lastBounds = await last.boundingBox(), currentBounds = await dialog.boundingBox()
  assert.ok(lastBounds && currentBounds && lastBounds.y >= currentBounds.y - 1
    && lastBounds.y + lastBounds.height <= currentBounds.y + currentBounds.height + 1,
  'Final legal disclosure cannot be reached by scrolling')
  await page.keyboard.press('Tab')
  assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)), 'Tab focus escaped legal dialog')
  await page.screenshot({ path: path.join(output, `${name}-legal-dialog.png`), animations: 'disabled' })
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.ok(await trigger.evaluate(element => element === document.activeElement), 'Escape did not restore footer trigger focus')
  return { bounds, viewport, focusRestored: true }
}

async function canvasMetrics(page) {
  return page.evaluate(() => {
    const read = selector => [...document.querySelectorAll(selector)].map(canvas => {
      const r = canvas.getBoundingClientRect(), parent = canvas.parentElement
      return { x: r.x, y: r.y, width: r.width, height: r.height, backingWidth: canvas.width,
        backingHeight: canvas.height, density: canvas.width / Math.max(1, r.width), hidden: canvas.hidden,
        ready: canvas.dataset.ready, parentClasses: parent.className }
    })
    return { viewport: { width: innerWidth, availableWidth: document.documentElement.clientWidth, height: innerHeight,
      dpr: devicePixelRatio, scrollY }, field: read('.light-field-canvas'), lens: read('.lens-stage > .lg-canvas') }
  })
}

async function verifyLiveResize(browser) {
  const record = { name: 'same-page-live-resize-and-DPR', method: 'CDP Emulation.setDeviceMetricsOverride; equivalent browser layout inputs, not browser UI zoom', checks: [] }
  report.cases.push(record)
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
    reducedMotion: 'no-preference' })
  await context.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia
    const probe = { queries: [], nativeChanges: 0, nativeResizes: 0, emulatedChanges: 0 }
    globalThis.__zoomDensityProbe = probe
    // Keep native MediaQueryList instances and native results. CDP's DPR-only
    // override updates .matches without delivering change events (or even
    // invalidating CSS resolution rules); record and bridge that tool limit.
    window.matchMedia = function (...args) {
      const query = nativeMatchMedia.apply(this, args)
      if (/resolution/i.test(String(args[0]))) {
        probe.queries.push(query)
        query.addEventListener('change', event => {
          if (event.isTrusted) probe.nativeChanges++
          else probe.emulatedChanges++
        })
      }
      return query
    }
    addEventListener('resize', event => { if (event.isTrusted) probe.nativeResizes++ })
  })
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 503, json: {} }))
  await context.route('https://img.shields.io/**', route => route.fulfill({ status: 503, json: {} }))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(report.url, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.querySelector('.operator-stage')?.dataset.state === 'ready')
    await page.waitForTimeout(3400)
    const cdp = await context.newCDPSession(page)
    const transitions = [
      { name: 'CDP-DPR-only-plus-emulated-resolution-change-event', width: 1440, height: 900, deviceScaleFactor: 1.5, emulateResolutionEvent: true },
      { name: '200percent', width: 720, height: 450, deviceScaleFactor: 2 },
      { name: '75percent', width: 1920, height: 1200, deviceScaleFactor: 0.75 },
      { name: '125percent', width: 1152, height: 720, deviceScaleFactor: 1.25 },
      { name: '100percent-restored', width: 1440, height: 900, deviceScaleFactor: 1 },
    ]
    record.initial = await canvasMetrics(page)
    const initialDensity = record.initial.lens.map(canvas => canvas.density)
    for (const step of transitions) await check(record, `Live resize ${step.name}: layout, menus and canvases`, async () => {
      const countersBefore = await page.evaluate(() => ({ changes: __zoomDensityProbe.nativeChanges,
        resizes: __zoomDensityProbe.nativeResizes }))
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: step.width, height: step.height,
        deviceScaleFactor: step.deviceScaleFactor, mobile: false })
      await page.waitForTimeout(400)
      let eventEmulation = null
      if (step.emulateResolutionEvent) {
        eventEmulation = await page.evaluate(before => {
          const probe = __zoomDensityProbe
          const nativeChanges = probe.nativeChanges - before.changes
          const nativeResizes = probe.nativeResizes - before.resizes
          const oldQueries = [...probe.queries]
          let dispatched = 0
          if (!nativeChanges && !nativeResizes) for (const query of oldQueries) {
            if (!query.matches) {
              query.dispatchEvent(new MediaQueryListEvent('change', { matches: query.matches, media: query.media }))
              dispatched++
            }
          }
          return { method: 'CDP DPR-only override plus emulated resolution-change event when native events are absent',
            nativeResolutionChangeEvents: nativeChanges, nativeResizeEvents: nativeResizes,
            emulatedResolutionChangeEvents: dispatched,
            note: 'This verifies the application response to resolution-change events, not delivery of real browser DPR-only events.' }
        }, countersBefore)
        record.eventEmulation = eventEmulation
        await page.waitForTimeout(400)
      }
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }))
      assert.equal(viewport.width, step.width)
      assert.equal(viewport.height, step.height)
      assert.ok(Math.abs(viewport.dpr - step.deviceScaleFactor) < 0.01)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Live resize causes horizontal overflow')
      await reachable(page, '.lens-cta')
      await reachable(page, '.operator-pet')
      await reachable(page, '.stage-window', { minimumHeight: 40, whole: false })
      await reachable(page, '.site-footer')
      const down = await canvasMetrics(page)
      if (await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1)) {
        assert.ok(down.viewport.scrollY > 0, 'Footer should exercise document scrolling')
      }
      const field = down.field[0]
      assert.ok(field && Math.abs(field.x) <= 1 && Math.abs(field.y) <= 1
        && Math.abs(field.width - down.viewport.availableWidth) <= 1
        && Math.abs(field.height - down.viewport.height) <= 1,
      `Background no longer fills viewport after scroll: ${JSON.stringify(down)}`)
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await page.waitForTimeout(120)
      const up = await canvasMetrics(page)
      assert.ok(Math.abs(up.field[0].y) <= 1 && Math.abs(up.field[0].height - field.height) <= 1,
        'Background moves or expands with document scrolling')
      const usableLens = up.lens.filter(canvas => canvas.parentClasses.includes('webgl-ready') && !canvas.hidden)
      assert.ok(usableLens.length >= 2, `Visible navigation and download glass missing: ${JSON.stringify(up.lens)}`)
      assert.ok(usableLens.every(canvas => canvas.backingWidth > 0 && canvas.backingHeight > 0), 'Glass canvas backing size collapsed')
      if (step.emulateResolutionEvent) {
        assert.ok(up.lens.every((canvas, index) => canvas.density >= initialDensity[index] * 1.45),
          `Fixed-size glass did not refresh for DPR-only change: ${JSON.stringify({ before: record.initial, after: up })}`)
        assert.ok(up.field[0].density >= record.initial.field[0].density * 1.45, 'Background backing did not refresh for DPR-only change')
      }
      await page.locator('.pm-trigger').click()
      await page.getByRole('dialog', { name: '选择平台与版本', exact: true }).waitFor({ state: 'visible' })
      await page.keyboard.press('Escape')
      await page.getByRole('dialog', { name: '选择平台与版本', exact: true }).waitFor({ state: 'hidden' })
      await legalDialog(page, `live-${step.name}`)
      await page.screenshot({ path: path.join(output, `live-${step.name}.png`), fullPage: true, animations: 'disabled' })
      return { viewport, eventEmulation, scrollDown: down, scrollTop: up }
    })
    await check(record, 'Normal-motion scroll/resize produced no browser exceptions', async () => {
      assert.deepEqual(errors, [])
      return { errors }
    })
  } catch (error) { record.checks.push({ name: 'Live resize setup', passed: false, error: error.message }) }
  finally { await context.close() }
}

let server, browser
try {
  await mkdir(output, { recursive: true })
  server = await createServer({ root, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address === 'object')
  report.url = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.MOWER_BROWSER_EXECUTABLE
      ? { executablePath: process.env.MOWER_BROWSER_EXECUTABLE } : { channel: 'msedge' }) })
  for (const spec of liveOnly ? [] : cases) {
    const viewport = { width: Math.round(spec.physicalWidth / spec.zoom), height: Math.round(spec.physicalHeight / spec.zoom) }
    const context = await browser.newContext({ viewport, deviceScaleFactor: spec.zoom,
      reducedMotion: 'reduce', isMobile: Boolean(spec.mobile), hasTouch: Boolean(spec.mobile) })
    await context.route('https://api.github.com/**', route => route.fulfill({ status: 503, json: {} }))
    await context.route('https://img.shields.io/**', route => route.fulfill({ status: 503, json: {} }))
    const page = await context.newPage()
    const record = { ...spec, viewport, method: spec.mobile ? 'Native mobile viewport' : report.method, checks: [] }
    report.cases.push(record)
    try {
      await page.goto(report.url, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForFunction(() => document.querySelector('.operator-stage')?.dataset.state === 'ready', null, { timeout: 15000 })
      record.initial = await metrics(page)
      await page.screenshot({ path: path.join(output, `${spec.name}-initial.png`), animations: 'disabled' })
      await check(record, 'No horizontal document overflow', async () => {
        const m = await metrics(page)
        assert.ok(m.document.width <= m.viewport.width + 1 && m.document.bodyWidth <= m.viewport.width + 1,
          JSON.stringify(m))
        return { width: m.document.width, bodyWidth: m.document.bodyWidth, viewport: m.viewport.width }
      })
      for (const selector of ['.lens-cta', '.hero-action-row .channel-bar', '.operator-pet']) {
        await check(record, `${selector} is reachable without hidden scrolling`, () => reachable(page, selector))
      }
      await check(record, 'Preview title bar has at least 40 CSS px and is reachable', () =>
        reachable(page, '.stage-window', { minimumHeight: 40, whole: false }))
      await check(record, 'Legal footer links are reachable', async () => {
        if (allowMissingFooter && !await page.locator('.site-footer').count()) return { skipped: 'Footer not yet added in baseline' }
        const footer = await reachable(page, '.site-footer')
        assert.equal(await page.getByRole('link', { name: '软件开源许可', exact: true }).getAttribute('href'), expectedLegal.software)
        assert.equal(await page.getByRole('link', { name: '用户须知', exact: true }).getAttribute('href'), expectedLegal.notice)
        const links = page.locator('.site-footer a, .site-footer button')
        assert.ok(await links.count() >= 2, 'Expected at least two legal disclosure links')
        for (let i = 0; i < await links.count(); i++) {
          await links.nth(i).evaluate(element => element.scrollIntoView({ block: 'nearest', behavior: 'instant' }))
          assert.ok(await links.nth(i).isVisible(), 'Legal disclosure link is hidden')
        }
        return { footer, linkCount: await links.count() }
      })
      if (!allowMissingFooter) await check(record, 'Legal dialog fits, scrolls, traps focus and closes with focus restored',
        () => legalDialog(page, spec.name))
      await check(record, 'Operator menu fits and all options can be scrolled to', async () => {
        await page.locator('.operator-pet').hover()
        await page.locator('.operator-menu-trigger').click({ timeout: 5000 })
        const menu = page.locator('.operator-menu')
        await menu.waitFor({ state: 'visible' })
        const bounds = await menu.boundingBox()
        const current = await metrics(page)
        assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= current.viewport.width + 1
          && bounds.y >= -1 && bounds.y + bounds.height <= current.viewport.height + 1,
        `Menu extends beyond viewport: ${JSON.stringify({ bounds, viewport: current.viewport })}`)
        const buttons = menu.locator('button')
        const buttonCount = await buttons.count()
        const last = buttons.last()
        await last.scrollIntoViewIfNeeded()
        const lastRect = await last.boundingBox(), menuRect = await menu.boundingBox()
        assert.ok(lastRect && menuRect && lastRect.y >= menuRect.y - 1
          && lastRect.y + lastRect.height <= menuRect.y + menuRect.height + 1, 'Last menu option cannot be revealed')
        await page.screenshot({ path: path.join(output, `${spec.name}-menu.png`), animations: 'disabled' })
        await page.keyboard.press('Escape')
        return { bounds, buttonCount }
      })
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await page.screenshot({ path: path.join(output, `${spec.name}.png`), fullPage: true, animations: 'disabled' })
      record.final = await metrics(page)
      if (spec.name === '1440x900-100percent') {
        const before = await metrics(page)
        await page.keyboard.press('Control++')
        await page.waitForTimeout(100)
        const after = await metrics(page)
        report.shortcutProbe = { shortcut: 'Control++ in headless Edge', before: before.viewport, after: after.viewport,
          actualBrowserZoomChanged: before.viewport.dpr !== after.viewport.dpr || before.viewport.width !== after.viewport.width }
        if (!report.shortcutProbe.actualBrowserZoomChanged) {
          report.shortcutProbe.note = 'Headless CDP keyboard did not invoke browser UI zoom; matrix uses the explicitly labelled equivalent inputs.'
        }
      }
    } catch (error) { record.checks.push({ name: 'Case setup', passed: false, error: error.message }) }
    finally { await context.close() }
    console.log(`${record.name}: ${record.checks.filter(check => check.passed).length}/${record.checks.length} passed`)
  }
  if (!allowMissingFooter) {
    if (!liveOnly) {
      const record = { name: 'Local legal notices', checks: [] }
      report.cases.push(record)
      const context = await browser.newContext()
      try {
        for (const [file, patterns] of [
          ['/licenses/lens-MIT.txt', [/MIT License/, /Permission is hereby granted/, /Copyright/]],
          ['/licenses/spine-runtimes.txt', [/Spine Runtimes License Agreement/, /Esoteric Software/, /2013-2019/]],
        ]) await check(record, `${file} serves the complete plain-text notice`, async () => {
          const response = await context.request.get(`${report.url}${file}`)
          assert.equal(response.status(), 200)
          const text = await response.text()
          assert.ok(!text.includes('<!doctype html>'), 'Vite HTML fallback is not a license')
          for (const pattern of patterns) assert.match(text, pattern)
          assert.ok(text.length > 500, 'License appears truncated')
          return { status: response.status(), characters: text.length, contentType: response.headers()['content-type'] }
        })
      } finally { await context.close() }
    }
    await verifyLiveResize(browser)
  }
} catch (error) { report.setupError = error.stack || error.message }
finally { if (browser) await browser.close(); if (server) await server.close() }
report.passed = report.cases.flatMap(record => record.checks).filter(check => check.passed).length
report.failures = report.cases.flatMap(record => record.checks.filter(check => !check.passed)
  .map(check => ({ case: record.name, ...check })))
report.failed = report.failures.length + (report.setupError ? 1 : 0)
await writeFile(path.join(output, liveOnly ? 'live-verification.json' : 'verification.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, failures: report.failures,
  shortcutProbe: report.shortcutProbe, setupError: report.setupError, output }, null, 2))
process.exitCode = report.failed ? 1 : 0
