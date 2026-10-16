import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

// Equivalent emulation of a 2560×1187 physical browser content area, 150% OS
// scaling and browser zoom. CSS viewport = physical / (OS scale × browser zoom).
// This uses CDP layout metrics and DPR, NOT real browser UI zoom or pinch zoom.
const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, '.taste-skill/single-screen')
const osScale = 1.5
const physical = { width: 2560, height: 1187 }
const percentages = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200]
const scenarios = percentages.map(percent => ({ name: `desktop-os150-browser${percent}`, percent,
  width: Math.round(physical.width / (osScale * percent / 100)),
  height: Math.round(physical.height / (osScale * percent / 100)), dpr: osScale * percent / 100,
})).concat([
  { name: 'mobile-390x844', width: 390, height: 844, dpr: 1, mobile: true },
  { name: 'mobile-320x568', width: 320, height: 568, dpr: 1, mobile: true },
  { name: 'mobile-landscape-667x375', width: 667, height: 375, dpr: 1, mobile: true },
])
const report = { method: 'Equivalent CDP CSS viewport and DPR; not browser UI zoom or pinch zoom',
  physicalDesktopContent: physical, osScale, cases: [], browser: process.env.MOWER_BROWSER_EXECUTABLE || 'msedge' }

async function inspect(page) {
  return page.evaluate(() => {
    const box = element => {
      if (!element) return null
      const r = element.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
    }
    const selectors = ['.site-header', '.hero-copy', '.hero-title', '.hero-summary', '.lens-cta',
      '.hero-action-row .channel-bar', '.stage', '.operator-stage', '.operator-pet', '.stage-window', '.site-footer']
    const rects = Object.fromEntries(selectors.map(selector => [selector, box(document.querySelector(selector))]))
    const image = document.querySelector('.stage-window img')
    const hiddenScroll = [...document.querySelectorAll('html,body,#root,.site-shell,.hero,.stage,.operator-stage')]
      .filter(element => /hidden|clip/.test(getComputedStyle(element).overflowY) && element.scrollTop > 1)
      .map(element => ({ tag: element.tagName, classes: element.className, scrollTop: element.scrollTop }))
    return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scrollX, scrollY,
      visualScale: visualViewport?.scale }, document: { width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight, bodyWidth: document.body.scrollWidth, bodyHeight: document.body.scrollHeight },
    rects, hiddenScroll, image: image ? { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
      naturalDisplayHeight: rects['.stage-window'].width * image.naturalHeight / image.naturalWidth } : null }
  })
}

async function check(record, name, fn) {
  try { record.checks.push({ name, passed: true, details: await fn() }) }
  catch (error) { record.checks.push({ name, passed: false, error: error.message }) }
}

async function screenshot(page, name) {
  // Playwright's screenshotter restores its context's original viewport after
  // a direct CDP metrics override. Capture through CDP so screenshots and the
  // following interactions keep the scenario's actual CSS viewport and DPR.
  const before = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio])
  const session = await page.context().newCDPSession(page)
  try {
    const capture = await session.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
    })
    await writeFile(path.join(output, `${name}.png`), Buffer.from(capture.data, 'base64'))
  } finally { await session.detach() }
  assert.deepEqual(await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]), before,
    'Screenshot changed the emulated CSS viewport or DPR')
}

function visible(rect, viewport) {
  return rect && rect.width > 0 && rect.height > 0 && rect.x >= -1 && rect.y >= -1
    && rect.right <= viewport.width + 1 && rect.bottom <= viewport.height + 1
}

async function popover(page, record, kind) {
  const operator = kind === 'operator'
  const trigger = page.locator(operator ? '.operator-menu-trigger' : '.site-footer-license-trigger')
  const anchor = page.locator(operator ? '.operator-pet' : '.site-footer-license-trigger')
  const bounds = await anchor.boundingBox()
  assert.ok(bounds && visible({ ...bounds, right: bounds.x + bounds.width, bottom: bounds.y + bounds.height }, record.layout.viewport),
    `${kind} trigger is not initially reachable without page scrolling`)
  if (operator) await anchor.hover()
  await trigger.click({ timeout: 3000 })
  const dialog = operator ? page.locator('.operator-menu')
    : page.getByRole('dialog', { name: '第三方许可与素材来源', exact: true })
  await dialog.waitFor({ state: 'visible', timeout: 3000 })
  const rect = await dialog.boundingBox()
  assert.ok(rect && visible({ ...rect, right: rect.x + rect.width, bottom: rect.y + rect.height }, record.layout.viewport),
    `${kind} popup exceeds viewport: ${JSON.stringify(rect)}`)
  const last = dialog.locator(operator ? 'button' : 'a').last()
  await last.scrollIntoViewIfNeeded()
  const lastRect = await last.boundingBox(), parentRect = await dialog.boundingBox()
  assert.ok(lastRect && parentRect && lastRect.y >= parentRect.y - 1
    && lastRect.y + lastRect.height <= parentRect.y + parentRect.height + 1, `${kind} final option cannot be reached internally`)
  assert.equal(await page.evaluate(() => scrollY), 0, `${kind} popup scrolled the document`)
  if ([25, 100, 200].includes(record.percent) || record.mobile) {
    await screenshot(page, `${record.name}-${kind}`)
  }
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden', timeout: 3000 })
  const after = await inspect(page)
  assert.equal(after.viewport.scrollY, 0, `${kind} close scrolled the document`)
  assert.ok(after.document.height <= after.viewport.height + 1, `${kind} close leaves a scrollable page`)
  return { bounds: rect, pageScrollY: after.viewport.scrollY }
}

