import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

async function run() {
  const server = await createServer({
    root,
    server: { port: 5182, host: '127.0.0.1' },
  })
  await server.listen()
  const port = server.config.server.port || 5182
  const url = `http://127.0.0.1:${port}`

  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

  console.log(`Navigating to ${url}...`)
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  const heroShotPath = path.join(root, 'dist', 'hero-pristine-screenshot.png')
  await page.screenshot({ path: heroShotPath, fullPage: true })
  console.log(`Saved screenshot to ${heroShotPath}`)

  await browser.close()
  await server.close()
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
