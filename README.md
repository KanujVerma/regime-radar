# RegimeRadar

**Live market-state monitor powered by XGBoost — classify today's equity market as Calm, Elevated, or Turbulent and quantify the weekly transition risk.**

**[→ Live Demo](https://regime-radar.vercel.app/)** — React/TypeScript frontend on Vercel + FastAPI/XGBoost backend on Render. The backend runs on Render's free tier and may cold-start (15–30s) after ~15 minutes of inactivity; on cold start it falls back to committed snapshots and shows a **DEMO** badge until the live refresh completes.

---

## What is RegimeRadar?

RegimeRadar ingests daily SPY, VIX, and FRED Economic Market Volatility data, engineers 22 market-state features, and runs two XGBoost models in sequence:

1. **Regime classifier** — labels current conditions as Calm / Elevated / Turbulent
2. **Transition-risk model** — estimates the probability that conditions worsen within the next 5 trading days

Results are served by a FastAPI backend and visualized in a React/TypeScript dashboard with five pages: Current State, History, Event Replay, Model Drivers, and Scenario Explorer.

---

## Why it exists

Most public market-state dashboards are either overfitted lookback tools or black-box sentiment aggregators. RegimeRadar is a fully documented, end-to-end ML pipeline with an honest evaluation methodology: walk-forward cross-validation over 104 weekly folds, explicit calibration, and a threshold-tradeoff table that shows exactly what recall buys at each false-alert cost.

---

## Live vs. demo mode

| Mode | Trigger | Badge |
|---|---|---|
| **Live** | yfinance + FRED refresh succeeded on startup | Green **LIVE** badge |
| **Demo** | Live refresh timed out; fell back to committed snapshots | Amber **DEMO** badge + as-of date shown |

The backend always attempts a live yfinance + FRED refresh on startup. On Render's free tier this can time out on the first cold boot — in that case the backend serves committed snapshot data and flips to live a few minutes later when the scheduler completes its first background refresh.

Finnhub is optional and only affects the live price-card overlay on the Current State page. All regime classification and transition-risk logic runs without it.

---

## Product overview

| Page | What it shows |
|---|---|
| **Current State** | Live regime, transition risk gauge, probability distribution across all three states, key risk drivers, 30-day mini chart |
| **History** | Full regime timeline with VIX overlay from 2020 onward |
| **Event Replay** | Walk the model through named historical events (2020 COVID crash, 2022 rate shock, etc.) |
| **Model Drivers** | Global feature importance, current local explanation, threshold/recall tradeoff table |
| **Scenario Explorer** | Adjust individual feature inputs with sliders and see how regime probabilities and risk shift in real time |

---

## Why this architecture

FastAPI keeps ML inference co-located with the Python data/model stack — no rewriting logic across language boundaries. Vercel gives zero-config static frontend hosting with a global CDN. Render hosts the FastAPI service on a free-tier Docker web service with automatic deploys on push to main. No external database — SQLite is used only as an ephemeral in-process cache for the latest inference result and resets on every cold boot, which is sufficient for a portfolio project.

---

## Architecture

```
┌─────────────────────────────┐
│   GitHub (public repo)      │
│   main → auto-deploys both  │
└──────────┬──────────────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
┌──────────┐  ┌────────────────────────────────┐
│  Vercel  │  │  Render (free tier)             │
│  React   │◄─│  FastAPI + XGBoost              │
│  /frontend│  │  src/api/main.py               │
│  CDN     │  │  data/models/ (committed)       │
└──────────┘  │  data/snapshots/ (committed)   │
VITE_API_URL  │  data/processed/ (ephemeral)   │
→ Render URL  │  SQLite: ephemeral inference cache│
              └────────────────────────────────┘
                          │
              FRED_API_KEY → live refresh on boot
              Fallback: data/snapshots/ → data/processed/
```

**Cold-start behavior:** On startup, the backend calls `_do_refresh()` (live yfinance + FRED fetch). If that fails, it copies `data/snapshots/*.parquet` → `data/processed/` and runs inference from committed snapshots, setting `mode = "demo"`.

---

## Frontend stack

- React 18 + TypeScript
- Vite + Tailwind CSS v4
- Recharts (charts), Framer Motion (transitions), Radix UI (sliders/tooltips)
- React Router v7

## Backend stack

- FastAPI + Uvicorn
- XGBoost 2.x + scikit-learn (calibration, evaluation)
- pandas, SHAP, APScheduler
- SQLite (ephemeral live state)
- yfinance, fredapi, requests

---

## Data sources

| Source | What | Why |
|---|---|---|
| **yfinance** | SPY daily OHLCV since 1993 | Price, returns, drawdown, realized volatility |
| **FRED** | Economic Policy Uncertainty / Market Volatility Index | Macro fear proxy independent of VIX |
| **CBOE via yfinance** | VIX daily since 1990 | Implied volatility level and momentum |
| **Finnhub** (optional) | Real-time SPY quote | Live price-card overlay only |

---

## Feature design

22 features across five groups:

| Feature | Group | Description |
|---|---|---|
| `ret_1d`, `ret_5d`, `ret_20d`, `momentum_20d` | Returns | Short/medium-term return and momentum |
| `dist_sma50` | Trend | Distance from 50-day moving average |
| `rv_10d`, `rv_20d`, `rv_20d_pct`, `vix_zscore_252d`, `vix_pct_504d` | Volatility | Realized and implied volatility, cross-period percentiles |
| `vix_level`, `vix_chg_1d`, `vix_chg_5d` | VIX | Level and short-term momentum |
| `drawdown`, `drawdown_pct_504d` | Drawdown | Current and relative-to-history drawdown |
| `trend_code` | Trend | Encoded trend label (uptrend / neutral / downtrend) |
| `emv_level`, `emv_chg_5d`, `emv_lag_5d`, `emv_lag_20d` | EMV | FRED Economic Market Volatility |
| `days_in_regime_lag1`, `turbulent_count_30d_lag1` | Regime memory | Persistence and recent stress count |

---

## Regime labeling methodology

Regimes are labeled using a rule-based procedure on rolling realized volatility and drawdown:

- **Calm** — low realized volatility, drawdown within normal range
- **Elevated** — above-median VIX or moderate drawdown
- **Turbulent** — top-quartile realized volatility or severe drawdown

Labels are computed daily and used as the target for the regime classifier. The labeling function is fully deterministic — no manual annotation.

---

## Transition-risk target definition

The transition-risk target is a binary label: did the market regime worsen within the next 5 trading days? "Worsen" means moving from Calm → Elevated, Calm → Turbulent, or Elevated → Turbulent. This is the primary ML task. The regime classifier is secondary — it provides context and SHAP explanations.

---

## Modeling

### Two-model pipeline

| Model | Task | Algorithm | Primary metric |
|---|---|---|---|
| `xgb_regime` | Regime classification (3-class) | XGBoost | Balanced accuracy: **0.926** |
| `xgb_transition` | 5-day transition risk (binary) | XGBoost + Platt calibration | ROC-AUC: **0.658**, Brier (calibrated): **0.079** |

### Baseline comparison

The transition-risk model is evaluated against:
- **Naive baseline** — always predicts the class-prior rate (~7.4% transition frequency)
- **VIX-only baseline** — logistic regression on VIX level alone

The XGBoost model meaningfully outperforms both baselines on PR-AUC and calibrated Brier score.

---

## Evaluation methodology

Walk-forward cross-validation: 104 weekly folds, each fold trains on all past data and tests on the next week. This respects temporal ordering — no look-ahead. Out-of-fold (OOF) predictions cover 7,812 daily observations.

The regime classifier uses the same walk-forward structure for consistency, but the transition-risk model is the primary ML contribution.

---

## Calibration / threshold tradeoff

The raw transition-risk model is Platt-calibrated (isotonic regression). Post-calibration ECE drops from 0.136 → 0.006, making the output interpretable as an actual probability.

Threshold sensitivity (from OOF evaluation):

| Threshold | Recall | False-alert rate | Avg lead time |
|---|---|---|---|
| 0.10 | 54% | 32% | 33.5 days |
| 0.20 | 9% | 5% | 23.6 days |
| 0.30 | 0.7% | 0.3% | 21.2 days |

The dashboard default displays the raw probability. The Model Drivers page shows the full threshold sweep.

---

## Scenario Explorer

Adjust any of the six key feature inputs with sliders and see the model re-score in real time:

- `vix_level`, `vix_chg_5d` — implied volatility and recent momentum
- `rv_20d_pct` — realized volatility percentile vs. 2-year history
- `drawdown_pct_504d` — drawdown vs. 2-year history
- `ret_20d` — 20-day return
- `dist_sma50` — distance from 50-day moving average

The response shows baseline vs. scenario risk, delta, and which features drove the change.

---

## Event Replay

Walk the model forward through named historical stress events using committed snapshot data. Available events include the 2020 COVID crash, 2022 rate shock, and others. The replay shows actual vs. predicted regime and the daily transition-risk signal, including warning lead time before each event's peak.

---

## Limitations

- SPY is the only instrument — regime signals apply to US large-cap equity only
- Daily granularity — no intraday signals
- Regime labels are rule-based — they encode a specific definition of "stress" that may not match all use cases
- The transition-risk model has modest PR-AUC (0.20) at 10% threshold — it is a signal, not a forecast
- On Render free tier, state is ephemeral — it resets on every cold boot

---

## Local development setup

**Prerequisites:** Python 3.11+, Node.js 18+, a FRED API key ([get one free](https://fred.stlouisfed.org/docs/api/api_key.html))

### Environment variables

```bash
cp .env.example .env
# Fill in FRED_API_KEY (required for live refresh)
# FINNHUB_API_KEY is optional (price-card overlay only)

cd frontend
cp .env.example .env
# VITE_API_URL=http://localhost:8000 is already set
```

### Run backend locally

```bash
python -m pip install -r requirements.txt
uvicorn src.api.main:app --reload
# API available at http://localhost:8000
# Swagger docs at http://localhost:8000/docs
```

On startup, the backend attempts a live refresh from yfinance + FRED. If that fails (e.g., rate limit), it falls back to committed snapshots.

### Run frontend locally

```bash
cd frontend
npm install
npm run dev
# Dashboard available at http://localhost:5173
```

### Docker full-stack (local)

```bash
cp .env.example .env  # fill in FRED_API_KEY
docker compose up --build
# API: http://localhost:8000
# Dashboard: http://localhost:3000
```

The compose file uses a bind mount (`./data:/app/data`) so the container reads committed model artifacts and snapshots directly from the repo.

---

## Deploy: Vercel (frontend)

1. Fork or push this repo to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Set **Root Directory** to `frontend` in the Vercel project settings
4. Add environment variable: `VITE_API_URL` → your Render service URL (e.g. `https://regime-radar-api.onrender.com`)
5. Deploy — Vercel auto-detects Vite

The `frontend/vercel.json` rewrite rule handles client-side routing.

---

## Deploy: Render (backend)

1. Push `render.yaml` to your repo (already committed)
2. Create a new Render Web Service, connect your GitHub repo
3. Render detects `render.yaml` automatically
4. Add environment variables in the Render dashboard:

| Variable | Required | Value |
|---|---|---|
| `FRED_API_KEY` | **Yes** | From [api.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html) |
| `APP_ENV` | No | `production` |
| `FINNHUB_API_KEY` | No | Optional price-card overlay |

**Cold-start notes:** Render free tier spins down after ~15 minutes of inactivity. The first request after a spin-down triggers a cold boot (~15–30 seconds). The backend will attempt a live yfinance + FRED refresh on startup; if that succeeds, the dashboard shows live data (LIVE badge). If it fails, it uses committed snapshots (DEMO badge).

---

## Repo structure

```
regime-radar/
├── src/
│   ├── api/            FastAPI app, routes, state management
│   ├── data/           Fetch functions (yfinance, VIX, FRED), panel merge
│   ├── features/       Feature engineering (22 features)
│   ├── labeling/       Regime and trend label builders
│   ├── models/         Training, prediction, registry, evaluation
│   └── utils/          Logging, config, paths, calendar
├── frontend/
│   ├── src/
│   │   ├── api/        Typed API client
│   │   ├── components/ Reusable UI and chart components
│   │   ├── hooks/      Data-fetching and health-polling hooks
│   │   ├── pages/      Five page components
│   │   └── types/      API response types
│   └── vercel.json
├── data/
│   ├── models/         Committed XGBoost artifacts (~3 MB)
│   └── snapshots/      Committed parquets for fallback (~1 MB)
├── tests/              pytest smoke tests (66 tests)
├── Dockerfile.api
├── docker-compose.yml
├── render.yaml
├── MODELS.md           Artifact policy and regeneration guide
└── requirements.txt
```

---

## Future improvements

- Multi-asset extension (bonds, gold, international equity)
- Intraday signals with 15-minute OHLCV
- GitHub Actions CI for automated test runs on push
- Alerting integration (email / Slack when transition risk crosses threshold)
