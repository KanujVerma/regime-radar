import { chromium } from '../frontend/node_modules/playwright/index.mjs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCREENSHOTS_DIR = resolve(__dirname, '../docs/screenshots')
const BASE_URL = 'http://localhost:5173'
const VIEWPORT = { width: 1280, height: 820 }

async function screenshot(page, outPath, url, readySelector) {
  await page.goto(`${BASE_URL}${url}`, { waitUntil: 'networkidle' })
  // Wait for the specific content element to confirm the page has rendered
  await page.waitForSelector(readySelector, { timeout: 20_000 })
  // Allow charts and framer-motion animations to settle
  await page.waitForTimeout(2000)
  await page.screenshot({ path: outPath, fullPage: false })
  console.log(`✓  ${outPath}`)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: VIEWPORT })
const page = await ctx.newPage()

// Prime the app: load root so React + router initialises
await page.goto(BASE_URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)

await screenshot(
  page,
  `${SCREENSHOTS_DIR}/current-state.png`,
  '/current-state',
  'text=Current State',
)

await screenshot(
  page,
  `${SCREENSHOTS_DIR}/model-drivers.png`,
  '/model-drivers',
  'text=Model Drivers',
)

await browser.close()
console.log('Done.')
