import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect as playwrightExpect } from '@playwright/test'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const outputDirectory = path.join(root, '.taste-skill', 'lens', 'after')
const expect = playwrightExpect.configure({ timeout: 10_000 })
const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 667, height: 375 },
]
const summary = { browser: null, url: null, screenshots: [], checks: [], warnings: [], browserEvents: [] }
const packageUrl = /^https:\/\/github\.com\/(?:ArkMowers\/arknights-mower|ALEXsun0\/arknights-mower-android)\/releases\/download\/.+/i
const stableReleasePage = 'https://github.com/ArkMowers/arknights-mower/releases/tag/v4.1.5'
const androidApkUrl = /^https:\/\/github\.com\/ALEXsun0\/arknights-mower-android\/releases\/download\/.+\.apk$/i
const trigger = page => page.locator('.pm-trigger')
const docs = page => page.getByRole('link', { name: '使用文档', exact: true })

async function check(name, run) {
  const started = performance.now()
  try {
    const details = await run()
    summary.checks.push({ name, passed: true, durationMs: Math.round(performance.now() - started), ...details })
  } catch (error) {
    summary.checks.push({ name, passed: false, durationMs: Math.round(performance.now() - started), error: error.message })
  }
}

async function newContext(browser, options = {}) {
  const { disableWebgl = false, ...browserOptions } = options
  const context = await browser.newContext({ reducedMotion: 'no-preference', ...browserOptions })
  const failedApis = []
  for (const pattern of ['https://api.github.com/**', 'https://img.shields.io/**']) {
    await context.route(pattern, route => {
      failedApis.push(route.request().url())
      return route.fulfill({ status: 503, json: { message: 'Intentional offline fallback validation' } })
    })
  }
  // Observe the contexts the application actually creates, without changing
  // support detection or relying on a vendor-specific global variable.
  await context.addInitScript(disabled => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (...args) {
      if (disabled && ['webgl', 'webgl2', 'experimental-webgl'].includes(args[0])) {
        if (args[0] === 'webgl2') this.dataset.verifyWebgl2 = 'false'
        return null
      }
      const result = original.apply(this, args)
      if (args[0] === 'webgl2') this.dataset.verifyWebgl2 = String(Boolean(result))
      return result
    }
  }, disableWebgl)
  return { context, failedApis }
}

function observeRuntime(page) {
  const errors = []
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) summary.browserEvents.push({ type: 'navigation', url: frame.url(), time: Date.now() })
  })
  page.on('websocket', socket => socket.on('framereceived', event => {
    try {
      const message = JSON.parse(String(event.payload))
      if (['full-reload', 'update', 'error'].includes(message.type)) {
        summary.browserEvents.push({ type: 'vite-message', message, time: Date.now() })
      }
    } catch { /* Other application sockets need no diagnostic logging. */ }
  }))
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'warning') summary.warnings.push(message.text())
    if (message.text().includes('[vite]')) {
      summary.browserEvents.push({ type: 'vite-console', text: message.text(), time: Date.now() })
    }
  })
  page.on('response', response => {
    if (response.url().startsWith(summary.url) && response.status() >= 400) {
      errors.push(`HTTP ${response.status()} ${response.url()}`)
    }
  })
  return errors
}

