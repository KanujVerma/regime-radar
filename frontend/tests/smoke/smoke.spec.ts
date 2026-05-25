/**
 * Smoke tests — verify every page loads real data and core UI elements render.
 * Requires: `npm run dev` (port 5173) + API backend (port 8000) both running.
 */
import { test, expect, type Page } from '@playwright/test'

const API = 'http://localhost:8000'

// ─── helpers ────────────────────────────────────────────────────────────────

/** Wait until the page has no "Loading…" spinner visible */
async function waitForLoad(page: Page) {
  await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 20_000 })
}

// ─── API health ──────────────────────────────────────────────────────────────

test.describe('API health', () => {
  test('GET /current-state returns 200 with regime field', async ({ request }) => {
    const res = await request.get(`${API}/current-state`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('regime')
    expect(body).toHaveProperty('transition_risk')
    expect(typeof body.transition_risk).toBe('number')
  })

  test('GET /historical-state returns 200 with data array', async ({ request }) => {
    const res = await request.get(`${API}/historical-state?start=2023-01-01`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data[0]).toHaveProperty('date')
    expect(body.data[0]).toHaveProperty('transition_risk')
  })

  test('GET /event-replay/financial_crisis_2008 returns 200 with data', async ({ request }) => {
    const res = await request.get(`${API}/event-replay/financial_crisis_2008`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('event_name')
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
  })

  test('GET /event-replay/covid_2020 returns 200', async ({ request }) => {
    const res = await request.get(`${API}/event-replay/covid_2020`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.data.length).toBeGreaterThan(0)
  })

  test('GET /event-replay/tightening_2022 returns 200', async ({ request }) => {
    const res = await request.get(`${API}/event-replay/tightening_2022`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.data.length).toBeGreaterThan(0)
  })

  test('GET /model-drivers returns 200 with global_importance', async ({ request }) => {
    const res = await request.get(`${API}/model-drivers`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.global_importance)).toBe(true)
    expect(body.global_importance.length).toBeGreaterThan(0)
    expect(body.global_importance[0]).toHaveProperty('feature')
    expect(body.global_importance[0]).toHaveProperty('importance')
  })

  test('POST /scenario returns baseline_risk and scenario_risk', async ({ request }) => {
    const res = await request.post(`${API}/scenario`, {
      data: {
        vix_level: 18, vix_chg_5d: 0, rv_20d_pct: 0.40,
        drawdown_pct_504d: 0.05, ret_20d: 0.01, dist_sma50: 0.01,
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('baseline_risk')
    expect(body).toHaveProperty('scenario_risk')
    expect(body).toHaveProperty('prob_calm')
    expect(body).toHaveProperty('prob_turbulent')
    expect(typeof body.baseline_risk).toBe('number')
    expect(typeof body.scenario_risk).toBe('number')
  })

  test('POST /scenario stress preset returns higher turbulent prob than calm preset', async ({ request }) => {
    const [calm, stress] = await Promise.all([
      request.post(`${API}/scenario`, {
        data: { vix_level: 13, vix_chg_5d: -1.0, rv_20d_pct: 0.20, drawdown_pct_504d: 0.02, ret_20d: 0.03, dist_sma50: 0.02, days_in_regime_lag1: 60, turbulent_count_30d_lag1: 0 },
      }),
      request.post(`${API}/scenario`, {
        data: { vix_level: 45, vix_chg_5d: 10.0, rv_20d_pct: 0.95, drawdown_pct_504d: 0.70, ret_20d: -0.15, dist_sma50: -0.10, days_in_regime_lag1: 2, turbulent_count_30d_lag1: 3 },
      }),
    ])
    const cBody = await calm.json()
    const sBody = await stress.json()
    expect(sBody.prob_turbulent).toBeGreaterThan(cBody.prob_turbulent)
  })
})

// ─── Navigation ──────────────────────────────────────────────────────────────

test.describe('Navigation', () => {
  test('sidebar renders all 5 nav items', async ({ page }) => {
    await page.goto('/')
    // Use getByRole('link') to avoid strict-mode violations from nested spans
    await expect(page.getByRole('link', { name: 'Current State' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'History' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Event Replay' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Signal Breakdown' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Scenario Explorer' })).toBeVisible()
  })

  test('sidebar brand shows RegimeRadar', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('RegimeRadar')).toBeVisible()
  })

  test('clicking History nav navigates to /history', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'History' }).click()
    await expect(page).toHaveURL(/\/history/)
  })

  test('clicking Event Replay nav navigates to /event-replay', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Event Replay' }).click()
    await expect(page).toHaveURL(/\/event-replay/)
  })

  test('clicking Signal Breakdown nav navigates to /model-drivers', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Signal Breakdown' }).click()
    await expect(page).toHaveURL(/\/model-drivers/)
  })

  test('clicking Scenario Explorer nav navigates to /scenario', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Scenario Explorer' }).click()
    await expect(page).toHaveURL(/\/scenario/)
  })
})

