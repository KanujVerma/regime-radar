# React Frontend Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Streamlit dashboard with a React + TypeScript SPA while keeping FastAPI + ML pipeline intact; add one new backend endpoint (`POST /scenario`).

**Architecture:** Vite SPA (`frontend/`) served by Nginx on port 3000 in Docker Compose; FastAPI on port 8000 with CORS enabled; Streamlit stays on 8501 during migration. React calls FastAPI directly via typed fetch wrappers.

**Tech Stack:** Vite, React 18, TypeScript (strict), Tailwind CSS, shadcn/ui, Framer Motion, Recharts, React Router v6, FastAPI (existing), pytest (backend TDD)

---

## Chunk 1: Backend Changes

### Task 1: Add CORS middleware to FastAPI

**Files:**
- Modify: `src/api/main.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_api_smoke.py`:

```python
def test_cors_header_present(monkeypatch, tmp_path):
    # CORS_ORIGIN must be set before create_app() so the middleware captures it
    monkeypatch.setenv("CORS_ORIGIN", "http://localhost:3000")
    from src.api.state import AppState
    state = AppState(db_path=tmp_path / "test.db")
    app = create_app(app_state=state, start_scheduler=False)
    client = TestClient(app)
    resp = client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_api_smoke.py::test_cors_header_present -v`
Expected: FAIL — header not present

- [ ] **Step 3: Add CORSMiddleware to `src/api/main.py`**

Insert after the existing imports, inside `create_app`, before `app.include_router(router)`:

```python
import os
from fastapi.middleware.cors import CORSMiddleware

# inside create_app(), after app = FastAPI(...)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:3000")],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_api_smoke.py::test_cors_header_present -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/main.py tests/test_api_smoke.py
git commit -m "feat: add CORS middleware to FastAPI app"
```

---

### Task 2: Extend schemas — StateDelta, ScenarioRequest/Response, threshold_sweep

**Files:**
- Modify: `src/api/schemas.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_api_smoke.py`:

```python
def test_current_state_response_has_delta_field():
    from src.api.schemas import CurrentStateResponse
    import inspect
    fields = CurrentStateResponse.model_fields
    assert "delta" in fields

def test_model_drivers_response_has_threshold_sweep():
    from src.api.schemas import ModelDriversResponse
    fields = ModelDriversResponse.model_fields
    assert "threshold_sweep" in fields

def test_scenario_response_schema_exists():
    from src.api.schemas import ScenarioResponse, ScenarioRequest, DriverDelta
    req = ScenarioRequest(
        vix_level=20.0, vix_chg_5d=1.0, rv_20d_pct=0.5,
        drawdown_pct_504d=0.1, ret_20d=0.01, dist_sma50=0.02,
    )
    assert req.vix_level == 20.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_api_smoke.py -k "schema" -v`
Expected: FAIL — classes/fields not found

- [ ] **Step 3: Add new schemas to `src/api/schemas.py`**

Append after the last class:

```python
class StateDelta(BaseModel):
    risk_delta: float
    regime_changed: bool
    prior_regime: str | None
    top_feature_moved: str | None
    top_feature_direction: str | None


class DriverDelta(BaseModel):
    feature: str
    plain_label: str
    delta_value: float


class ScenarioRequest(BaseModel):
    vix_level: float
    vix_chg_5d: float
    rv_20d_pct: float
    drawdown_pct_504d: float
    ret_20d: float
    dist_sma50: float


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
    driver_deltas: list[DriverDelta]
```

Update `CurrentStateResponse` — add `delta` field:

```python
class CurrentStateResponse(BaseModel):
    # ... existing fields ...
    delta: StateDelta | None = None
```

Update `ModelDriversResponse` — add `threshold_sweep` field:

```python
class ModelDriversResponse(BaseModel):
    global_importance: list[DriverItem]
    local_explanation: dict[str, float]
    threshold_sweep: list[dict] = []
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_api_smoke.py -k "schema" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/schemas.py tests/test_api_smoke.py
git commit -m "feat: add StateDelta, ScenarioRequest/Response schemas; extend CurrentState and ModelDrivers"
```

---

### Task 3: Update `/current-state` to populate StateDelta

**Files:**
- Modify: `src/api/routes.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_api_smoke.py`:

```python
def test_current_state_delta_populated_with_two_rows(app_with_state):
    app, state = app_with_state
    state.write_state({
        "as_of_ts": "2024-01-01T00:00:00+00:00",
        "regime": "calm", "transition_risk": 0.10,
        "trend": "uptrend", "vix_level": 15.0, "vix_chg_1d": 0.0,
        "top_drivers": [{"feature": "vix_level", "importance": 0.4}],
        "mode": "demo", "price_card_price": None,
    })
    state.write_state({
        "as_of_ts": "2024-01-02T00:00:00+00:00",
        "regime": "elevated", "transition_risk": 0.25,
        "trend": "neutral", "vix_level": 22.0, "vix_chg_1d": 0.5,
        "top_drivers": [{"feature": "vix_level", "importance": 0.4}],
        "mode": "demo", "price_card_price": None,
    })
    client = TestClient(app)
    resp = client.get("/current-state")
    assert resp.status_code == 200
    data = resp.json()
    assert data["delta"] is not None
    assert data["delta"]["risk_delta"] == pytest.approx(0.15, abs=0.01)
    assert data["delta"]["regime_changed"] is True
    assert data["delta"]["prior_regime"] == "calm"

def test_current_state_delta_none_with_one_row(app_with_state):
    app, state = app_with_state
    state.write_state({
        "as_of_ts": "2024-01-01T00:00:00+00:00",
        "regime": "calm", "transition_risk": 0.10,
        "trend": "uptrend", "vix_level": 15.0, "vix_chg_1d": 0.0,
        "top_drivers": [], "mode": "demo", "price_card_price": None,
    })
    client = TestClient(app)
    resp = client.get("/current-state")
    assert resp.status_code == 200
    assert resp.json()["delta"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_api_smoke.py -k "delta" -v`
Expected: FAIL — delta is None / missing

- [ ] **Step 3: Update `/current-state` handler in `src/api/routes.py`**

Replace the `current_state` handler body:

```python
@router.get("/current-state", response_model=CurrentStateResponse)
async def current_state(request: Request):
    from src.api.schemas import StateDelta
    app_state = _get_state(request)
    latest = app_state.read_latest_state()
    if latest is None:
        raise HTTPException(status_code=503, detail="No state available. Run /refresh-data first.")

    drivers = [DriverItem(**d) for d in (latest.get("top_drivers") or [])]

    delta = None
    prior = app_state.read_prior_state()
    if prior is not None:
        risk_delta = (latest.get("transition_risk") or 0.0) - (prior.get("transition_risk") or 0.0)
        regime_changed = latest.get("regime") != prior.get("regime")
        top_driver = drivers[0].feature if drivers else None
        delta = StateDelta(
            risk_delta=risk_delta,
            regime_changed=regime_changed,
            prior_regime=prior.get("regime"),
            top_feature_moved=top_driver,
            top_feature_direction="up" if risk_delta > 0 else "down",
        )

    return CurrentStateResponse(
        regime=latest.get("regime", "unknown"),
        transition_risk=latest.get("transition_risk", 0.0),
        trend=latest.get("trend", "neutral"),
        vix_level=latest.get("vix_level"),
        vix_chg_1d=latest.get("vix_chg_1d"),
        top_drivers=drivers,
        as_of_ts=latest.get("as_of_ts", ""),
        mode=latest.get("mode", "demo"),
        prob_calm=latest.get("prob_calm"),
        prob_elevated=latest.get("prob_elevated"),
        prob_turbulent=latest.get("prob_turbulent"),
        delta=delta,
    )
```

**Prerequisite:** Task 2 must be committed before applying this task — the import below references `ScenarioRequest`, `ScenarioResponse`, and `DriverDelta` which are added in Task 2.

Also update the import at the top of routes.py to include `StateDelta`:

```python
from src.api.schemas import (
    HealthResponse, CurrentStateResponse, HistoricalStateResponse,
    EventReplayResponse, ModelDriversResponse, DriverItem,
    HistoricalPoint, EventReplayPoint, TransitionRiskResponse, TransitionRiskPoint,
    StateDelta, ScenarioRequest, ScenarioResponse, DriverDelta,
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_api_smoke.py -k "delta" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/routes.py
git commit -m "feat: populate StateDelta in /current-state from read_prior_state()"
```

---

### Task 4: Update `/model-drivers` to include threshold_sweep

**Files:**
- Modify: `src/api/routes.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_api_smoke.py`:

```python
def test_model_drivers_threshold_sweep_field_present(app_with_state):
    """threshold_sweep is always present (may be empty list if artifacts missing)."""
    app, _ = app_with_state
    client = TestClient(app)
    resp = client.get("/model-drivers")
    # 503 is acceptable when no model artifacts present; we just need to verify
    # the field is present when the endpoint succeeds. Mock the artifact:
    if resp.status_code == 503:
        pytest.skip("No model artifacts — skipping threshold_sweep field check")
    data = resp.json()
    assert "threshold_sweep" in data
    assert isinstance(data["threshold_sweep"], list)
```

- [ ] **Step 2: Run test to see it fails or skips**

Run: `pytest tests/test_api_smoke.py::test_model_drivers_threshold_sweep_field_present -v`

- [ ] **Step 3: Add `threshold_sweep` to the `/model-drivers` handler**

In `src/api/routes.py`, update the `return ModelDriversResponse(...)` call at the end of `model_drivers`:

```python
    return ModelDriversResponse(
        global_importance=global_imp[:20],
        local_explanation=local_exp,
        threshold_sweep=meta.get("threshold_sweep", []),
    )
```

- [ ] **Step 4: Run full test suite**

Run: `pytest tests/ -v`
Expected: all pass (or skip if no artifacts)

- [ ] **Step 5: Commit**

```bash
git add src/api/routes.py
git commit -m "feat: expose threshold_sweep in /model-drivers response"
```