async function openApp(page) {
  await page.goto(summary.url, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Arknights Mower')
  await page.evaluate(() => document.fonts.ready)
  // The normal entrance timeline lasts approximately three seconds.
  if (await page.evaluate(() => !matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    await page.waitForTimeout(3400)
  }
}

async function screenshot(page, name) {
  const destination = path.join(outputDirectory, `${name}.png`)
  await page.screenshot({ path: destination, fullPage: true, animations: 'disabled' })
  summary.screenshots.push(destination)
}

async function assertLayout(page) {
  const dimensions = await page.evaluate(() => ({
    available: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    shell: document.querySelector('.site-shell').scrollWidth,
    viewportHeight: innerHeight,
  }))
  assert.ok(Math.max(dimensions.document, dimensions.body, dimensions.shell) <= dimensions.available + 1,
    `Horizontal overflow: ${JSON.stringify(dimensions)}`)
  for (const control of [trigger(page), docs(page), page.locator('.github-nav'), page.locator('.lens-cta')]) {
    await expect(control).toBeVisible()
    const rect = await control.boundingBox()
    assert.ok(rect.width > 0 && rect.x >= -1 && rect.x + rect.width <= dimensions.available + 1,
      `Clipped control: ${JSON.stringify(rect)}`)
    await expect(control).toHaveAccessibleName(/\S/)
  }
  await expect(trigger(page)).toHaveAccessibleName(/其他平台|选择平台|平台与版本/)
  const copy = await page.locator('.hero-summary').evaluate(element => {
    const rect = element.getBoundingClientRect()
    if (!rect.height) return null
    const point = { x: rect.x + rect.width / 2, y: rect.bottom - 2 }
    const hit = document.elementFromPoint(point.x, point.y)
    return { point, bottomLineExposed: hit === element || element.contains(hit),
      hitClassName: hit?.className, zIndex: getComputedStyle(element).zIndex }
  })
  if (copy && !await page.locator('.pm-panel').count()) {
    assert.ok(copy.bottomLineExposed, `Summary is occluded by the neighboring material stage: ${JSON.stringify(copy)}`)
  }
  const headline = await page.locator('.hero-title').evaluate(element => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }))
  if (dimensions.available <= 380) assert.ok(headline.height / headline.lineHeight < 1.2,
    `Small-screen title should fit without orphaned characters: ${JSON.stringify(headline)}`)
  return { dimensions, copy, headline }
}

async function assertAssets(page) {
  const logo = page.locator('.brand-logo')
  await expect(logo).toHaveAttribute('src', '/brand/mower-logo-original.png')
  await expect(logo).toHaveJSProperty('complete', true)
  const logoStyle = await logo.evaluate(element => ({
    width: element.naturalWidth,
    height: element.naturalHeight,
    filter: getComputedStyle(element).filter,
    objectFit: getComputedStyle(element).objectFit,
  }))
  assert.ok(logoStyle.width > 0 && logoStyle.height > 0, 'Clean logo failed to load')
  assert.equal(logoStyle.filter, 'none', 'The original logo must render without recoloring')
  assert.equal(logoStyle.objectFit, 'contain')

  const preview = page.locator('.stage-window img')
  await expect(preview).toHaveAttribute('src', '/images/mower-screenshot-light-clean.webp')
  await expect(preview).toBeVisible()
  await expect(preview).toHaveJSProperty('complete', true)
  const image = await preview.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return { width: element.naturalWidth, height: element.naturalHeight,
      renderedWidth: rect.width, renderedHeight: rect.height, currentSrc: element.currentSrc,
      objectFit: getComputedStyle(element).objectFit }
  })
  assert.ok(image.width > 0 && image.height > 0, 'Light preview failed to load')
  assert.match(image.currentSrc, /mower-screenshot-light-clean(?:-960)?\.webp$/)
  const naturalRatio = image.width / image.height
  const renderedRatio = image.renderedWidth / image.renderedHeight
  assert.ok(image.objectFit === 'cover' || Math.abs(naturalRatio / renderedRatio - 1) < 0.005,
    `Light preview is stretched or cropped inside its image box: ${JSON.stringify(image)}`)
  return { logo: logoStyle, image }
}

async function assertLens(page) {
  const surfaces = [page.locator('.lens-cta'), page.locator('.github-nav')]
  for (const surface of surfaces) {
    await expect(surface).toHaveAttribute('data-glass', 'button')
    await expect(surface).toHaveClass(/\blg-surface\b/)
  }
  const support = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    const supported = Boolean(gl)
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return supported
  })
  if (support) {
    await expect(page.locator('[data-lens-stage] > .lg-canvas[data-gpu-state="active"][data-verify-webgl2="true"]'),
      'Both visible Lens stages must have active WebGL2 renderers').toHaveCount(2)
  }
  const canvases = await page.locator('canvas').evaluateAll(elements => elements.map(element => ({
    id: element.id, className: element.className, width: element.width, height: element.height,
    ready: element.dataset.ready ?? null, gpuState: element.dataset.gpuState ?? null,
    webgl2: element.dataset.verifyWebgl2 ?? null,
  })))
  return { webgl2Supported: support, canvases }
}

