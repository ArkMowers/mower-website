import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect as playwrightExpect } from '@playwright/test'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const outputDirectory = path.join(root, '.taste-skill', 'operator-stage')
const expect = playwrightExpect.configure({ timeout: 15_000 })
const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 667, height: 375 },
]
const skins = ['default', 'holiday', 'autumn']
const skinNames = ['默认', '悠然假日 HD78', '秋高气爽']
const actions = [['闲置', 'Relax'], ['走动', 'Move'], ['互动', 'Interact'], ['坐下', 'Sit'], ['睡眠', 'Sleep']]
const summary = { browser: null, url: null, screenshots: [], checks: [], warnings: [] }
const pet = page => page.locator('button.operator-pet')
// Outside dismissal intentionally hides this control; retain the node for its closed-state assertion.
const menuTrigger = page => page.locator('button.operator-menu-trigger')
const menu = page => page.getByRole('dialog', { name: '但书动作与时装', exact: true })

async function openMenu(page) {
  if (!await menu(page).isVisible()) {
    await pet(page).hover()
    await menuTrigger(page).click()
  }
  await expect(menu(page)).toBeVisible()
  await expect(menuTrigger(page)).toHaveAttribute('aria-expanded', 'true')
}

async function closeMenu(page) {
  if (await menu(page).isVisible()) await page.keyboard.press('Escape')
  await expect(menu(page)).not.toBeVisible()
  await expect(menuTrigger(page)).toHaveAttribute('aria-expanded', 'false')
}

