import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect as playwrightExpect } from '@playwright/test'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../', import.meta.url))
const previewUrl = process.env.MOWER_PREVIEW_URL || 'http://127.0.0.1:5180'
const outputDirectory = path.join(root, '.taste-skill', process.env.MOWER_VERIFY_DIRECTORY || 'refinement')
const scope = process.env.MOWER_VERIFY_SCOPE || 'all'
const themeKey = 'mower-theme'
const releaseApi = 'https://api.github.com/repos/ArkMowers/arknights-mower/releases?per_page=100'
const releasesUrl = 'https://github.com/ArkMowers/arknights-mower/releases'
const expect = playwrightExpect.configure({ timeout: 10_000 })
const viewports = [
  { width: 1440, height: 900 }, { width: 1366, height: 768 },
  { width: 768, height: 1024 }, { width: 390, height: 844 },
  { width: 375, height: 667 }, { width: 320, height: 568 },
  { width: 844, height: 390 }, { width: 667, height: 375 },
]
const summary = { url: previewUrl, scope, browser: null, screenshots: [], checks: [] }

async function check(name, run) {
  const started = performance.now()
  try {
    const details = await run()
    summary.checks.push({ name, passed: true, durationMs: Math.round(performance.now() - started), ...details })
    return true
  } catch (error) {
    summary.checks.push({ name, passed: false, durationMs: Math.round(performance.now() - started), error: error.message })
    return false
  }
}

async function launchBrowser() {
  if (process.env.MOWER_BROWSER_EXECUTABLE) {
    summary.browser = process.env.MOWER_BROWSER_EXECUTABLE
    return chromium.launch({ executablePath: process.env.MOWER_BROWSER_EXECUTABLE, headless: true })
  }
  summary.browser = 'msedge'
  return chromium.launch({ channel: 'msedge', headless: true })
}

async function appContext(browser, options) {
  const context = await browser.newContext(options)
  await context.route(releaseApi, route => route.fulfill({ json: releaseFixtures }))
  return context
}