async function assertKeyboardNavigation(page) {
  await page.evaluate(() => document.activeElement?.blur())
  const reached = new Set()
  const order = []
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press('Tab')
    const active = await page.evaluate(() => {
      const element = document.activeElement
      return { tag: element?.tagName, className: element?.className,
        name: element?.getAttribute('aria-label') || element?.textContent?.trim(),
        platform: Boolean(element?.matches('.pm-trigger')), docs: Boolean(element?.matches('.docs-nav')) }
    })
    order.push(active)
    if (active.platform) reached.add('platform')
    if (active.docs) reached.add('docs')
    if (reached.size === 2) break
  }
  assert.equal(reached.size, 2, `Platform and docs controls must be reachable by Tab: ${JSON.stringify(order)}`)
  return { order }
}

async function assertMenu(page, viewport, failedApis, capture = true) {
  await trigger(page).focus()
  await page.keyboard.press('Enter')
  const panel = page.getByRole('dialog', { name: '选择平台与版本' })
  await expect(panel).toBeVisible()
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(panel.locator('.pm-list > li')).toHaveCount(7)
  await expect(panel.locator('a.pm-row')).toHaveCount(7)
  const rows = await panel.locator('.pm-name').allTextContents()
  for (const label of ['Windows', 'Apple 芯片', 'Intel 芯片', 'Linux', 'ARM64', 'APK', '更新包']) {
    assert.ok(rows.some(row => row.includes(label)), `Missing platform row: ${label}`)
  }
  const linksByChannel = {}
  for (const [channel, label] of [['beta', '测试版'], ['stable', '正式版']]) {
    await panel.getByRole('radio', { name: label, exact: true }).click()
    await expect(panel.getByRole('radio', { name: label, exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(panel.locator('.channel-switch')).toHaveAttribute('data-active', channel)
    if (await page.locator('.download .channel-switch').count()) {
      await expect(page.locator('.download .channel-switch')).toHaveAttribute('data-active', channel)
    }
    const resolvedRows = await panel.locator('a.pm-row').evaluateAll(elements => elements.map(element => ({ href: element.href, text: element.textContent })))
    const urls = resolvedRows.map(row => row.href)
    assert.equal(urls.length, 7)
    if (channel === 'beta') {
      for (const url of urls) assert.match(url, packageUrl, 'Verified beta packages must remain direct downloads')
    } else {
      const releaseRows = resolvedRows.filter(row => row.href === stableReleasePage)
      assert.equal(releaseRows.length, 6, 'Assetless desktop stable must link to the current v4.1.5 release')
      for (const row of releaseRows) {
        assert.ok(row.text.includes('v4.1.5') && row.text.includes('此版本未附该平台安装包') && row.text.includes('发布说明'),
          `An assetless stable row must explain its release-page link: ${row.text}`)
      }
      assert.equal(urls.filter(url => androidApkUrl.test(url)).length, 1, 'Android stable APK keeps its own direct installation link')
      assert.ok(urls.every(url => url === stableReleasePage || androidApkUrl.test(url)))
    }
    linksByChannel[channel] = urls
  }
  assert.ok(failedApis.some(url => /api\.github\.com.*\/releases\?/.test(url)), 'Release API failure was not exercised')
  assert.ok(failedApis.some(url => /api\.github\.com.*\/releases\/latest$/.test(url)), 'Latest-stable API failure was not exercised')
  await assertLayout(page)
  if (capture && [1440, 390, 667].includes(viewport.width)) await screenshot(page, `menu-${viewport.width}x${viewport.height}`)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false')
  const returnedFocus = await trigger(page).evaluate(element => document.activeElement === element)
  assert.ok(returnedFocus, 'Escape should return keyboard focus to the platform trigger')
  const heroHref = await page.locator('a.lens-cta').getAttribute('href')
  if (heroHref === stableReleasePage) {
    await expect(page.locator('a.lens-cta')).toContainText('查看正式版')
    await expect(page.locator('a.lens-cta')).toHaveAttribute('title', /v4\.1\.5.*暂无安装包，查看发布说明/)
    await expect(page.locator('a.lens-cta')).toHaveAttribute('aria-label', /查看.*v4\.1\.5.*暂无安装包/)
  } else if (heroHref) {
    assert.match(heroHref, androidApkUrl, 'Stable hero either opens current desktop release notes or downloads the Android APK')
  }
  return { rows: rows.map(row => row.trim()), linksByChannel, escapeReturnedFocus: returnedFocus,
    failedApiRequests: failedApis.length, heroHref }
}

async function verifyViewport(browser, viewport) {
  const { context, failedApis } = await newContext(browser, { viewport })
  const page = await context.newPage()
  const errors = observeRuntime(page)
  const label = `${viewport.width}×${viewport.height}`
  try {
    await openApp(page)
    await check(`${label}: responsive layout and accessible controls`, () => assertLayout(page))
    await check(`${label}: clean logo and natural light screenshot`, () => assertAssets(page))
    await check(`${label}: Lens surfaces and working canvas`, () => assertLens(page))
    await screenshot(page, `home-${viewport.width}x${viewport.height}`)
    await check(`${label}: keyboard navigation`, () => assertKeyboardNavigation(page))
    await check(`${label}: seven platform rows, channel sync, Escape, API fallback`,
      () => assertMenu(page, viewport, failedApis))
    await check(`${label}: no runtime errors or missing local resources`, () => {
      assert.deepEqual(errors, [])
      return { errors }
    })
  } finally {
    await context.close()
  }
}

async function verifyReducedMotion(browser) {
  const { context } = await newContext(browser, { viewport: viewports[0], reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    await openApp(page)
    await check('Reduced motion: button presses leave no jelly transform', async () => {
      await trigger(page).click()
      const panel = page.getByRole('dialog', { name: '选择平台与版本' })
      await panel.getByRole('radio', { name: '测试版', exact: true }).click()
      await page.keyboard.press('Escape')
      await page.locator('.lens-cta').evaluate(element => {
        element.addEventListener('click', event => event.preventDefault(), { once: true, capture: true })
      })
      await page.locator('.lens-cta').click()
      await expect.poll(() => page.locator('.lens-button').evaluateAll(elements => elements.every(element => {
        const transform = getComputedStyle(element).transform
        return transform === 'none' || new DOMMatrixReadOnly(transform).isIdentity
      })), { message: 'Reduced-motion button springs must settle', timeout: 4000 }).toBe(true)
      const styles = await page.locator('.lens-button').evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element)
        const matrix = style.transform === 'none' ? null : new DOMMatrixReadOnly(style.transform)
        return { className: element.className, transform: style.transform,
          translate: style.translate, scale: style.scale, identity: !matrix || matrix.isIdentity }
      }))
      assert.ok(styles.length >= 2, 'Lens surfaces missing in reduced-motion mode')
      assert.ok(styles.every(style => style.identity && ['none', '0px', '0px 0px'].includes(style.translate)
        && ['none', '1', '1 1'].includes(style.scale)), `Lingering jelly transform: ${JSON.stringify(styles)}`)
      return { styles }
    })
    await screenshot(page, 'reduced-motion-1440x900')
  } finally {
    await context.close()
  }
}

