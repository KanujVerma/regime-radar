# RegimeRadar — React Frontend Migration Design Spec

**Date:** 2026-04-24  
**Scope:** Replace the Streamlit dashboard with a React + TypeScript frontend while keeping the FastAPI backend and ML pipeline fully intact. One new backend endpoint (`POST /scenario`) is added to support the Scenario Explorer. Streamlit runs in parallel during migration on port 8501; React on port 3000.

---

## Decisions Made

| Decision | Choice |
|---|---|
| Frontend stack | Vite + React + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion + Recharts |
| Deployment model | Docker Compose — two containers: `api` (FastAPI, port 8000) + `frontend` (Nginx/Node, port 3000) |
| Streamlit during migration | Stays on port 8501; removed once React reaches parity |
| Navigation | Left sidebar, ~196px wide, persistent across all pages |
| New backend route | `POST /scenario` — accepts slider inputs, returns baseline risk, scenario risk, regime probs, driver deltas |
| API communication | React calls FastAPI directly; FastAPI gets CORS middleware (one line) |
| Chart library | Recharts (ComposedChart pattern throughout) |

---

## 1. Architecture

### 1.1 Frontend stack

```
frontend/
  src/
    api/          # typed fetch wrappers for each endpoint
    components/
      layout/     # AppShell, Sidebar, Topbar
      ui/         # shadcn/ui primitives + custom cards, gauges, badges
      charts/     # Recharts wrappers (RegimeChart, RiskChart, DriverBars, etc.)
    pages/
      CurrentState.tsx
      History.tsx
      EventReplay.tsx
      ModelDrivers.tsx
      ScenarioExplorer.tsx
    hooks/        # useCurrentState, useHistory, useScenario, etc.
    lib/          # formatting utils, feature label map, color tokens
    types/        # TypeScript types mirroring Pydantic schemas
    main.tsx
    App.tsx       # router + AppShell
  index.html
  vite.config.ts
  tailwind.config.ts
  Dockerfile
```

### 1.2 Docker Compose additions

`VITE_API_URL` is a **build-time** variable in Vite (inlined via `import.meta.env`), not a runtime env var. The Dockerfile must pass it as a build ARG:

```dockerfile
# frontend/Dockerfile
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build       # build bakes the value into static files
```

```yaml
# docker-compose.yml addition
frontend:
  build:
    context: ./frontend
    dockerfile: Dockerfile
    args:
      - VITE_API_URL=http://localhost:8000
  ports:
    - "3000:80"       # Nginx serves the built Vite app
  depends_on:
    api:
      condition: service_healthy
```

For local dev outside Docker, set `VITE_API_URL=http://localhost:8000` in `frontend/.env.local` — Vite picks this up at dev-server startup.

Streamlit service remains unchanged at port 8501 during migration. After parity is reached, the `dashboard` service is removed from `docker-compose.yml`.

### 1.3 CORS

Single addition to `src/api/main.py`:

```python
import os
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:3000")],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
```

### 1.4 New backend endpoint: `POST /scenario`

**Request schema** (`ScenarioRequest`):
```python
class ScenarioRequest(BaseModel):
    vix_level: float
    vix_chg_5d: float
    rv_20d_pct: float
    drawdown_pct_504d: float
    ret_20d: float
    dist_sma50: float
```

**Logic:**
1. Load `xgb_transition` + `xgb_regime` models and `xgb_transition` metadata from registry (cached in `AppState`).
2. Build baseline feature vector from the latest panel row (`data/processed/panel.parquet`); fill unknowns with 0.
3. Build scenario feature vector = baseline overridden with the 6 request fields.
4. Score both vectors with `xgb_transition.predict_proba(X)[0, 1]` → `baseline_risk`, `scenario_risk`.
5. Score baseline vector with `xgb_regime.predict_proba(X)[0]` → `baseline_prob_calm/elevated/turbulent`.
6. Score scenario vector with `xgb_regime.predict_proba(X)[0]` → `prob_calm/elevated/turbulent`.
7. Compute driver deltas = top-5 features sorted by `|scenario_val - baseline_val| * feature_importance`.

