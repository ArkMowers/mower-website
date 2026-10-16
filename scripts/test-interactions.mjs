import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

async function run() {
  const server = await createServer({
    root,
    server: { port: 5180, host: '127.0.0.1' },
  })
  await server.listen()
  const port = server.config.server.port || 5180
  const url = `http://127.0.0.1:${port}`

  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

  console.log(`Navigating to ${url}...`)
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  // 1. Open Database modal
  const dbBtn = await page.$('.btn-database')
  if (dbBtn) {
    await dbBtn.click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(root, 'dist', 'mower-db-modal.png') })
    console.log('Saved dist/mower-db-modal.png')
    // Close modal by clicking close btn
    const closeBtn = await page.$('.modal-close-btn')
    if (closeBtn) await closeBtn.click()
    await page.waitForTimeout(300)
  }

  // 2. Open Add Task modal
  const addBtn = await page.$('.btn-add-task')
  if (addBtn) {
    await addBtn.click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(root, 'dist', 'mower-add-task.png') })
    console.log('Saved dist/mower-add-task.png')
    const closeBtn = await page.$('.modal-close-btn')
    if (closeBtn) await closeBtn.click()
    await page.waitForTimeout(300)
  }

  // 3. Click AI tab
  const aiTab = await page.$('.sidebar-nav-item:has-text("Mower AI")')
  if (aiTab) {
    await aiTab.click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(root, 'dist', 'mower-ai-tab.png') })
    console.log('Saved dist/mower-ai-tab.png')
  }

  // 4. Click Settings tab
  const settingsTab = await page.$('.sidebar-nav-item:has-text("全部设置")')
  if (settingsTab) {
    await settingsTab.click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(root, 'dist', 'mower-settings-tab.png') })
    console.log('Saved dist/mower-settings-tab.png')
  }

  await browser.close()
  await server.close()
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
