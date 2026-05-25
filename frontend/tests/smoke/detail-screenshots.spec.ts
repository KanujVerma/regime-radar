import { test } from '@playwright/test'
import { fileURLToPath } from 'url'
import path from 'path'

const OUT = path.resolve(fileURLToPath(import.meta.url), '../../../../docs/screenshots')

test('detail: signal breakdown wide', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const modelDone = page.waitForResponse(r => r.url().includes('/model-drivers') && r.status() === 200, { timeout: 15_000 })
  const stateDone = page.waitForResponse(r => r.url().includes('/current-state') && r.status() === 200, { timeout: 15_000 })
  await page.goto('/model-drivers')
  await Promise.all([modelDone, stateDone])
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/model-drivers-wide.png`, fullPage: true })
})

test('detail: event-replay wide', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const done = page.waitForResponse(r => r.url().includes('/event-replay') && r.status() === 200, { timeout: 15_000 })
  await page.goto('/event-replay')
  await done
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/event-replay-wide.png`, fullPage: false })
})