**Response schema** (`ScenarioResponse`):
```python
class ScenarioResponse(BaseModel):
    baseline_risk: float
    scenario_risk: float
    delta: float
    prob_calm: float
    prob_elevated: float
    prob_turbulent: float
    baseline_prob_calm: float
    baseline_prob_elevated: float
    baseline_prob_turbulent: float
    driver_deltas: list[DriverDelta]   # feature, plain_label, delta_value

class DriverDelta(BaseModel):
    feature: str
    plain_label: str
    delta_value: float
```

---

## 2. Design Tokens

```ts
// lib/tokens.ts
export const colors = {
  bg: '#080b12',
  surface: '#0c1020',
  sidebar: '#0a0d16',
  border: '#151d2e',
  borderSubtle: '#131b2a',
  cyan: '#06b6d4',
  cyanDim: '#0e4d6e',
  green: '#4ade80',
  greenDim: '#166534',
  amber: '#fbbf24',
  amberDim: '#92400e',
  red: '#f87171',
  redDim: '#7f1d1d',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#475569',
  textDim: '#2d4060',
}

export const regimeColor = {
  calm: colors.green,
  elevated: colors.amber,
  turbulent: colors.red,
}
```

---

## 3. App Shell & Navigation

### Sidebar (196px, fixed)

```
┌─ Logo mark (cyan dot + "RegimeRadar" + "Market Monitor" subtext)
├─ NAV GROUP: Monitor
│   ├─ Current State  [LIVE badge when active]
│   ├─ History
│   └─ Event Replay
├─ NAV GROUP: Explore
│   ├─ Model Drivers
│   └─ Scenario Explorer
└─ Footer
    ├─ Green dot + "NEAR-LIVE DATA" (or amber "DEMO MODE")
    └─ "Last refresh: X min ago"
```

Active nav item: `background: linear-gradient(90deg, #061d2e, #070f1c)`, color `#06b6d4`, left border `2.5px solid #06b6d4` with glow.

### Main area

Topbar (48px): page title (17px 700), page subtitle (10px muted), contextual action button (e.g. "↻ Refresh Data" on Current State, "↺ Reset to current market" on Scenario Explorer).

Content area: `padding: 20px 22px`, `max-width: none`, scrollable.

### Framer Motion

- Page transitions: `AnimatePresence` + `motion.div` with `initial={{ opacity: 0, y: 8 }}`, `animate={{ opacity: 1, y: 0 }}`, `exit={{ opacity: 0 }}`, duration 200ms.
- Card entrance: `initial={{ opacity: 0, y: 12 }}`, staggered by 60ms per card.
- Scenario rail markers: `animate={{ left: newPct }}` with spring physics on each API response.
- Gauge needle (if implemented as SVG): same spring transition.

---

## 4. Current State Page

### Layout

```
Topbar: "Current State" + timestamp + Refresh button

Hero row (4 equal cards):
  [Market Regime] [Transition Risk] [VIX Level] [Trend]

Divider

Two-column body:
  Left col:
    Panel: "What this means right now"
      → 2–3 sentence plain-English narrative
      → Regime probability chips (Calm / Elevated / Turbulent %)
    Panel: "Why it changed since last refresh"
      → 3 delta rows (icon + text + badge)
  Right col:
    Panel: "Transition risk gauge"
      → Semi-circle arc gauge
      → Plain-English caption (e.g. "Moderate risk — conditions could
        deteriorate within the next week.")
    Panel: "What is pushing risk right now"
      → 4–5 driver bars, cyan for upward contributors, red for downward
```

### Hero cards

Each card: `padding: 14px 16px`, `border-radius: 10px`, `background: #0c1020`.
- Label: `9px 700 uppercase tracking-wide #2d4060`
- Value: `22px 800 tracking-tight` — color matches regime (green/amber/red/neutral)
- Subtitle: `9px #334155`
- Delta badge: top-right, `9px`, color-coded (red = risk up, green = risk down, neutral = unchanged)

### Plain-English narrative template