async function verifyGestures(browser) {
  const { context } = await newContext(browser, { viewport: viewports[0], hasTouch: true })
  const page = await context.newPage()
  const errors = observeRuntime(page)
  try {
    await openApp(page)
    await check('CTA: mouse click and touch tap each fire once; actual drag bends and resets', async () => {
      const cta = page.locator('.lens-cta')
      await expect(cta).toHaveAttribute('data-jelly', 'tether')
      await page.evaluate(() => {
        window.__mowerVerifyCtaClicks = 0
        document.addEventListener('click', event => {
          if (event.target.closest('.lens-cta')) {
            window.__mowerVerifyCtaClicks += 1
            event.preventDefault()
          }
        }, { capture: true })
      })
      const readMatrix = () => cta.evaluate(element => {
        const transform = getComputedStyle(element).transform
        const matrix = transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform)
        return { transform, a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d,
          x: matrix.e, y: matrix.f, identity: matrix.isIdentity }
      })
      const settle = () => expect.poll(async () => (await readMatrix()).identity,
        { message: 'Tether must return to its original matrix', timeout: 5000 }).toBe(true)
      await cta.click()
      assert.equal(await page.evaluate(() => window.__mowerVerifyCtaClicks), 1, 'Mouse click must activate exactly once')
      await settle()
      let box = await cta.boundingBox()
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
      assert.equal(await page.evaluate(() => window.__mowerVerifyCtaClicks), 2, 'Touch tap must activate exactly once')
      await settle()
      const before = await readMatrix()
      await screenshot(page, 'gesture-before-1440x900')
      box = await cta.boundingBox()
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      await page.mouse.move(center.x, center.y)
      await page.mouse.down()
      await expect(cta).toHaveAttribute('data-held', 'true')
      await expect.poll(async () => (await readMatrix()).identity,
        { message: 'Held lens must visibly deform' }).toBe(false)
      const held = await readMatrix()
      await screenshot(page, 'gesture-held-1440x900')
      await page.mouse.move(center.x + 44, center.y + 18, { steps: 12 })
      await expect.poll(async () => {
        const matrix = await readMatrix()
        return Math.hypot(matrix.x, matrix.y)
      }, { message: 'Dragging must visibly translate the lens' }).toBeGreaterThan(4)
      const dragged = await readMatrix()
      await screenshot(page, 'gesture-drag-1440x900')
      await page.mouse.up()
      await expect(cta).not.toHaveAttribute('data-held', 'true')
      await settle()
      const after = await readMatrix()
      assert.equal(await page.evaluate(() => window.__mowerVerifyCtaClicks), 2, 'Dragging must not trigger a download click')
      assert.deepEqual(errors, [], 'Gesture validation must have no browser runtime errors')
      await screenshot(page, 'gesture-after-1440x900')
      return { mouseClickCount: 1, touchTapCount: 1, dragClickCount: 0, before, held, dragged, after }
    })
  } finally {
    await context.close()
  }
}

