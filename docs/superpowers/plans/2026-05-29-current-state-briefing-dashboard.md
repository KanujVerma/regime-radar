# Current State Briefing Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Current State into a hybrid market analyst briefing that answers what regime we are in, how unusual today's risk is, what changed recently, and what current market context may matter.

**Architecture:** Keep Current State focused on situational awareness and keep Signal Breakdown focused on model explanation. V1 replaces the duplicate gauge and SHAP-driver panel with Risk Temperature, What Changed, and Stress Ladder modules backed by current-state, daily-diff, historical-state, and a small new `condition_values` API field. Market Context ships as a constrained, hidden-when-empty slot first; real news/context ingestion is deferred.

**Tech Stack:** FastAPI + Pydantic backend, React + TypeScript + Vite frontend, framer-motion, existing token system, Vitest unit tests, Playwright smoke tests, pytest API tests.

---

## Product Boundary

### Current State Owns

- Current regime headline and model confidence summary.
- Today's transition risk as a live market reading.
- Historical unusualness of today's risk reading.
- A fixed, concise V1 change ledger: transition risk, regime, VIX, and trend.
- Live condition pressure against calm-to-stress thresholds.
- Small, conditional market-context cards tied to changed conditions.
- Optional compact regime duration context if the layout stays clean.

### Signal Breakdown Keeps

- SHAP/local explanation and positive/negative model contributions.
- Global feature importance, including "what always drives the model most."
- Historical analog cards and deeper setup matching.
- Reliability/calibration tables and threshold sweeps.
- Full model-mechanics narrative.

### Explicit Non-Goals For V1

- No radar/spider chart.
- No generic news feed.
- No full historical analogs module on Current State.
- No standalone deterministic Watchpoints card.
- No language that implies a fixed rule such as "if VIX crosses X, regime flips."

### Hard Implementation Rules

- Keep `/current-state` condition monitoring and `/scenario` baseline inputs conceptually separate. Use `CURRENT_STATE_CONDITION_FEATURES` for Current State and `SCENARIO_BASELINE_FEATURES` for Scenario Explorer, even if the arrays contain the same feature names in V1.
- Stress Ladder thresholds are directional UI guideposts sourced from existing slider configuration. They must not be described as validated market breakpoints, calibrated model thresholds, or rules that determine regime transitions.
- Stress Ladder copy must use directional language only: "moving toward stress," "likely add pressure," and "likely ease pressure." Do not write deterministic phrasing such as "will trigger," "will flip," "breakpoint," or "regime changes when."
- What Changed V1 must render exactly four rows: Transition risk, Regime, VIX, and Trend. Additional time windows or condition rows belong in V1.5 or later.
- Market Context Brief must render nothing when its card array is empty. No empty shell, stand-in card, filler card, or visible stub content may ship in production V1.

---

## Phase Summary

### V1 Core

Build the sharp first pass:

1. Add `condition_values` to `/current-state`.
2. Add briefing derivation helpers with unit tests.
3. Create Risk Temperature, What Changed, Stress Ladder, and Market Context slot components.
4. Replace the existing duplicate gauge and "What is raising risk right now" panel in `CurrentState.tsx`.
5. Update smoke tests to enforce the product boundary.

### V1.5 Enhancements

Polish and cautiously add depth:

1. Add compact Regime Persistence only if the layout remains clean after V1.
2. Add richer 5-day and 20-day condition deltas when the API exposes enough data.
3. Add conservative stubbed market-context cards behind relevance rules.
4. Tighten responsive layout and visual states.

### Later / Optional

Add external context only after the core briefing works:

1. Add a real market-context/news source.
2. Add a dedicated backend briefing endpoint if `/historical-state` remains too heavy.
3. Add saved/shareable briefing snapshots.

---

## Module Inventory

| Module | Phase | Question Answered | Visual Form | Data | Frontend/API | Risk |
|---|---:|---|---|---|---|---|
| Regime Brief | V1 | What regime are we in right now? | Existing hero refined into briefing header | `/current-state` | Frontend-only | Low |
| Risk Temperature | V1 | How unusual is today's risk reading? | Historical percentile strip/thermometer | `/current-state`, `/historical-state`, `/reliability` | Frontend-only | Medium |
| What Changed | V1 | What moved recently? | Fixed four-row change ledger | `/daily-diff`, `/current-state` | Frontend-only | Medium |
| Stress Ladder | V1 | Which live conditions are closest to stress? | Per-condition calm-to-stress rails with deltas | New `/current-state.condition_values`, `SLIDER_CONFIG`, `/daily-diff` | Backend-light | Medium |
| Market Context Brief Slot | V1 | What possible external context may connect to changed conditions? | Hidden-when-empty 2-3 card rail | Empty array in production V1, test fixture cards | Frontend-only | Low |
| Regime Persistence | V1.5 | How long have we been in this regime, and is that duration unusual? | Compact duration capsule | `/historical-state` | Frontend-only | Medium |
| Real Market Context | Optional Future Work | Which current stories may relate to changed conditions? | Relevance-scored context cards | New backend source + relevance rules | Backend/API | High |

---

## File Structure

### Backend/API

- Modify: `src/api/schemas.py`
  - Add `condition_values: dict[str, float]` to `CurrentStateResponse`.
- Modify: `src/api/routes.py`
  - Add separate `CURRENT_STATE_CONDITION_FEATURES` and `SCENARIO_BASELINE_FEATURES` constants.
  - Add `_condition_values_from_cache(app_state)`.
  - Populate `condition_values` in `/current-state`.
  - Use `SCENARIO_BASELINE_FEATURES` in `/scenario` for `baseline_inputs`.
- Modify: `tests/test_api_smoke.py`
  - Add API coverage for `condition_values`.

### Frontend Data/Logic

- Modify: `frontend/src/types/api.ts`
  - Add `condition_values: Record<string, number>` to `CurrentStateResponse`.
- Create: `frontend/src/lib/currentStateBriefing.ts`
  - Pure functions for Risk Temperature, What Changed, Stress Ladder, Market Context slot inputs, and optional Regime Persistence.
- Create: `frontend/src/lib/currentStateBriefing.test.ts`
  - Vitest coverage for all pure derivations.

### Frontend Components

- Create: `frontend/src/components/current-state/RiskTemperature.tsx`
- Create: `frontend/src/components/current-state/WhatChanged.tsx`
- Create: `frontend/src/components/current-state/StressLadder.tsx`
- Create: `frontend/src/components/current-state/MarketContextBrief.tsx`
- Create in V1.5 only: `frontend/src/components/current-state/RegimePersistence.tsx`
- Modify: `frontend/src/pages/CurrentState.tsx`
  - Integrate the V1 modules in the Hybrid Briefing-Dashboard layout.
  - Remove the `GaugeArc` UI from the visible page.
  - Remove the "What is raising risk right now" panel from the visible page.

### Tests

- Modify: `frontend/tests/smoke/smoke.spec.ts`
  - Replace old gauge/top-driver smoke assertions with Risk Temperature, What Changed, and Stress Ladder assertions.
- Run existing frontend and backend test commands listed in the tasks.