```
"SPY is in a {regime} regime with {risk_level} transition risk ({risk:.0%}). 
{trend_sentence} VIX is at {vix:.1f} and {vix_direction}."
```

Risk levels: `<5%` = very low · `5–20%` = low · `20–40%` = moderate · `>40%` = elevated  
Trend sentences: up → "The trend is positive." / down → "The trend is negative." / neutral → "The trend is neutral."  
VIX direction: `chg_1d > 0.5` → "rising" · `< -0.5` → "falling" · else → "stable"

### Regime probability chips

Three chips side-by-side. Each: `flex: 1`, `padding: 8px 10px`, `border-radius: 7px`, color-coded border + background tint. Hidden (not "N/A") if `prob_*` fields are null.

### "Why it changed" delta panel

Reads from the two most recent rows in `live_state` SQLite table via existing `read_prior_state()` method on `AppState`. The `/current-state` route handler in `routes.py` calls `read_prior_state()`, computes the delta fields, and includes them in the response as `delta: StateDelta | None`. This is a change to `routes.py`, not `state.py` (which already has `read_prior_state()`).

```python
class StateDelta(BaseModel):
    risk_delta: float         # scenario_risk - prior_risk
    regime_changed: bool
    prior_regime: str | None
    top_feature_moved: str | None   # plain label
    top_feature_direction: str | None  # "up" | "down"
```

Three delta rows rendered as: icon (📈/📉/↔️) + plain-English description + badge (Risk ↑ / Risk ↓ / No change).

### Driver bars

4–5 bars. Cyan gradient for positive SHAP contributors, red gradient for negative. Plain-language feature labels from `FEATURE_LABELS` map (see Section 9). Fallback to global importance when SHAP unavailable.

### Data sources

- `/current-state` → hero cards, narrative, regime chips, delta panel
- `/model-drivers` → driver bars

---

## 5. History Page

### Layout

```
Topbar: "History" + date range info

Section: "What happened over time?"
  Caption: "Shaded bands show the market regime on each day.
            A darker shade indicates higher stress."
  Chart: SPY line + regime background bands + optional VIX overlay toggle
  [Show VIX overlay] toggle button

Spacer (16px)

Section: "When did the model get worried?"
  Caption: "The line shows the model's daily estimate of the chance
            conditions worsen within the next week."
  Chart: Transition risk line + Watch threshold (10%, cyan dashed) +
         Alert threshold (30%, amber dashed)
```

### Chart specs — SPY + Regime chart

- `ComposedChart` with `ReferenceArea` components for regime bands
- SPY line: `strokeWidth: 2`, color `#42a5f5`
- Regime band opacity: `0.08`
- Colors: calm `#4ade80`, elevated `#fbbf24`, turbulent `#f87171`
- VIX overlay (when toggled): secondary Y-axis (`yAxisId="vix"`), domain `[0, 'auto']`, formatted as integer, `strokeWidth: 1`, color `#94a3b8`, opacity 0.6; axis label "VIX" on the right side
- Hover tooltip: date + SPY close + regime label + transition risk

### Chart specs — Transition risk chart

- Single `LineChart`
- Risk line: `strokeWidth: 2`, color `#06b6d4`
- Watch threshold at 10%: `ReferenceLine` with `stroke="#06b6d4"` dashed, label `"Watch (10%)"`
- Alert threshold at 30%: `ReferenceLine` with `stroke="#fbbf24"` dashed, label `"Alert (30%)"`
- Y-axis: 0–1 formatted as percentage
- Hover tooltip: date + risk value + threshold context

### Data sources

- `/historical-state` (with `start` param, default `2020-01-01`) → both charts

---

## 6. Event Replay Page

### Layout

```
Topbar: "Event Replay"

Event selector: three buttons (2008 Financial Crisis | COVID-19 2020 | Rate Tightening 2022)

Hero stats row (2 large):
  [Warning Lead Time]  [Peak Transition Risk]

Supporting stats row (3 smaller — regime match rate demoted or removed):
  [Alert Days]  [First Threshold Crossing]  [High-Stress Days]

Event description (one factual sentence, hardcoded per event)

Methodology note (caption, same for all events):
  "Replay metrics are computed from out-of-fold predictions — each day
   in this window was scored by a model that did not train on that day."

Replay chart (see below)

Replay takeaway card:
  2–3 sentence plain-English interpretation per event (hardcoded)
```