async function selectSkin(page, index) {
  await openMenu(page)
  await menu(page).getByRole('button', { name: skinNames[index], exact: true }).click()
  await expect(pet(page)).toHaveAttribute('data-skin', skins[index])
  await expect(pet(page)).not.toHaveAttribute('data-state', 'loading')
  if (await menu(page).isVisible()) {
    await expect(menu(page).getByRole('button', { name: skinNames[index], exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
  await closeMenu(page)
}

async function check(name, run) {
  const started = performance.now()
  try {
    const details = await run()
    summary.checks.push({ name, passed: true, durationMs: Math.round(performance.now() - started), ...details })
  } catch (error) {
    summary.checks.push({ name, passed: false, durationMs: Math.round(performance.now() - started), error: error.stack || error.message })
  }
}

async function newContext(browser, options = {}) {
  const { disableWebgl = false, deterministicMotion = false, ...browserOptions } = options
  const context = await browser.newContext({ reducedMotion: 'no-preference', ...browserOptions })
  // Keep unrelated network availability out of the locally bundled model checks.
  for (const pattern of ['https://api.github.com/**', 'https://img.shields.io/**']) {
    await context.route(pattern, route => route.fulfill({ status: 503, json: { message: 'Intentional offline validation' } }))
  }
  await context.addInitScript(({ disabled, deterministic }) => {
    if (deterministic) Math.random = () => 0.5
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (...args) {
      if (disabled && ['webgl', 'webgl2', 'experimental-webgl'].includes(args[0])) return null
      return original.apply(this, args)
    }
  }, { disabled: disableWebgl, deterministic: deterministicMotion })
  return context
}

function observeRuntime(page) {
  const errors = []
  const resources = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'warning') summary.warnings.push(message.text())
  })
  page.on('response', response => {
    if (!response.url().startsWith(summary.url)) return
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`)
    if (/\.(?:skel|atlas|png|webp)(?:\?|$)/.test(response.url())) {
      resources.push({ url: new URL(response.url()).pathname, status: response.status() })
    }
  })
  return { errors, resources }
}

async function openApp(page, state = 'ready') {
  await page.goto(summary.url, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Arknights Mower')
  await page.evaluate(() => document.fonts.ready)
  await expect(pet(page)).toHaveAttribute('data-state', state)
  await expect(pet(page)).toHaveAttribute('data-skin', 'default')
  if (await page.evaluate(() => !matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    await page.waitForTimeout(3400)
  }
}

async function screenshot(page, name) {
  const destination = path.join(outputDirectory, `${name}.png`)
  await page.screenshot({ path: destination, fullPage: true, animations: 'disabled' })
  summary.screenshots.push(destination)
}

async function boxes(page) {
  return page.evaluate(() => {
    const box = selector => {
      const element = document.querySelector(selector)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom }
    }
    return { pet: box('.operator-pet'), stage: box('.operator-stage'), window: box('.stage-window'),
      cta: box('.lens-cta'), channels: box('.hero-action-row .channel-bar'),
      available: document.documentElement.clientWidth, documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth }
  })
}

function assertContained(rect, bounds, label) {
  assert.ok(rect && bounds, `${label} is missing`)
  assert.ok(rect.x >= bounds.x - 2 && rect.right <= bounds.right + 2,
    `${label} exceeds its horizontal bounds: ${JSON.stringify({ rect, bounds })}`)
}

function overlap(a, b) {
  return a && b && Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1
    && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1
}

async function assertLayout(page) {
  await expect(pet(page)).toBeVisible()
  await expect(pet(page)).toHaveAccessibleName(/\S/)
  await expect(pet(page)).toHaveAttribute('type', 'button')
  const dimensions = await boxes(page)
  assert.ok(Math.max(dimensions.documentWidth, dimensions.bodyWidth) <= dimensions.available + 1,
    `Horizontal overflow: ${JSON.stringify(dimensions)}`)
  assertContained(dimensions.pet, dimensions.stage, 'Operator')
  assertContained(dimensions.pet, { x: 0, right: dimensions.available }, 'Operator in viewport')
  assert.ok(Math.abs(dimensions.pet.bottom - dimensions.window.y) <= 20,
    `Operator feet must meet the preview top edge: ${JSON.stringify(dimensions)}`)
  assert.ok(!overlap(dimensions.pet, dimensions.cta), `Operator overlaps download CTA: ${JSON.stringify(dimensions)}`)
  assert.ok(!overlap(dimensions.pet, dimensions.channels), `Operator overlaps channel controls: ${JSON.stringify(dimensions)}`)
  for (const control of [page.locator('.lens-cta'), page.locator('.hero-action-row .channel-bar')]) {
    if (!await control.count()) continue
    const hit = await control.evaluate(element => {
      const rect = element.getBoundingClientRect()
      if (rect.bottom <= 0 || rect.top >= innerHeight) return { inViewport: false, exposed: true }
      const topmost = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return { inViewport: true, exposed: topmost === element || element.contains(topmost), hitClass: topmost?.className }
    })
    assert.ok(hit.exposed, `Transparent operator track blocks a control: ${JSON.stringify(hit)}`)
  }
  return { dimensions }
}

async function verifyViewport(browser, viewport) {
  const context = await newContext(browser, { viewport })
  const page = await context.newPage()
  const runtime = observeRuntime(page)
  const label = `${viewport.width}×${viewport.height}`
  try {
    await openApp(page)
    await check(`${label}: operator placement and unobstructed accessible controls`, () => assertLayout(page))
    await check(`${label}: one bounded renderer for the operator and its effects`, async () => {
      const canvas = page.locator('canvas.operator-pet-canvas')
      await expect(canvas).toHaveCount(1)
      await expect(canvas).toBeVisible()
      const size = await canvas.evaluate(element => ({ width: element.width, height: element.height,
        cssWidth: element.getBoundingClientRect().width, cssHeight: element.getBoundingClientRect().height }))
      assert.ok(size.width > 0 && size.height > 0 && size.width <= Math.ceil(size.cssWidth * 2)
        && size.height <= Math.ceil(size.cssHeight * 2) && size.cssHeight <= 256,
      `Renderer should stay bounded to the activity track: ${JSON.stringify(size)}`)
      return { size }
    })
    await screenshot(page, `home-${viewport.width}x${viewport.height}`)
    await check(`${label}: keyboard activates a random action without changing its outfit`, async () => {
      await pet(page).focus()
      await expect(pet(page)).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(pet(page)).toHaveAttribute('data-skin', 'default')
      await expect(pet(page)).toHaveAttribute('data-action', /^(Relax|Move|Interact|Sit|Sleep)$/)
      await expect(pet(page)).toHaveAttribute('data-state', 'ready')
      await expect(menu(page)).not.toBeVisible()
      return { skin: await pet(page).getAttribute('data-skin'), action: await pet(page).getAttribute('data-action') }
    })
    await check(`${label}: hover reveals the menu and its panel stays inside the viewport`, async () => {
      await openMenu(page)
      const panel = await menu(page).boundingBox()
      assert.ok(panel && panel.x >= -1 && panel.y >= -1
        && panel.x + panel.width <= viewport.width + 1 && panel.y + panel.height <= viewport.height + 1,
      `Operator menu must fit the viewport: ${JSON.stringify({ panel, viewport })}`)
      await screenshot(page, `menu-${viewport.width}x${viewport.height}`)
      await closeMenu(page)
      return { panel }
    })
    await check(`${label}: no runtime errors or missing local model resources`, () => {
      assert.deepEqual(runtime.errors, [])
      return runtime
    })
  } finally {
    await context.close()
  }
}

async function verifySkinsAndReducedMotion(browser) {
  const context = await newContext(browser, { viewport: viewports[0], reducedMotion: 'reduce' })
  const page = await context.newPage()
  const runtime = observeRuntime(page)
  try {
    await openApp(page)
    await check('Reduced motion: still position, three distinct menu-selected outfits and an explicit keyboard action', async () => {
      await expect(pet(page)).toHaveAttribute('data-motion', 'reduced')
      const initial = await pet(page).boundingBox()
      await page.waitForTimeout(1200)
      const after = await pet(page).boundingBox()
      assert.ok(Math.abs(initial.x - after.x) <= 1, 'Reduced motion must disable automatic walking')
      const hashes = []
      const positions = []
      for (const [index, skin] of skins.entries()) {
        await selectSkin(page, index)
        await expect(pet(page)).toHaveAttribute('data-skin', skin)
        await expect(pet(page)).toHaveAttribute('data-state', 'ready')
        const canvas = page.locator('canvas.operator-pet-canvas')
        const image = await canvas.screenshot({ animations: 'disabled' })
        hashes.push(createHash('sha256').update(image).digest('hex'))
        positions.push(await pet(page).boundingBox())
        await screenshot(page, `skin-${skin}-1440x900`)
      }
      assert.equal(new Set(hashes).size, 3, 'Outfit changes must produce three different rendered images')
      for (const position of positions) {
        assert.ok(Math.abs(position.x - initial.x) <= 1, 'Changing outfit should retain the horizontal position')
        assert.ok(Math.abs(position.y + position.height - initial.y - initial.height) <= 2,
          'Changing outfit should retain the foot baseline')
      }
      await pet(page).focus()
      await page.keyboard.press('Space')
      await expect(pet(page)).toHaveAttribute('data-skin', 'autumn')
      await expect(pet(page)).toHaveAttribute('data-motion', 'reduced')
      await expect(pet(page)).toHaveAttribute('data-action', /^(Relax|Move|Interact|Sit|Sleep|Special)$/)
      await openMenu(page)
      await menu(page).getByRole('button', { name: '互动', exact: true }).click()
      await expect(pet(page)).toHaveAttribute('data-action', 'Interact')
      await expect(pet(page)).toHaveAttribute('data-skin', 'autumn')
      await closeMenu(page)
      assert.deepEqual(runtime.errors, [])
      return { hashes, positions, resources: runtime.resources }
    })
  } finally {
    await context.close()
  }
}

async function verifyMenu(browser) {
  const context = await newContext(browser, { viewport: viewports[0], deterministicMotion: true })
  const page = await context.newPage()
  const runtime = observeRuntime(page)
  try {
    await openApp(page)
    await check('Menu: hover access, keyboard navigation, Escape and outside dismissal', async () => {
      await pet(page).hover()
      await expect(menuTrigger(page)).toHaveAccessibleName('小人菜单')
      await expect.poll(() => menuTrigger(page).evaluate(element => {
        const style = getComputedStyle(element)
        return Number(style.opacity) > 0.99 && style.pointerEvents !== 'none'
      })).toBe(true)
      await menuTrigger(page).focus()
      await page.keyboard.press('Enter')
      await expect(menu(page)).toBeVisible()
      await expect(menuTrigger(page)).toHaveAttribute('aria-expanded', 'true')
      const focusInside = await menu(page).evaluate(element => element.contains(document.activeElement))
      assert.ok(focusInside, 'Opening the menu with a keyboard must focus its controls')
      await page.keyboard.press('Tab')
      assert.ok(await menu(page).evaluate(element => element.contains(document.activeElement)),
        'Menu controls must be reachable with Tab')
      await closeMenu(page)
      await expect(menuTrigger(page)).toBeFocused()
      await openMenu(page)
      await page.mouse.click(2, 2)
      await expect(menu(page)).not.toBeVisible()
      await expect(menuTrigger(page)).toHaveAttribute('aria-expanded', 'false')
      return { focusInside }
    })
    await check('Menu: each action plays on request, selected states are exposed and opening pauses travel', async () => {
      const selected = []
      for (const [name, action] of actions) {
        await openMenu(page)
        const activeAction = await pet(page).getAttribute('data-action')
        const activeLabel = actions.find(([, value]) => value === activeAction)?.[0]
        assert.ok(activeLabel, `Unknown action in menu: ${activeAction}`)
        await expect(menu(page).getByRole('button', { name: activeLabel, exact: true })).toHaveAttribute('aria-pressed', 'true')
        await menu(page).getByRole('button', { name, exact: true }).click()
        await expect(pet(page)).toHaveAttribute('data-action', action)
        await expect(menu(page)).not.toBeVisible()
        await expect(pet(page)).toHaveAttribute('data-skin', 'default')
        selected.push(await pet(page).getAttribute('data-action'))
      }
      await openMenu(page)
      await menu(page).getByRole('button', { name: '走动', exact: true }).click()
      await expect(pet(page)).toHaveAttribute('data-action', 'Move')
      await openMenu(page)
      const before = await pet(page).boundingBox()
      await page.waitForTimeout(1100)
      const after = await pet(page).boundingBox()
      assert.ok(Math.abs(before.x - after.x) <= 1, 'An open menu must stop horizontal travel')
      await closeMenu(page)
      await pet(page).click()
      await expect(pet(page)).toHaveAttribute('data-skin', 'default')
      await expect(pet(page)).toHaveAttribute('data-action', /^(Relax|Interact|Sit|Sleep)$/)
      assert.deepEqual(runtime.errors, [])
      return { selected, before, after, clickAction: await pet(page).getAttribute('data-action') }
    })
  } finally {
    await context.close()
  }

  const touchContext = await newContext(browser, { viewport: viewports[2], hasTouch: true, isMobile: true })
  const touchPage = await touchContext.newPage()
  try {
    await openApp(touchPage)
    await check('Touch: menu trigger remains visible without hover and actions/outfits can be selected', async () => {
      await expect.poll(() => menuTrigger(touchPage).evaluate(element => {
        const style = getComputedStyle(element)
        return Number(style.opacity) > 0.99 && style.pointerEvents !== 'none'
      })).toBe(true)
      await menuTrigger(touchPage).tap()
      await expect(menu(touchPage)).toBeVisible()
      await menu(touchPage).getByRole('button', { name: '秋高气爽', exact: true }).tap()
      await expect(pet(touchPage)).toHaveAttribute('data-skin', 'autumn')
      await expect(pet(touchPage)).toHaveAttribute('data-state', 'ready')
      await menuTrigger(touchPage).tap()
      await menu(touchPage).getByRole('button', { name: '坐下', exact: true }).tap()
      await expect(pet(touchPage)).toHaveAttribute('data-action', 'Sit')
      await pet(touchPage).tap()
      await expect(pet(touchPage)).toHaveAttribute('data-skin', 'autumn')
      await expect(pet(touchPage)).not.toHaveAttribute('data-action', 'Sit')
      await screenshot(touchPage, 'touch-menu-390x844')
      return { skin: await pet(touchPage).getAttribute('data-skin') }
    })
  } finally {
    await touchContext.close()
  }
}

async function verifySpecialActions(browser) {
  const context = await newContext(browser, { viewport: viewports[0], reducedMotion: 'reduce', deterministicMotion: true })
  const page = await context.newPage()
  const runtime = observeRuntime(page)
  const specialButton = currentPage => menu(currentPage).getByRole('button', { name: '特殊动作', exact: true })
  try {
    await openApp(page)
    await check('Special: default outfit exposes only its five playable actions', async () => {
      await openMenu(page)
      for (const [name] of actions) await expect(menu(page).getByRole('button', { name, exact: true })).toBeEnabled()
      await expect(specialButton(page)).toHaveCount(0)
      await closeMenu(page)
    })
    for (const [index, duration] of [[1, 12.233], [2, 8.133]]) {
      await check(`Special: ${skinNames[index]} plays its entire one-shot animation and returns to idle`, async () => {
        await selectSkin(page, index)
        await openMenu(page)
        await expect(specialButton(page)).toBeEnabled()
        const started = performance.now()
        await specialButton(page).click()
        await expect(menu(page)).not.toBeVisible()
        await expect(pet(page)).toHaveAttribute('data-action', 'Special')
        await expect(pet(page)).toHaveAttribute('data-motion', 'reduced')
        await page.waitForTimeout(duration * 850)
        await expect(pet(page)).toHaveAttribute('data-action', 'Special')
        await expect(pet(page)).toHaveAttribute('data-action', 'Relax', { timeout: Math.ceil(duration * 500 + 5000) })
        const elapsedMs = performance.now() - started
        assert.ok(elapsedMs >= duration * 950, `The ${duration}s special animation ended early: ${elapsedMs}ms`)
        await page.waitForTimeout(400)
        await expect(pet(page)).toHaveAttribute('data-action', 'Relax')
        return { skin: skins[index], expectedDurationSeconds: duration, elapsedMs: Math.round(elapsedMs) }
      })
      await check(`Special: ordinary clicks can select the extra action on ${skinNames[index]}`, async () => {
        await page.evaluate(() => { Math.random = () => 0.999 })
        await pet(page).click()
        await expect(pet(page)).toHaveAttribute('data-action', 'Special')
        await expect(pet(page)).toHaveAttribute('data-skin', skins[index])
        await pet(page).click()
        await expect(pet(page)).not.toHaveAttribute('data-action', 'Special')
        await page.evaluate(() => { Math.random = () => 0.5 })
        return { skin: skins[index] }
      })
    }
    await check('Special: returning to the default outfit removes the extra action and its click candidate', async () => {
      await selectSkin(page, 0)
      await openMenu(page)
      await expect(specialButton(page)).toHaveCount(0)
      await closeMenu(page)
      await page.evaluate(() => { Math.random = () => 0.999 })
      await pet(page).click()
      await expect(pet(page)).toHaveAttribute('data-action', /^(Relax|Interact|Sit|Sleep)$/)
      await expect(pet(page)).toHaveAttribute('data-skin', 'default')
      assert.deepEqual(runtime.errors, [])
      return { clickAction: await pet(page).getAttribute('data-action'), resources: runtime.resources }
    })
  } finally {
    await context.close()
  }

  for (const viewport of [viewports[2], viewports[3]]) {
    const touchContext = await newContext(browser, { viewport, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
    const touchPage = await touchContext.newPage()
    const touchRuntime = observeRuntime(touchPage)
    try {
      await openApp(touchPage)
      await check(`Special touch ${viewport.width}px: persistent menu button, complete accessible menu and explicit playback`, async () => {
        assert.ok(await touchPage.evaluate(() => matchMedia('(hover: none)').matches && matchMedia('(pointer: coarse)').matches),
          'This validation must use a touch device without hover')
        await expect.poll(() => menuTrigger(touchPage).evaluate(element => {
          const style = getComputedStyle(element)
          return Number(style.opacity) > 0.99 && style.pointerEvents !== 'none'
        })).toBe(true)
        const trigger = await menuTrigger(touchPage).boundingBox()
        assert.ok(trigger && trigger.width >= 36 && trigger.height >= 36,
          `Touch menu trigger is smaller than its intended target: ${JSON.stringify(trigger)}`)
        await menuTrigger(touchPage).tap()
        await expect(menu(touchPage)).toBeVisible()
        await menu(touchPage).getByRole('button', { name: '秋高气爽', exact: true }).tap()
        await expect(pet(touchPage)).toHaveAttribute('data-skin', 'autumn')
        await expect(pet(touchPage)).toHaveAttribute('data-state', 'ready')
        await menuTrigger(touchPage).tap()
        await expect(specialButton(touchPage)).toBeEnabled()
        const panel = await menu(touchPage).boundingBox()
        assert.ok(panel && panel.x >= -1 && panel.y >= -1
          && panel.x + panel.width <= viewport.width + 1 && panel.y + panel.height <= viewport.height + 1,
        `Special-action menu must fit the touch viewport: ${JSON.stringify({ panel, viewport })}`)
        const scrollport = await menu(touchPage).evaluate(element => ({
          clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
          overflowY: getComputedStyle(element).overflowY,
        }))
        await screenshot(touchPage, `special-menu-mobile-${viewport.width}x${viewport.height}`)
        for (const label of [...actions.map(([name]) => name), '特殊动作', ...skinNames]) {
          const control = menu(touchPage).getByRole('button', { name: label, exact: true })
          await expect(control).toBeVisible()
          // Short screens intentionally constrain the popover to a scrollport.
          await control.scrollIntoViewIfNeeded()
          const exposed = await control.evaluate(element => {
            const rect = element.getBoundingClientRect()
            const topmost = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
            return topmost === element || element.contains(topmost)
          })
          assert.ok(exposed, `Touch menu control cannot receive a tap: ${label}`)
        }
        await specialButton(touchPage).tap()
        await expect(menu(touchPage)).not.toBeVisible()
        await expect(pet(touchPage)).toHaveAttribute('data-action', 'Special')
        await touchPage.waitForTimeout(1100)
        await screenshot(touchPage, `special-frame-mobile-${viewport.width}x${viewport.height}`)
        await expect.poll(() => menuTrigger(touchPage).evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1)
        assert.deepEqual(touchRuntime.errors, [])
        return { trigger, panel, scrollport, skin: await pet(touchPage).getAttribute('data-skin'), action: await pet(touchPage).getAttribute('data-action') }
      })
    } finally {
      await touchContext.close()
    }
  }
}

async function verifyMotion(browser) {
  const context = await newContext(browser, { viewport: viewports[0], deterministicMotion: true })
  const page = await context.newPage()
  const runtime = observeRuntime(page)
  try {
    await openApp(page)
    await check('Walking: visible movement, bounded speed, resize containment and hidden-tab pause', async () => {
      await expect(pet(page)).toHaveAttribute('data-motion', 'running')
      await expect(pet(page)).toHaveAttribute('data-action', 'Move', { timeout: 20_000 })
      const samples = []
      for (let index = 0; index < 12; index += 1) {
        const sample = await boxes(page)
        assertContained(sample.pet, sample.stage, 'Walking operator')
        samples.push({ time: performance.now(), x: sample.pet.x, action: await pet(page).getAttribute('data-action') })
        await page.waitForTimeout(120)
      }
      const moving = samples.slice(1).map((sample, index) => ({
        speed: Math.abs(sample.x - samples[index].x) / ((sample.time - samples[index].time) / 1000),
        distance: Math.abs(sample.x - samples[index].x),
      }))
      assert.ok(moving.some(sample => sample.speed >= 5), `Move animation must actually translate the character: ${JSON.stringify(samples)}`)
      assert.ok(moving.every(sample => sample.speed <= 140), `Walking should stay gentle: ${JSON.stringify(moving)}`)
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await expect(pet(page)).toHaveAttribute('data-motion', 'paused')
      const pausedBefore = await pet(page).boundingBox()
      await page.waitForTimeout(700)
      const pausedAfter = await pet(page).boundingBox()
      assert.ok(Math.abs(pausedBefore.x - pausedAfter.x) <= 1, 'Hidden documents must stop movement')
      await page.evaluate(() => {
        delete document.visibilityState
        delete document.hidden
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await expect(pet(page)).toHaveAttribute('data-motion', 'running')
      await page.setViewportSize(viewports[3])
      await page.waitForTimeout(300)
      const resized = await assertLayout(page)
      await screenshot(page, 'walking-resized-320x568')
      assert.deepEqual(runtime.errors, [])
      return { samples, moving, pausedBefore, pausedAfter, resized }
    })
  } finally {
    await context.close()
  }
}

async function verifyWebglFallback(browser) {
  const context = await newContext(browser, { viewport: viewports[0], reducedMotion: 'reduce', disableWebgl: true })
  const page = await context.newPage()
  const runtime = observeRuntime(page)
  try {
    await openApp(page, 'fallback')
    await check('WebGL unavailable: menu selects three local posters while unavailable actions stay disabled', async () => {
      const sources = []
      for (const [index, skin] of skins.entries()) {
        await selectSkin(page, index)
        await expect(pet(page)).toHaveAttribute('data-skin', skin)
        await expect(pet(page)).toHaveAttribute('data-state', 'fallback')
        const poster = page.locator('.operator-pet-poster')
        await expect(poster).toBeVisible()
        await expect(poster).toHaveJSProperty('complete', true)
        const image = await poster.evaluate(element => ({ src: element.currentSrc,
          width: element.naturalWidth, height: element.naturalHeight }))
        assert.ok(image.width > 0 && image.height > 0, `Fallback poster did not load: ${JSON.stringify(image)}`)
        sources.push(image.src)
        await assertLayout(page)
        await screenshot(page, `fallback-${skin}-1440x900`)
        await openMenu(page)
        for (const [name] of actions) {
          await expect(menu(page).getByRole('button', { name, exact: true })).toBeDisabled()
        }
        await closeMenu(page)
        await pet(page).click()
        await expect(pet(page)).toHaveAttribute('data-skin', skin)
      }
      assert.equal(new Set(sources).size, 3, 'Each fallback outfit needs its own local poster')
      assert.deepEqual(runtime.errors, [])
      return { sources, resources: runtime.resources }
    })
  } finally {
    await context.close()
  }
}

let server
let browser
try {
  await mkdir(outputDirectory, { recursive: true })
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
  if (process.argv.includes('--special-only')) {
    await verifySpecialActions(browser)
  } else if (process.argv.includes('--fallback-only')) {
    await verifyWebglFallback(browser)
  } else if (process.argv.includes('--motion-only')) {
    await verifyMotion(browser)
  } else if (process.argv.includes('--menu-only')) {
    await verifyMenu(browser)
  } else {
    for (const viewport of viewports) await verifyViewport(browser, viewport)
    await verifySkinsAndReducedMotion(browser)
    await verifyMenu(browser)
    await verifySpecialActions(browser)
    await verifyMotion(browser)
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
const reportFile = process.argv.includes('--special-only') ? 'special-verification.json'
  : process.argv.includes('--fallback-only') ? 'fallback-verification.json'
  : process.argv.includes('--motion-only') ? 'motion-verification.json'
    : process.argv.includes('--menu-only') ? 'menu-verification.json' : 'verification.json'
await writeFile(path.join(outputDirectory, reportFile), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed,
  failures: summary.checks.filter(result => !result.passed), warnings: [...new Set(summary.warnings)],
  screenshots: summary.screenshots }, null, 2))
process.exitCode = summary.failed ? 1 : 0