---

# V1 Core

## Task 1: Expose Current Condition Values On `/current-state`

**Purpose:** Stress Ladder should use real live condition values, not a fake six-row chart. This is the smallest API change that makes the module honest.

**Files:**

- Modify: `src/api/schemas.py`
- Modify: `src/api/routes.py`
- Modify: `frontend/src/types/api.ts`
- Test: `tests/test_api_smoke.py`

**Frontend/API:** Backend-light plus TypeScript type update.

**Dependencies / Ordering:** First task. Stress Ladder depends on this field.

**Risk Level:** Medium. It touches the primary API response, but the added field is backward-compatible because it defaults to an empty object.

**Mocked First vs Real Data:** Do not mock this for V1. Use the existing scenario cache `baseline_vec` as the real source. If the cache is empty, return `{}` and let the frontend hide missing rows.

- [ ] **Step 1: Write the failing API test**

Add this test method inside `class TestCurrentStateEndpoint` in `tests/test_api_smoke.py`:

```python
    def test_current_state_returns_condition_values_from_scenario_cache(self, app_with_state):
        app, state = app_with_state
        state.write_state({
            "as_of_ts": "2024-01-01T00:00:00+00:00",
            "regime": "elevated",
            "transition_risk": 0.25,
            "trend": "neutral",
            "vix_level": 22.0,
            "vix_chg_1d": 0.5,
            "top_drivers": [],
            "mode": "demo",
            "price_card_price": None,
        })
        state._scenario_cache = {
            "baseline_vec": {
                "vix_level": 22.0,
                "vix_chg_5d": 4.0,
                "rv_20d_pct": 0.62,
                "drawdown_pct_504d": 0.10,
                "ret_20d": -0.02,
                "dist_sma50": -0.01,
                "unrelated_feature": 99.0,
            }
        }

        client = TestClient(app)
        resp = client.get("/current-state")

        assert resp.status_code == 200
        data = resp.json()
        assert data["condition_values"] == {
            "vix_level": 22.0,
            "vix_chg_5d": 4.0,
            "rv_20d_pct": 0.62,
            "drawdown_pct_504d": 0.1,
            "ret_20d": -0.02,
            "dist_sma50": -0.01,
        }
```

- [ ] **Step 2: Run the failing backend test**

Run:

```bash
pytest tests/test_api_smoke.py::TestCurrentStateEndpoint::test_current_state_returns_condition_values_from_scenario_cache -q
```

Expected: FAIL because `condition_values` is not present on the response.

- [ ] **Step 3: Add the backend schema field**

In `src/api/schemas.py`, change the import:

```python
from pydantic import BaseModel, Field
```

Then update `CurrentStateResponse`:

```python
class CurrentStateResponse(BaseModel):
    regime: str
    transition_risk: float
    trend: str
    vix_level: float | None
    vix_chg_1d: float | None
    top_drivers: list[DriverItem]
    as_of_ts: str
    mode: str
    prob_calm: float | None = None
    prob_elevated: float | None = None
    prob_turbulent: float | None = None
    delta: StateDelta | None = None
    condition_values: dict[str, float] = Field(default_factory=dict)
```

- [ ] **Step 4: Add condition helper in routes**

In `src/api/routes.py`, near the module-level helpers after `_get_state`, add two separate constants. Do not collapse these into one shared constant: Current State condition monitoring and Scenario Explorer baseline inputs are different product concepts.

```python
CURRENT_STATE_CONDITION_FEATURES = [
    "vix_level",
    "vix_chg_5d",
    "rv_20d_pct",
    "drawdown_pct_504d",
    "ret_20d",
    "dist_sma50",
]

SCENARIO_BASELINE_FEATURES = [
    "vix_level",
    "vix_chg_5d",
    "rv_20d_pct",
    "drawdown_pct_504d",
    "ret_20d",
    "dist_sma50",
]


def _condition_values_from_cache(app_state) -> dict[str, float]:
    cache = getattr(app_state, "_scenario_cache", None) or {}
    baseline_vec = cache.get("baseline_vec") or {}
    values: dict[str, float] = {}
    for feature in CURRENT_STATE_CONDITION_FEATURES:
        raw = baseline_vec.get(feature)
        if raw is None:
            continue
        value = float(raw)
        if math.isfinite(value):
            values[feature] = round(value, 4)
    return values
```

- [ ] **Step 5: Populate `/current-state`**

In `current_state()` in `src/api/routes.py`, add the field to `CurrentStateResponse`:

```python
        condition_values=_condition_values_from_cache(app_state),
```

The return block should include the existing fields unchanged and append `condition_values` after `delta`.

- [ ] **Step 6: Use the scenario-specific feature list in `/scenario`**

Replace the local `slider_features = [...]` list in `scenario()` with:

```python
    baseline_inputs = {f: round(baseline_vec.get(f, 0.0), 4) for f in SCENARIO_BASELINE_FEATURES}
```

- [ ] **Step 7: Update the frontend API type**

In `frontend/src/types/api.ts`, update `CurrentStateResponse`:

```ts
export interface CurrentStateResponse {
  regime: string
  transition_risk: number
  trend: string
  vix_level: number | null
  vix_chg_1d: number | null
  top_drivers: DriverItem[]
  as_of_ts: string
  mode: string
  prob_calm: number | null
  prob_elevated: number | null
  prob_turbulent: number | null
  delta: StateDelta | null
  condition_values: Record<string, number>
}
```

- [ ] **Step 8: Run backend and type verification**

Run:

```bash
pytest tests/test_api_smoke.py::TestCurrentStateEndpoint -q
```

Expected: all `TestCurrentStateEndpoint` tests pass.

Run:

```bash
cd frontend && npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add src/api/schemas.py src/api/routes.py frontend/src/types/api.ts tests/test_api_smoke.py
git commit -m "feat(current-state): expose live condition values"
```

---

## Task 2: Add Current State Briefing Derivation Helpers

**Purpose:** Keep component JSX focused by moving percentile math, change rows, stress-ladder rows, hidden market-context behavior, and optional persistence math into pure functions.

**Files:**

- Create: `frontend/src/lib/currentStateBriefing.ts`
- Create: `frontend/src/lib/currentStateBriefing.test.ts`

**Frontend/API:** Frontend-only.

**Dependencies / Ordering:** After Task 1 so helper types include `condition_values`.

**Risk Level:** Low. Pure functions are easy to test.

**Mocked First vs Real Data:** Use real inputs from existing response types in tests. Market Context uses fixture cards only and returns an empty array unless strong local relevance rules are satisfied in V1.5.

- [ ] **Step 1: Create failing helper tests**