---

### Task 5: Add `POST /scenario` endpoint

**Files:**
- Modify: `src/api/routes.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_api_smoke.py`:

```python
def test_scenario_returns_503_without_artifacts(app_with_state):
    app, _ = app_with_state
    client = TestClient(app)
    payload = {
        "vix_level": 25.0, "vix_chg_5d": 3.0, "rv_20d_pct": 0.7,
        "drawdown_pct_504d": 0.15, "ret_20d": -0.05, "dist_sma50": -0.04,
    }
    resp = client.post("/scenario", json=payload)
    assert resp.status_code == 503

def test_scenario_response_shape(app_with_state, monkeypatch):
    """With mocked models and panel, POST /scenario returns expected shape."""
    import numpy as np
    import pandas as pd

    app, _ = app_with_state

    class _FakeModel:
        feature_importances_ = np.array([0.3, 0.2, 0.1, 0.2, 0.1, 0.1])
        feature_names_in_ = ["vix_level", "vix_chg_5d", "rv_20d_pct",
                             "drawdown_pct_504d", "ret_20d", "dist_sma50"]
        def predict_proba(self, X):
            n = len(X)
            # transition model: shape (n, 2); regime model: shape (n, 3)
            if self._n_classes == 2:
                return np.array([[0.7, 0.3]] * n)
            return np.array([[0.5, 0.3, 0.2]] * n)

    fake_transition = _FakeModel(); fake_transition._n_classes = 2
    fake_regime = _FakeModel(); fake_regime._n_classes = 3

    panel_df = pd.DataFrame(
        {f: [15.0] for f in fake_transition.feature_names_in_},
        index=pd.to_datetime(["2024-01-01"]),
    )

    import src.models.registry as reg
    monkeypatch.setattr(reg, "artifact_exists", lambda name: True)
    monkeypatch.setattr(reg, "load_artifact", lambda name: fake_transition if "transition" in name else fake_regime)
    monkeypatch.setattr(reg, "load_metadata", lambda name: {
        "feature_names": fake_transition.feature_names_in_,
        "feature_importances": fake_transition.feature_importances_.tolist(),
    })

    import pandas as pd
    monkeypatch.setattr("src.api.routes.pd.read_parquet", lambda p: panel_df)

    client = TestClient(app)
    payload = {
        "vix_level": 30.0, "vix_chg_5d": 5.0, "rv_20d_pct": 0.8,
        "drawdown_pct_504d": 0.2, "ret_20d": -0.07, "dist_sma50": -0.05,
    }
    resp = client.post("/scenario", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    for field in ["baseline_risk", "scenario_risk", "delta", "prob_calm",
                  "prob_elevated", "prob_turbulent", "baseline_prob_calm",
                  "baseline_prob_elevated", "baseline_prob_turbulent", "driver_deltas"]:
        assert field in data
    assert isinstance(data["driver_deltas"], list)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_api_smoke.py -k "scenario" -v`
Expected: both tests FAIL — `test_scenario_returns_503_without_artifacts` gets 404 (route doesn't exist yet, not 503), `test_scenario_response_shape` gets 404

- [ ] **Step 3: Add `POST /scenario` route to `src/api/routes.py`**

Append after the `model_drivers` handler:

```python
FEATURE_PLAIN_LABELS = {
    "vix_pct_504d":             "VIX relative to 2-year history",
    "vix_level":                "Current VIX level",
    "vix_zscore_252d":          "VIX z-score (1-year)",
    "vix_chg_5d":               "VIX 5-day change",
    "rv_20d_pct":               "Realized volatility percentile",
    "drawdown_pct_504d":        "Drawdown relative to 2-year history",
    "ret_20d":                  "20-day SPY return",
    "momentum_20d":             "20-day momentum",
    "dist_sma50":               "Distance from 50-day moving average",
    "emv_level":                "Equity market volatility index",
    "days_in_regime_lag1":      "Days in current regime (lagged)",
    "turbulent_count_30d_lag1": "Turbulent days in past 30 days (lagged)",
    "trend_code":               "Trend direction",
}


@router.post("/scenario", response_model=ScenarioResponse)
async def scenario(request: Request, body: ScenarioRequest):
    from src.models.registry import artifact_exists, load_artifact, load_metadata
    from src.utils.paths import PROCESSED_DIR
    from pathlib import Path
    import numpy as np

    for name in ("xgb_transition", "xgb_regime"):
        if not artifact_exists(name):
            raise HTTPException(status_code=503, detail=f"{name} artifact not found. Run bootstrap_data.py.")

    transition_model = load_artifact("xgb_transition")
    regime_model = load_artifact("xgb_regime")
    meta = load_metadata("xgb_transition")
    feature_names: list[str] = meta.get("feature_names", [])
    feature_importances: list[float] = meta.get("feature_importances",
        list(transition_model.feature_importances_))

    # Build baseline vector from latest panel row
    panel_path = Path(PROCESSED_DIR) / "panel.parquet"
    if panel_path.exists():
        panel = pd.read_parquet(panel_path)
        last_row = panel.iloc[-1]
        baseline_vec = {f: float(last_row[f]) if f in last_row.index else 0.0
                        for f in feature_names}
    else:
        baseline_vec = {f: 0.0 for f in feature_names}

    # Scenario vector = baseline overridden with 6 request fields
    overrides = {
        "vix_level": body.vix_level,
        "vix_chg_5d": body.vix_chg_5d,
        "rv_20d_pct": body.rv_20d_pct,
        "drawdown_pct_504d": body.drawdown_pct_504d,
        "ret_20d": body.ret_20d,
        "dist_sma50": body.dist_sma50,
    }
    scenario_vec = {**baseline_vec, **overrides}

    X_base = pd.DataFrame([baseline_vec])[feature_names].fillna(0)
    X_scen = pd.DataFrame([scenario_vec])[feature_names].fillna(0)

    baseline_risk = float(transition_model.predict_proba(X_base)[0, 1])
    scenario_risk = float(transition_model.predict_proba(X_scen)[0, 1])

    base_regime_probs = regime_model.predict_proba(X_base)[0]
    scen_regime_probs = regime_model.predict_proba(X_scen)[0]

    # Driver deltas: top-5 by |delta_val * importance|
    imp_map = dict(zip(feature_names, feature_importances))
    deltas = []
    for feat in overrides:
        if feat in imp_map:
            delta_val = scenario_vec.get(feat, 0.0) - baseline_vec.get(feat, 0.0)
            score = abs(delta_val * imp_map[feat])
            deltas.append((feat, delta_val, score))
    deltas.sort(key=lambda x: x[2], reverse=True)

    driver_deltas = [
        DriverDelta(
            feature=feat,
            plain_label=FEATURE_PLAIN_LABELS.get(feat, feat),
            delta_value=round(dv, 4),
        )
        for feat, dv, _ in deltas[:5]
    ]

    return ScenarioResponse(
        baseline_risk=round(baseline_risk, 4),
        scenario_risk=round(scenario_risk, 4),
        delta=round(scenario_risk - baseline_risk, 4),
        prob_calm=round(float(scen_regime_probs[0]), 4),
        prob_elevated=round(float(scen_regime_probs[1]), 4),
        prob_turbulent=round(float(scen_regime_probs[2]), 4),
        baseline_prob_calm=round(float(base_regime_probs[0]), 4),
        baseline_prob_elevated=round(float(base_regime_probs[1]), 4),
        baseline_prob_turbulent=round(float(base_regime_probs[2]), 4),
        driver_deltas=driver_deltas,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_api_smoke.py -k "scenario" -v`
Expected: PASS

Run full suite: `pytest tests/ -v`

- [ ] **Step 5: Commit**

```bash
git add src/api/routes.py
git commit -m "feat: add POST /scenario endpoint for Scenario Explorer"
```

---

### Task 6: Update docker-compose.yml to add frontend service

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add frontend service**

Add the following service block to `docker-compose.yml` (before the `volumes:` section):

```yaml
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - VITE_API_URL=http://localhost:8000
    ports:
      - "3000:80"
    depends_on:
      api:
        condition: service_healthy
```

- [ ] **Step 2: Verify docker-compose.yml parses cleanly**

Run: `docker compose config --quiet`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add frontend service to docker-compose.yml"
```

---

## Chunk 2: Frontend Scaffold

### Task 7: Initialize Vite + React + TypeScript project

**Files:**
- Create: `frontend/` (new directory)
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tailwind.config.ts`, `frontend/postcss.config.js`, `frontend/index.html`
- Create: `frontend/src/main.tsx`, `frontend/src/App.tsx`

- [ ] **Step 1: Scaffold the Vite project**

```bash
cd /Users/kanuj/regime-radar
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

- [ ] **Step 2: Install dependencies**

```bash
npm install \
  tailwindcss @tailwindcss/vite \
  framer-motion \
  recharts \
  react-router-dom \
  clsx tailwind-merge \
  lucide-react \
  @radix-ui/react-tooltip \
  @radix-ui/react-slider \
  @radix-ui/react-separator

npm install -D \
  @types/react @types/react-dom \
  eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

- [ ] **Step 3: Configure Tailwind**

Replace `frontend/tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#080b12',
        surface: '#0c1020',
        sidebar: '#0a0d16',
        border: '#151d2e',
        cyan: '#06b6d4',
        'cyan-dim': '#0e4d6e',
      },
    },
  },
  plugins: [],
} satisfies Config
```

Create `frontend/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 4: Configure vite.config.ts**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
})
```

- [ ] **Step 5: Create `.env.local` for local dev**

```
VITE_API_URL=http://localhost:8000
```

(Do not commit this file — add to `frontend/.gitignore`)

- [ ] **Step 6: Create `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 7: Create `frontend/nginx.conf`**

```nginx
server {
    listen 80;
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 8: Verify dev server starts**

Run: `cd frontend && npm run dev`
Expected: server starts at http://localhost:5173 with default Vite page

- [ ] **Step 9: Commit**

```bash
cd ..
git add frontend/
git commit -m "feat: scaffold Vite + React + TypeScript frontend"
```

---

### Task 8: Create design tokens, types, API client, and constants

**Files:**
- Create: `frontend/src/lib/tokens.ts`
- Create: `frontend/src/lib/constants.ts`
- Create: `frontend/src/lib/featureLabels.ts`
- Create: `frontend/src/types/api.ts`
- Create: `frontend/src/api/client.ts`

- [ ] **Step 1: Create `frontend/src/lib/tokens.ts`**

```ts
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
} as const

export const regimeColor: Record<string, string> = {
  calm: colors.green,
  elevated: colors.amber,
  turbulent: colors.red,
  unknown: colors.textMuted,
}
```

- [ ] **Step 2: Create `frontend/src/lib/constants.ts`**

```ts
export const DEFAULT_THRESHOLD = 0.10
export const ALERT_THRESHOLD = 0.30

export const RISK_ZONES = [
  { label: 'Low',        min: 0,    max: 0.15, color: '#166534' },
  { label: 'Moderate',   min: 0.15, max: 0.35, color: '#92400e' },
  { label: 'Elevated',   min: 0.35, max: 0.65, color: '#b45309' },
  { label: 'High Stress',min: 0.65, max: 1.0,  color: '#7f1d1d' },
] as const
```

- [ ] **Step 3: Create `frontend/src/lib/featureLabels.ts`**

```ts
export const FEATURE_LABELS: Record<string, string> = {
  vix_pct_504d:             'VIX relative to 2-year history',
  vix_level:                'Current VIX level',
  vix_zscore_252d:          'VIX z-score (1-year)',
  vix_chg_5d:               'VIX 5-day change',
  rv_20d_pct:               'Realized volatility percentile',
  drawdown_pct_504d:        'Drawdown relative to 2-year history',
  ret_20d:                  '20-day SPY return',
  momentum_20d:             '20-day momentum',
  dist_sma50:               'Distance from 50-day moving average',
  emv_level:                'Equity market volatility index',
  days_in_regime_lag1:      'Days in current regime (lagged)',
  turbulent_count_30d_lag1: 'Turbulent days in past 30 days (lagged)',
  trend_code:               'Trend direction',
}

export function labelFor(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature
}
```

- [ ] **Step 4: Create `frontend/src/types/api.ts`**

```ts
export interface DriverItem {
  feature: string
  importance: number
}

export interface StateDelta {
  risk_delta: number
  regime_changed: boolean
  prior_regime: string | null
  top_feature_moved: string | null
  top_feature_direction: 'up' | 'down' | null
}

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
}

export interface HistoricalPoint {
  date: string
  regime: string
  transition_risk: number | null
  vix_level: number | null
  close: number | null
}

export interface HistoricalStateResponse {
  data: HistoricalPoint[]
  start: string
  end: string
}

export interface EventReplayPoint {
  date: string
  regime_actual: string
  regime_predicted: string
  transition_risk: number | null
  transition_actual: number
}

export interface EventReplayResponse {
  event_name: string
  warning_lead_days: number | null
  data: EventReplayPoint[]
}

export interface ModelDriversResponse {
  global_importance: DriverItem[]
  local_explanation: Record<string, number>
  threshold_sweep: ThresholdSweepRow[]
}

export interface ThresholdSweepRow {
  threshold: number
  recall: number
  false_alert_rate: number
  alert_frequency: number
  avg_lead_time_days: number
}

export interface DriverDelta {
  feature: string
  plain_label: string
  delta_value: number
}

export interface ScenarioRequest {
  vix_level: number
  vix_chg_5d: number
  rv_20d_pct: number
  drawdown_pct_504d: number
  ret_20d: number
  dist_sma50: number
}

export interface ScenarioResponse {
  baseline_risk: number
  scenario_risk: number
  delta: number
  prob_calm: number
  prob_elevated: number
  prob_turbulent: number
  baseline_prob_calm: number
  baseline_prob_elevated: number
  baseline_prob_turbulent: number
  driver_deltas: DriverDelta[]
}
```

- [ ] **Step 5: Create `frontend/src/api/client.ts`**

```ts
import type {
  CurrentStateResponse,
  HistoricalStateResponse,
  EventReplayResponse,
  ModelDriversResponse,
  ScenarioRequest,
  ScenarioResponse,
} from '../types/api'

const BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000'

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`)
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText} — ${path}`)
  return resp.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText} — ${path}`)
  return resp.json() as Promise<T>
}

