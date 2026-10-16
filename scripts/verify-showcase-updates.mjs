import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, '.taste-skill/showcase')
const previewOnly = process.argv.includes('--preview-only')
const report = { mode: previewOnly ? 'preview-only' : 'full', checks: [], scenarios: [], screenshots: [] }
const specs = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
  { name: 'mobile-320', width: 320, height: 568, mobile: true },
]

async function check(name, run) {
  try { report.checks.push({ name, passed: true, details: await run() }); console.log(`PASS ${name}`) }
  catch (error) { report.checks.push({ name, passed: false, error: error.stack || error.message }); console.log(`FAIL ${name}: ${error.message}`) }
}

async function contextFor(browser, spec = {}, motion = 'reduce') {
  const context = await browser.newContext({ viewport: { width: spec.width || 1440, height: spec.height || 900 },
    reducedMotion: motion, isMobile: Boolean(spec.mobile), hasTouch: Boolean(spec.mobile) })
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 503, json: {} }))
  await context.route('https://img.shields.io/**', route => route.fulfill({ status: 503, json: {} }))
  await context.addInitScript(() => {
    const probe = { samples: [], programs: [], nodes: null, trustedCTA: 0 }
    globalThis.__showcase = probe
    const hooked = new WeakSet()
    const watchControls = () => {
      const cta = document.querySelector('.lens-cta')
      if (cta && !hooked.has(cta)) {
        hooked.add(cta)
        // Count trusted native activation while preventing an external download.
        cta.addEventListener('click', event => { if (event.isTrusted) probe.trustedCTA++; event.preventDefault() })
      }
    }
    new MutationObserver(watchControls).observe(document, { subtree: true, childList: true })
    const originals = [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext].filter(Boolean)
      .map(Type => [Type.prototype, Type.prototype.createProgram])
    for (const [prototype, original] of originals) prototype.createProgram = function (...args) {
      const program = original.apply(this, args)
      probe.programs.push({ canvas: this.canvas, program })
      return program
    }
    const sample = () => {
      const header = document.querySelector('.site-header-inner'), action = document.querySelector('.hero-action-row')
      const field = document.querySelector('.light-field-canvas')
      const lenses = [...document.querySelectorAll('.header-nav > .lg-canvas, .download > .lg-canvas')]
      if (header && action) {
        const h = getComputedStyle(header), a = getComputedStyle(action), cta = document.querySelector('.lens-cta')
        if (!probe.nodes && field && lenses.length === 2 && lenses.every(canvas => !canvas.hidden)) {
          probe.nodes = { field, lenses, initialPrograms: probe.programs.filter(entry => [field, ...lenses].includes(entry.canvas)).length }
        }
        probe.samples.push({ time: performance.now(), headerOpacity: Number(h.opacity), headerTop: parseFloat(h.top) || 0,
          actionOpacity: Number(a.opacity), actionY: a.transform === 'none' ? 0 : new DOMMatrixReadOnly(a.transform).m42,
          headerVisibility: h.visibility, actionVisibility: a.visibility, lensCount: lenses.length,
          activeLensCount: lenses.filter(canvas => !canvas.hidden).length, ctaInlineTransform: cta?.style.transform || '' })
      }
      if (performance.now() < 8000 && probe.samples.length < 600) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  return context
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

async function ready(page) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => document.querySelector('.operator-stage')?.dataset.state === 'ready'
    && document.querySelector('.stage-window img')?.complete && document.querySelector('.schedule-backdrop img')?.complete)
}

async function setTheme(page, theme) {
  if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click()
  await page.waitForFunction(value => {
    const figure = document.querySelector('.stage-window')
    if (!figure) return false
    const [width, height] = getComputedStyle(figure).aspectRatio.split('/').map(Number)
    const targetRatio = value === 'light' ? 1924 / 1084 : 1920 / 1080
    // The reduced-motion CSS sets a 0.01ms transition duration globally. Wait
    // until that genuine aspect-ratio transition settles before inspecting it.
    return document.documentElement.dataset.theme === value
      && document.querySelector('.site-shell')?.dataset.theme === value
      && document.querySelector('.stage-window img')?.currentSrc.includes(`mower-screenshot-${value}-clean`)
      && document.querySelector('.stage-window img')?.complete
      && document.querySelector('.schedule-backdrop img')?.currentSrc.includes(`mower-schedule-${value}`)
      && document.querySelector('.schedule-backdrop img')?.complete
      && Math.abs(width / height - targetRatio) < 0.0001
  }, theme, { timeout: 5000 })
}

async function inspect(page, expected) {
  const result = await page.evaluate(() => {
    const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom } }
    const image = document.querySelector('.stage-window img'), figure = image.parentElement
    const backdrop = document.querySelector('.schedule-backdrop'), decoration = backdrop.querySelector('img')
    const css = getComputedStyle(backdrop), star = getComputedStyle(document.querySelector('.star-icon'))
    const controls = ['.brand', '.pm-trigger', '.docs-nav', '.theme-toggle', '.github-nav', '.lens-cta', '.channel-bar', '.operator-pet', '.site-footer']
    const heading = document.querySelector('.hero-heading').getBoundingClientRect()
    const hits = document.elementsFromPoint(heading.x + heading.width / 2, heading.y + heading.height / 2)
    return { theme: document.documentElement.dataset.theme, viewport: { width: innerWidth, height: innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, scrollY },
      controls: Object.fromEntries(controls.map(selector => [selector, box(document.querySelector(selector))])),
      preview: { count: figure.querySelectorAll('img').length, currentSrc: image.currentSrc, src: image.getAttribute('src'),
        srcset: image.getAttribute('srcset'), alt: image.alt, width: image.getAttribute('width'), height: image.getAttribute('height'),
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, ratio: getComputedStyle(figure).aspectRatio, rect: box(figure) },
      backdrop: { currentSrc: decoration.currentSrc, width: decoration.getAttribute('width'), height: decoration.getAttribute('height'),
        opacity: Number(css.opacity), pointerEvents: css.pointerEvents, position: css.position, zIndex: css.zIndex,
        ariaHidden: backdrop.getAttribute('aria-hidden'), alt: decoration.alt, mask: css.maskImage,
        interceptsHeading: hits.some(element => element === backdrop || backdrop.contains(element)) }, starColor: star.color }
  })
  assert.equal(result.theme, expected)
  assert.ok(result.document.width <= result.viewport.width + 1 && result.document.height <= result.viewport.height + 1
    && result.document.scrollY === 0, `Page scrolls: ${JSON.stringify(result)}`)
  for (const [selector, rect] of Object.entries(result.controls)) assert.ok(rect.width > 0 && rect.height > 0
    && rect.x >= -1 && rect.y >= -1 && rect.right <= result.viewport.width + 1 && rect.bottom <= result.viewport.height + 1,
  `Control is clipped: ${selector}: ${JSON.stringify(rect)}`)
  const dimensions = expected === 'light' ? [1924, 1084] : [1920, 1080]
  assert.equal(result.preview.count, 1)
  assert.equal(result.preview.src, `/images/mower-screenshot-${expected}-clean.webp`)
  assert.match(result.preview.currentSrc, new RegExp(`/mower-screenshot-${expected}-clean(?:-960)?\\.webp$`))
  assert.ok(result.preview.srcset.includes(`mower-screenshot-${expected}-clean-960.webp`))
  assert.ok(result.preview.alt.includes(expected === 'light' ? '亮色' : '暗色'))
  assert.deepEqual([Number(result.preview.width), Number(result.preview.height)], dimensions)
  const [ratioWidth, ratioHeight] = result.preview.ratio.split('/').map(Number)
  assert.ok(Math.abs(ratioWidth / ratioHeight - dimensions[0] / dimensions[1]) < 0.0001,
    `Preview aspect ratio differs from ${dimensions.join('/')}: ${JSON.stringify(result.preview)}`)
  assert.ok(result.preview.rect.height > 0 && result.preview.rect.height <= result.preview.rect.width * dimensions[1] / dimensions[0] + 1)
  assert.match(result.backdrop.currentSrc, new RegExp(`/mower-schedule-${expected}(?:-960)?\\.webp$`))
  assert.deepEqual([Number(result.backdrop.width), Number(result.backdrop.height)], [1470, 700])
  assert.equal(result.backdrop.ariaHidden, 'true')
  assert.equal(result.backdrop.alt, '')
  assert.equal(result.backdrop.pointerEvents, 'none')
  assert.equal(result.backdrop.position, 'absolute')
  assert.ok(Number(result.backdrop.zIndex) < 0 && result.backdrop.mask !== 'none')
  assert.ok(result.backdrop.opacity > 0 && result.backdrop.opacity <= 0.35 && !result.backdrop.interceptsHeading,
    `Decorative backdrop is too strong or intercepts input: ${JSON.stringify(result.backdrop)}`)
  const rgb = result.starColor.match(/[\d.]+/g).slice(0, 3).map(Number), [r, g, b] = rgb
  const maximum = Math.max(...rgb), minimum = Math.min(...rgb)
  const hue = (60 * ((g - b) / (maximum - minimum)) + 360) % 360
  assert.ok(maximum === r && hue >= 35 && hue <= 65 && maximum - minimum > 80, `Star is not yellow: ${result.starColor}`)
  return result
}

