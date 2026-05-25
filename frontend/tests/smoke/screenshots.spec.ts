import { test } from '@playwright/test'
import { fileURLToPath } from 'url'
import path from 'path'

const OUT = path.resolve(fileURLToPath(import.meta.url), '../../../../docs/screenshots')

test('screenshot: current-state', async ({ page }) => {
  const done = page.waitForResponse(
    r => r.url().includes('/current-state') && r.status() === 200,
    { timeout: 15_000 },
  )
  await page.goto('/')
  await done
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/current-state.png`, fullPage: true })
})

test('screenshot: history', async ({ page }) => {
  const done = page.waitForResponse(
    r => r.url().includes('/historical-state') && r.status() === 200,
    { timeout: 15_000 },
  )
  await page.goto('/history')
  await done
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/history.png`, fullPage: true })
})

test('screenshot: event-replay', async ({ page }) => {
  const done = page.waitForResponse(
    r => r.url().includes('/event-replay') && r.status() === 200,
    { timeout: 15_000 },
  )
  await page.goto('/event-replay')
  await done
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/event-replay.png`, fullPage: true })
})

test('screenshot: model-drivers', async ({ page }) => {
  const modelDone = page.waitForResponse(
    r => r.url().includes('/model-drivers') && r.status() === 200,
    { timeout: 15_000 },
  )
  const stateDone = page.waitForResponse(
    r => r.url().includes('/current-state') && r.status() === 200,
    { timeout: 15_000 },
  )
  await page.goto('/model-drivers')
  await Promise.all([modelDone, stateDone])
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/model-drivers.png`, fullPage: true })
})

test('screenshot: scenario-explorer', async ({ page }) => {
  const done = page.waitForResponse(
    r => r.url().includes('/scenario') && r.status() === 200,
    { timeout: 15_000 },
  )
  await page.goto('/scenario')
  await done
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/scenario-explorer.png`, fullPage: true })
})