export const api = {
  currentState: () => get<CurrentStateResponse>('/current-state'),
  historicalState: (start = '2020-01-01') =>
    get<HistoricalStateResponse>(`/historical-state?start=${start}`),
  eventReplay: (name: string) =>
    get<EventReplayResponse>(`/event-replay/${name}`),
  modelDrivers: () => get<ModelDriversResponse>('/model-drivers'),
  scenario: (body: ScenarioRequest) =>
    post<ScenarioResponse>('/scenario', body),
}
```

- [ ] **Step 6: Verify TypeScript compiles cleanly**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: add design tokens, API types, and typed API client"
```

---

### Task 9: App shell — sidebar, topbar, routing

**Files:**
- Create: `frontend/src/components/layout/Sidebar.tsx`
- Create: `frontend/src/components/layout/Topbar.tsx`
- Create: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`
- Create placeholder pages: `frontend/src/pages/CurrentState.tsx`, `History.tsx`, `EventReplay.tsx`, `ModelDrivers.tsx`, `ScenarioExplorer.tsx`

- [ ] **Step 1: Create placeholder pages**

Each placeholder is identical in structure:

```tsx
// frontend/src/pages/CurrentState.tsx
export default function CurrentState() {
  return <div className="p-6 text-slate-300">Current State — coming soon</div>
}
```

Repeat for `History`, `EventReplay`, `ModelDrivers`, `ScenarioExplorer`.

- [ ] **Step 2: Create `frontend/src/components/layout/Sidebar.tsx`**

```tsx
import { NavLink } from 'react-router-dom'
import { Activity, Clock, Archive, BarChart2, Sliders } from 'lucide-react'

const NAV = [
  {
    group: 'Monitor',
    items: [
      { to: '/', label: 'Current State', icon: Activity },
      { to: '/history', label: 'History', icon: Clock },
      { to: '/event-replay', label: 'Event Replay', icon: Archive },
    ],
  },
  {
    group: 'Explore',
    items: [
      { to: '/model-drivers', label: 'Model Drivers', icon: BarChart2 },
      { to: '/scenario', label: 'Scenario Explorer', icon: Sliders },
    ],
  },
]