**Note on regime match rate:** Demoted — not shown in the supporting stats row. It is technically correct but visually confusing to non-experts. Can be added to a collapsed "Details" section if desired later.

### Per-event hardcoded content

**2008 Financial Crisis**
- Description: *"The 2008 financial crisis saw SPY fall more than 50% from peak as credit markets seized."*
- Takeaway: *"The model began flagging elevated risk roughly 3–4 weeks before the peak stress period. Risk stayed above the alert threshold for much of the window, reflecting the prolonged nature of the crisis rather than a single spike."*

**COVID-19 2020**
- Description: *"The COVID-19 market crash in early 2020 was one of the fastest equity declines on record."*
- Takeaway: *"This was the sharpest test — the model caught the transition but with less lead time than 2008, consistent with how rapidly conditions deteriorated. Peak risk reached the model's highest recorded readings during the window."*

**Rate Tightening 2022**
- Description: *"The 2022 rate-tightening cycle saw aggressive Fed hikes as inflation reached 40-year highs."*
- Takeaway: *"Unlike the prior two events, 2022 was a slow-burn elevated regime rather than a sudden crash. The model reflected this — risk stayed persistently moderate rather than spiking sharply, and the regime held Elevated for most of the year."*

### Replay chart specs

`ComposedChart` with three layers:
1. Actual regime (area/background band, color-coded)
2. Predicted regime (line, dashed, same color scale)
3. Transition risk (line, cyan, secondary Y-axis)

Vertical dashed marker at first day risk crossed `DEFAULT_THRESHOLD` (0.10). Red ✕ markers at `transition_actual == 1` days. Hover tooltip shows regime labels ("Calm"/"Elevated"/"Turbulent"), not numeric encodings.

### Client-side stat computations (from `data` array in `EventReplayResponse`)

All three supporting stats are computed client-side — no new schema fields needed:

```ts
const DEFAULT_THRESHOLD = 0.10  // defined in lib/constants.ts

const peakRisk = Math.max(...data.map(p => p.transition_risk ?? 0))

const alertDays = data.filter(p => (p.transition_risk ?? 0) > DEFAULT_THRESHOLD).length

const firstCrossing = data.find(p => (p.transition_risk ?? 0) > DEFAULT_THRESHOLD)?.date ?? '—'

const highStressDays = data.filter(p =>
  p.regime_actual === 'elevated' || p.regime_actual === 'turbulent'
).length
```

`warning_lead_days` comes directly from `EventReplayResponse.warning_lead_days`.

`DEFAULT_THRESHOLD = 0.10` is a named constant in `frontend/src/lib/constants.ts`. Event Replay uses this fixed value — it is not linked to the Scenario Explorer threshold slider (which is a separate per-session exploration tool).

### Data sources

- `/event-replay/{event_name}` → chart data; all stats computed client-side as above

---

## 7. Model Drivers Page

### Layout

```
Topbar: "Model Drivers"

Section A: "What usually raises risk"
  Caption: "These inputs have the strongest upward effect on transition
            risk across all historical predictions."
  Chart: horizontal bar chart, top 5–8 upward contributors, cyan bars
  Plain-English labels on Y-axis

Section B: "What usually lowers risk"  
  Caption: "These inputs tend to reduce transition risk when present."
  Chart: horizontal bar chart, top 3–5 downward contributors, green bars

Divider

Section C: "Why the latest reading looks this way"
  SHAP-based local explanation
  When SHAP available:
    "What pushed risk higher:" bullet list (top 3, plain labels + value)
    "What held risk down:" bullet list (top 3)
  When SHAP unavailable:
    "Overall, {feature_label} has the largest influence on this model's
     transition risk estimates across all historical predictions."
```

### Feature label map (canonical)