let server, browser, desktopContext
try {
  await mkdir(output, { recursive: true })
  server = await createServer({ root, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  report.url = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.MOWER_BROWSER_EXECUTABLE ? { executablePath: process.env.MOWER_BROWSER_EXECUTABLE } : { channel: 'msedge' }) })
  async function contextFor(spec) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height },
      deviceScaleFactor: spec.dpr, reducedMotion: 'reduce', isMobile: Boolean(spec.mobile), hasTouch: Boolean(spec.mobile) })
    await context.route('https://api.github.com/**', route => route.fulfill({ status: 503, json: {} }))
    await context.route('https://img.shields.io/**', route => route.fulfill({ status: 503, json: {} }))
    return context
  }
  desktopContext = await contextFor(scenarios[0])
  const desktopPage = await desktopContext.newPage()
  const cdp = await desktopContext.newCDPSession(desktopPage)
  await desktopPage.goto(report.url, { waitUntil: 'networkidle' })
  await desktopPage.evaluate(() => document.fonts.ready)
  await desktopPage.waitForFunction(() => document.querySelector('.operator-stage')?.dataset.state === 'ready', null, { timeout: 15000 })
  for (const spec of scenarios) {
    const record = { ...spec, checks: [] }
    report.cases.push(record)
    let mobileContext
    const page = spec.mobile ? await (mobileContext = await contextFor(spec)).newPage() : desktopPage
    try {
      if (spec.mobile) {
        await page.goto(report.url, { waitUntil: 'networkidle' })
        await page.evaluate(() => document.fonts.ready)
        await page.waitForFunction(() => document.querySelector('.operator-stage')?.dataset.state === 'ready', null, { timeout: 15000 })
      } else {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: spec.width, height: spec.height,
          deviceScaleFactor: spec.dpr, mobile: false })
        await page.waitForTimeout(120)
      }
      await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
      record.layout = await inspect(page)
      const m = record.layout
      await check(record, 'Document fits one screen without vertical scrolling', async () => {
        assert.ok(m.document.height <= m.viewport.height + 1, `Document ${m.document.height}px exceeds viewport ${m.viewport.height}px`)
        assert.equal(m.viewport.scrollY, 0)
        assert.deepEqual(m.hiddenScroll, [])
      })
      await check(record, 'No horizontal overflow', async () => {
        assert.ok(Math.max(m.document.width, m.document.bodyWidth) <= m.viewport.width + 1, JSON.stringify(m.document))
      })
      await check(record, 'Header, download, channels, operator and legal footer are visible without scrolling', async () => {
        const failed = ['.site-header', '.lens-cta', '.hero-action-row .channel-bar', '.operator-pet', '.site-footer']
          .filter(selector => !visible(m.rects[selector], m.viewport))
        assert.deepEqual(failed, [], `Offscreen elements: ${JSON.stringify(Object.fromEntries(failed.map(selector => [selector, m.rects[selector]])))}`)
        assert.deepEqual(m.hiddenScroll, [])
      })
      await check(record, 'Preview is positive and no taller than its image natural aspect ratio', async () => {
        assert.ok(m.image?.naturalWidth > 0 && m.image.naturalHeight > 0, 'Preview image is missing')
        assert.ok(m.rects['.stage-window'].height > 0, 'Preview collapsed')
        assert.ok(m.rects['.stage-window'].height <= m.image.naturalDisplayHeight + 1,
          `Preview ${m.rects['.stage-window'].height}px exceeds natural image height ${m.image.naturalDisplayHeight}px`)
      })
      if ([25, 100, 200].includes(spec.percent) || spec.mobile) {
        await screenshot(page, spec.name)
      }
      await check(record, 'Operator menu fits and scrolls internally without document scroll', () => popover(page, record, 'operator'))
      // A failing popover check must not contaminate the following independent check.
      await page.keyboard.press('Escape')
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await check(record, 'Legal dialog fits and scrolls internally without document scroll', () => popover(page, record, 'legal'))
      await page.keyboard.press('Escape')
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      console.log(JSON.stringify({ name: spec.name, viewport: m.viewport, documentHeight: m.document.height,
        previewHeight: m.rects['.stage-window']?.height, naturalImageHeight: m.image?.naturalDisplayHeight,
        petBottom: m.rects['.operator-pet']?.bottom, footerBottom: m.rects['.site-footer']?.bottom,
        passed: record.checks.filter(check => check.passed).length, total: record.checks.length }))
    } catch (error) { record.checks.push({ name: 'Scenario setup', passed: false, error: error.message }) }
    finally { if (mobileContext) await mobileContext.close() }
  }
} catch (error) { report.setupError = error.stack || error.message }
finally { if (desktopContext) await desktopContext.close(); if (browser) await browser.close(); if (server) await server.close() }
report.passed = report.cases.flatMap(record => record.checks).filter(check => check.passed).length
report.failures = report.cases.flatMap(record => record.checks.filter(check => !check.passed).map(check => ({ case: record.name, ...check })))
report.failed = report.failures.length + (report.setupError ? 1 : 0)
await writeFile(path.join(output, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, setupError: report.setupError, output }, null, 2))
process.exitCode = report.failed ? 1 : 0
