// Screenshot script — run with: node scripts/take-screenshots.js
const { chromium } = require('/Users/kanuj/regime-radar/frontend/node_modules/@playwright/test')
const path = require('path')

const BASE = 'http://localhost:5175'
const OUT = path.join(__dirname, '..', 'docs', 'screenshots')

async function waitForNoSpinner(page) {
  // Give animations and data fetches time to settle
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()

  // ── Current State ──────────────────────────────────────────────────────────
  console.log('📸 current-state...')
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await waitForNoSpinner(page)
  await page.screenshot({ path: `${OUT}/current-state.png`, fullPage: false })

  // ── History ────────────────────────────────────────────────────────────────
  console.log('📸 history...')
  await page.goto(`${BASE}/history`, { waitUntil: 'networkidle' })
  await waitForNoSpinner(page)
  await page.screenshot({ path: `${OUT}/history.png`, fullPage: false })

  // ── Event Replay ───────────────────────────────────────────────────────────
  console.log('📸 event-replay...')
  await page.goto(`${BASE}/event-replay`, { waitUntil: 'networkidle' })
  await waitForNoSpinner(page)
  await page.screenshot({ path: `${OUT}/event-replay.png`, fullPage: false })

  // ── Signal Breakdown (Model Drivers) ──────────────────────────────────────
  console.log('📸 signal-breakdown (model-drivers)...')
  await page.goto(`${BASE}/model-drivers`, { waitUntil: 'networkidle' })
  await waitForNoSpinner(page)
  await page.screenshot({ path: `${OUT}/model-drivers.png`, fullPage: false })

  // ── Scenario Explorer — Crisis Peak ────────────────────────────────────────
  console.log('📸 scenario-explorer (Crisis Peak)...')
  await page.goto(`${BASE}/scenario`, { waitUntil: 'networkidle' })
  await waitForNoSpinner(page)

  // Click Crisis Peak preset
  const crisisPeak = page.locator('text=Crisis Peak')
  if (await crisisPeak.isVisible()) {
    await crisisPeak.click()
    await page.waitForTimeout(1500) // let driver cards animate in
  } else {
    console.warn('  ⚠ Crisis Peak button not found — falling back to default state')
  }

  await page.screenshot({ path: `${OUT}/scenario-explorer.png`, fullPage: false })

  await browser.close()
  console.log('✅ All screenshots saved to docs/screenshots/')
})()