```ts
export const FEATURE_LABELS: Record<string, string> = {
  vix_pct_504d:              "VIX relative to 2-year history",
  vix_level:                 "Current VIX level",
  vix_zscore_252d:           "VIX z-score (1-year)",
  vix_chg_5d:                "VIX 5-day change",
  rv_20d_pct:                "Realized volatility percentile",
  drawdown_pct_504d:         "Drawdown relative to 2-year history",
  ret_20d:                   "20-day SPY return",
  momentum_20d:              "20-day momentum",
  dist_sma50:                "Distance from 50-day moving average",
  emv_level:                 "Equity market volatility index",
  days_in_regime_lag1:       "Days in current regime (lagged)",
  turbulent_count_30d_lag1:  "Turbulent days in past 30 days (lagged)",
  trend_code:                "Trend direction",
}
```

De-duplication: if both `momentum_20d` and `ret_20d` appear as top contributors in the same direction, show only `momentum_20d`.

### Data sources

- `/model-drivers` → global importance (sections A + B) and local SHAP explanation (section C)

---

## 8. Scenario Explorer Page

### Layout

```
Topbar: "Scenario Explorer" + "↺ Reset to current market" button

Two-column body:
  Left col (276px, fixed):
    Section: Quick scenarios
      [📍 Current] [🌤 Calm] [⚡ Choppy] [🔴 Stress Spike]
    Divider
    Section: Manual inputs (6 sliders)
    Divider
    Section: Alert threshold (slider + 3 metric cards)

  Right col (flex, scrollable):
    Panel 1: Risk zone rail  ← replaces old baseline/scenario cards
    Panel 2: Regime probability shift
    Panel 3: What this scenario means (narrative, max 2–3 sentences)
    Panel 4: What changed the most (driver deltas)
```

### Sliders

| Label | Feature key | Range | Helper text |
|---|---|---|---|
| VIX Level | `vix_level` | 5–80 | "Market fear gauge — higher = more fear" |
| VIX 5-day Change | `vix_chg_5d` | −15–15 | "How fast fear is rising or falling" |
| Realized Vol Percentile | `rv_20d_pct` | 0.0–1.0 | "How unusually jumpy the market has been" |
| Drawdown | `drawdown_pct_504d` | 0.0–1.0 | "How far prices have fallen from a recent high" |
| 20-day Return | `ret_20d` | −0.30–0.30 | "Recent price performance" |
| Distance from SMA-50 | `dist_sma50` | −0.15–0.15 | "How far price is from its 50-day average" |

Slider thumb + fill color: cyan when value is in calm range, amber when elevated, red when stressed (per-slider thresholds hardcoded in `lib/sliderRanges.ts`).

### Preset scenarios

| Button | Values |
|---|---|
| 📍 Current | Seeded from latest panel row; falls back to defaults |
| 🌤 Calm | `vix: 13, chg: -1.0, rv: 0.25, dd: 0.02, ret: 0.03, sma: 0.02` |
| ⚡ Choppy | `vix: 22, chg: 2.0, rv: 0.65, dd: 0.08, ret: -0.01, sma: -0.01` |
| 🔴 Stress Spike | `vix: 35, chg: 6.0, rv: 0.85, dd: 0.20, ret: -0.08, sma: -0.06` |

### Risk zone rail

```
Numbers row: [Baseline 18%]  →  [Scenario 47%]  +29pp
Gradient track (green → amber → red), 8px height
  Threshold markers: Watch (10%, cyan dashed) · Alert (30%, amber dashed)
  Markers: B dot (baseline position) · S dot (scenario position)
  Dashed bridge between B and S
Zone labels below: Low · Moderate · Elevated · High Stress
```

B and S dots animate via Framer Motion spring on each API response. Zone boundaries: Low 0–15% · Moderate 15–35% · Elevated 35–65% · High Stress 65–100%.

### Regime probability shift

Three rows (Calm / Elevated / Turbulent). Each row: label + paired bar tracks (dim baseline + bright scenario) + numeric before → after. Color-coded per regime.

### Scenario narrative template