async function verifyWebglFallback(browser) {
  const { context, failedApis } = await newContext(browser,
    { viewport: viewports[0], reducedMotion: 'reduce', disableWebgl: true })
  const page = await context.newPage()
  const errors = observeRuntime(page)
  try {
    await openApp(page)
    await check('WebGL unavailable: CSS materials, native CTA, navigation and all package links remain usable', async () => {
      await expect(page.locator('[data-lens-stage].fallback')).toHaveCount(2)
      await expect(page.locator('[data-lens-stage] > canvas[data-gpu-state="active"]')).toHaveCount(0)
      await assertLayout(page)
      await expect(docs(page)).toHaveAttribute('href', 'https://arkmowers.github.io/arknights-mower/')
      await page.locator('.lens-cta').evaluate(element => {
        window.__mowerVerifyFallbackClicks = 0
        element.addEventListener('click', event => {
          window.__mowerVerifyFallbackClicks += 1
          event.preventDefault()
        }, { capture: true })
      })
      await page.locator('.lens-cta').click()
      assert.equal(await page.evaluate(() => window.__mowerVerifyFallbackClicks), 1)
      const menu = await assertMenu(page, viewports[0], failedApis, false)
      const materials = await page.locator('.lens-cta, .github-nav').evaluateAll(elements => elements.map(element => ({
        className: element.className, background: getComputedStyle(element).backgroundColor,
        backdropFilter: getComputedStyle(element).backdropFilter,
      })))
      assert.ok(materials.every(material => material.background !== 'rgba(0, 0, 0, 0)' && material.background !== 'transparent'))
      assert.deepEqual(errors, [])
      return { materials, expectedWebglUnavailableWarnings: summary.warnings.length, ...menu }
    })
    await screenshot(page, 'fallback-1440x900')
  } finally {
    await context.close()
  }
}