Create `frontend/src/lib/currentStateBriefing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildRiskTemperature,
  buildStressLadderRows,
  buildWhatChangedRows,
  classifyRegimePersistence,
  percentileRank,
} from './currentStateBriefing'
import type { CurrentStateResponse, DailyDiffResponse, HistoricalPoint } from '../types/api'

const historical: HistoricalPoint[] = [
  { date: '2024-01-01', regime: 'calm', transition_risk: 0.05, vix_level: 13, close: 480 },
  { date: '2024-01-02', regime: 'calm', transition_risk: 0.10, vix_level: 14, close: 482 },
  { date: '2024-01-03', regime: 'elevated', transition_risk: 0.20, vix_level: 20, close: 476 },
  { date: '2024-01-04', regime: 'elevated', transition_risk: 0.40, vix_level: 26, close: 468 },
]

const current: CurrentStateResponse = {
  regime: 'elevated',
  transition_risk: 0.20,
  trend: 'neutral',
  vix_level: 20,
  vix_chg_1d: 1.2,
  top_drivers: [],
  as_of_ts: '2024-01-04T00:00:00+00:00',
  mode: 'demo',
  prob_calm: 0.25,
  prob_elevated: 0.65,
  prob_turbulent: 0.10,
  delta: null,
  condition_values: {
    vix_level: 20,
    vix_chg_5d: 4,
    rv_20d_pct: 0.62,
    drawdown_pct_504d: 0.10,
    ret_20d: -0.02,
    dist_sma50: -0.01,
  },
}

const dailyDiff: DailyDiffResponse = {
  current: {
    as_of_date: '2024-01-04',
    generated_at: '2024-01-04T00:00:00+00:00',
    data_through_date: '2024-01-04',
    regime: 'elevated',
    transition_risk: 0.20,
    prob_calm: 0.25,
    prob_elevated: 0.65,
    prob_turbulent: 0.10,
    vix_level: 20,
    trend: 'neutral',
    top_drivers: [],
    model_version: {
      transition_model: 'xgb_transition',
      transition_trained_as_of: '2026-04-24',
      regime_model: 'xgb_regime',
      regime_trained_as_of: '2026-04-24',
    },
  },
  previous: {
    as_of_date: '2024-01-03',
    generated_at: '2024-01-03T00:00:00+00:00',
    data_through_date: '2024-01-03',
    regime: 'calm',
    transition_risk: 0.12,
    prob_calm: 0.58,
    prob_elevated: 0.36,
    prob_turbulent: 0.06,
    vix_level: 18,
    trend: 'uptrend',
    top_drivers: [],
    model_version: {
      transition_model: 'xgb_transition',
      transition_trained_as_of: '2026-04-24',
      regime_model: 'xgb_regime',
      regime_trained_as_of: '2026-04-24',
    },
  },
  diff: {
    regime_changed: true,
    prior_regime: 'calm',
    risk_delta: 0.08,
    vix_delta: 2,
    trend_changed: true,
    prior_trend: 'uptrend',
    top_driver_changed: false,
    prior_top_driver: null,
    current_top_driver: null,
  },
  metadata: {
    current_date: '2024-01-04',
    previous_date: '2024-01-03',
    gap_days: 1,
    is_stale: false,
  },
}

describe('currentStateBriefing', () => {
  it('computes percentile rank from non-null historical risks', () => {
    expect(percentileRank(0.20, historical)).toBe(75)
  })

  it('builds risk temperature with a historical percentile and label', () => {
    const result = buildRiskTemperature(current.transition_risk, historical)
    expect(result.percentile).toBe(75)
    expect(result.label).toBe('Above normal')
    expect(result.currentRisk).toBe(0.20)
  })

  it('builds directional change rows from daily diff', () => {
    const rows = buildWhatChangedRows(current, dailyDiff)
    expect(rows.map(row => row.id)).toEqual(['transition_risk', 'regime', 'vix_level', 'trend'])
    expect(rows.find(row => row.id === 'transition_risk')?.direction).toBe('up')
    expect(rows.find(row => row.id === 'regime')?.summary).toContain('Calm to Elevated')
    expect(rows.find(row => row.id === 'trend')?.summary).toContain('Uptrend to Neutral')
  })

  it('builds stress ladder rows from condition values and thresholds', () => {
    const rows = buildStressLadderRows(current.condition_values, dailyDiff)
    expect(rows).toHaveLength(6)
    expect(rows[0].feature).toBe('vix_level')
    expect(rows[0].status).toBe('watch')
    expect(rows[0].watchHigher).toContain('likely add pressure')
    expect(rows[0].watchHigher).not.toMatch(/flip|trigger|breakpoint|regime changes/i)
    expect(rows[0].watchLower).toContain('likely ease pressure')
    expect(rows[0].watchLower).not.toMatch(/flip|trigger|breakpoint|regime changes/i)
  })

  it('classifies regime persistence compactly', () => {
    const persistence = classifyRegimePersistence('elevated', historical)
    expect(persistence.daysInRegime).toBe(2)
    expect(persistence.label).toBe('Typical')
  })
})
```

- [ ] **Step 2: Run tests to verify the file fails**

Run:

```bash
cd frontend && npm run test -- currentStateBriefing
```

Expected: FAIL because `currentStateBriefing.ts` does not exist.

- [ ] **Step 3: Add helper implementation**

Create `frontend/src/lib/currentStateBriefing.ts`:

```ts
import type {
  CurrentStateResponse,
  DailyDiffResponse,
  HistoricalPoint,
} from '../types/api'
import { SLIDER_CONFIG, type SliderConfig } from './sliderConfig'

export type Direction = 'up' | 'down' | 'flat'
export type StressStatus = 'calm' | 'watch' | 'stress'

export interface RiskTemperature {
  currentRisk: number
  percentile: number | null
  label: 'Normal' | 'Above normal' | 'Stretched' | 'Extreme' | 'No history'
}

export interface ChangeRow {
  id: string
  label: string
  value: string
  summary: string
  direction: Direction
}

export interface StressLadderRow {
  feature: SliderConfig['key']
  label: string
  value: number
  calmMax: number
  stressMin: number
  position: number
  status: StressStatus
  delta: number | null
  watchHigher: string
  watchLower: string
}

export interface MarketContextCard {
  id: string
  condition: string
  title: string
  summary: string
  sourceLabel: string
  timestampLabel: string
}

export interface RegimePersistence {
  regime: string
  daysInRegime: number
  label: 'Short' | 'Typical' | 'Stretched'
}

function titleCase(value: string) {
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function formatPct(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function directionFromDelta(delta: number, epsilon = 0.0001): Direction {
  if (delta > epsilon) return 'up'
  if (delta < -epsilon) return 'down'
  return 'flat'
}

export function percentileRank(currentRisk: number, historical: HistoricalPoint[]): number | null {
  const values = historical
    .map(point => point.transition_risk)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (values.length === 0) return null

  const lessOrEqual = values.filter(value => value <= currentRisk).length
  return Math.round((lessOrEqual / values.length) * 100)
}

export function buildRiskTemperature(currentRisk: number, historical: HistoricalPoint[]): RiskTemperature {
  const percentile = percentileRank(currentRisk, historical)
  if (percentile === null) {
    return { currentRisk, percentile, label: 'No history' }
  }
  if (percentile >= 95) return { currentRisk, percentile, label: 'Extreme' }
  if (percentile >= 85) return { currentRisk, percentile, label: 'Stretched' }
  if (percentile >= 65) return { currentRisk, percentile, label: 'Above normal' }
  return { currentRisk, percentile, label: 'Normal' }
}

export function buildWhatChangedRows(
  current: CurrentStateResponse,
  dailyDiff: DailyDiffResponse | null,
): ChangeRow[] {
  const rows: ChangeRow[] = []
  const riskDelta = dailyDiff?.diff.risk_delta ?? current.delta?.risk_delta ?? 0
  rows.push({
    id: 'transition_risk',
    label: 'Transition risk',
    value: formatPct(current.transition_risk),
    summary: `${riskDelta >= 0 ? '+' : ''}${formatPct(riskDelta)} over the latest daily diff`,
    direction: directionFromDelta(riskDelta),
  })

  if (dailyDiff?.diff.regime_changed && dailyDiff.diff.prior_regime) {
    rows.push({
      id: 'regime',
      label: 'Regime',
      value: titleCase(current.regime),
      summary: `${titleCase(dailyDiff.diff.prior_regime)} to ${titleCase(current.regime)}`,
      direction: 'up',
    })
  } else {
    rows.push({
      id: 'regime',
      label: 'Regime',
      value: titleCase(current.regime),
      summary: 'No regime change in the latest daily diff',
      direction: 'flat',
    })
  }

  const vixDelta = dailyDiff?.diff.vix_delta ?? null
  rows.push({
    id: 'vix_level',
    label: 'VIX',
    value: current.vix_level === null ? 'Unavailable' : current.vix_level.toFixed(1),
    summary: vixDelta === null ? 'Latest VIX change unavailable' : `${vixDelta >= 0 ? '+' : ''}${vixDelta.toFixed(1)} over the latest daily diff`,
    direction: vixDelta === null ? 'flat' : directionFromDelta(vixDelta, 0.05),
  })

  if (dailyDiff?.diff.trend_changed && dailyDiff.diff.prior_trend) {
    rows.push({
      id: 'trend',
      label: 'Trend',
      value: titleCase(current.trend),
      summary: `${titleCase(dailyDiff.diff.prior_trend)} to ${titleCase(current.trend)}`,
      direction: current.trend.toLowerCase().includes('down') ? 'up' : 'down',
    })
  } else {
    rows.push({
      id: 'trend',
      label: 'Trend',
      value: titleCase(current.trend),
      summary: 'No trend change in the latest daily diff',
      direction: 'flat',
    })
  }

  return rows
}

function positionFor(config: SliderConfig, value: number) {
  const span = config.max - config.min
  if (span <= 0) return 0
  return Math.min(1, Math.max(0, (value - config.min) / span))
}

function stressStatus(config: SliderConfig, value: number): StressStatus {
  if (config.stressMin >= config.calmMax) {
    if (value >= config.stressMin) return 'stress'
    if (value > config.calmMax) return 'watch'
    return 'calm'
  }
  if (value <= config.stressMin) return 'stress'
  if (value < config.calmMax) return 'watch'
  return 'calm'
}

export function buildStressLadderRows(
  conditionValues: Record<string, number>,
  dailyDiff: DailyDiffResponse | null,
): StressLadderRow[] {
  return SLIDER_CONFIG
    .filter(config => typeof conditionValues[config.key] === 'number')
    .map(config => {
      const value = conditionValues[config.key]
      const delta = config.key === 'vix_level' ? dailyDiff?.diff.vix_delta ?? null : null
      return {
        feature: config.key,
        label: config.label,
        value,
        calmMax: config.calmMax,
        stressMin: config.stressMin,
        position: positionFor(config, value),
        status: stressStatus(config, value),
        delta,
        watchHigher: `${config.label} moving toward stress would likely add pressure.`,
        watchLower: `${config.label} moving back toward calm would likely ease pressure.`,
      }
    })
}

export function buildMarketContextCards(cards: MarketContextCard[]): MarketContextCard[] {
  return cards.slice(0, 3)
}

export function classifyRegimePersistence(
  currentRegime: string,
  historical: HistoricalPoint[],
): RegimePersistence | null {
  if (historical.length === 0) return null

  const latestIndex = historical.length - 1
  let daysInRegime = 0
  for (let index = latestIndex; index >= 0; index -= 1) {
    if (historical[index].regime.toLowerCase() !== currentRegime.toLowerCase()) break
    daysInRegime += 1
  }

  if (daysInRegime === 0) return null

  const completedRuns: number[] = []
  let activeRegime = historical[0].regime
  let runLength = 1
  for (let index = 1; index < historical.length; index += 1) {
    if (historical[index].regime === activeRegime) {
      runLength += 1
    } else {
      if (activeRegime.toLowerCase() === currentRegime.toLowerCase()) {
        completedRuns.push(runLength)
      }
      activeRegime = historical[index].regime
      runLength = 1
    }
  }

  const sortedRuns = completedRuns.sort((a, b) => a - b)
  const median = sortedRuns.length === 0 ? daysInRegime : sortedRuns[Math.floor(sortedRuns.length / 2)]
  const label = daysInRegime < Math.max(2, median * 0.5)
    ? 'Short'
    : daysInRegime > Math.max(5, median * 1.75)
      ? 'Stretched'
      : 'Typical'

  return { regime: currentRegime, daysInRegime, label }
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
cd frontend && npm run test -- currentStateBriefing
```

Expected: all `currentStateBriefing` tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/src/lib/currentStateBriefing.ts frontend/src/lib/currentStateBriefing.test.ts
git commit -m "feat(current-state): add briefing derivation helpers"
```

---

## Task 3: Build V1 Briefing Components

**Purpose:** Create reusable presentation units for the new Current State page without burying all rendering logic inside `CurrentState.tsx`.

**Files:**

- Create: `frontend/src/components/current-state/RiskTemperature.tsx`
- Create: `frontend/src/components/current-state/WhatChanged.tsx`
- Create: `frontend/src/components/current-state/StressLadder.tsx`
- Create: `frontend/src/components/current-state/MarketContextBrief.tsx`

**Frontend/API:** Frontend-only.

**Dependencies / Ordering:** After Task 2.

**Risk Level:** Medium. Visual components must be responsive and must not introduce text overlap.

**Mocked First vs Real Data:** Risk Temperature, What Changed, and Stress Ladder use real derived data. Market Context accepts card props, but an empty card array renders nothing.

- [ ] **Step 1: Create `RiskTemperature.tsx`**

Create `frontend/src/components/current-state/RiskTemperature.tsx`:

```tsx
import { motion } from 'framer-motion'
import type { RiskTemperature as RiskTemperatureData } from '../../lib/currentStateBriefing'
import { colors } from '../../lib/tokens'

interface RiskTemperatureProps {
  data: RiskTemperatureData
}