export default function Sidebar() {
  return (
    <aside
      className="fixed top-0 left-0 h-full flex flex-col"
      style={{ width: 196, background: '#0a0d16', borderRight: '1px solid #151d2e' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="w-2 h-2 rounded-full bg-cyan-400" />
        <div>
          <div className="text-sm font-bold text-slate-100 tracking-tight">RegimeRadar</div>
          <div className="text-[9px] text-slate-500 tracking-widest uppercase">Market Monitor</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 mt-2">
        {NAV.map(({ group, items }) => (
          <div key={group} className="mb-4">
            <div className="px-2 mb-1 text-[9px] font-bold tracking-widest uppercase text-slate-600">{group}</div>
            {items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-2.5 px-3 py-2 rounded-md mb-0.5 text-[11px] font-medium transition-colors',
                    isActive
                      ? 'text-cyan-400 border-l-2 border-cyan-400 pl-[10px]'
                      : 'text-slate-400 hover:text-slate-200',
                  ].join(' ')
                }
                style={({ isActive }) =>
                  isActive
                    ? { background: 'linear-gradient(90deg, #061d2e, #070f1c)' }
                    : {}
                }
              >
                <Icon size={13} />
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-800">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-[9px] font-bold tracking-widest uppercase text-slate-500">Near-live data</span>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Create `frontend/src/components/layout/Topbar.tsx`**

```tsx
interface TopbarProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
}

export default function Topbar({ title, subtitle, action }: TopbarProps) {
  return (
    <div
      className="flex items-center justify-between px-6"
      style={{ height: 48, borderBottom: '1px solid #151d2e', background: '#080b12' }}
    >
      <div>
        <div className="text-[17px] font-bold text-slate-100 leading-tight">{title}</div>
        {subtitle && <div className="text-[10px] text-slate-500">{subtitle}</div>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Create `frontend/src/components/layout/AppShell.tsx`**

```tsx
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function AppShell() {
  return (
    <div className="min-h-screen" style={{ background: '#080b12' }}>
      <Sidebar />
      <main style={{ marginLeft: 196, minHeight: '100vh' }}>
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Wire up `frontend/src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import AppShell from './components/layout/AppShell'
import CurrentState from './pages/CurrentState'
import History from './pages/History'
import EventReplay from './pages/EventReplay'
import ModelDrivers from './pages/ModelDrivers'
import ScenarioExplorer from './pages/ScenarioExplorer'

export default function App() {
  return (
    <BrowserRouter>
      <AnimatePresence mode="wait">
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<CurrentState />} />
            <Route path="history" element={<History />} />
            <Route path="event-replay" element={<EventReplay />} />
            <Route path="model-drivers" element={<ModelDrivers />} />
            <Route path="scenario" element={<ScenarioExplorer />} />
          </Route>
        </Routes>
      </AnimatePresence>
    </BrowserRouter>
  )
}
```

- [ ] **Step 6: Update `frontend/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 7: Update `frontend/src/index.css`**

```css
@import "tailwindcss";

* { box-sizing: border-box; }
body {
  margin: 0;
  background: #080b12;
  color: #e2e8f0;
  font-family: 'Inter', system-ui, sans-serif;
}
```

- [ ] **Step 8: Verify TypeScript and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no errors, `dist/` created

- [ ] **Step 9: Commit**

```bash
git add frontend/src/
git commit -m "feat: add app shell — sidebar, topbar, routing with placeholder pages"
```

---

## Chunk 3: Current State + History Pages

### Task 10: Shared UI components — MetricCard, RegimeBadge, DriverBar

**Files:**
- Create: `frontend/src/components/ui/MetricCard.tsx`
- Create: `frontend/src/components/ui/RegimeBadge.tsx`
- Create: `frontend/src/components/ui/DriverBar.tsx`
- Create: `frontend/src/components/ui/Panel.tsx`

- [ ] **Step 1: Create `frontend/src/components/ui/Panel.tsx`**

```tsx
interface PanelProps {
  title?: string
  children: React.ReactNode
  className?: string
}

export default function Panel({ title, children, className = '' }: PanelProps) {
  return (
    <div
      className={`rounded-xl p-5 ${className}`}
      style={{ background: '#0c1020', border: '1px solid #151d2e' }}
    >
      {title && (
        <div
          className="text-[9px] font-bold tracking-widest uppercase mb-4 pb-2.5"
          style={{ color: '#2d4060', borderBottom: '1px solid #131b2a' }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/src/components/ui/MetricCard.tsx`**

```tsx
interface MetricCardProps {
  label: string
  value: string
  subtitle?: string
  valueColor?: string
  delta?: { label: string; positive: boolean } | null
}

export default function MetricCard({ label, value, subtitle, valueColor = '#f1f5f9', delta }: MetricCardProps) {
  return (
    <div
      className="relative rounded-[10px] px-4 py-3.5"
      style={{ background: '#0c1020', border: '1px solid #151d2e' }}
    >
      {delta && (
        <span
          className="absolute top-2.5 right-3 text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{
            background: delta.positive ? '#052e1620' : '#450a0a20',
            color: delta.positive ? '#4ade80' : '#f87171',
          }}
        >
          {delta.label}
        </span>
      )}
      <div className="text-[9px] font-bold tracking-widest uppercase mb-1.5" style={{ color: '#2d4060' }}>
        {label}
      </div>
      <div className="text-[22px] font-extrabold tracking-tight leading-none" style={{ color: valueColor }}>
        {value}
      </div>
      {subtitle && <div className="text-[9px] mt-1" style={{ color: '#334155' }}>{subtitle}</div>}
    </div>
  )
}
```

- [ ] **Step 3: Create `frontend/src/components/ui/RegimeBadge.tsx`**

```tsx
import { regimeColor } from '../../lib/tokens'

interface RegimeBadgeProps {
  regime: string
  probability?: number | null
}

export default function RegimeBadge({ regime, probability }: RegimeBadgeProps) {
  const color = regimeColor[regime.toLowerCase()] ?? regimeColor.unknown
  return (
    <div
      className="flex-1 rounded-[7px] px-2.5 py-2 text-center"
      style={{ background: `${color}10`, border: `1px solid ${color}30` }}
    >
      <div className="text-[9px] font-bold tracking-wide capitalize" style={{ color }}>
        {regime}
      </div>
      {probability != null && (
        <div className="text-[15px] font-extrabold mt-0.5" style={{ color }}>
          {(probability * 100).toFixed(0)}%
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `frontend/src/components/ui/DriverBar.tsx`**

```tsx
import { labelFor } from '../../lib/featureLabels'

interface DriverBarProps {
  feature: string
  importance: number
  maxImportance: number
  positive?: boolean
}

export default function DriverBar({ feature, importance, maxImportance, positive = true }: DriverBarProps) {
  const pct = maxImportance > 0 ? (importance / maxImportance) * 100 : 0
  const color = positive ? '#06b6d4' : '#f87171'
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="text-[10px] text-right shrink-0" style={{ width: 180, color: '#94a3b8' }}>
        {labelFor(feature)}
      </div>
      <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ background: '#151d2e' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, opacity: 0.8 }}
        />
      </div>
      <div className="text-[10px] font-bold shrink-0 w-10 text-right" style={{ color }}>
        {(importance * 100).toFixed(1)}%
      </div>
    </div>
  )
}
```

- [ ] **Step 5: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/
git commit -m "feat: add shared UI components — Panel, MetricCard, RegimeBadge, DriverBar"
```

---

### Task 11: Current State page

**Files:**
- Modify: `frontend/src/pages/CurrentState.tsx`
- Create: `frontend/src/hooks/useCurrentState.ts`
- Create: `frontend/src/lib/narratives.ts`

- [ ] **Step 1: Create `frontend/src/hooks/useCurrentState.ts`**

```ts
import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { CurrentStateResponse } from '../types/api'

export function useCurrentState() {
  const [data, setData] = useState<CurrentStateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await api.currentState()
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  return { data, loading, error, refresh }
}
```

- [ ] **Step 2: Create `frontend/src/lib/narratives.ts`**

```ts
export function buildCurrentStateNarrative(
  regime: string,
  risk: number,
  trend: string,
  vixLevel: number | null,
  vixChg1d: number | null,
): string {
  const riskLevel =
    risk < 0.05 ? 'very low' :
    risk < 0.20 ? 'low' :
    risk < 0.40 ? 'moderate' : 'elevated'

  const trendSentence =
    trend === 'uptrend' ? 'The trend is positive.' :
    trend === 'downtrend' ? 'The trend is negative.' :
    'The trend is neutral.'

  const vixDir =
    (vixChg1d ?? 0) > 0.5 ? 'rising' :
    (vixChg1d ?? 0) < -0.5 ? 'falling' : 'stable'

  const vixPart = vixLevel != null
    ? ` VIX is at ${vixLevel.toFixed(1)} and ${vixDir}.`
    : ''

  return `SPY is in a ${regime} regime with ${riskLevel} transition risk (${(risk * 100).toFixed(0)}%). ${trendSentence}${vixPart}`
}
```

- [ ] **Step 3: Create `frontend/src/hooks/useModelDrivers.ts`**

```ts
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { ModelDriversResponse } from '../types/api'

export function useModelDrivers() {
  const [data, setData] = useState<ModelDriversResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.modelDrivers()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return { data, loading, error }
}
```

- [ ] **Step 4: Implement `frontend/src/pages/CurrentState.tsx`**

```tsx
import { motion } from 'framer-motion'
import { useCurrentState } from '../hooks/useCurrentState'
import { useModelDrivers } from '../hooks/useModelDrivers'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import MetricCard from '../components/ui/MetricCard'
import RegimeBadge from '../components/ui/RegimeBadge'
import DriverBar from '../components/ui/DriverBar'
import { buildCurrentStateNarrative } from '../lib/narratives'
import { regimeColor } from '../lib/tokens'
import { labelFor } from '../lib/featureLabels'

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.2 } }),
}

export default function CurrentState() {
  const { data, loading, error, refresh } = useCurrentState()
  const { data: drivers } = useModelDrivers()

  if (loading) return <div className="p-6 text-slate-500 text-sm">Loading…</div>
  if (error) return <div className="p-6 text-red-400 text-sm">{error}</div>
  if (!data) return null

  const regime = data.regime.toLowerCase()
  const rColor = regimeColor[regime] ?? regimeColor.unknown
  const narrative = buildCurrentStateNarrative(
    data.regime, data.transition_risk, data.trend, data.vix_level, data.vix_chg_1d,
  )

  const topDrivers = data.top_drivers.length > 0
    ? data.top_drivers
    : drivers?.global_importance.slice(0, 5) ?? []
  const maxImp = Math.max(...topDrivers.map(d => d.importance), 0.001)

  const refreshAction = (
    <button
      onClick={refresh}
      className="text-[10px] font-bold px-3 py-1.5 rounded"
      style={{ background: '#0c1020', border: '1px solid #151d2e', color: '#06b6d4' }}
    >
      ↻ Refresh Data
    </button>
  )

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Topbar
        title="Current State"
        subtitle={`As of ${data.as_of_ts ? new Date(data.as_of_ts).toLocaleString() : '—'}`}
        action={refreshAction}
      />

      <div className="p-5 space-y-5">
        {/* Hero row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Market Regime', value: data.regime, color: rColor },
            { label: 'Transition Risk', value: `${(data.transition_risk * 100).toFixed(0)}%`, color: data.transition_risk > 0.40 ? '#f87171' : data.transition_risk > 0.20 ? '#fbbf24' : '#4ade80' },
            { label: 'VIX Level', value: data.vix_level != null ? data.vix_level.toFixed(1) : '—', color: '#f1f5f9' },
            { label: 'Trend', value: data.trend.replace('trend', ''), color: '#94a3b8' },
          ].map((card, i) => (
            <motion.div key={card.label} custom={i} variants={cardVariants} initial="hidden" animate="visible">
              <MetricCard label={card.label} value={card.value} valueColor={card.color} />
            </motion.div>
          ))}
        </div>

        <div className="h-px" style={{ background: '#151d2e' }} />

        {/* Two-column body */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 320px' }}>
          {/* Left */}
          <div className="space-y-4">
            <Panel title="What this means right now">
              <p className="text-[11px] leading-relaxed mb-4" style={{ color: '#94a3b8' }}>{narrative}</p>
              <div className="flex gap-2">
                {(['calm', 'elevated', 'turbulent'] as const).map(r => {
                  const prob = data[`prob_${r}` as keyof typeof data] as number | null
                  if (prob == null) return null
                  return <RegimeBadge key={r} regime={r} probability={prob} />
                })}
              </div>
            </Panel>

            {data.delta && (
              <Panel title="Why it changed since last refresh">
                <DeltaRows delta={data.delta} />
              </Panel>
            )}
          </div>

          {/* Right */}
          <div className="space-y-4">
            <Panel title="Transition risk gauge">
              <GaugeArc risk={data.transition_risk} />
            </Panel>

            <Panel title="What is pushing risk right now">
              {topDrivers.slice(0, 5).map(d => (
                <DriverBar
                  key={d.feature}
                  feature={d.feature}
                  importance={d.importance}
                  maxImportance={maxImp}
                  positive
                />
              ))}
            </Panel>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function DeltaRows({ delta }: { delta: NonNullable<import('../types/api').CurrentStateResponse['delta']> }) {
  const rows = [
    {
      icon: delta.risk_delta > 0.01 ? '📈' : delta.risk_delta < -0.01 ? '📉' : '↔️',
      text: `Transition risk ${delta.risk_delta > 0.01 ? 'increased' : delta.risk_delta < -0.01 ? 'decreased' : 'unchanged'} by ${Math.abs(delta.risk_delta * 100).toFixed(1)}pp`,
      badge: delta.risk_delta > 0.01 ? 'Risk ↑' : delta.risk_delta < -0.01 ? 'Risk ↓' : 'No change',
      positive: delta.risk_delta < 0,
    },
    delta.regime_changed && delta.prior_regime
      ? { icon: '🔄', text: `Regime shifted from ${delta.prior_regime} to current`, badge: 'Changed', positive: false }
      : null,
    delta.top_feature_moved
      ? { icon: delta.top_feature_direction === 'up' ? '↑' : '↓', text: `${labelFor(delta.top_feature_moved)} moved ${delta.top_feature_direction}`, badge: '', positive: delta.top_feature_direction === 'down' }
      : null,
  ].filter(Boolean)

  return (
    <div className="space-y-2">
      {rows.map((row, i) => row && (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span>{row.icon}</span>
          <span style={{ color: '#94a3b8', flex: 1 }}>{row.text}</span>
          {row.badge && (
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded"
              style={{
                background: row.positive ? '#052e1620' : '#450a0a20',
                color: row.positive ? '#4ade80' : '#f87171',
              }}
            >
              {row.badge}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function GaugeArc({ risk }: { risk: number }) {
  const pct = Math.min(risk, 1)
  const angle = pct * 180 - 90
  const color = risk < 0.20 ? '#4ade80' : risk < 0.40 ? '#fbbf24' : '#f87171'
  const caption =
    risk < 0.05 ? 'Very low risk — market looks calm.' :
    risk < 0.20 ? 'Low risk — conditions appear stable.' :
    risk < 0.40 ? 'Moderate risk — conditions could deteriorate within the next week.' :
    'Elevated risk — model sees meaningful stress probability.'

  // cy=90 puts arc center at bottom edge so semi-circle fits in 110px height
  const cx = 80, cy = 90, r = 55
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const x1 = cx + r * Math.cos(toRad(-180))
  const y1 = cy + r * Math.sin(toRad(-180))
  const x2 = cx + r * Math.cos(toRad(0))
  const y2 = cy + r * Math.sin(toRad(0))
  const nx = cx + r * Math.cos(toRad(angle))
  const ny = cy + r * Math.sin(toRad(angle))

  return (
    <div className="flex flex-col items-center">
      <svg width={160} height={110} viewBox="0 0 160 110">
        <path d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`} fill="none" stroke="#151d2e" strokeWidth={8} />
        <path
          d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${nx} ${ny}`}
          fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
        />
        <text x={cx} y={cy - 10} textAnchor="middle" fill={color} fontSize={18} fontWeight={800}>
          {(risk * 100).toFixed(0)}%
        </text>
        <text x={cx} y={cy + 6} textAnchor="middle" fill="#475569" fontSize={8}>
          Transition Risk
        </text>
      </svg>
      <p className="text-[10px] text-center mt-1 leading-relaxed" style={{ color: '#64748b', maxWidth: 220 }}>{caption}</p>
    </div>
  )
}
```

- [ ] **Step 5: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat: implement Current State page with hero cards, narrative, gauge, and driver bars"
```

---

### Task 12: History page

**Files:**
- Modify: `frontend/src/pages/History.tsx`
- Create: `frontend/src/hooks/useHistoricalState.ts`
- Create: `frontend/src/components/charts/RegimeChart.tsx`
- Create: `frontend/src/components/charts/RiskLineChart.tsx`

- [ ] **Step 1: Create `frontend/src/hooks/useHistoricalState.ts`**

```ts
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { HistoricalStateResponse } from '../types/api'

export function useHistoricalState(start = '2020-01-01') {
  const [data, setData] = useState<HistoricalStateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.historicalState(start)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [start])

  return { data, loading, error }
}
```

- [ ] **Step 2: Create `frontend/src/components/charts/RegimeChart.tsx`**

```tsx
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceArea, CartesianGrid,
} from 'recharts'
import type { HistoricalPoint } from '../../types/api'

interface RegimeChartProps {
  data: HistoricalPoint[]
  showVix: boolean
}

const REGIME_COLORS: Record<string, string> = {
  calm: '#4ade80',
  elevated: '#fbbf24',
  turbulent: '#f87171',
}

function buildRegimeBands(data: HistoricalPoint[]) {
  const bands: { start: string; end: string; regime: string }[] = []
  let current: { start: string; regime: string } | null = null
  for (const pt of data) {
    if (!current || current.regime !== pt.regime) {
      if (current) bands.push({ ...current, end: pt.date })
      current = { start: pt.date, regime: pt.regime }
    }
  }
  if (current && data.length > 0) {
    bands.push({ ...current, end: data[data.length - 1].date })
  }
  return bands
}

export default function RegimeChart({ data, showVix }: RegimeChartProps) {
  const bands = buildRegimeBands(data)

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#151d2e" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#475569', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="spy"
          tick={{ fill: '#475569', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        {showVix && (
          <YAxis
            yAxisId="vix"
            orientation="right"
            tick={{ fill: '#475569', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            width={32}
            label={{ value: 'VIX', angle: -90, position: 'insideRight', fill: '#475569', fontSize: 9 }}
          />
        )}
        <Tooltip
          contentStyle={{ background: '#0c1020', border: '1px solid #151d2e', fontSize: 10 }}
          labelStyle={{ color: '#94a3b8' }}
        />
        {bands.map((b, i) => (
          <ReferenceArea
            key={i}
            yAxisId="spy"
            x1={b.start}
            x2={b.end}
            fill={REGIME_COLORS[b.regime] ?? '#475569'}
            fillOpacity={0.08}
          />
        ))}
        <Line
          yAxisId="spy"
          dataKey="close"
          stroke="#42a5f5"
          strokeWidth={2}
          dot={false}
          name="SPY"
        />
        {showVix && (
          <Line
            yAxisId="vix"
            dataKey="vix_level"
            stroke="#94a3b8"
            strokeWidth={1}
            dot={false}
            opacity={0.6}
            name="VIX"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 3: Create `frontend/src/components/charts/RiskLineChart.tsx`**

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts'
import type { HistoricalPoint } from '../../types/api'
import { DEFAULT_THRESHOLD, ALERT_THRESHOLD } from '../../lib/constants'

interface RiskLineChartProps {
  data: HistoricalPoint[]
}

export default function RiskLineChart({ data }: RiskLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#151d2e" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#475569', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={v => `${(v * 100).toFixed(0)}%`}
          tick={{ fill: '#475569', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          domain={[0, 1]}
          width={40}
        />
        <Tooltip
          formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'Risk']}
          contentStyle={{ background: '#0c1020', border: '1px solid #151d2e', fontSize: 10 }}
          labelStyle={{ color: '#94a3b8' }}
        />
        <ReferenceLine
          y={DEFAULT_THRESHOLD}
          stroke="#06b6d4"
          strokeDasharray="4 4"
          label={{ value: 'Watch (10%)', fill: '#06b6d4', fontSize: 8 }}
        />
        <ReferenceLine
          y={ALERT_THRESHOLD}
          stroke="#fbbf24"
          strokeDasharray="4 4"
          label={{ value: 'Alert (30%)', fill: '#fbbf24', fontSize: 8 }}
        />
        <Line dataKey="transition_risk" stroke="#06b6d4" strokeWidth={2} dot={false} name="Risk" />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 4: Implement `frontend/src/pages/History.tsx`**

```tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import RegimeChart from '../components/charts/RegimeChart'
import RiskLineChart from '../components/charts/RiskLineChart'
import { useHistoricalState } from '../hooks/useHistoricalState'

export default function History() {
  const [showVix, setShowVix] = useState(false)
  const { data, loading, error } = useHistoricalState()

  if (loading) return <div className="p-6 text-slate-500 text-sm">Loading…</div>
  if (error) return <div className="p-6 text-red-400 text-sm">{error}</div>
  if (!data) return null

  const toggleBtn = (
    <button
      onClick={() => setShowVix(v => !v)}
      className="text-[10px] font-bold px-3 py-1.5 rounded"
      style={{
        background: showVix ? '#0e4d6e' : '#0c1020',
        border: `1px solid ${showVix ? '#06b6d4' : '#151d2e'}`,
        color: showVix ? '#06b6d4' : '#64748b',
      }}
    >
      {showVix ? '▼ Hide VIX' : '▲ Show VIX overlay'}
    </button>
  )

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Topbar title="History" subtitle={`${data.start} — ${data.end}`} />
      <div className="p-5 space-y-5">
        <Panel title="What happened over time?">
          <p className="text-[10px] mb-3" style={{ color: '#475569' }}>
            Shaded bands show the market regime on each day. A darker shade indicates higher stress.
          </p>
          <div className="flex justify-end mb-2">{toggleBtn}</div>
          <RegimeChart data={data.data} showVix={showVix} />
        </Panel>
        <Panel title="When did the model get worried?">
          <p className="text-[10px] mb-3" style={{ color: '#475569' }}>
            The line shows the model's daily estimate of the chance conditions worsen within the next week.
          </p>
          <RiskLineChart data={data.data} />
        </Panel>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 5: TypeScript check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat: implement History page with regime bands chart and risk line chart"
```

---

## Chunk 4: Event Replay + Model Drivers Pages

### Task 13: Event Replay page

**Files:**
- Modify: `frontend/src/pages/EventReplay.tsx`
- Create: `frontend/src/hooks/useEventReplay.ts`
- Create: `frontend/src/components/charts/EventReplayChart.tsx`

- [ ] **Step 1: Create `frontend/src/hooks/useEventReplay.ts`**

```ts
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { EventReplayResponse } from '../types/api'

export function useEventReplay(eventName: string) {
  const [data, setData] = useState<EventReplayResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.eventReplay(eventName)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [eventName])

  return { data, loading, error }
}
```

- [ ] **Step 2: Create `frontend/src/components/charts/EventReplayChart.tsx`**

```tsx
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceArea, ReferenceLine, CartesianGrid,
} from 'recharts'
import type { EventReplayPoint } from '../../types/api'
import { DEFAULT_THRESHOLD } from '../../lib/constants'

const REGIME_COLORS: Record<string, string> = {
  calm: '#4ade80',
  elevated: '#fbbf24',
  turbulent: '#f87171',
}

function buildBands(data: EventReplayPoint[]) {
  const bands: { start: string; end: string; regime: string }[] = []
  let cur: { start: string; regime: string } | null = null
  for (const pt of data) {
    const r = pt.regime_actual
    if (!cur || cur.regime !== r) {
      if (cur) bands.push({ ...cur, end: pt.date })
      cur = { start: pt.date, regime: r }
    }
  }
  if (cur && data.length) bands.push({ ...cur, end: data[data.length - 1].date })
  return bands
}

export default function EventReplayChart({ data }: { data: EventReplayPoint[] }) {
  const bands = buildBands(data)
  const firstCrossDate = data.find(p => (p.transition_risk ?? 0) > DEFAULT_THRESHOLD)?.date

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#151d2e" />
        <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis
          tickFormatter={v => `${(v * 100).toFixed(0)}%`}
          tick={{ fill: '#475569', fontSize: 9 }}
          tickLine={false} axisLine={false} domain={[0, 1]} width={40}
        />
        <Tooltip
          contentStyle={{ background: '#0c1020', border: '1px solid #151d2e', fontSize: 10 }}
          formatter={(v: unknown, name: string) => {
            if (name === 'transition_risk') return [`${((v as number) * 100).toFixed(1)}%`, 'Risk']
            return [v, name]
          }}
        />
        {bands.map((b, i) => (
          <ReferenceArea
            key={i} x1={b.start} x2={b.end}
            fill={REGIME_COLORS[b.regime] ?? '#475569'} fillOpacity={0.1}
          />
        ))}
        {firstCrossDate && (
          <ReferenceLine x={firstCrossDate} stroke="#06b6d4" strokeDasharray="4 4" />
        )}
        <Line dataKey="transition_risk" stroke="#06b6d4" strokeWidth={2} dot={false} name="transition_risk" />
        <Line
          dataKey="transition_actual"
          stroke="#f87171"
          strokeWidth={0}
          dot={(props: { cx?: number; cy?: number; payload?: EventReplayPoint }) => {
            const { cx, cy, payload } = props
            if (!payload?.transition_actual) return <g key={`dot-${cx}-${cy}`} />
            return (
              <text key={`x-${cx}-${cy}`} x={cx} y={cy} textAnchor="middle" fill="#f87171" fontSize={8}>✕</text>
            )
          }}
          name="Actual transition"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 3: Implement `frontend/src/pages/EventReplay.tsx`**

```tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import MetricCard from '../components/ui/MetricCard'
import EventReplayChart from '../components/charts/EventReplayChart'
import { useEventReplay } from '../hooks/useEventReplay'
import { DEFAULT_THRESHOLD } from '../lib/constants'

const EVENTS = [
  { id: 'financial_crisis_2008', label: '2008 Financial Crisis' },
  { id: 'covid_2020', label: 'COVID-19 2020' },
  { id: 'tightening_2022', label: 'Rate Tightening 2022' },
]

const EVENT_CONTENT: Record<string, { description: string; takeaway: string }> = {
  financial_crisis_2008: {
    description: 'The 2008 financial crisis saw SPY fall more than 50% from peak as credit markets seized.',
    takeaway: 'The model began flagging elevated risk roughly 3–4 weeks before the peak stress period. Risk stayed above the alert threshold for much of the window, reflecting the prolonged nature of the crisis rather than a single spike.',
  },
  covid_2020: {
    description: 'The COVID-19 market crash in early 2020 was one of the fastest equity declines on record.',
    takeaway: 'This was the sharpest test — the model caught the transition but with less lead time than 2008, consistent with how rapidly conditions deteriorated. Peak risk reached the model\'s highest recorded readings during the window.',
  },
  tightening_2022: {
    description: 'The 2022 rate-tightening cycle saw aggressive Fed hikes as inflation reached 40-year highs.',
    takeaway: 'Unlike the prior two events, 2022 was a slow-burn elevated regime rather than a sudden crash. The model reflected this — risk stayed persistently moderate rather than spiking sharply, and the regime held Elevated for most of the year.',
  },
}

export default function EventReplay() {
  const [selected, setSelected] = useState('financial_crisis_2008')
  const { data, loading, error } = useEventReplay(selected)

  const pts = data?.data ?? []
  const peakRisk = pts.length ? Math.max(...pts.map(p => p.transition_risk ?? 0)) : null
  const alertDays = pts.filter(p => (p.transition_risk ?? 0) > DEFAULT_THRESHOLD).length
  const firstCrossing = pts.find(p => (p.transition_risk ?? 0) > DEFAULT_THRESHOLD)?.date ?? '—'
  const highStressDays = pts.filter(p => p.regime_actual === 'elevated' || p.regime_actual === 'turbulent').length

  const content = EVENT_CONTENT[selected]

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Topbar title="Event Replay" />
      <div className="p-5 space-y-4">
        {/* Event selector */}
        <div className="flex gap-2">
          {EVENTS.map(e => (
            <button
              key={e.id}
              onClick={() => setSelected(e.id)}
              className="px-4 py-2 rounded-lg text-[11px] font-semibold transition-colors"
              style={{
                background: selected === e.id ? '#0e4d6e' : '#0c1020',
                border: `1px solid ${selected === e.id ? '#06b6d4' : '#151d2e'}`,
                color: selected === e.id ? '#06b6d4' : '#475569',
              }}
            >
              {e.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-slate-500 text-sm">Loading…</div>}
        {error && <div className="text-red-400 text-sm">{error}</div>}

        {!loading && !error && data && (
          <>
            {/* Hero stats */}
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="Warning Lead Time"
                value={data.warning_lead_days != null ? `${Math.round(data.warning_lead_days)}d` : '—'}
                subtitle="Days before peak stress the model flagged risk"
                valueColor="#06b6d4"
              />
              <MetricCard
                label="Peak Transition Risk"
                value={peakRisk != null ? `${(peakRisk * 100).toFixed(0)}%` : '—'}
                subtitle="Highest single-day risk reading"
                valueColor="#f87171"
              />
            </div>

            {/* Supporting stats */}
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Alert Days" value={`${alertDays}d`} subtitle={`Days risk > ${(DEFAULT_THRESHOLD * 100).toFixed(0)}%`} />
              <MetricCard label="First Threshold Crossing" value={firstCrossing} subtitle="First day risk exceeded watch threshold" />
              <MetricCard label="High-Stress Days" value={`${highStressDays}d`} subtitle="Days in Elevated or Turbulent regime" />
            </div>

            {/* Event description */}
            {content && (
              <p className="text-[11px] leading-relaxed" style={{ color: '#94a3b8' }}>{content.description}</p>
            )}

            {/* Methodology note */}
            <p className="text-[10px] italic" style={{ color: '#475569' }}>
              Replay metrics are computed from out-of-fold predictions — each day in this window was scored by a model that did not train on that day.
            </p>

            {/* Chart */}
            <Panel title={`${EVENTS.find(e => e.id === selected)?.label} — Transition Risk & Regime`}>
              <EventReplayChart data={pts} />
            </Panel>

            {/* Takeaway */}
            {content && (
              <Panel title="Takeaway">
                <p className="text-[11px] leading-relaxed" style={{ color: '#94a3b8' }}>{content.takeaway}</p>
              </Panel>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 4: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat: implement Event Replay page with event selector, stats, and replay chart"
```

---

### Task 14: Model Drivers page

**Files:**
- Modify: `frontend/src/pages/ModelDrivers.tsx`

- [ ] **Step 1: Implement `frontend/src/pages/ModelDrivers.tsx`**

```tsx
import { motion } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import DriverBar from '../components/ui/DriverBar'
import { useModelDrivers } from '../hooks/useModelDrivers'
import { labelFor } from '../lib/featureLabels'

export default function ModelDrivers() {
  const { data, loading, error } = useModelDrivers()

  if (loading) return <div className="p-6 text-slate-500 text-sm">Loading…</div>
  if (error) return <div className="p-6 text-red-400 text-sm">{error}</div>
  if (!data) return null

  const sorted = [...data.global_importance].sort((a, b) => b.importance - a.importance)
  const topUp = sorted.slice(0, 8)
  const maxImp = topUp[0]?.importance ?? 0.001

  const localEntries = Object.entries(data.local_explanation).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  const pushing = localEntries.filter(([, v]) => v > 0).slice(0, 3)
  const holding = localEntries.filter(([, v]) => v < 0).slice(0, 3)

  const topFeatureLabel = labelFor(sorted[0]?.feature ?? '')

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Topbar title="Model Drivers" />
      <div className="p-5 space-y-5">
        <Panel title="What usually raises risk">
          <p className="text-[10px] mb-4" style={{ color: '#475569' }}>
            These inputs have the strongest upward effect on transition risk across all historical predictions.
          </p>
          {topUp.map(d => (
            <DriverBar key={d.feature} feature={d.feature} importance={d.importance} maxImportance={maxImp} positive />
          ))}
        </Panel>

        <div className="h-px" style={{ background: '#151d2e' }} />

        <Panel title="Why the latest reading looks this way">
          {pushing.length > 0 || holding.length > 0 ? (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-[10px] font-bold mb-3" style={{ color: '#06b6d4' }}>What pushed risk higher</div>
                {pushing.map(([feat, val]) => (
                  <div key={feat} className="flex justify-between items-center mb-2">
                    <span className="text-[10px]" style={{ color: '#94a3b8' }}>{labelFor(feat)}</span>
                    <span className="text-[10px] font-bold" style={{ color: '#f87171' }}>+{(val * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[10px] font-bold mb-3" style={{ color: '#4ade80' }}>What held risk down</div>
                {holding.map(([feat, val]) => (
                  <div key={feat} className="flex justify-between items-center mb-2">
                    <span className="text-[10px]" style={{ color: '#94a3b8' }}>{labelFor(feat)}</span>
                    <span className="text-[10px] font-bold" style={{ color: '#4ade80' }}>{(val * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px]" style={{ color: '#94a3b8' }}>
              Overall, <strong style={{ color: '#f1f5f9' }}>{topFeatureLabel}</strong> has the largest influence on this model's transition risk estimates across all historical predictions.
            </p>
          )}
        </Panel>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ModelDrivers.tsx
git commit -m "feat: implement Model Drivers page with global importance bars and local SHAP explanation"
```

---

## Chunk 5: Scenario Explorer

### Task 15: Scenario Explorer — sliders, presets, API integration

**Files:**
- Modify: `frontend/src/pages/ScenarioExplorer.tsx`
- Create: `frontend/src/lib/sliderConfig.ts`
- Create: `frontend/src/hooks/useScenario.ts`
- Create: `frontend/src/components/charts/RiskRail.tsx`

- [ ] **Step 1: Create `frontend/src/lib/sliderConfig.ts`**

```ts
export interface SliderConfig {
  key: 'vix_level' | 'vix_chg_5d' | 'rv_20d_pct' | 'drawdown_pct_504d' | 'ret_20d' | 'dist_sma50'
  label: string
  helper: string
  min: number
  max: number
  step: number
  calmMax: number
  stressMin: number
}

export const SLIDER_CONFIG: SliderConfig[] = [
  {
    key: 'vix_level', label: 'VIX Level',
    helper: 'Market fear gauge — higher = more fear',
    min: 5, max: 80, step: 0.5, calmMax: 18, stressMin: 28,
  },
  {
    key: 'vix_chg_5d', label: 'VIX 5-day Change',
    helper: 'How fast fear is rising or falling',
    min: -15, max: 15, step: 0.5, calmMax: 0, stressMin: 5,
  },
  {
    key: 'rv_20d_pct', label: 'Realized Vol Percentile',
    helper: 'How unusually jumpy the market has been',
    min: 0, max: 1, step: 0.01, calmMax: 0.40, stressMin: 0.70,
  },
  {
    key: 'drawdown_pct_504d', label: 'Drawdown',
    helper: 'How far prices have fallen from a recent high',
    min: 0, max: 1, step: 0.01, calmMax: 0.10, stressMin: 0.30,
  },
  {
    key: 'ret_20d', label: '20-day Return',
    helper: 'Recent price performance',
    min: -0.30, max: 0.30, step: 0.01, calmMax: 0.05, stressMin: -0.05,
  },
  {
    key: 'dist_sma50', label: 'Distance from SMA-50',
    helper: 'How far price is from its 50-day average',
    min: -0.15, max: 0.15, step: 0.005, calmMax: 0.02, stressMin: -0.02,
  },
]

export type ScenarioInputs = Record<SliderConfig['key'], number>

export const PRESETS: Record<string, ScenarioInputs> = {
  calm:   { vix_level: 13, vix_chg_5d: -1.0, rv_20d_pct: 0.25, drawdown_pct_504d: 0.02, ret_20d: 0.03, dist_sma50: 0.02 },
  choppy: { vix_level: 22, vix_chg_5d:  2.0, rv_20d_pct: 0.65, drawdown_pct_504d: 0.08, ret_20d: -0.01, dist_sma50: -0.01 },
  stress: { vix_level: 35, vix_chg_5d:  6.0, rv_20d_pct: 0.85, drawdown_pct_504d: 0.20, ret_20d: -0.08, dist_sma50: -0.06 },
}
```

- [ ] **Step 2: Create `frontend/src/hooks/useScenario.ts`**

```ts
import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api/client'
import type { ScenarioResponse } from '../types/api'
import type { ScenarioInputs } from '../lib/sliderConfig'

export function useScenario(inputs: ScenarioInputs) {
  const [data, setData] = useState<ScenarioResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = useCallback(async (inp: ScenarioInputs) => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.scenario(inp)
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => run(inputs), 120)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [inputs, run])

  return { data, loading, error }
}
```

- [ ] **Step 3: Create `frontend/src/components/charts/RiskRail.tsx`**

```tsx
import { motion } from 'framer-motion'
import { RISK_ZONES } from '../../lib/constants'

interface RiskRailProps {
  baselineRisk: number
  scenarioRisk: number
}

export default function RiskRail({ baselineRisk, scenarioRisk }: RiskRailProps) {
  const bPct = `${(baselineRisk * 100).toFixed(0)}%`
  const sPct = `${(scenarioRisk * 100).toFixed(0)}%`
  const delta = scenarioRisk - baselineRisk
  const deltaLabel = `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}pp`

  return (
    <div>
      {/* Numbers row */}
      <div className="flex items-center gap-4 mb-5">
        <div>
          <div className="text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: '#2d4060' }}>Baseline</div>
          <div className="text-[28px] font-extrabold tracking-tight leading-none" style={{ color: '#4ade80' }}>{bPct}</div>
        </div>
        <div style={{ color: '#1e293b', fontSize: 24 }}>→</div>
        <div>
          <div className="text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: '#2d4060' }}>Scenario</div>
          <div className="text-[28px] font-extrabold tracking-tight leading-none" style={{ color: '#f87171' }}>{sPct}</div>
        </div>
        <div
          className="px-3.5 py-1 rounded-full text-[13px] font-extrabold ml-2"
          style={{ background: '#450a0a30', border: '1px solid #7f1d1d40', color: '#f87171' }}
        >
          {deltaLabel}
        </div>
      </div>

      {/* Track */}
      <div className="relative" style={{ paddingTop: 40, paddingBottom: 28 }}>
        <div
          className="h-2.5 rounded-full"
          style={{
            background: 'linear-gradient(to right, #14532d 0%, #166534 15%, #92400e 30%, #d97706 50%, #b45309 65%, #7f1d1d 80%, #991b1b 100%)',
          }}
        />

        {/* Threshold markers */}
        {[{ pct: 10, label: 'Watch · 10%', color: '#06b6d4', bg: '#061d2e', border: '#0e3d55' },
          { pct: 30, label: 'Alert · 30%', color: '#fbbf24', bg: '#451a0320', border: '#92400e40' }].map(m => (
          <div
            key={m.pct}
            className="absolute flex flex-col items-center"
            style={{ left: `${m.pct}%`, top: 0, transform: 'translateX(-50%)' }}
          >
            <div
              className="text-[8px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
              style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}
            >
              {m.label}
            </div>
            <div
              className="w-px"
              style={{
                height: 36,
                marginTop: 2,
                background: `repeating-linear-gradient(to bottom, ${m.color} 0px, ${m.color} 4px, transparent 4px, transparent 8px)`,
              }}
            />
          </div>
        ))}

        {/* Baseline marker */}
        <motion.div
          className="absolute flex flex-col items-center"
          style={{ top: 14, zIndex: 10 }}
          animate={{ left: `${baselineRisk * 100}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        >
          <div className="flex flex-col items-center" style={{ transform: 'translateX(-50%)', position: 'absolute', top: -28 }}>
            <div className="text-[10px] font-extrabold" style={{ color: '#4ade80' }}>{bPct}</div>
            <div className="text-[9px] font-bold" style={{ color: '#4ade8090' }}>Baseline</div>
          </div>
          <div
            className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-extrabold"
            style={{
              background: '#052e16', border: '2px solid #4ade80', color: '#4ade80',
              boxShadow: '0 0 0 3px #080b12, 0 0 10px #4ade8040',
            }}
          >B</div>
        </motion.div>

        {/* Scenario marker */}
        <motion.div
          className="absolute flex flex-col items-center"
          style={{ top: 14, zIndex: 10 }}
          animate={{ left: `${scenarioRisk * 100}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        >
          <div className="flex flex-col items-center" style={{ transform: 'translateX(-50%)', position: 'absolute', top: -28 }}>
            <div className="text-[10px] font-extrabold" style={{ color: '#f87171' }}>{sPct}</div>
            <div className="text-[9px] font-bold" style={{ color: '#f8717190' }}>Scenario</div>
          </div>
          <div
            className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-extrabold"
            style={{
              background: '#450a0a', border: '2px solid #f87171', color: '#f87171',
              boxShadow: '0 0 0 3px #080b12, 0 0 10px #f8717140',
            }}
          >S</div>
        </motion.div>

        {/* Zone labels */}
        <div className="absolute bottom-0 left-0 right-0">
          {RISK_ZONES.map(z => (
            <span
              key={z.label}
              className="absolute text-[8px] font-bold tracking-wide uppercase"
              style={{
                left: `${((z.min + z.max) / 2) * 100}%`,
                transform: 'translateX(-50%)',
                color: z.color,
              }}
            >
              {z.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement `frontend/src/pages/ScenarioExplorer.tsx`**

```tsx
import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import RiskRail from '../components/charts/RiskRail'
import { useScenario } from '../hooks/useScenario'
import { SLIDER_CONFIG, PRESETS, type ScenarioInputs } from '../lib/sliderConfig'
import { DEFAULT_THRESHOLD } from '../lib/constants'
import { useModelDrivers } from '../hooks/useModelDrivers'

const DEFAULT_INPUTS: ScenarioInputs = {
  vix_level: 18, vix_chg_5d: 0, rv_20d_pct: 0.40,
  drawdown_pct_504d: 0.05, ret_20d: 0.01, dist_sma50: 0.01,
}

function sliderColor(cfg: (typeof SLIDER_CONFIG)[0], val: number): string {
  if (val <= cfg.calmMax) return '#06b6d4'
  if (val >= cfg.stressMin) return '#f87171'
  return '#fbbf24'
}

export default function ScenarioExplorer() {
  const [inputs, setInputs] = useState<ScenarioInputs>(DEFAULT_INPUTS)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const { data, loading, error } = useScenario(inputs)
  const { data: modelData } = useModelDrivers()

  const reset = useCallback(() => setInputs(DEFAULT_INPUTS), [])

  const sweepRow = modelData?.threshold_sweep?.find(r => Math.abs(r.threshold - threshold) < 0.05)

  const narrative = data
    ? buildNarrative(inputs, data.baseline_risk, data.scenario_risk, data.driver_deltas[0]?.plain_label ?? '', data.prob_calm)
    : null

  const resetBtn = (
    <button
      onClick={reset}
      className="text-[10px] font-bold px-3 py-1.5 rounded"
      style={{ background: '#0c1020', border: '1px solid #151d2e', color: '#64748b' }}
    >
      ↺ Reset to current market
    </button>
  )

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Topbar title="Scenario Explorer" action={resetBtn} />
      <div className="p-5 flex gap-5">
        {/* Left column */}
        <div className="shrink-0 space-y-4" style={{ width: 276 }}>
          <Panel title="Quick scenarios">
            <div className="flex flex-col gap-2">
              {[
                { id: 'calm', icon: '🌤', label: 'Calm' },
                { id: 'choppy', icon: '⚡', label: 'Choppy' },
                { id: 'stress', icon: '🔴', label: 'Stress Spike' },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => setInputs(PRESETS[p.id])}
                  className="text-[11px] font-semibold px-3 py-2 rounded-lg text-left"
                  style={{ background: '#080b12', border: '1px solid #151d2e', color: '#94a3b8' }}
                >
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </Panel>

          <div className="h-px" style={{ background: '#151d2e' }} />

          <div className="space-y-4">
            {SLIDER_CONFIG.map(cfg => {
              const val = inputs[cfg.key]
              const color = sliderColor(cfg, val)
              return (
                <div key={cfg.key}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] font-semibold" style={{ color: '#94a3b8' }}>{cfg.label}</span>
                    <span className="text-[10px] font-bold" style={{ color }}>{val.toFixed(cfg.step < 0.1 ? 2 : 1)}</span>
                  </div>
                  <p className="text-[9px] mb-1.5" style={{ color: '#475569' }}>{cfg.helper}</p>
                  <input
                    type="range"
                    min={cfg.min}
                    max={cfg.max}
                    step={cfg.step}
                    value={val}
                    onChange={e => setInputs(prev => ({ ...prev, [cfg.key]: parseFloat(e.target.value) }))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: color }}
                  />
                </div>
              )
            })}
          </div>

          <div className="h-px" style={{ background: '#151d2e' }} />

          {/* Threshold slider */}
          <div>
            <div className="text-[9px] font-bold tracking-widest uppercase mb-2" style={{ color: '#2d4060' }}>Alert threshold</div>
            <div className="flex justify-between mb-1">
              <span className="text-[10px]" style={{ color: '#94a3b8' }}>Threshold</span>
              <span className="text-[10px] font-bold" style={{ color: '#fbbf24' }}>{(threshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range" min={0.10} max={0.70} step={0.10}
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: '#fbbf24' }}
            />
            {sweepRow ? (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[
                  { label: 'Recall', value: `${(sweepRow.recall * 100).toFixed(0)}%` },
                  { label: 'False Alerts', value: `${(sweepRow.false_alert_rate * 100).toFixed(0)}%` },
                  { label: 'Lead Time', value: `${sweepRow.avg_lead_time_days.toFixed(0)}d` },
                ].map(m => (
                  <div key={m.label} className="rounded-lg p-2 text-center" style={{ background: '#080b12', border: '1px solid #151d2e' }}>
                    <div className="text-[8px] tracking-wide uppercase" style={{ color: '#2d4060' }}>{m.label}</div>
                    <div className="text-[14px] font-extrabold" style={{ color: '#94a3b8' }}>{m.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[9px] mt-2" style={{ color: '#475569' }}>Threshold data unavailable</p>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="flex-1 space-y-4">
          {loading && <div className="text-slate-500 text-sm">Calculating…</div>}
          {error && <div className="text-red-400 text-sm">{error}</div>}

          {data && (
            <>
              <Panel title="Risk position — baseline vs scenario">
                <RiskRail baselineRisk={data.baseline_risk} scenarioRisk={data.scenario_risk} />
              </Panel>

              <Panel title="Regime probability shift">
                {(['calm', 'elevated', 'turbulent'] as const).map(r => {
                  const base = data[`baseline_prob_${r}` as keyof typeof data] as number
                  const scen = data[`prob_${r}` as keyof typeof data] as number
                  const colors = { calm: '#4ade80', elevated: '#fbbf24', turbulent: '#f87171' }
                  const c = colors[r]
                  return (
                    <div key={r} className="flex items-center gap-3 mb-3">
                      <div className="w-20 text-[10px] font-semibold capitalize" style={{ color: '#94a3b8' }}>{r}</div>
                      <div className="flex-1 space-y-1">
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#151d2e' }}>
                          <div className="h-full rounded-full opacity-30" style={{ width: `${base * 100}%`, background: c }} />
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#151d2e' }}>
                          <div className="h-full rounded-full" style={{ width: `${scen * 100}%`, background: c }} />
                        </div>
                      </div>
                      <div className="text-[10px] font-bold w-24 text-right" style={{ color: c }}>
                        {(base * 100).toFixed(0)}% → {(scen * 100).toFixed(0)}%
                      </div>
                    </div>
                  )
                })}
              </Panel>

              {narrative && (
                <Panel title="What this scenario means">
                  <p className="text-[11px] leading-relaxed" style={{ color: '#94a3b8' }}>{narrative}</p>
                </Panel>
              )}

              <Panel title="What changed the most">
                <p className="text-[10px] mb-3" style={{ color: '#475569' }}>Biggest input shifts driving the scenario difference</p>
                {data.driver_deltas.map(d => (
                  <div key={d.feature} className="flex justify-between items-center mb-2">
                    <span className="text-[10px]" style={{ color: '#94a3b8' }}>{d.plain_label}</span>
                    <span
                      className="text-[10px] font-bold"
                      style={{ color: d.delta_value > 0 ? '#f87171' : '#4ade80' }}
                    >
                      {d.delta_value > 0 ? '+' : ''}{d.delta_value.toFixed(3)}
                    </span>
                  </div>
                ))}
              </Panel>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function buildNarrative(
  inputs: ScenarioInputs,
  baseRisk: number,
  scenRisk: number,
  topDriver: string,
  probCalm: number,
): string {
  const changed = Object.keys(inputs).filter(k => {
    const cfg = SLIDER_CONFIG.find(s => s.key === k)
    return cfg && Math.abs((inputs as Record<string, number>)[k] - DEFAULT_INPUTS[k as keyof ScenarioInputs]) > cfg.step * 2
  })
  const changedLabel = changed.length > 0
    ? changed.map(k => SLIDER_CONFIG.find(s => s.key === k)?.label ?? k).join(' and ')
    : 'these inputs'

  let sentence = `Adjusting ${changedLabel} pushes transition risk from ${(baseRisk * 100).toFixed(0)}% to ${(scenRisk * 100).toFixed(0)}%.`
  if (topDriver) sentence += ` The model is most sensitive to ${topDriver}.`
  if (probCalm < 0.5) sentence += ' The probability of staying Calm drops below half.'
  return sentence
}
```

- [ ] **Step 5: TypeScript check and full build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: clean build, no type errors

**Note:** `DEFAULT_INPUTS` is module-scoped, so `buildNarrative` can reference it directly as a standalone function — no refactoring needed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat: implement Scenario Explorer with sliders, risk rail, regime shifts, and driver deltas"
```

---

### Task 16: Final integration — lint, build, docker smoke test

**Files:**
- No new files

- [ ] **Step 1: Run ESLint**

```bash
cd frontend && npx eslint src/ --ext .ts,.tsx
```

Fix any issues reported.

- [ ] **Step 2: Run TypeScript strict check**

```bash
npx tsc --noEmit --strict
```

Expected: no errors

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: `dist/` produced with no warnings about type errors.

- [ ] **Step 4: Run full backend test suite**

```bash
cd .. && pytest tests/ -v
```

Expected: all pass

- [ ] **Step 5: Docker Compose smoke test**

```bash
docker compose build
docker compose up -d
curl -s http://localhost:8000/health | python3 -m json.tool
curl -s http://localhost:3000 | head -5
```

Expected: health endpoint returns JSON with `status: ok`; port 3000 returns HTML.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: React frontend — complete Vite + TypeScript SPA with all 5 pages"
```

---

## Implementation Notes

**CORS fix if browser blocks requests:** Ensure `CORS_ORIGIN` env var matches the exact origin the browser sends (including port). For local dev: `http://localhost:5173`.

**POST /scenario import fix:** The route uses `pd.read_parquet` which requires `pandas` to be in scope. The file already imports pandas at the top, so no additional import is needed inside the route. Remove any inner `import pandas as pd as _pd` line — it's invalid Python.

**Docker VITE_API_URL:** When running inside Docker Compose, the frontend container serves static files built with `VITE_API_URL=http://localhost:8000`. The browser (running on the host) will call `localhost:8000` — this works because the API port is exposed to the host. For production deployments with a real domain, change the `args.VITE_API_URL` in docker-compose.yml.

**shadcn/ui (optional):** The plan uses Radix UI primitives directly. If you want the full shadcn/ui component set, run `npx shadcn@latest init` after scaffolding, then `npx shadcn@latest add tooltip slider separator button`. The components used in this plan are compatible with either approach.