Max 2–3 sentences:
```
"Raising {changed_features} pushes transition risk from {baseline:.0%} to {scenario:.0%}. 
The model is most sensitive to {top_driver}. 
{regime_implication_sentence}"
```

Regime implication: if scenario calm probability < 50%, add "The probability of staying Calm drops below half."

### Threshold tuning (compact, in left col)

Single slider (0.10–0.70, step 0.10). Three metric cards: Recall · False Alerts · Lead Time.

Data source: `GET /model-drivers` already returns model metadata via `load_metadata("xgb_transition")`. The `threshold_sweep` key in that metadata contains a list of dicts at steps of 0.10:

```python
# Structure in model metadata (written by train_transition_model.py)
threshold_sweep = [
  {"threshold": 0.10, "recall": 0.54, "false_alert_rate": 0.22,
   "alert_frequency": 0.34, "avg_lead_time_days": 33.0},
  {"threshold": 0.20, ...},
  ...
]
```

The frontend reads `modelDriversResponse.threshold_sweep` (add this field to `ModelDriversResponse` in `schemas.py`), finds the matching row for the selected threshold, and renders the three cards. If `threshold_sweep` is missing or empty (older model artifacts), show a "Threshold data unavailable" message instead of crashing.

**Schema addition required:** Add `threshold_sweep: list[dict] = []` to `ModelDriversResponse` in `schemas.py`, and populate it from `meta.get("threshold_sweep", [])` in the `/model-drivers` route handler.

### API interaction

- `POST /scenario` called on every slider change, debounced 120ms
- Presets snap all sliders and trigger a single API call
- Threshold slider reads only from model metadata — no API call

### Data sources

- `POST /scenario` → risk rail, regime bars, narrative, driver deltas
- Model metadata (cached) → threshold tuning

---

## 9. Tooltips & Accessibility

Lightweight tooltips (shadcn/ui `Tooltip` component) on first mention of each term on its page:

| Term | Tooltip text |
|---|---|
| VIX | "A measure of expected market volatility, often called the 'fear gauge'" |
| Transition risk | "The model's estimate of the chance conditions worsen within the next week" |
| Drawdown | "How far prices have fallen from a recent peak" |
| Realized volatility | "How unusually jumpy the market has been recently" |
| Market regime | "A label (Calm / Elevated / Turbulent) describing the current market stress level" |
| Alert threshold | "The risk level above which the model considers an alert to be active" |

---

## 10. Backend Changes Summary

| File | Change |
|---|---|
| `src/api/main.py` | Add `CORSMiddleware`; read allowed origin from `CORS_ORIGIN` env var (default `http://localhost:3000`) so non-local deployments don't require source edits |
| `src/api/routes.py` | (1) Update `/current-state` handler to call `read_prior_state()` and populate `delta` field; (2) Add `POST /scenario` route |
| `src/api/schemas.py` | Add `ScenarioRequest`, `ScenarioResponse`, `DriverDelta`, `StateDelta`; add `delta: StateDelta \| None = None` to `CurrentStateResponse`; add `threshold_sweep: list[dict] = []` to `ModelDriversResponse` |
| `src/api/state.py` | No changes needed — `read_prior_state()` already exists |

All other backend files unchanged.

---

## 11. Docker / Local Run Instructions

**Start everything:**
```bash
docker compose up --build
```

- FastAPI: `http://localhost:8000`
- React frontend: `http://localhost:3000`
- Streamlit (during migration): `http://localhost:8501`

**Frontend dev (hot reload, outside Docker):**
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```
Requires `VITE_API_URL=http://localhost:8000` in `frontend/.env.local`.

**Remove Streamlit once React reaches parity:**
```bash
# In docker-compose.yml: delete the 'dashboard' service block
docker compose up --build
```

---

## 12. What Is NOT in Scope

- No new data sources
- No model retraining
- No trading language anywhere
- No auth or user accounts
- No SSR (Vite SPA only)
- No changes to the ML pipeline
- No API proxy layer
- No tests for React components (TDD for any new Python code in the backend changes)