function formatRisk(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

export default function RiskTemperature({ data }: RiskTemperatureProps) {
  const marker = data.percentile === null ? 0 : Math.min(100, Math.max(0, data.percentile))

  return (
    <section
      aria-label="Risk Temperature"
      className="rounded-xl p-5"
      style={{ background: colors.glass, border: `1px solid ${colors.border}` }}
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: colors.textDim }}>
            Risk Temperature
          </div>
          <div className="text-sm mt-1" style={{ color: colors.textSecondary }}>
            How unusual today's transition risk is versus history.
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black tabular-nums" style={{ color: colors.textPrimary }}>
            {formatRisk(data.currentRisk)}
          </div>
          <div className="text-[11px] font-semibold" style={{ color: colors.textSecondary }}>
            {data.label}
          </div>
        </div>
      </div>

      <div className="relative h-4 rounded-full overflow-hidden" style={{ background: '#101827' }}>
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(34,197,94,.55) 0%, rgba(234,179,8,.65) 62%, rgba(249,115,22,.78) 84%, rgba(239,68,68,.9) 100%)',
          }}
        />
        <motion.div
          className="absolute top-1/2 h-7 w-1.5 rounded-full"
          style={{ left: `${marker}%`, background: colors.textPrimary, transform: 'translate(-50%, -50%)' }}
          initial={{ scaleY: 0.6, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: 0.35 }}
        />
      </div>

      <div className="flex justify-between text-[10px] font-semibold mt-2" style={{ color: colors.textDim }}>
        <span>Common</span>
        <span>{data.percentile === null ? 'No percentile' : `${data.percentile}th percentile`}</span>
        <span>Extreme</span>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create `WhatChanged.tsx`**

Create `frontend/src/components/current-state/WhatChanged.tsx`:

```tsx
import type { ChangeRow } from '../../lib/currentStateBriefing'
import { colors } from '../../lib/tokens'

interface WhatChangedProps {
  rows: ChangeRow[]
}

const directionGlyph = {
  up: '↑',
  down: '↓',
  flat: '→',
} as const

const directionColor = {
  up: '#f97316',
  down: '#22c55e',
  flat: colors.textDim,
} as const

export default function WhatChanged({ rows }: WhatChangedProps) {
  return (
    <section
      aria-label="What Changed"
      className="rounded-xl p-5"
      style={{ background: colors.glass, border: `1px solid ${colors.border}` }}
    >
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: colors.textDim }}>
            What Changed
          </div>
          <div className="text-sm mt-1" style={{ color: colors.textSecondary }}>
            Recent movement in the live regime read.
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map(row => (
          <div
            key={row.id}
            className="min-h-[92px] rounded-lg p-3"
            style={{ background: '#08111f', border: '1px solid rgba(148,163,184,0.16)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: colors.textDim }}>
                {row.label}
              </div>
              <div className="text-base font-black" style={{ color: directionColor[row.direction] }}>
                {directionGlyph[row.direction]}
              </div>
            </div>
            <div className="text-xl font-black mt-2 tabular-nums" style={{ color: colors.textPrimary }}>
              {row.value}
            </div>
            <div className="text-[11px] leading-snug mt-1" style={{ color: colors.textSecondary }}>
              {row.summary}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create `StressLadder.tsx`**

Create `frontend/src/components/current-state/StressLadder.tsx`:

```tsx
import { motion } from 'framer-motion'
import type { StressLadderRow } from '../../lib/currentStateBriefing'
import { colors } from '../../lib/tokens'

interface StressLadderProps {
  rows: StressLadderRow[]
}

function formatValue(value: number) {
  if (Math.abs(value) <= 1) return `${(value * 100).toFixed(0)}%`
  return value.toFixed(1)
}

function statusLabel(status: StressLadderRow['status']) {
  if (status === 'stress') return 'Stress'
  if (status === 'watch') return 'Watch'
  return 'Calm'
}

function statusColor(status: StressLadderRow['status']) {
  if (status === 'stress') return '#ef4444'
  if (status === 'watch') return '#f59e0b'
  return '#22c55e'
}