async function checkMenu(page, theme, name) {
  await page.locator('.operator-pet').hover()
  const trigger = page.locator('.operator-menu-trigger')
  const colors = await trigger.evaluate(element => {
    const css = getComputedStyle(element)
    const luma = value => { const c = value.match(/[\d.]+/g).slice(0, 3).map(Number); return (0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255 }
    return { background: css.backgroundColor, color: css.color, backgroundLuma: luma(css.backgroundColor), textLuma: luma(css.color), border: css.borderTopWidth }
  })
  assert.ok(theme === 'light' ? colors.backgroundLuma > colors.textLuma + 0.4 : colors.backgroundLuma + 0.4 < colors.textLuma,
    `Operator trigger has inverted theme colors: ${JSON.stringify(colors)}`)
  await trigger.click()
  const menu = page.getByRole('dialog', { name: '但书动作与时装', exact: true })
  await menu.waitFor({ state: 'visible' })
  await screenshot(page, `${name}-${theme}-menu`)
  await menu.getByRole('button', { name: '坐下', exact: true }).click()
  assert.equal(await page.locator('.operator-pet').getAttribute('data-action'), 'Sit')
  return colors
}

async function rendererState(page) {
  return page.evaluate(() => {
    const saved = __showcase.nodes
    if (!saved) return { retained: false, reason: 'No first-frame main renderer references' }
    const live = [...document.querySelectorAll('.header-nav > .lg-canvas, .download > .lg-canvas')]
    return { retained: saved.field === document.querySelector('.light-field-canvas') && live.length === saved.lenses.length
      && live.every((canvas, index) => canvas === saved.lenses[index]), initialPrograms: saved.initialPrograms,
    currentPrograms: __showcase.programs.filter(entry => [saved.field, ...saved.lenses].includes(entry.canvas)).length }
  })
}

let server, browser
try {
  await mkdir(output, { recursive: true })
  server = await createServer({ root, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  report.url = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.MOWER_BROWSER_EXECUTABLE ? { executablePath: process.env.MOWER_BROWSER_EXECUTABLE } : { channel: 'msedge' }) })

  if (!previewOnly) {
    await check('Only sanitized image outputs are served; original paths do not return image data', async () => {
      const manifest = JSON.parse(await readFile(path.join(output, 'assets/asset-preparation.json'), 'utf8'))
      for (const item of manifest.pixelInvariants) { assert.equal(item.changedOutsideRegions, 0); assert.equal(item.anonymousRegionsOpaque, true) }
      const served = (await readdir(path.join(root, 'public/images'))).sort()
      assert.deepEqual(served, [...manifest.servedFiles].sort())
      assert.equal(served.length, 10)
      const context = await browser.newContext()
      try {
        const assets = await Promise.all(manifest.outputs.map(async asset => {
          const response = await context.request.get(`${report.url}/images/${asset.file}`)
          assert.equal(response.status(), 200)
          assert.match(response.headers()['content-type'], /^image\/webp/)
          const metadata = await sharp(await response.body()).metadata()
          assert.deepEqual([metadata.width, metadata.height], [asset.width, asset.height])
          return { file: asset.file, width: metadata.width, height: metadata.height }
        }))
        const archive = path.resolve(root, manifest.localOriginals)
        assert.ok(archive.startsWith(`${path.resolve(root)}${path.sep}`))
        const originalNames = (await readdir(archive, { withFileTypes: true }))
          .filter(entry => entry.isFile() && /\.(?:png|jpe?g|webp)$/i.test(entry.name) && !served.includes(entry.name)).map(entry => entry.name)
        assert.ok(originalNames.length > 0, 'Expected archived original image paths for leak checks')
        for (const file of originalNames) {
          const response = await context.request.get(`${report.url}/images/${encodeURIComponent(file)}`)
          assert.ok(!/^image\//i.test(response.headers()['content-type'] || ''), `Original image is publicly served: ${file}`)
          const metadata = await sharp(await response.body()).metadata().catch(() => null)
          assert.equal(metadata, null, `Original path returned decodable image data: ${file}`)
        }
        const deniedPrivateFiles = []
        for (const privatePath of ['/.screenshots.local/original-public/mower-light-source.png',
          '/运行日志-dark.png', '/.taste-skill/zoom/1440x900-100percent.png']) {
          const response = await context.request.get(new URL(privatePath, report.url).href)
          assert.equal(response.status(), 403, `Private source/artifact was not denied: ${privatePath}`)
          const metadata = await sharp(await response.body()).metadata().catch(() => null)
          assert.equal(metadata, null, `Private source/artifact returned image data: ${privatePath}`)
          deniedPrivateFiles.push({ path: privatePath, status: response.status(), contentType: response.headers()['content-type'] })
        }
        return { assets, checkedOriginalPaths: originalNames, deniedPrivateFiles,
          redactionEvidence: 'Generator report: zero pixel changes outside account ROI; not a second independent image-edit comparison.' }
      } finally { await context.close() }
    })

    const context = await contextFor(browser, {}, 'no-preference'), page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(report.url, { waitUntil: 'domcontentloaded' })
      await page.locator('.lens-cta').waitFor({ state: 'visible' })
      await check('Normal entrance keeps glass alive and accepts a trusted CTA click while fading in', async () => {
        const before = await page.evaluate(() => {
          const action = document.querySelector('.hero-action-row'), r = document.querySelector('.lens-cta').getBoundingClientRect()
          return { opacity: Number(getComputedStyle(action).opacity), center: { x: r.x+r.width/2, y: r.y+r.height/2 },
            lenses: [...document.querySelectorAll('.header-nav > .lg-canvas, .download > .lg-canvas')].map(canvas => ({ hidden: canvas.hidden, width: canvas.width, height: canvas.height })) }
        })
        assert.ok(before.opacity > 0 && before.opacity < 0.99, `Missed the entrance interaction interval: ${JSON.stringify(before)}`)
        assert.ok(before.lenses.length === 2 && before.lenses.every(canvas => !canvas.hidden && canvas.width > 0 && canvas.height > 0))
        await page.mouse.click(before.center.x, before.center.y)
        assert.ok(await page.evaluate(() => __showcase.trustedCTA > 0), 'Fading CTA did not receive the native click')
        await page.keyboard.press('Escape')
        return before
      })
      await ready(page)
      await page.waitForTimeout(3400)
      await check('Normal entrance changes opacity and position, then removes temporary inline styles', async () => {
        const state = await page.evaluate(() => ({ samples: __showcase.samples,
          header: { opacity: document.querySelector('.site-header-inner').style.opacity, top: document.querySelector('.site-header-inner').style.top },
          action: { opacity: document.querySelector('.hero-action-row').style.opacity, transform: document.querySelector('.hero-action-row').style.transform } }))
        assert.ok(state.samples.some(sample => sample.headerOpacity < 0.5) && state.samples.some(sample => sample.headerOpacity > 0.999))
        assert.ok(state.samples.some(sample => sample.actionOpacity < 0.5) && state.samples.some(sample => sample.actionOpacity > 0.999))
        assert.ok(Math.max(...state.samples.map(sample => sample.headerTop)) > 2 && Math.max(...state.samples.map(sample => sample.actionY)) > 2)
        assert.ok(state.samples.every(sample => sample.headerVisibility !== 'hidden' && sample.actionVisibility !== 'hidden' && sample.ctaInlineTransform === ''))
        assert.deepEqual(state.header, { opacity: '', top: '' })
        assert.deepEqual(state.action, { opacity: '', transform: '' })
        const renderers = await rendererState(page)
        assert.ok(renderers.retained)
        assert.equal(renderers.currentPrograms, renderers.initialPrograms)
        return { firstSamples: state.samples.slice(0, 4), sampleCount: state.samples.length, settledHeader: state.header, settledAction: state.action, renderers }
      })
      await check('Settled keyboard activation works; theme switch does not replay entrance or rebuild renderers', async () => {
        const before = await page.evaluate(() => __showcase.trustedCTA)
        await page.locator('.lens-cta').focus()
        await page.keyboard.press('Enter')
        assert.equal(await page.evaluate(() => __showcase.trustedCTA), before + 1)
        await page.keyboard.press('Escape')
        await setTheme(page, 'dark')
        const samples = []
        for (let frame = 0; frame < 4; frame++) {
          samples.push(await page.evaluate(() => ['.site-header-inner', '.hero-action-row'].map(selector => {
            const element = document.querySelector(selector), css = getComputedStyle(element)
            return { opacity: Number(css.opacity), top: element.style.top, transform: element.style.transform }
          })))
          await page.waitForTimeout(80)
        }
        assert.ok(samples.flat().every(sample => sample.opacity === 1 && !sample.top && !sample.transform), JSON.stringify(samples))
        const renderers = await rendererState(page)
        assert.ok(renderers.retained)
        assert.equal(renderers.currentPrograms, renderers.initialPrograms)
        assert.deepEqual(errors, [])
        return { samples, renderers, errors }
      })
    } finally { await context.close() }
  }

  for (const spec of specs) {
    const context = await contextFor(browser, spec), page = await context.newPage(), resources = [], errors = []
    page.on('response', response => { if (response.url().startsWith(report.url) && response.url().includes('/images/')) resources.push({ url: new URL(response.url()).pathname, status: response.status() }) })
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(report.url, { waitUntil: 'networkidle' })
      await ready(page)
      const alternateWarmedBeforeSwitch = resources.some(resource => /mower-screenshot-dark-clean(?:-960)?\.webp$/.test(resource.url) && resource.status === 200)
      for (const theme of ['light', 'dark']) await check(`${spec.name} ${theme}: matching images, yellow star, decorative input safety and one-screen layout`, async () => {
        await setTheme(page, theme)
        const state = await inspect(page, theme)
        await screenshot(page, `${spec.name}-${theme}`)
        const menu = previewOnly ? null : await checkMenu(page, theme, spec.name)
        const reduced = await page.evaluate(() => ['.site-header-inner', '.hero-action-row'].map(selector => {
          const element = document.querySelector(selector), css = getComputedStyle(element)
          return { opacity: Number(css.opacity), top: element.style.top, transform: element.style.transform }
        }))
        assert.ok(reduced.every(value => value.opacity === 1 && !value.top && !value.transform), 'Reduced-motion controls were animated')
        assert.deepEqual(errors, [])
        report.scenarios.push({ name: spec.name, theme, state, menu })
        return { state, menu, reduced }
      })
      await check(`${spec.name}: alternate preview is preloaded and reduced-motion renderers are retained`, async () => {
        assert.ok(alternateWarmedBeforeSwitch, 'Alternate theme preview was not loaded before the first theme switch')
        assert.ok(resources.some(resource => /mower-screenshot-dark-clean(?:-960)?\.webp$/.test(resource.url) && resource.status === 200))
        assert.ok(resources.some(resource => /mower-screenshot-light-clean(?:-960)?\.webp$/.test(resource.url) && resource.status === 200))
        const renderers = await rendererState(page)
        assert.ok(renderers.retained)
        assert.equal(renderers.currentPrograms, renderers.initialPrograms)
        return { alternateWarmedBeforeSwitch, resources, renderers }
      })
    } finally { await context.close() }
  }
} catch (error) { report.checks.push({ name: 'Verification setup', passed: false, error: error.stack || error.message }) }
finally { if (browser) await browser.close(); if (server) await server.close() }
report.passed = report.checks.filter(check => check.passed).length
report.failed = report.checks.filter(check => !check.passed).length
await writeFile(path.join(output, previewOnly ? 'preview-verification.json' : 'verification.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, failures: report.checks.filter(check => !check.passed), output }, null, 2))
process.exitCode = report.failed ? 1 : 0