// ─── Current State page ──────────────────────────────────────────────────────

test.describe('Current State page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForLoad(page)
  })

  test('renders page title', async ({ page }) => {
    await expect(page.getByText('Current State').first()).toBeVisible()
  })

  test('regime value is shown on the page', async ({ page }) => {
    // Regime is displayed as a hero value (Calm / Elevated / Turbulent), not under a "Market Regime" label
    const regimeValues = page.locator('text=/^(Calm|Elevated|Turbulent)$/i')
    await expect(regimeValues.first()).toBeVisible()
  })

  test('Transition Risk card shows a percentage', async ({ page }) => {
    await expect(page.getByText('Transition Risk').first()).toBeVisible()
  })

  test('VIX Level card renders', async ({ page }) => {
    await expect(page.getByText('VIX Level').first()).toBeVisible()
  })

  test('Trend card renders', async ({ page }) => {
    await expect(page.getByText('Trend').first()).toBeVisible()
  })

  test('"What this means right now" panel renders', async ({ page }) => {
    await expect(page.getByText('What this means right now')).toBeVisible()
  })

  test('Transition risk gauge SVG renders', async ({ page }) => {
    await expect(page.getByText('Transition risk gauge')).toBeVisible()
    await expect(page.locator('svg').first()).toBeVisible()
  })

  test('"What is raising risk right now" panel renders driver bars', async ({ page }) => {
    await expect(page.getByText('What is raising risk right now')).toBeVisible()
  })

  test('"Last 30 Trading Days" panel renders with a chart', async ({ page }) => {
    const panelTitle = page.getByText('Last 30 Trading Days')
    await expect(panelTitle).toBeVisible()
    const panel = panelTitle.locator('..')
    await expect(panel.locator('svg').first()).toBeVisible()
  })

  test('Refresh button works without error', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i }).first()
    await expect(refreshBtn).toBeVisible()
    await refreshBtn.click()
    await expect(page.locator('text=Error').first()).toHaveCount(0)
    await waitForLoad(page)
  })
})

// ─── History page ────────────────────────────────────────────────────────────

test.describe('History page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/history')
    await waitForLoad(page)
  })

  test('renders History page title', async ({ page }) => {
    await expect(page.getByText('History').first()).toBeVisible()
  })

  test('chart container renders', async ({ page }) => {
    await expect(page.locator('.recharts-responsive-container, svg').first()).toBeVisible()
  })

  test('threshold labels visible on chart', async ({ page }) => {
    await expect(page.getByText(/Watch/)).toBeVisible()
    await expect(page.getByText(/Alert/)).toBeVisible()
  })

  test('chart shell titles render for both linked charts', async ({ page }) => {
    await expect(page.getByText('Regime & SPY').first()).toBeVisible()
    await expect(page.getByText('Transition Risk').first()).toBeVisible()
  })
})

// ─── Event Replay page ───────────────────────────────────────────────────────