export default function StressLadder({ rows }: StressLadderProps) {
  if (rows.length === 0) return null

  return (
    <section
      aria-label="Stress Ladder"
      className="rounded-xl p-5"
      style={{ background: colors.glass, border: `1px solid ${colors.border}` }}
    >
      <div className="mb-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: colors.textDim }}>
          Stress Ladder
        </div>
        <div className="text-sm mt-1" style={{ color: colors.textSecondary }}>
          Live conditions shown as directional calm-to-stress guides, not regime rules.
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((row, index) => (
          <div key={row.feature} className="grid gap-2 md:grid-cols-[160px_1fr_92px] md:items-center">
            <div>
              <div className="text-sm font-bold" style={{ color: colors.textPrimary }}>{row.label}</div>
              <div className="text-[11px]" style={{ color: colors.textDim }}>
                {row.delta === null ? 'Recent delta unavailable' : `${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(1)} recent delta`}
              </div>
            </div>

            <div>
              <div className="relative h-3 rounded-full overflow-hidden" style={{ background: '#0d1626' }}>
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(90deg, rgba(34,197,94,.5), rgba(234,179,8,.58), rgba(239,68,68,.72))',
                  }}
                />
                <motion.div
                  className="absolute top-1/2 h-6 w-6 rounded-full border"
                  style={{
                    left: `${row.position * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    background: '#e5edf7',
                    borderColor: statusColor(row.status),
                    boxShadow: `0 0 18px ${statusColor(row.status)}66`,
                  }}
                  initial={{ scale: 0.75, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.04, duration: 0.25 }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-semibold mt-1" style={{ color: colors.textDim }}>
                <span>Calm</span>
                <span>Stress</span>
              </div>
              <div className="text-[11px] mt-1 leading-snug" style={{ color: colors.textSecondary }}>
                {row.status === 'stress' ? row.watchLower : row.watchHigher}
              </div>
            </div>

            <div className="md:text-right">
              <div className="text-lg font-black tabular-nums" style={{ color: colors.textPrimary }}>
                {formatValue(row.value)}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: statusColor(row.status) }}>
                {statusLabel(row.status)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Create `MarketContextBrief.tsx`**

Create `frontend/src/components/current-state/MarketContextBrief.tsx`:

```tsx
import type { MarketContextCard } from '../../lib/currentStateBriefing'
import { colors } from '../../lib/tokens'

interface MarketContextBriefProps {
  cards: MarketContextCard[]
}

export default function MarketContextBrief({ cards }: MarketContextBriefProps) {
  if (cards.length === 0) return null

  return (
    <section
      aria-label="Market Context Brief"
      className="rounded-xl p-5"
      style={{ background: colors.glass, border: `1px solid ${colors.border}` }}
    >
      <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: colors.textDim }}>
          Possible Market Context
        </div>
        <div className="text-sm mt-1" style={{ color: colors.textSecondary }}>
          Context is tied to changed conditions and is not treated as model evidence.
        </div>
      </div>

      <div className="space-y-3">
        {cards.slice(0, 3).map(card => (
          <article
            key={card.id}
            className="rounded-lg p-3"
            style={{ background: '#08111f', border: '1px solid rgba(148,163,184,0.16)' }}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: '#38bdf8' }}>
              {card.condition}
            </div>
            <div className="text-sm font-bold mt-1" style={{ color: colors.textPrimary }}>
              {card.title}
            </div>
            <div className="text-[11px] leading-snug mt-1" style={{ color: colors.textSecondary }}>
              {card.summary}
            </div>
            <div className="text-[10px] mt-2" style={{ color: colors.textDim }}>
              {card.sourceLabel} · {card.timestampLabel}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Run typecheck/build**

Run:

```bash
cd frontend && npm run build
```

Expected: build passes.

- [ ] **Step 6: Commit**

Run:

```bash
git add frontend/src/components/current-state/RiskTemperature.tsx frontend/src/components/current-state/WhatChanged.tsx frontend/src/components/current-state/StressLadder.tsx frontend/src/components/current-state/MarketContextBrief.tsx
git commit -m "feat(current-state): add briefing modules"
```

---

## Task 4: Integrate The Hybrid Briefing-Dashboard Layout

**Purpose:** Replace the duplicate Current State panels with the new module set while protecting the Current State versus Signal Breakdown boundary.

**Files:**

- Modify: `frontend/src/pages/CurrentState.tsx`

**Frontend/API:** Frontend-only after Task 1's API type exists.

**Dependencies / Ordering:** After Tasks 1-3.

**Risk Level:** Medium. This changes the page's primary visual hierarchy.

**Mocked First vs Real Data:** Market Context receives `[]` in V1 production render, so it is hidden. All other modules use real API data.

- [ ] **Step 1: Import new helpers and components**

In `frontend/src/pages/CurrentState.tsx`, add imports:

```tsx
import RiskTemperature from '../components/current-state/RiskTemperature'
import WhatChanged from '../components/current-state/WhatChanged'
import StressLadder from '../components/current-state/StressLadder'
import MarketContextBrief from '../components/current-state/MarketContextBrief'
import {
  buildMarketContextCards,
  buildRiskTemperature,
  buildStressLadderRows,
  buildWhatChangedRows,
} from '../lib/currentStateBriefing'
```

- [ ] **Step 2: Derive module data inside the component**

After data loading guards and before `return`, derive:

```tsx
  const historicalPoints = recentData?.data ?? []
  const riskTemperature = buildRiskTemperature(data.transition_risk, historicalPoints)
  const whatChangedRows = buildWhatChangedRows(data, dailyDiffData)
  const stressLadderRows = buildStressLadderRows(data.condition_values ?? {}, dailyDiffData)
  const marketContextCards = buildMarketContextCards([])
```

Use the local `useDailyDiff()` variable names already present in `CurrentState.tsx`. If the existing variable is named `dailyDiff`, use that exact name instead of `dailyDiffData`.

- [ ] **Step 3: Remove visible duplicate gauge**

Remove the visible `Panel title="Transition risk gauge"` block and the `GaugeArc` JSX from the rendered layout. Keep the `GaugeArc` function in the file for one commit if deleting it creates a noisy diff; remove it in Task 5 after smoke tests pass.

The page must still show one transition-risk headline in the hero and one Risk Temperature module. It must not show a second gauge that restates the same probability.

- [ ] **Step 4: Remove visible SHAP-driver duplicate panel**

Remove this visible panel from `CurrentState.tsx`:

```tsx
<Panel title="What is raising risk right now" className="flex-1">
```

Do not move this exact panel to another place on Current State. Signal Breakdown keeps model-driver explanation.

- [ ] **Step 5: Add Hybrid Briefing-Dashboard layout**

Use this page structure in the main content area after the existing hero cards:

```tsx
<div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
  <RiskTemperature data={riskTemperature} />
  <Panel title="What this means right now">
    <p className="text-[11px] leading-relaxed mb-4" style={{ color: '#94a3b8' }}>{narrative}</p>
    <div className="text-[9px] font-bold tracking-widest uppercase mb-2" style={{ color: '#4a6080' }}>
      Model confidence in each market state
    </div>
    <div className="flex gap-2 mb-4">
      {(['calm', 'elevated', 'turbulent'] as const).map(r => {
        const prob = (data as unknown as Record<string, unknown>)[`prob_${r}`] as number | null
        if (prob == null) return null
        return <RegimeBadge key={r} regime={r} probability={prob} />
      })}
    </div>
  </Panel>
</div>

<WhatChanged rows={whatChangedRows} />

<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
  <StressLadder rows={stressLadderRows} />
  <div className="space-y-4">
    <MarketContextBrief cards={marketContextCards} />
    <Panel title="Last 30 Trading Days">
      <MiniRegimeChart data={historicalPoints.slice(-30)} />
    </Panel>
  </div>
</div>
```

Adapt class names to the surrounding page spacing, but preserve this hierarchy:

1. Regime/hero area.
2. Risk Temperature + "What this means right now."
3. What Changed.
4. Stress Ladder + sidebar.

- [ ] **Step 6: Add Signal Breakdown CTA without duplicating its content**

At the bottom of the Stress Ladder section or the narrative panel, add a small link:

```tsx
<Link
  to="/model-drivers"
  className="text-[11px] font-bold uppercase tracking-[0.12em]"
  style={{ color: '#38bdf8' }}
>
  Open Signal Breakdown for model explanation
</Link>
```

Import `Link` from `react-router-dom` if it is not already imported:

```tsx
import { Link } from 'react-router-dom'
```

- [ ] **Step 7: Run build**

Run:

```bash
cd frontend && npm run build
```

Expected: build passes.

- [ ] **Step 8: Commit**

Run:

```bash
git add frontend/src/pages/CurrentState.tsx
git commit -m "feat(current-state): integrate briefing dashboard layout"
```

---

## Task 5: Update Smoke Tests And Remove Dead Gauge Code

**Purpose:** Lock the page boundary into tests: Current State should show the new situational-awareness modules and no longer require the duplicated gauge/top-driver panel.

**Files:**

- Modify: `frontend/tests/smoke/smoke.spec.ts`
- Modify: `frontend/src/pages/CurrentState.tsx`

**Frontend/API:** Frontend-only.

**Dependencies / Ordering:** After Task 4.

**Risk Level:** Low.

**Mocked First vs Real Data:** Smoke tests should assert visible module titles, not exact market values.

- [ ] **Step 1: Update Current State smoke tests**

In `frontend/tests/smoke/smoke.spec.ts`, replace:

```ts
  test('Transition risk gauge SVG renders', async ({ page }) => {
    await expect(page.getByText('Transition risk gauge')).toBeVisible()
    await expect(page.locator('svg').first()).toBeVisible()
  })

  test('"What is raising risk right now" panel renders driver bars', async ({ page }) => {
    await expect(page.getByText('What is raising risk right now')).toBeVisible()
  })
```

with:

```ts
  test('Risk Temperature panel renders', async ({ page }) => {
    await expect(page.getByText('Risk Temperature')).toBeVisible()
    await expect(page.getByText(/percentile|No percentile/)).toBeVisible()
  })

  test('What Changed panel renders', async ({ page }) => {
    await expect(page.getByText('What Changed')).toBeVisible()
    await expect(page.getByText('Transition risk')).toBeVisible()
  })

  test('Stress Ladder panel renders market-condition rails', async ({ page }) => {
    await expect(page.getByText('Stress Ladder')).toBeVisible()
    await expect(page.getByText('VIX Level')).toBeVisible()
  })

  test('Current State links deeper model explanation to Signal Breakdown', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Open Signal Breakdown for model explanation/i })).toBeVisible()
  })
```

- [ ] **Step 2: Add negative boundary assertions**

Add this test in the Current State describe block:

```ts
  test('Current State does not render the old model-explanation panels', async ({ page }) => {
    await expect(page.getByText('Transition risk gauge')).toHaveCount(0)
    await expect(page.getByText('What is raising risk right now')).toHaveCount(0)
  })

  test('Market Context Brief stays hidden when empty', async ({ page }) => {
    await expect(page.getByText('Possible Market Context')).toHaveCount(0)
  })
```

- [ ] **Step 3: Remove dead visible-only gauge code**

If `GaugeArc` is no longer referenced in `frontend/src/pages/CurrentState.tsx`, remove the `GaugeArc` function and any imports used only by it.

- [ ] **Step 4: Run smoke tests**

Run:

```bash
cd frontend && npm run test:smoke
```

Expected: all smoke tests pass.

- [ ] **Step 5: Run frontend unit tests**

Run:

```bash
cd frontend && npm run test
```

Expected: all Vitest tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add frontend/tests/smoke/smoke.spec.ts frontend/src/pages/CurrentState.tsx
git commit -m "test(current-state): cover briefing dashboard modules"
```

---

# V1.5 Enhancements

## Task 6: Add Compact Regime Persistence If Layout Remains Clean

**Purpose:** Add duration context without turning Current State into another historical analysis page.

**Files:**

- Create: `frontend/src/components/current-state/RegimePersistence.tsx`
- Modify: `frontend/src/pages/CurrentState.tsx`
- Test: `frontend/src/lib/currentStateBriefing.test.ts`

**Frontend/API:** Frontend-only.

**Dependencies / Ordering:** After V1 is visually reviewed.

**Risk Level:** Medium. The feature is useful only if compact; it should be dropped from the visible page if it crowds the layout.

**Mocked First vs Real Data:** Use real `/historical-state` data. The helper already exists in Task 2.

- [ ] **Step 1: Add persistence edge-case tests**

Append tests to `frontend/src/lib/currentStateBriefing.test.ts`:

```ts
  it('returns null when regime persistence has no history', () => {
    expect(classifyRegimePersistence('calm', [])).toBeNull()
  })

  it('classifies a long current run as stretched against completed runs', () => {
    const points: HistoricalPoint[] = [
      { date: '2024-01-01', regime: 'calm', transition_risk: 0.05, vix_level: 12, close: 100 },
      { date: '2024-01-02', regime: 'elevated', transition_risk: 0.20, vix_level: 20, close: 98 },
      { date: '2024-01-03', regime: 'calm', transition_risk: 0.07, vix_level: 13, close: 101 },
      { date: '2024-01-04', regime: 'elevated', transition_risk: 0.22, vix_level: 21, close: 99 },
      { date: '2024-01-05', regime: 'elevated', transition_risk: 0.23, vix_level: 22, close: 97 },
      { date: '2024-01-06', regime: 'elevated', transition_risk: 0.24, vix_level: 23, close: 96 },
      { date: '2024-01-07', regime: 'elevated', transition_risk: 0.25, vix_level: 24, close: 95 },
    ]
    expect(classifyRegimePersistence('elevated', points)?.label).toBe('Stretched')
  })
```

- [ ] **Step 2: Run persistence tests**

Run:

```bash
cd frontend && npm run test -- currentStateBriefing
```

Expected: tests pass.

- [ ] **Step 3: Create compact component**

Create `frontend/src/components/current-state/RegimePersistence.tsx`:

```tsx
import type { RegimePersistence as RegimePersistenceData } from '../../lib/currentStateBriefing'
import { colors } from '../../lib/tokens'

interface RegimePersistenceProps {
  data: RegimePersistenceData | null
}

export default function RegimePersistence({ data }: RegimePersistenceProps) {
  if (!data) return null

  return (
    <section
      aria-label="Regime Persistence"
      className="rounded-xl p-4"
      style={{ background: colors.glass, border: `1px solid ${colors.border}` }}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: colors.textDim }}>
        Regime Persistence
      </div>
      <div className="flex items-end justify-between gap-3 mt-2">
        <div>
          <div className="text-2xl font-black tabular-nums" style={{ color: colors.textPrimary }}>
            {data.daysInRegime}
          </div>
          <div className="text-[11px]" style={{ color: colors.textSecondary }}>
            trading days in {data.regime}
          </div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: '#38bdf8' }}>
          {data.label}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Integrate only if the sidebar remains clean**

In `frontend/src/pages/CurrentState.tsx`, import:

```tsx
import RegimePersistence from '../components/current-state/RegimePersistence'
import { classifyRegimePersistence } from '../lib/currentStateBriefing'
```

Update the helper import if `currentStateBriefing` imports are grouped.

Derive:

```tsx
  const regimePersistence = classifyRegimePersistence(data.regime, historicalPoints)
```

Render it in the right sidebar above `MarketContextBrief`:

```tsx
<RegimePersistence data={regimePersistence} />
```

If the right sidebar becomes taller than the Stress Ladder on desktop, place Regime Persistence below Risk Temperature instead. If both placements feel crowded, keep this component unmounted and do not ship it in V1.5.

- [ ] **Step 5: Run visual and test verification**

Run:

```bash
cd frontend && npm run build
```

Expected: build passes.

Run:

```bash
cd frontend && npm run test -- currentStateBriefing
```

Expected: helper tests pass.

- [ ] **Step 6: Commit if included**

Run:

```bash
git add frontend/src/components/current-state/RegimePersistence.tsx frontend/src/pages/CurrentState.tsx frontend/src/lib/currentStateBriefing.test.ts
git commit -m "feat(current-state): add compact regime persistence"
```

---

## Task 7: Add Conservative Stubbed Market Context Cards

**Purpose:** Test the Market Context Brief experience without introducing external news dependency or generic feed clutter.

**Files:**

- Modify: `frontend/src/lib/currentStateBriefing.ts`
- Modify: `frontend/src/lib/currentStateBriefing.test.ts`
- Modify: `frontend/src/pages/CurrentState.tsx`

**Frontend/API:** Frontend-only.

**Dependencies / Ordering:** After V1 layout review.

**Risk Level:** Medium. This can become noisy if relevance rules are weak.

**Mocked First vs Real Data:** Stubbed cards are generated from local condition changes only. No real external articles are used in this phase.

- [ ] **Step 1: Add tests for constrained cards**

Add tests to `frontend/src/lib/currentStateBriefing.test.ts`:

```ts
  it('hides market context when relevance is weak', () => {
    expect(buildMarketContextCards([])).toEqual([])
  })

  it('caps market context at three cards', () => {
    const cards = buildMarketContextCards([
      { id: 'a', condition: 'Volatility', title: 'A', summary: 'A', sourceLabel: 'Stub', timestampLabel: 'Now' },
      { id: 'b', condition: 'Rates', title: 'B', summary: 'B', sourceLabel: 'Stub', timestampLabel: 'Now' },
      { id: 'c', condition: 'Trend', title: 'C', summary: 'C', sourceLabel: 'Stub', timestampLabel: 'Now' },
      { id: 'd', condition: 'Drawdown', title: 'D', summary: 'D', sourceLabel: 'Stub', timestampLabel: 'Now' },
    ])
    expect(cards.map(card => card.id)).toEqual(['a', 'b', 'c'])
  })
```

- [ ] **Step 2: Run tests**

Run:

```bash
cd frontend && npm run test -- currentStateBriefing
```

Expected: tests pass.

- [ ] **Step 3: Add local relevance builder**

In `frontend/src/lib/currentStateBriefing.ts`, add:

```ts
export function buildStubMarketContextCards(
  rows: StressLadderRow[],
  enableStubs: boolean,
): MarketContextCard[] {
  if (!enableStubs) return []

  const stressed = rows.filter(row => row.status !== 'calm').slice(0, 3)
  return stressed.map(row => ({
    id: `stub-${row.feature}`,
    condition: row.label,
    title: `${row.label} is the condition to watch`,
    summary: row.status === 'stress'
      ? `${row.label} is already in its stress zone. Treat related headlines as possible context, not model evidence.`
      : `${row.label} is between calm and stress. Related headlines may help explain why this condition is moving.`,
    sourceLabel: 'Local condition tag',
    timestampLabel: 'Current snapshot',
  }))
}
```

- [ ] **Step 4: Keep stubs disabled in production render**

In `frontend/src/pages/CurrentState.tsx`, import `buildStubMarketContextCards` and derive:

```tsx
  const marketContextCards = buildMarketContextCards(
    buildStubMarketContextCards(stressLadderRows, false)
  )
```

This keeps the slot designed and testable without showing synthetic context to users.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/src/lib/currentStateBriefing.ts frontend/src/lib/currentStateBriefing.test.ts frontend/src/pages/CurrentState.tsx
git commit -m "feat(current-state): prepare constrained market context slot"
```

---

# Optional Future Work

## Task 8: Real Market Context Source

**Purpose:** Add external market context only when it can be relevance-filtered and hidden when weak.

**Files Likely Touched:**

- Create: `src/api/market_context.py`
- Modify: `src/api/routes.py`
- Modify: `src/api/schemas.py`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/types/api.ts`
- Create: `frontend/src/hooks/useMarketContext.ts`
- Modify: `frontend/src/pages/CurrentState.tsx`
- Modify: `frontend/src/components/current-state/MarketContextBrief.tsx`
- Test: `tests/test_api_smoke.py`
- Test: `frontend/src/lib/currentStateBriefing.test.ts`

**Frontend/API:** Backend/API plus frontend hook.

**Dependencies / Ordering:** Only after V1 and V1.5 prove the page remains coherent.

**Risk Level:** High. Generic news will make the product worse.

**Mocked First vs Real Data:** Start with provider fixtures in backend tests. Wire a real source only after relevance scoring and hidden-empty behavior are tested.

**Constraints For This Work:**

- Return at most 3 cards.
- Each card must include `condition_tag`, `headline`, `summary`, `source`, `published_at`, and `relevance_score`.
- API returns an empty list when every candidate is below relevance threshold.
- Frontend labels the module "Possible Market Context."
- Frontend copy states that context is not model evidence.
- Do not show a scrolling list of headlines.
- Do not show context that cannot be tied to a changed condition.

Recommended API shape:

```python
class MarketContextCard(BaseModel):
    condition_tag: str
    headline: str
    summary: str
    source: str
    published_at: str
    relevance_score: float


class MarketContextResponse(BaseModel):
    cards: list[MarketContextCard]
    generated_at: str
```

Recommended frontend type:

```ts
export interface MarketContextApiCard {
  condition_tag: string
  headline: string
  summary: string
  source: string
  published_at: string
  relevance_score: number
}

export interface MarketContextResponse {
  cards: MarketContextApiCard[]
  generated_at: string
}
```

---

## Task 9: Dedicated Briefing Summary Endpoint

**Purpose:** Reduce frontend orchestration and avoid loading full historical state on every Current State visit if performance becomes a problem.

**Files Likely Touched:**

- Create: `src/api/briefing.py`
- Modify: `src/api/routes.py`
- Modify: `src/api/schemas.py`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/types/api.ts`
- Create: `frontend/src/hooks/useCurrentStateBriefing.ts`
- Modify: `frontend/src/pages/CurrentState.tsx`
- Test: `tests/test_api_smoke.py`

**Frontend/API:** Backend/API plus frontend hook.

**Dependencies / Ordering:** Only after V1 makes the desired data contract obvious.

**Risk Level:** Medium. This is valuable if performance is poor; premature consolidation would slow the redesign.

Recommended response shape:

```python
class CurrentStateBriefingResponse(BaseModel):
    current: CurrentStateResponse
    risk_percentile: int | None
    recent_history: list[HistoricalPoint]
    daily_diff: DailyDiffResponse | None
    regime_persistence: dict | None
```

Do not add market news to this endpoint. Keep external context separate so failures in a news provider do not break the live model briefing.

---

## Verification Commands

Run these before claiming the branch is complete:

```bash
pytest tests/test_api_smoke.py::TestCurrentStateEndpoint -q
```

Expected: all Current State API tests pass.

```bash
cd frontend && npm run test
```

Expected: all Vitest suites pass.

```bash
cd frontend && npm run build
```

Expected: TypeScript and Vite build pass.

```bash
cd frontend && npm run test:smoke
```

Expected: all Playwright smoke tests pass, including the new Current State module assertions.

---

## Self-Review

### Spec Coverage

- Current State as market analyst briefing: covered by Tasks 2-5.
- Signal Breakdown boundary: covered by Product Boundary and Task 5 negative assertions.
- Replace duplicated gauge with Risk Temperature: covered by Tasks 3-5.
- Replace "What is raising risk right now" with What Changed + Stress Ladder: covered by Tasks 3-5.
- Market Context Brief small and conditional: covered by Tasks 3, 7, and 8.
- Hybrid Briefing-Dashboard layout: covered by Task 4.
- Regime Persistence optional for V1: placed in V1.5 Task 6 with explicit layout gate.
- Separate Current State and Scenario feature-list constants: covered by Task 1.
- Directional-only Stress Ladder copy: covered by Hard Implementation Rules plus Task 2 tests.
- Fixed V1 What Changed row set: covered by Hard Implementation Rules and Task 2 tests.
- Empty Market Context hidden in production V1: covered by Hard Implementation Rules, Task 3 component behavior, and Task 5 smoke test.

### Forbidden Token Scan

- No forbidden planning tokens remain.
- Market context is intentionally disabled in V1 production render rather than represented by filler content.
- Optional future work has explicit API shapes and constraints.

### Type Consistency

- `condition_values` is added to backend schema and frontend type.
- `CURRENT_STATE_CONDITION_FEATURES` and `SCENARIO_BASELINE_FEATURES` are intentionally separate constants.
- `StressLadderRow`, `MarketContextCard`, `RiskTemperature`, and `ChangeRow` are defined before use.
- Component props use the exported helper interfaces.
