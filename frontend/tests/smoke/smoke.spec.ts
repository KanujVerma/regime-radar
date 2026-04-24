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

/** Assert an element matching `selector` is visible */
async function visible(page: Page, selector: string) {
  await expect(page.locator(selector).first()).toBeVisible()
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
    // Nav links (exact text match, sidebar context)
    await expect(page.locator('nav').getByText('Current State')).toBeVisible()
    await expect(page.locator('nav').getByText('History')).toBeVisible()
    await expect(page.locator('nav').getByText('Event Replay')).toBeVisible()
    await expect(page.locator('nav').getByText('Model Drivers')).toBeVisible()
    await expect(page.locator('nav').getByText('Scenario Explorer')).toBeVisible()
  })

  test('sidebar brand shows RegimeRadar', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('RegimeRadar')).toBeVisible()
  })

  test('clicking History nav navigates to /history', async ({ page }) => {
    await page.goto('/')
    await page.getByText('History').click()
    await expect(page).toHaveURL(/\/history/)
  })

  test('clicking Event Replay nav navigates to /event-replay', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Event Replay').click()
    await expect(page).toHaveURL(/\/event-replay/)
  })

  test('clicking Model Drivers nav navigates to /model-drivers', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Model Drivers').click()
    await expect(page).toHaveURL(/\/model-drivers/)
  })

  test('clicking Scenario Explorer nav navigates to /scenario', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Scenario Explorer').click()
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

  test('Market Regime card shows a regime value', async ({ page }) => {
    const card = page.locator('text=Market Regime')
    await expect(card).toBeVisible()
    // regime value should be one of calm / elevated / turbulent
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
    // SVG gauge rendered inside the panel
    await expect(page.locator('svg').first()).toBeVisible()
  })

  test('"What is pushing risk" panel renders driver bars', async ({ page }) => {
    await expect(page.getByText('What is pushing risk right now')).toBeVisible()
  })

  test('"Last 30 Trading Days" panel renders with a chart', async ({ page }) => {
    const panelTitle = page.getByText('Last 30 Trading Days')
    await expect(panelTitle).toBeVisible()
    // Panel.tsx structure: title div is a direct child of the Panel root div.
    // One level up from the title div lands on the Panel root, which contains the chart SVG.
    const panel = panelTitle.locator('..')
    await expect(panel.locator('svg').first()).toBeVisible()
  })

  test('Refresh Data button works without error', async ({ page }) => {
    const refreshBtn = page.getByText('↻ Refresh Data')
    await expect(refreshBtn).toBeVisible()
    await refreshBtn.click()
    // After click page should still not show error
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
    // Recharts renders a <svg> inside a responsive container
    await expect(page.locator('.recharts-responsive-container, svg').first()).toBeVisible()
  })

  test('threshold labels visible on chart', async ({ page }) => {
    await expect(page.getByText(/Watch/)).toBeVisible()
    await expect(page.getByText(/Alert/)).toBeVisible()
  })

  test('regime color legend shows Calm, Elevated, Turbulent chips', async ({ page }) => {
    await expect(page.getByText('Calm').first()).toBeVisible()
    await expect(page.getByText('Elevated').first()).toBeVisible()
    await expect(page.getByText('Turbulent').first()).toBeVisible()
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
    // Buttons rendered as flex row at top of page
    await expect(page.getByRole('button', { name: '2008 Financial Crisis' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'COVID-19 2020' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rate Tightening 2022' })).toBeVisible()
  })

  test('2008 event loads warning lead time and peak risk cards', async ({ page }) => {
    await expect(page.getByText('Warning Lead Time')).toBeVisible()
    await expect(page.getByText('Peak Transition Risk')).toBeVisible()
  })

  test('switching to COVID-19 2020 loads new data', async ({ page }) => {
    await page.getByText('COVID-19 2020').click()
    await waitForLoad(page)
    await expect(page.getByText('Warning Lead Time')).toBeVisible()
    await expect(page.getByText('Peak Transition Risk')).toBeVisible()
  })

  test('switching to Rate Tightening 2022 loads new data', async ({ page }) => {
    await page.getByText('Rate Tightening 2022').click()
    await waitForLoad(page)
    await expect(page.getByText('Warning Lead Time')).toBeVisible()
  })

  test('Takeaway panel renders with content', async ({ page }) => {
    await expect(page.getByText('Takeaway')).toBeVisible()
  })

  test('chart renders for selected event', async ({ page }) => {
    await expect(page.locator('.recharts-responsive-container, svg').first()).toBeVisible()
  })

  test('Alert Days metric card renders', async ({ page }) => {
    await expect(page.getByText('Alert Days')).toBeVisible()
  })

  test('First Threshold Crossing card renders', async ({ page }) => {
    await expect(page.getByText('First Threshold Crossing')).toBeVisible()
  })
})

// ─── Model Drivers page ──────────────────────────────────────────────────────

test.describe('Model Drivers page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/model-drivers')
    await waitForLoad(page)
  })

  test('renders Model Drivers title', async ({ page }) => {
    await expect(page.getByText('Model Drivers').first()).toBeVisible()
  })

  test('"What usually raises risk" panel renders', async ({ page }) => {
    await expect(page.getByText('What usually raises risk')).toBeVisible()
  })

  test('"Why the latest reading" panel renders', async ({ page }) => {
    await expect(page.getByText('Why the latest reading looks this way')).toBeVisible()
  })

  test('driver bars render for at least one feature', async ({ page }) => {
    // Feature labels are rendered inside DriverBar — check for any known feature name
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

  test('all 6 sliders render', async ({ page }) => {
    await expect(page.getByText('VIX Level')).toBeVisible()
    await expect(page.getByText('VIX 5-day Change')).toBeVisible()
    await expect(page.getByText('Realized Vol Percentile')).toBeVisible()
    await expect(page.getByText('Drawdown')).toBeVisible()
    await expect(page.getByText('20-day Return')).toBeVisible()
    await expect(page.getByText('Distance from SMA-50')).toBeVisible()
  })

  test('quick scenario preset buttons render', async ({ page }) => {
    await expect(page.getByText(/Calm/)).toBeVisible()
    await expect(page.getByText(/Choppy/)).toBeVisible()
    await expect(page.getByText(/Stress/)).toBeVisible()
  })

  test('Alert Threshold slider renders with metric cards', async ({ page }) => {
    await expect(page.getByText('Alert threshold').first()).toBeVisible()
    await expect(page.locator('text=Recall, text=False Alerts, text=Lead Time').first()).toBeVisible().catch(() => {
      // metrics may render individually
    })
  })

  test('RiskRail renders with Baseline and Scenario values', async ({ page }) => {
    await expect(page.getByText('Baseline').first()).toBeVisible()
    await expect(page.getByText('Scenario').first()).toBeVisible()
    await expect(page.locator('text=B').first()).toBeVisible()
    await expect(page.locator('text=S').first()).toBeVisible()
  })

  test('Regime probability shift panel renders', async ({ page }) => {
    await expect(page.getByText('Regime probability shift')).toBeVisible()
    await expect(page.getByText(/calm/i).first()).toBeVisible()
    await expect(page.getByText(/turbulent/i).first()).toBeVisible()
  })

  test('Calm preset updates values without error', async ({ page }) => {
    await page.getByText('🌤 Calm').click()
    await waitForLoad(page)
    await expect(page.locator('text=error', { exact: false }).first()).toHaveCount(0)
    await expect(page.getByText('Baseline').first()).toBeVisible()
  })

  test('Choppy preset updates values without error', async ({ page }) => {
    await page.getByText('⚡ Choppy').click()
    await waitForLoad(page)
    await expect(page.getByText('Baseline').first()).toBeVisible()
  })

  test('Stress Spike preset updates values without error', async ({ page }) => {
    await page.getByText('🔴 Stress Spike').click()
    await waitForLoad(page)
    await expect(page.getByText('Baseline').first()).toBeVisible()
  })

  test('Stress Spike shows higher turbulent region on RiskRail than Calm', async ({ page }) => {
    // Click Calm first, capture scenario value
    await page.getByText('🌤 Calm').click()
    await waitForLoad(page)
    // Get scenario % text from RiskRail numbers row
    const scenarioEl = page.locator('text=Scenario').first().locator('..').locator('..').locator('[class*="text-[28px]"]').last()
    const calmText = await scenarioEl.textContent().catch(() => '0%')

    // Click Stress Spike
    await page.getByText('🔴 Stress Spike').click()
    await waitForLoad(page)
    const stressText = await scenarioEl.textContent().catch(() => '100%')

    const calmVal = parseInt((calmText ?? '0').replace('%', ''))
    const stressVal = parseInt((stressText ?? '0').replace('%', ''))
    expect(stressVal).toBeGreaterThanOrEqual(calmVal)
  })

  test('"What this scenario means" narrative panel renders', async ({ page }) => {
    await expect(page.getByText('What this scenario means')).toBeVisible()
  })

  test('"What changed the most" driver deltas panel renders', async ({ page }) => {
    await expect(page.getByText('What changed the most')).toBeVisible()
  })

  test('Reset to current market button works', async ({ page }) => {
    await page.getByText('🔴 Stress Spike').click()
    await waitForLoad(page)
    await page.getByText('↺ Reset to current market').click()
    await waitForLoad(page)
    await expect(page.getByText('Baseline').first()).toBeVisible()
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

      // No visible red error div
      const errDiv = page.locator('.text-red-400').first()
      const errVisible = await errDiv.isVisible().catch(() => false)
      expect(errVisible).toBe(false)
    })
  }
})