test.describe('Event Replay page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/event-replay')
    await waitForLoad(page)
  })

  test('renders Event Replay title', async ({ page }) => {
    await expect(page.getByText('Event Replay').first()).toBeVisible()
  })

  test('all three event tabs render', async ({ page }) => {
    await expect(page.getByRole('tab', { name: '2008 Financial Crisis' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'COVID-19 2020' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Rate Tightening 2022' })).toBeVisible()
  })

  test('2008 event loads live stat cards', async ({ page }) => {
    await expect(page.getByText('Days into event')).toBeVisible()
    await expect(page.getByText('Risk today')).toBeVisible()
    await expect(page.getByText('Peak risk so far')).toBeVisible()
    await expect(page.getByText('Alert days so far')).toBeVisible()
  })

  test('switching to COVID-19 2020 loads new data', async ({ page }) => {
    await page.getByRole('tab', { name: 'COVID-19 2020' }).click()
    await waitForLoad(page)
    await expect(page.getByText('Days into event')).toBeVisible()
    await expect(page.getByText('Peak risk so far')).toBeVisible()
  })

  test('switching to Rate Tightening 2022 loads new data', async ({ page }) => {
    await page.getByRole('tab', { name: 'Rate Tightening 2022' }).click()
    await waitForLoad(page)
    await expect(page.getByText('Days into event')).toBeVisible()
  })

  test('"What happened" panel renders with content', async ({ page }) => {
    await expect(page.getByText('What happened')).toBeVisible()
  })

  test('Takeaway panel renders with content', async ({ page }) => {
    await expect(page.getByText('Takeaway')).toBeVisible()
  })

  test('chart renders for selected event', async ({ page }) => {
    await expect(page.locator('.recharts-responsive-container, svg').first()).toBeVisible()
  })

  test('scrubber transport controls render', async ({ page }) => {
    await expect(page.getByRole('button', { name: /play|pause/i }).first()).toBeVisible()
  })
})

// ─── Model Drivers (Signal Breakdown) page ───────────────────────────────────

test.describe('Model Drivers page', () => {
  test.beforeEach(async ({ page }) => {
    // Page renders skeleton until BOTH /model-drivers and /current-state resolve
    const modelDone = page.waitForResponse(
      resp => resp.url().includes('/model-drivers') && resp.status() === 200,
      { timeout: 15_000 },
    )
    const stateDone = page.waitForResponse(
      resp => resp.url().includes('/current-state') && resp.status() === 200,
      { timeout: 15_000 },
    )
    await page.goto('/model-drivers')
    await Promise.all([modelDone, stateDone])
  })

  test('renders Signal Breakdown title', async ({ page }) => {
    await expect(page.getByText('Signal Breakdown').first()).toBeVisible()
  })

  test('"What always drives the model most" panel renders', async ({ page }) => {
    await expect(page.getByText('What always drives the model most')).toBeVisible()
  })

  test('"Why the model sees it this way today" panel renders', async ({ page }) => {
    await expect(page.getByText('Why the model sees it this way today')).toBeVisible()
  })

  test('driver bars render for at least one feature', async ({ page }) => {
    await expect(page.getByText(/VIX|Volatility|Drawdown|Return|Momentum/i).first()).toBeVisible()
  })
})

// ─── Scenario Explorer page ──────────────────────────────────────────────────

test.describe('Scenario Explorer page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/scenario')
    await waitForLoad(page)
  })

  test('renders Scenario Explorer title', async ({ page }) => {
    await expect(page.getByText('Scenario Explorer').first()).toBeVisible()
  })

  test('all 6 driver sliders render (Drivers section open by default)', async ({ page }) => {
    await expect(page.getByText('VIX Level')).toBeVisible()
    await expect(page.getByText('VIX 5-day Change')).toBeVisible()
    await expect(page.getByText('Realized Vol Percentile')).toBeVisible()
    await expect(page.getByText('Drawdown')).toBeVisible()
    await expect(page.getByText('20-day Return')).toBeVisible()
    await expect(page.getByText('Distance from SMA-50')).toBeVisible()
  })

  test('quick scenario presets render when section is opened', async ({ page }) => {
    await page.locator('button', { hasText: 'Quick Scenarios' }).click()
    await expect(page.getByText(/Calm Recovery/)).toBeVisible()
    await expect(page.getByText(/Panic Shock/)).toBeVisible()
    await expect(page.getByText(/Crisis Peak/)).toBeVisible()
  })

  test('Alert Threshold section renders metric cards when opened', async ({ page }) => {
    await page.locator('button', { hasText: 'Alert Threshold' }).click()
    await expect(page.getByText(/Crises caught|False alarms|Avg warning/i).first()).toBeVisible()
  })

  test('Regime probability tripod panel renders with Calm/Turbulent tiles', async ({ page }) => {
    await expect(page.getByText('Regime probability — current market → your scenario')).toBeVisible()
    await expect(page.getByText(/calm/i).first()).toBeVisible()
    await expect(page.getByText(/turbulent/i).first()).toBeVisible()
  })

  test('"What\'s driving this scenario" driver panel renders', async ({ page }) => {
    await expect(page.getByText("What's driving this scenario")).toBeVisible()
  })

  test('Calm Recovery preset updates values without error', async ({ page }) => {
    await page.locator('button', { hasText: 'Quick Scenarios' }).click()
    await page.getByText('🌤 Calm Recovery').click()
    await waitForLoad(page)
    await expect(page.locator('text=error', { exact: false }).first()).toHaveCount(0)
  })

  test('Panic Shock preset updates values without error', async ({ page }) => {
    await page.locator('button', { hasText: 'Quick Scenarios' }).click()
    await page.getByText('⚡ Panic Shock').click()
    await waitForLoad(page)
    await expect(page.getByText('Regime probability — current market → your scenario')).toBeVisible()
  })

  test('Crisis Peak preset updates values without error', async ({ page }) => {
    await page.locator('button', { hasText: 'Quick Scenarios' }).click()
    await page.getByText('🔴 Crisis Peak').click()
    await waitForLoad(page)
    await expect(page.getByText('Regime probability — current market → your scenario')).toBeVisible()
  })

  test('Crisis Peak preset renders tripod with Turbulent regime visible', async ({ page }) => {
    await page.locator('button', { hasText: 'Quick Scenarios' }).click()
    await page.getByText('🔴 Crisis Peak').click()
    await waitForLoad(page)
    await expect(page.getByText('Regime probability — current market → your scenario')).toBeVisible()
    await expect(page.getByText('Turbulent').first()).toBeVisible()
  })

  test('Reset to current market button works', async ({ page }) => {
    await page.locator('button', { hasText: 'Quick Scenarios' }).click()
    await page.getByText('🔴 Crisis Peak').click()
    await waitForLoad(page)
    await page.getByText('↺ Reset to current market').click()
    await waitForLoad(page)
    await expect(page.getByText('Regime probability — current market → your scenario')).toBeVisible()
  })

  test('preset chip strip is visible without opening any section', async ({ page }) => {
    const done = page.waitForResponse(
      r => r.url().includes('/scenario') && r.status() === 200,
      { timeout: 15_000 },
    )
    await page.goto('/scenario')
    await done
    await page.waitForTimeout(400)
    // Presets always visible — no section click required
    await expect(page.getByText('Calm Recovery')).toBeVisible()
    await expect(page.getByText('Volatility Pickup')).toBeVisible()
    await expect(page.getByText('Panic Shock')).toBeVisible()
  })

  test('customized indicator appears after clicking preset then moving a slider', async ({ page }) => {
    const done = page.waitForResponse(
      r => r.url().includes('/scenario') && r.status() === 200,
      { timeout: 15_000 },
    )
    await page.goto('/scenario')
    await done
    await page.waitForTimeout(400)
    await page.getByText('Calm Recovery').click()
    await page.waitForTimeout(400)
    await page.locator('input[type="range"]').first().evaluate((el: HTMLInputElement) => {
      el.value = String(parseFloat(el.max) * 0.8)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(400)
    await expect(page.getByText(/Modified from/)).toBeVisible()
  })

  test('inline "Reset to preset" button clears customized state', async ({ page }) => {
    const done = page.waitForResponse(
      r => r.url().includes('/scenario') && r.status() === 200,
      { timeout: 15_000 },
    )
    await page.goto('/scenario')
    await done
    await page.waitForTimeout(400)
    await page.getByText('Calm Recovery').click()
    await page.waitForTimeout(400)
    await page.locator('input[type="range"]').first().evaluate((el: HTMLInputElement) => {
      el.value = String(parseFloat(el.max) * 0.8)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(400)
    await expect(page.getByText(/Modified from/)).toBeVisible()
    await page.getByRole('button', { name: /reset to preset/i }).click()
    await page.waitForTimeout(300)
    await expect(page.getByText(/Modified from/)).not.toBeVisible()
  })

  test('Drivers section can be toggled collapsed and re-expanded', async ({ page }) => {
    const done = page.waitForResponse(
      r => r.url().includes('/scenario') && r.status() === 200,
      { timeout: 15_000 },
    )
    await page.goto('/scenario')
    await done
    await page.waitForTimeout(400)
    const driversBtn = page.getByRole('button', { name: /Drivers/i })
    // Drivers open by default on desktop viewport (1280px default)
    await expect(page.locator('input[type="range"]').first()).toBeVisible()
    await driversBtn.click()
    await page.waitForTimeout(250)
    await expect(driversBtn).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('input[type="range"]').first()).not.toBeVisible()
    await driversBtn.click()
    await page.waitForTimeout(250)
    await expect(driversBtn).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('input[type="range"]').first()).toBeVisible()
  })
})

// ─── No-error across all pages ───────────────────────────────────────────────

test.describe('No runtime errors across pages', () => {
  const pages = [
    { path: '/', name: 'Current State' },
    { path: '/history', name: 'History' },
    { path: '/event-replay', name: 'Event Replay' },
    { path: '/model-drivers', name: 'Model Drivers' },
    { path: '/scenario', name: 'Scenario Explorer' },
  ]

  for (const { path, name } of pages) {
    test(`${name} — no red error banner`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', err => errors.push(err.message))
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text())
      })

      await page.goto(path)
      await waitForLoad(page)

      const errDiv = page.locator('.text-red-400').first()
      const errVisible = await errDiv.isVisible().catch(() => false)
      expect(errVisible).toBe(false)
    })
  }
})