async function diagnoseResize(browser) {
  const { context } = await newContext(browser, { viewport: viewports[0] })
  const page = await context.newPage()
  observeRuntime(page)
  try {
    await openApp(page)
    const inspect = () => page.locator('[data-lens-stage]').evaluateAll(stages => stages.map(stage => ({
      className: stage.className, visibility: getComputedStyle(stage).visibility,
      width: stage.getBoundingClientRect().width, height: stage.getBoundingClientRect().height,
      canvas: [...stage.querySelectorAll(':scope > canvas')].map(canvas => ({
        className: canvas.className, gpuState: canvas.dataset.gpuState,
        webgl2: canvas.dataset.verifyWebgl2, width: canvas.width, height: canvas.height, hidden: canvas.hidden,
      })),
    })))
    const before = await inspect()
    await page.evaluate(() => window.dispatchEvent(new Event('resize')))
    await page.waitForTimeout(1500)
    const after = await inspect()
    summary.checks.push({ name: 'Lens visibility budget diagnostic: synthetic resize after entrance',
      passed: true, before, after })
    console.log(JSON.stringify({ before, after, warnings: [...new Set(summary.warnings)] }, null, 2))
    await screenshot(page, 'diagnose-resize-1440x900')
  } finally {
    await context.close()
  }
}

let server
let browser
try {
  await mkdir(outputDirectory, { recursive: true })
  // Browser assertions must stay in one document even if another checkout task
  // writes source or generated audit artifacts while this validation is running.
  // The actual click/drag counters and native navigation checks remain intact.
  server = await createServer({ root, server: { port: 0, host: '127.0.0.1', hmr: false } })
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address === 'object')
  summary.url = `http://127.0.0.1:${address.port}`
  summary.browser = process.env.MOWER_BROWSER_EXECUTABLE || 'msedge'
  browser = await chromium.launch({ headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.MOWER_BROWSER_EXECUTABLE
    ? { executablePath: process.env.MOWER_BROWSER_EXECUTABLE } : { channel: 'msedge' }) })
  if (process.argv.includes('--diagnose-resize')) {
    await diagnoseResize(browser)
  } else if (process.argv.includes('--fallback-only')) {
    await verifyWebglFallback(browser)
  } else if (process.argv.includes('--gestures-only')) {
    await verifyGestures(browser)
  } else if (process.argv.includes('--final-details')) {
    await verifyViewport(browser, viewports[0])
    await verifyViewport(browser, viewports[3])
    await verifyGestures(browser)
  } else {
    for (const viewport of viewports) await verifyViewport(browser, viewport)
    await verifyGestures(browser)
    await verifyReducedMotion(browser)
    await verifyWebglFallback(browser)
  }
} catch (error) {
  summary.checks.push({ name: 'Browser validation setup', passed: false, error: error.stack || error.message })
} finally {
  if (browser) await browser.close()
  if (server) await server.close()
}
summary.passed = summary.checks.filter(result => result.passed).length
summary.failed = summary.checks.filter(result => !result.passed).length
const reportFile = process.argv.includes('--diagnose-resize') ? 'diagnose-resize.json'
  : process.argv.includes('--fallback-only') ? 'fallback-verification.json'
    : process.argv.includes('--gestures-only') ? 'gesture-verification.json'
    : process.argv.includes('--final-details') ? 'final-details.json' : 'verification.json'
await writeFile(path.join(outputDirectory, reportFile), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed,
  failures: summary.checks.filter(result => !result.passed), warnings: [...new Set(summary.warnings)],
  screenshots: summary.screenshots }, null, 2))
process.exitCode = summary.failed ? 1 : 0