function observeRuntime(page) {
  const errors = []
  const origin = new URL(previewUrl).origin
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => {
    if (response.url().startsWith(origin) && response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`)
  })
  page.on('requestfailed', request => {
    if (request.url().startsWith(origin)) errors.push(`${request.failure()?.errorText} ${request.url()}`)
  })
  return errors
}

const downloadTrigger = page => page.getByRole('link', { name: '下载 Mower', exact: true })
const platformSelector = page => page.getByRole('combobox', { name: '下载平台', exact: true })

async function assertSelectedPlatformFits(page) {
  const dimensions = await platformSelector(page).evaluate(element => {
    const style = getComputedStyle(element)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const selected = element.selectedOptions[0].textContent
    return { selected, textWidth: context.measureText(selected).width,
      availableWidth: element.getBoundingClientRect().width - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
        - Number.parseFloat(style.borderLeftWidth) - Number.parseFloat(style.borderRightWidth) }
  })
  assert.ok(dimensions.textWidth <= dimensions.availableWidth + 1, `Selected platform name is clipped: ${JSON.stringify(dimensions)}`)
  return dimensions
}
async function assertFixedAppearance(page) {
  await expect(page.getByRole('combobox', { name: '页面主题' })).toHaveCount(0)
  await expect(page.locator('.theme-control')).toHaveCount(0)
  await expect(page.getByLabel(/^(亮色模式|暗色模式|跟随系统)$/)).toHaveCount(0)
  const images = page.locator('main figure img')
  await expect(images).toHaveCount(2)
  for (const theme of ['light', 'dark']) {
    const image = page.locator(`main figure img[src*="mower-${theme}-"]`)
    await expect(image).toHaveJSProperty('complete', true)
    assert.ok(await image.evaluate(element => element.naturalWidth > 0), `${theme} product screenshot failed to load`)
  }
  const style = await page.locator('html').evaluate(element => {
    const computed = getComputedStyle(element)
    const shell = getComputedStyle(document.querySelector('.site-shell'))
    return { colorScheme: computed.colorScheme, background: computed.backgroundColor, color: computed.color,
      shellBackground: shell.backgroundColor, shellImage: shell.backgroundImage,
      screenshots: [...document.querySelectorAll('main figure img')].map(image => image.currentSrc),
      dataTheme: element.dataset.theme ?? null,
      tokens: ['--background', '--foreground', '--primary', '--stage'].map(key => [key, computed.getPropertyValue(key).trim()]) }
  })
  return style
}

async function openApp(page) {
  await page.goto(previewUrl, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { level: 1 }).waitFor()
  await page.evaluate(() => document.fonts.ready)
  await assertFixedAppearance(page)
}

async function assertNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: innerWidth, viewportHeight: innerHeight,
    availableWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
    documentHeight: document.documentElement.scrollHeight, bodyHeight: document.body.scrollHeight,
  }))
  assert.ok(Math.max(dimensions.documentWidth, dimensions.bodyWidth) <= dimensions.availableWidth + 1,
    `Horizontal page overflow: ${JSON.stringify(dimensions)}`)
  return dimensions
}

async function assertReachable(locator, label, minimumTarget = 44) {
  await expect(locator, `${label} must be visible`).toBeVisible()
  const geometry = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      receivesPointer: target === element || element.contains(target) }
  })
  assert.ok(geometry.x >= -1 && geometry.y >= -1
    && geometry.x + geometry.width <= geometry.viewportWidth + 1
    && geometry.y + geometry.height <= geometry.viewportHeight + 1,
  `${label} is clipped or outside the viewport: ${JSON.stringify(geometry)}`)
  assert.ok(geometry.width >= minimumTarget - 0.5 && geometry.height >= minimumTarget - 0.5,
    `${label} target is smaller than ${minimumTarget}×${minimumTarget}px: ${JSON.stringify(geometry)}`)
  assert.ok(geometry.receivesPointer, `${label} is obscured at its center`)
}

async function assertControls(page) {
  await assertReachable(downloadTrigger(page), 'Download CTA')
  await assertReachable(platformSelector(page), 'Download platform selector')
  await assertReachable(page.getByRole('button', { name: '放大软件截图', exact: true }), 'Screenshot preview trigger')
  const headerControls = page.locator('header a[href], header button, header select')
  for (let index = 0; index < await headerControls.count(); index += 1) {
    const control = headerControls.nth(index)
    if (await control.isVisible()) await assertReachable(control, await control.getAttribute('aria-label') || (await control.textContent())?.trim() || `Header control ${index + 1}`)
  }
}

async function assertConciseCopyAndComposite(page) {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Arknights Mower')
  await expect(page.locator('.hero-description')).toHaveText('明日方舟 长草助手')
  await expect(page.locator('.platform-note, .preview-caption, .download-status, .download-note')).toHaveCount(0)
  await expect(page.locator('main figcaption')).toHaveCount(0)
  const visibleParagraphs = await page.locator('main p').evaluateAll(elements => elements.filter(element => element.getClientRects().length).length)
  assert.equal(visibleParagraphs, 1, 'Unrequested supporting text remains on the page')
  const images = await page.locator('main figure img').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return { source: element.getAttribute('src'), mask: style.maskImage, x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }))
  const masks = await page.locator('main figure *').evaluateAll(elements => elements.map(element => ({
    className: element.className, mask: getComputedStyle(element).maskImage,
  })).filter(element => element.mask.includes('gradient')))
  assert.ok(masks.length > 0, 'The light/dark screenshots have no CSS blend mask')
  // Preserve each original's intrinsic ratio; the two optimized rasters can
  // differ by a pixel in height. Their crop position and width must agree.
  for (const property of ['x', 'y', 'width']) assert.ok(Math.abs(images[0][property] - images[1][property]) <= 1,
    `Original screenshot layers are not aligned: ${JSON.stringify(images)}`)
  const placement = await page.locator('main').evaluate(element => {
    const title = element.querySelector('h1').getBoundingClientRect()
    const picture = element.querySelector('.product-image').getBoundingClientRect()
    return { titleTop: title.top, pictureBottom: picture.bottom }
  })
  assert.ok(placement.titleTop >= placement.pictureBottom - 1, `The title does not follow the picture: ${JSON.stringify(placement)}`)
  return { screenshotLayers: images, masks, placement, sceneMask: await assertSceneMask(page) }
}

async function assertSceneMask(page) {
  const read = () => page.locator('main .screenshot-cutout').evaluate(frame => {
    const scene = frame.closest('.site-shell')
    const mask = getComputedStyle(frame.querySelector('.screenshot-theme-dark'))
    const frameRect = frame.getBoundingClientRect()
    const sceneRect = scene.getBoundingClientRect()
    const size = mask.maskSize.split(/\s+/).map(Number.parseFloat)
    const position = mask.maskPosition.split(/\s+/).map(Number.parseFloat)
    return { image: mask.maskImage, size, position, expectedSize: [scene.clientWidth, scene.clientHeight],
      expectedPosition: [sceneRect.left - frameRect.left, sceneRect.top - frameRect.top] }
  })
  await expect.poll(async () => {
    const metrics = await read()
    return metrics.size.every((value, index) => Math.abs(value - metrics.expectedSize[index]) <= 1)
      && metrics.position.every((value, index) => Math.abs(value - metrics.expectedPosition[index]) <= 2)
  }, { message: 'Screenshot mask does not share the page canvas dimensions and origin' }).toBe(true)
  const metrics = await read()
  assert.match(metrics.image, /radial-gradient/)
  return metrics
}

async function assertGreenScreenCropped(locator) {
  const { data, info } = await sharp(await locator.screenshot({ animations: 'disabled' })).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let greenPixels = 0
  let sampledPixels = 0
  // Check displayed frame edges, excluding rounded corners and real UI content.
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const perimeter = (y < 3 || y >= info.height - 3) && x >= 16 && x < info.width - 16
      || (x < 3 || x >= info.width - 3) && y >= 16 && y < info.height - 16
    if (!perimeter) continue
    const offset = (y * info.width + x) * info.channels
    const [red, green, blue] = data.subarray(offset, offset + 3)
    if (red < 70 && green > 180 && blue < 70) greenPixels += 1
    sampledPixels += 1
  }
  assert.ok(greenPixels <= 2, `Green-screen pixels remain at frame edges: ${greenPixels}/${sampledPixels}`)
  return { edgePixelsChecked: sampledPixels }
}

function luminance(rgb) {
  const linear = rgb.map(value => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

async function verifyRenderedContrast(page) {
  const text = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')
    return Array.from(document.querySelectorAll('.brand-name, header .nav-link, .hero-title, .hero-description'))
      .filter(element => element.getClientRects().length)
      .map(element => {
        const style = getComputedStyle(element)
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = style.color
        context.fillRect(0, 0, 1, 1)
        const color = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
        const range = document.createRange()
        range.selectNodeContents(element)
        const rect = element.textContent.trim() ? range.getBoundingClientRect() : element.getBoundingClientRect()
        // Outside the actual glyph bounds, so measurements see the rendered
        // atmospheric background rather than text antialiasing or an ancestor.
        const points = [
          { x: rect.left + 2, y: rect.top - 4 },
          { x: (rect.left + rect.right) / 2, y: rect.top - 4 },
          { x: rect.right - 2, y: rect.top - 4 },
          { x: rect.left - 4, y: (rect.top + rect.bottom) / 2 },
          { x: rect.right + 4, y: (rect.top + rect.bottom) / 2 },
        ].filter(point => point.x >= 0 && point.y >= 0 && point.x < innerWidth && point.y < innerHeight)
        const fontSize = Number.parseFloat(style.fontSize)
        const fontWeight = Number.parseFloat(style.fontWeight)
        return { label: element.textContent.trim() || element.getAttribute('aria-label'), color, points,
          threshold: fontSize >= 24 || fontSize >= 18.66 && fontWeight >= 700 ? 3 : 4.5 }
      })
  })
  const { data, info } = await sharp(await page.screenshot({ animations: 'disabled' })).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return text.map(item => {
    const foreground = luminance(item.color)
    const samples = item.points.map(point => {
      const x = Math.round(point.x)
      const y = Math.round(point.y)
      const offset = (y * info.width + x) * info.channels
      const color = Array.from(data.subarray(offset, offset + 3))
      const background = luminance(color)
      return { x, y, color, contrast: Number(((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)).toFixed(2)) }
    })
    assert.ok(samples.every(sample => sample.contrast >= item.threshold),
      `Rendered text contrast is low: ${JSON.stringify({ label: item.label, threshold: item.threshold, samples })}`)
    return { label: item.label, threshold: item.threshold, foreground: item.color, samples }
  })
}

async function assertFocusTrap(page, dialog) {
  const focusIsInside = () => dialog.evaluate(element => element.contains(document.activeElement))
  await expect.poll(focusIsInside).toBe(true)
  for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key)
    assert.ok(await focusIsInside(), `Dialog focus escaped after ${key}`)
  }
}

async function verifyScreenshotDialog(page) {
  const trigger = page.getByRole('button', { name: '放大软件截图', exact: true })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Mower 运行界面', exact: true })
  await expect(dialog).toBeVisible()
  await assertReachable(dialog.getByRole('button', { name: '关闭', exact: true }), 'Preview close button')
  const images = dialog.locator('img')
  await expect(images).toHaveCount(1)
  await expect(images).toHaveAttribute('src', /mower-light-source\.png(?:\?.*)?$/)
  await expect(images).toHaveJSProperty('complete', true)
  assert.ok(await images.evaluate(element => element.naturalWidth > 0), 'Original preview image failed to load')
  await assertGreenScreenCropped(dialog.locator('.dialog-screenshot'))
  await assertFocusTrap(page, dialog)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
}

async function capture(page, name) {
  const filename = path.join(outputDirectory, `${name}.png`)
  await page.screenshot({ path: filename, fullPage: true, animations: 'disabled' })
  summary.screenshots.push(filename)
}

async function verifyViewport(browser, viewport, theme) {
  const name = `${viewport.width}×${viewport.height}, ${theme}`
  const context = await appContext(browser, { viewport, colorScheme: theme, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = observeRuntime(page)
  try {
    if (!await check(`${name}: unified page loads`, () => openApp(page))) return
    await check(`${name}: layout, touch targets and complete screenshot`, async () => {
      const dimensions = await assertNoHorizontalOverflow(page)
      await assertControls(page)
      const composite = await assertConciseCopyAndComposite(page)
      const headline = await page.locator('h1, .title-line').evaluateAll(elements => elements.map(element => ({
        text: element.textContent, width: element.clientWidth, contentWidth: element.scrollWidth,
      })))
      assert.ok(headline.every(line => line.contentWidth <= line.width + 1), `Headline text is clipped: ${JSON.stringify(headline)}`)
      await assertReachable(page.locator('.product-image'), 'Complete screenshot frame', 0)
      return { dimensions, ...composite, ...await assertGreenScreenCropped(page.locator('.product-image')) }
    })
    if (viewport.width === 320 || viewport.width === 390) await check(`${name}: every selected platform label fits`, async () => {
      const original = await platformSelector(page).inputValue()
      const labels = []
      try {
        for (const [choice] of directChoices) {
          await platformSelector(page).selectOption(choice)
          labels.push(await assertSelectedPlatformFits(page))
        }
      } finally { await platformSelector(page).selectOption(original) }
      return { labels }
    })
    const captureName = viewport.width === 2560 ? 'wide' : viewport.width === 1440 ? 'desktop' : viewport.width === 1366 ? 'laptop' : viewport.width === 768 ? 'tablet' : viewport.width === 390 ? 'mobile' : viewport.width === 320 ? 'small-phone' : null
    if (captureName) await check(`${name}: screenshot`, () => capture(page, viewport.width === 2560 ? 'wide' : `${captureName}-${theme}`))
    if (captureName && theme === 'light') await check(`${name}: rendered text contrast on atmospheric background`, async () => ({ text: await verifyRenderedContrast(page) }))
    await check(`${name}: keyboard screenshot dialog`, () => verifyScreenshotDialog(page, theme))
    await check(`${name}: runtime and local assets`, async () => assert.deepEqual(errors, []))
  } finally {
    await context.close()
  }
}

async function setStorage(context, value) {
  await context.addInitScript(({ key, value }) => {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  }, { key: themeKey, value })
}

async function verifyUnifiedAppearance(browser) {
  let baseline
  for (const systemTheme of ['light', 'dark']) for (const storedValue of [null, 'system', 'light', 'dark', 'invalid-theme']) {
    const context = await appContext(browser, { viewport: { width: 1366, height: 768 }, colorScheme: systemTheme, reducedMotion: 'reduce' })
    await setStorage(context, storedValue)
    const page = await context.newPage()
    const errors = observeRuntime(page)
    try {
      await check('Unified appearance: OS ' + systemTheme + ', saved ' + (storedValue ?? 'none') + ', reload and live OS change', async () => {
        await openApp(page)
        const appearance = await assertFixedAppearance(page)
        baseline ??= appearance
        assert.deepEqual(appearance, baseline, 'OS or legacy storage changed the unified design')
        await page.reload({ waitUntil: 'networkidle' })
        assert.deepEqual(await assertFixedAppearance(page), baseline, 'Reload changed the unified design')
        await page.emulateMedia({ colorScheme: systemTheme === 'light' ? 'dark' : 'light' })
        assert.deepEqual(await assertFixedAppearance(page), baseline, 'Live OS switch changed the unified design')
        assert.deepEqual(errors, [])
      })
    } finally {
      await context.close()
    }
  }
}

async function verifyUnavailableStorage(browser) {
  const context = await appContext(browser, { viewport: { width: 1366, height: 768 }, colorScheme: 'dark', reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage disabled', 'SecurityError') } })
  })
  const page = await context.newPage()
  const errors = observeRuntime(page)
  try {
    await check('Unified appearance: unavailable browser storage has no effect', async () => {
      await openApp(page)
      const baseline = await assertFixedAppearance(page)
      await page.emulateMedia({ colorScheme: 'light' })
      assert.deepEqual(await assertFixedAppearance(page), baseline)
      assert.deepEqual(errors, [])
    })
  } finally {
    await context.close()
  }
}

function releaseFixture(tag, timestamp, names) {
  return { id: tag, tag_name: tag, html_url: `${releasesUrl}/tag/${tag}`,
    published_at: timestamp, prerelease: true, draft: false,
    assets: names.map((suffix, index) => {
      const filename = `arknights-mower_${tag.slice(1)}_${suffix}`
      return { id: `${tag}-${index}`, name: filename, size: 132 * 1024 * 1024,
        browser_download_url: `${releasesUrl}/download/${tag}/${filename}` }
    }) }
}
// Real naming and availability, intentionally supplied out of date order.
const releaseFixtures = [
  releaseFixture('v4.1.6-alpha.11', '2026-10-09T05:24:54Z', ['windows_x64.zip', 'macos_arm64.dmg', 'macos_x64.dmg', 'linux_x64.tar.gz', 'linux_arm64.tar.gz', 'android_arm64.zip']),
  releaseFixture('v4.1.6-alpha.12', '2026-10-10T11:12:05Z', ['windows_x64.zip', 'macos_arm64.dmg', 'linux_x64.tar.gz', 'linux_arm64.tar.gz', 'android_arm64.zip']),
]

const androidApk = 'https://github.com/ALEXsun0/arknights-mower-android/releases/download/v0.2.19/arknights-mower-android-v0.2.19-arm64.apk'
const directChoices = [
  ['windows-x64', 'v4.1.6-alpha.12', 'windows_x64.zip'],
  ['macos-arm64', 'v4.1.6-alpha.12', 'macos_arm64.dmg'],
  ['macos-x64', 'v4.1.6-alpha.11', 'macos_x64.dmg'],
  ['linux-x64', 'v4.1.6-alpha.12', 'linux_x64.tar.gz'],
  ['linux-arm64', 'v4.1.6-alpha.12', 'linux_arm64.tar.gz'],
  ['android-arm64-update', 'v4.1.6-alpha.12', 'android_arm64.zip'],
  ['android-apk', null, null],
]

async function verifyDirectChoices(page) {
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '下载 Mower', exact: true })).toHaveCount(0)
  for (const [choice, tag, suffix] of directChoices) {
    await platformSelector(page).selectOption(choice)
    await assertSelectedPlatformFits(page)
    const href = tag ? releasesUrl + '/download/' + tag + '/arknights-mower_' + tag.slice(1) + '_' + suffix : androidApk
    await expect(downloadTrigger(page)).toHaveAttribute('href', href)
    assert.equal(await downloadTrigger(page).getAttribute('target'), null, 'Download opens an unnecessary popup')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
}

async function verifyDownloads(browser) {
  for (const fail of [false, true]) {
    const context = await appContext(browser, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    await context.route(releaseApi, route => fail ? route.abort('failed') : route.fulfill({ json: releaseFixtures }))
    const page = await context.newPage()
    try {
      await check(fail ? 'Direct downloads: offline metadata preserves usable verified packages' : 'Direct downloads: every platform and architecture has a direct package URL', async () => {
        await openApp(page)
        await verifyDirectChoices(page)
        if (fail) await expect(page.locator('.download-control [role="status"]')).toContainText('暂时无法检查更新')
        await platformSelector(page).selectOption('windows-x64')
        const href = await downloadTrigger(page).getAttribute('href')
        await page.route(href, route => route.fulfill({ contentType: 'text/html', body: '<p>Local verification of direct download navigation</p>' }))
        let popups = 0
        page.on('popup', () => { popups += 1 })
        await downloadTrigger(page).click()
        await expect(page).toHaveURL(href)
        assert.equal(popups, 0, 'Download opened a popup')
      })
    } finally { await context.close() }
  }

  const context = await appContext(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  let releaseMetadata
  const metadataReady = new Promise(resolve => { releaseMetadata = resolve })
  const future = releaseFixture('v4.1.6-alpha.13', '2026-10-12T12:00:00Z', ['windows_arm64.zip', 'android_arm64.apk'])
  future.assets[1].name = 'Mower_arm64.apk'
  future.assets[1].browser_download_url = releasesUrl + '/download/v4.1.6-alpha.13/Mower_arm64.apk'
  await context.route(releaseApi, async route => { await metadataReady; await route.fulfill({ json: [future] }) })
  const page = await context.newPage()
  try {
    await check('Direct downloads: available while updating; new packages replace metadata without discarding known platforms', async () => {
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded' })
      await platformSelector(page).waitFor()
      await expect(page.locator('.download-control [role="status"]')).toContainText('正在后台检查更新')
      await platformSelector(page).selectOption('macos-x64')
      await expect(downloadTrigger(page)).toHaveAttribute('href', releasesUrl + '/download/v4.1.6-alpha.11/arknights-mower_4.1.6-alpha.11_macos_x64.dmg')
      releaseMetadata()
      await expect(platformSelector(page).locator('option[value="windows-arm64"]')).toHaveCount(1)
      await platformSelector(page).selectOption('windows-arm64')
      await expect(downloadTrigger(page)).toHaveAttribute('href', future.assets[0].browser_download_url)
      await platformSelector(page).selectOption('android-apk')
      await expect(downloadTrigger(page)).toHaveAttribute('href', future.assets[1].browser_download_url)
      await platformSelector(page).selectOption('macos-x64')
      await expect(downloadTrigger(page)).toHaveAttribute('href', releasesUrl + '/download/v4.1.6-alpha.11/arknights-mower_4.1.6-alpha.11_macos_x64.dmg')
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })
  } finally { releaseMetadata(); await context.close() }
}

async function verifyTabOrder(browser) {
  const context = await appContext(browser, { viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    await openApp(page)
    await check('Keyboard: Tab reaches native platform selector, download, docs and image preview', async () => {
      const targets = [platformSelector(page), downloadTrigger(page), page.getByRole('link', { name: '使用文档', exact: true }),
        page.getByRole('button', { name: '放大软件截图', exact: true })]
      const reached = new Set()
      for (let step = 0; step < 20 && reached.size < targets.length; step += 1) {
        await page.keyboard.press('Tab')
        for (let index = 0; index < targets.length; index += 1) if (await targets[index].evaluate(element => element === document.activeElement)) {
          reached.add(index)
          await assertReachable(targets[index], `Keyboard destination ${index + 1}`)
        }
      }
      assert.equal(reached.size, targets.length, `Tab reached ${reached.size}/${targets.length} destinations`)
    })
  } finally {
    await context.close()
  }
}

async function verifyReducedMotion(browser) {
  const context = await appContext(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    await openApp(page)
    await check('Reduced motion: content and artwork have no sustained animation', async () => {
      const elements = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(element => element.getClientRects().length).map(element => {
        const style = getComputedStyle(element)
        const seconds = value => value.split(',').map(part => Number.parseFloat(part) * (part.trim().endsWith('ms') ? 0.001 : 1))
        return { tag: element.tagName, className: element.className.baseVal ?? element.className,
          animation: style.animationName, duration: seconds(style.animationDuration), delay: seconds(style.animationDelay),
          iterations: style.animationIterationCount, transition: seconds(style.transitionDuration) }
      }))
      for (const element of elements) {
        assert.ok(element.animation === 'none' || Math.max(...element.duration) <= 0.02
          && Math.max(...element.delay) <= 0.02 && element.iterations !== 'infinite', `Sustained animation: ${JSON.stringify(element)}`)
        assert.ok(Math.max(...element.transition) <= 0.02, `Long reduced-motion transition: ${JSON.stringify(element)}`)
      }
      return { elementsChecked: elements.length }
    })
  } finally {
    await context.close()
  }
}

async function verifySustainedMotion(browser) {
  const context = await appContext(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  try {
    await openApp(page)
    await check('Ambient light keeps moving after entrance, pauses in a hidden tab, and resumes', async () => {
      await page.waitForTimeout(3000)
      const lightStates = () => page.locator('.ambient-light > *, main .screenshot-theme-dark').evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element)
        return { className: element.className, iterations: style.animationIterationCount, state: style.animationPlayState,
          transform: style.transform, opacity: style.opacity }
      }).filter(item => item.iterations.includes('infinite')))
      const before = await lightStates()
      assert.ok(before.length > 0, 'Only entrance animations remain; atmospheric light stopped')
      assert.ok(before.every(item => item.state.split(',').every(state => state.trim() === 'running')))
      await page.waitForTimeout(800)
      const after = await lightStates()
      assert.ok(after.some((item, index) => item.transform !== before[index].transform || item.opacity !== before[index].opacity),
        'Ambient animation runs in CSS but does not change visible transform or opacity')
      const wrapperBefore = before.find(item => item.className === 'screenshot-theme-dark')
      const wrapperAfter = after.find(item => item.className === 'screenshot-theme-dark')
      assert.ok(wrapperBefore && wrapperAfter, 'The screenshot mask wrapper has no sustained animation')
      assert.notEqual(wrapperBefore.opacity, wrapperAfter.opacity, 'The screenshot mask wrapper opacity remains static')
      const mask = await page.locator('main .screenshot-theme-dark').evaluate(element => {
        const style = getComputedStyle(element)
        const scene = element.closest('.site-shell')
        return { size: style.maskSize.split(/\s+/).map(Number.parseFloat), position: style.maskPosition.split(/\s+/).map(Number.parseFloat),
          sceneSize: [scene.clientWidth, scene.clientHeight], image: style.maskImage }
      })
      assert.deepEqual(mask.size, mask.sceneSize, 'Animated screenshot mask loses the page-sized canvas')
      assert.ok(mask.position.every(Number.isFinite))
      assert.match(mask.image, /radial-gradient/)
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await expect(page.locator('.site-shell')).toHaveAttribute('data-motion', 'paused')
      assert.ok((await lightStates()).every(item => item.state.split(',').every(state => state.trim() === 'paused')),
        'Atmospheric light does not pause when the visibility listener reports a hidden tab')
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await expect(page.locator('.site-shell')).toHaveAttribute('data-motion', 'running')
      assert.ok((await lightStates()).every(item => item.state.split(',').every(state => state.trim() === 'running')))
      return { loopsChecked: before.length, wrapperOpacity: [wrapperBefore.opacity, wrapperAfter.opacity], mask,
        visibilitySimulation: 'Standard visibilitychange listener with hidden/visible document state' }
    })
  } finally { await context.close() }
}

async function verifyFavicon(browser) {
  const context = await appContext(browser, { reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    await openApp(page)
    await check('Favicon is a transparent SVG with no rectangular backing', async () => {
      const faviconHref = await page.locator('link[rel="icon"]').getAttribute('href')
      assert.match(new URL(faviconHref, previewUrl).pathname, /\.svg$/)
      const response = await page.request.get(new URL(faviconHref, previewUrl).href)
      assert.ok(response.ok())
      const source = await response.text()
      assert.match(source, /<svg\b/)
      assert.doesNotMatch(source, /<rect\b/)
      const alpha = await page.evaluate(async href => {
        const icon = new Image()
        icon.src = href
        await icon.decode()
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 64
        const context = canvas.getContext('2d')
        context.drawImage(icon, 0, 0, 64, 64)
        return [[0, 0], [63, 0], [0, 63], [63, 63], [4, 4], [59, 4], [4, 59], [59, 59]]
          .map(([x, y]) => ({ x, y, alpha: context.getImageData(x, y, 1, 1).data[3] }))
      }, faviconHref)
      assert.ok(alpha.every(point => point.alpha === 0), `Favicon backing is opaque: ${JSON.stringify(alpha)}`)
      return { cornerAlpha: alpha }
    })
  } finally { await context.close() }
}

async function verifyShortViewports(browser) {
  for (const viewport of [{ width: 390, height: 420 }, { width: 683, height: 384 }, { width: 320, height: 240 }]) {
    const context = await appContext(browser, { viewport, reducedMotion: 'reduce' })
    const page = await context.newPage()
    try {
      await openApp(page)
      await check(`Short/zoom ${viewport.width}×${viewport.height}: controls reachable`, async () => {
        for (const target of [platformSelector(page), downloadTrigger(page), page.getByRole('link', { name: '使用文档', exact: true }),
          page.getByRole('button', { name: '放大软件截图', exact: true })]) {
          await target.scrollIntoViewIfNeeded()
          await assertReachable(target, 'Short viewport control')
        }
        return { dimensions: await assertNoHorizontalOverflow(page), verticalScrollAllowed: true }
      })
      await check(`Short/zoom ${viewport.width}×${viewport.height}: preview usable`, () => verifyScreenshotDialog(page, 'light'))
    } finally {
      await context.close()
    }
  }
}

async function verifyMaskResize(browser) {
  const context = await appContext(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    await openApp(page)
    await check('Page-aligned screenshot mask follows live viewport changes', async () => {
      const samples = []
      for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 667, height: 375 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(viewport)
        samples.push({ viewport, ...await assertSceneMask(page) })
      }
      return { samples }
    })
  } finally { await context.close() }
}

let browser
try {
  await mkdir(outputDirectory, { recursive: true })
  browser = await launchBrowser()
  if (scope === 'final-details') {
    await verifyViewport(browser, { width: 2560, height: 1187 }, 'light')
    await verifyReducedMotion(browser)
    await verifySustainedMotion(browser)
  } else {
    for (const viewport of viewports) await verifyViewport(browser, viewport, 'light')
    if (scope === 'all') {
    await verifyUnifiedAppearance(browser)
    await verifyUnavailableStorage(browser)
    await verifyDownloads(browser)
    await verifyTabOrder(browser)
    await verifyReducedMotion(browser)
    await verifySustainedMotion(browser)
    }
    await verifyFavicon(browser)
    await verifyShortViewports(browser)
    await verifyMaskResize(browser)
  }
} catch (error) {
  summary.checks.push({ name: 'Browser validation setup', passed: false, error: error.message })
} finally {
  if (browser) await browser.close()
}
summary.passed = summary.checks.filter(result => result.passed).length
summary.failed = summary.checks.filter(result => !result.passed).length
await writeFile(path.join(outputDirectory, scope === 'final-details' ? 'final-details.json' : 'verification.json'), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify(summary, null, 2))
process.exitCode = summary.failed ? 1 : 0
