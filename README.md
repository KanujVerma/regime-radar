# RegimeRadar

**Market-state monitoring and transition-risk forecasting for SPY.**

RegimeRadar classifies the current equity market regime (calm / elevated / turbulent) and estimates the probability that the regime will shift to a higher-stress state within the next five trading days. It is a monitoring and awareness tool — not a trading system.

> **What this is NOT:** RegimeRadar does not generate trade recommendations, produce entry or exit points, claim to predict prices, or generate alpha. It is a regime-awareness dashboard for structured observation of market conditions.

---

## Overview

The system produces two outputs every trading day:

1. **Current regime** — a three-class label (calm / elevated / turbulent) derived from a composite stress score built from VIX percentile, realized volatility percentile, and drawdown percentile.
2. **5-day transition-risk score** — a calibrated probability that the regime will escalate to a higher-stress level within the next five trading days and hold there for at least three consecutive days.

Both outputs are explained via SHAP values and per-feature importance, making the classifications auditable and interpretable.

The dashboard has four pages:

| Page | Description |
|---|---|
| **Current State** | Today's regime, transition-risk gauge, feature snapshot, SHAP waterfall |
| **History** | Regime timeline, stress-score history, VIX overlay, drawdown chart |
| **Event Replay** | 2008, 2020, and 2022 crisis windows with out-of-fold warning lead times |
| **Model Drivers** | Walk-forward metrics, threshold analysis, feature importance, calibration curves |

---

## Product Framing

- **Monitoring, not trading.** RegimeRadar tracks market-state; it does not advise action.
- **Daily cadence.** All regime logic operates on end-of-day OHLCV data.
- **Explainable by design.** SHAP values and feature importance are surfaced for every classification. The composite stress score formula is fully documented and reproducible.
- **Honest about limitations.** The regime classifier is a feature-sufficiency reference task (labels are a deterministic function of inputs). The primary ML contribution is the transition-risk model.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Data Ingestion                            │
│   yfinance (SPY OHLCV)  ·  FRED VIXCLS  ·  FRED EMVOVERALLEMV  │
│   [Finnhub: optional price-card overlay only]                   │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Feature Pipeline                             │
│   build_market_features.py → 20 features (panel.parquet)       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Labels                                    │
│   Regime: composite stress score → smooth_offline               │
│   Transition: H=5d horizon scan + persistence check            │
│   Trend: SMA-50 + 20d return                                    │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Training                                   │
│   XGBoost regime (multiclass) · XGBoost transition (binary)    │
│   Baselines: rule engine, LogisticRegression, RandomForest      │
│   Walk-forward expanding window · per-fold calibration          │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Evaluation                                  │
│   Walk-forward metrics · threshold sweep · event replay        │
│   Calibration report (Brier, ECE, reliability curves)          │
└──────────────────────┬──────────────────────────────────────────┘
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
┌───────────────────┐   ┌────────────────────────┐
│  Serving (FastAPI)│   │  Dashboard (Streamlit)  │
│  src/api/main.py  │   │  src/dashboard/app.py  │
│  :8000            │   │  :8501                 │
└───────────────────┘   └────────────────────────┘
```

---

## Data Sources

| Source | Series | Coverage | Role |
|---|---|---|---|
| **yfinance** | SPY OHLCV | From 1993 | Primary; always required |
| **FRED VIXCLS** | CBOE Volatility Index (daily) | From 1990 | Primary VIX source; required |
| **FRED EMVOVERALLEMV** | Equity Market Volatility index | From inception (monthly) | Macro context feature; required |
| **Finnhub** | Real-time price card | Live only | Optional; Current State overlay only. Never required for ML pipeline. |

**DEMO mode** uses yfinance + FRED only. No Finnhub key is needed to run the full ML pipeline, train models, or view historical replay.

---

## Feature Design

All 20 features are computed at time `t` using only trailing data. Regime-lag features use `regime.shift(1)` — no leakage.

### Returns
| Feature | Description |
|---|---|
| `ret_1d` | 1-day log return |
| `ret_5d` | 5-day return |
| `ret_20d` | 20-day return |

### Momentum
| Feature | Description |
|---|---|
| `momentum_20d` | 20-day price momentum |
| `dist_sma50` | Distance from 50-day SMA (normalized) |

### Volatility
| Feature | Description |
|---|---|
| `rv_10d` | 10-day realized volatility (annualized) |
| `rv_20d` | 20-day realized volatility (annualized) |
| `rv_20d_pct` | 20-day RV percentile rank over trailing 504-day window |

### VIX
| Feature | Description |
|---|---|
| `vix_level` | Raw VIX close |
| `vix_chg_1d` | 1-day VIX change |
| `vix_chg_5d` | 5-day VIX change |
| `vix_zscore_252d` | VIX z-score over trailing 252-day window |
| `vix_pct_504d` | VIX percentile rank over trailing 504-day window |

### Risk / Context
| Feature | Description |
|---|---|
| `drawdown` | Drawdown from rolling 504-day maximum |
| `drawdown_pct_504d` | Drawdown percentile rank over trailing 504-day window |
| `days_in_regime_lag1` | Consecutive days in current regime as of yesterday |
| `turbulent_count_30d_lag1` | Turbulent days in prior 30-day window (from lagged regime) |
| `trend_code` | Trend state: +1 (above SMA50 + positive 20d return), -1 (below + negative), 0 (mixed) |

### Macro
| Feature | Description |
|---|---|
| `emv_level` | FRED EMVOVERALLEMV level |
| `emv_chg_5d` | 5-day change in EMV |
| `emv_lag_5d` | EMV lagged 5 days |
| `emv_lag_20d` | EMV lagged 20 days |

---

## Regime Labeling Logic

The regime label is derived from a **composite stress score** — a weighted sum of three trailing percentile ranks, each computed over a 504-trading-day (≈2-year) window:

```
stress = 0.45 × vix_percentile
       + 0.35 × realized_vol_percentile
       + 0.20 × drawdown_percentile
```

Thresholds applied to `stress`:
- `calm`: stress < 0.40
- `elevated`: 0.40 ≤ stress < 0.70
- `turbulent`: stress ≥ 0.70

Raw labels are then smoothed to suppress single-day noise:

**`smooth_offline`** (training labels)
Forward-scan: a regime flip is accepted only when the new label holds for ≥ `smoothing_days` (default: 2) consecutive days. The flip is attributed to the **first day** of the run. This function uses future data and is used only at training time.

**`smooth_live`** (serving)
Backward-only: a flip is confirmed only after the new label has held for ≥ `smoothing_days` consecutive trailing days. This introduces a known `smoothing_days`-day reporting lag. It is the only smoothing function used at inference time and never looks ahead.

> **Intentional difference:** `smooth_offline` and `smooth_live` produce slightly different label sequences near transition boundaries. This is by design — it is documented, not a data-leakage bug. The live system has a known N-day lag that is understood and accepted.

---

## Transition Target

**Binary label:** within `H = 5` trading days, does the regime rise to a strictly higher level AND hold for ≥ 3 consecutive days?

- Rows where the current regime is **turbulent** always receive label `0` (no higher regime is possible).
- Rows within `H` days of the end of the series receive label `0` (future is unknown).
- All parameters (`horizon_days`, `persistence_days`) are configurable via `configs/labels.yaml`.

---

## Modeling

### Two models

**1. Regime Classifier (XGBoost multiclass) — reference task**

Because regime labels are a deterministic function of the input features (VIX percentile, realized-vol percentile, drawdown percentile), the XGBoost classifier closely approximates the rule baseline. This is an honest property of the problem — documented explicitly. The regime classifier serves as a feature-sufficiency check and a clean baseline reference.

Configuration (`configs/model.yaml`):
- `objective: multi:softprob`, `num_class: 3`
- 400 estimators, max_depth 4, learning_rate 0.05
- Evaluated via macro F1 and balanced accuracy

**2. Transition-Risk Model (XGBoost binary) — PRIMARY ML task**

Predicts the probability that the regime will escalate within the next 5 days. This is the principal machine learning contribution: the target is not a deterministic function of current features, and the model must learn temporal structure.

Configuration:
- `objective: binary:logistic`, eval metric `aucpr`
- 500 estimators, max_depth 4, learning_rate 0.04
- `scale_pos_weight`: computed per fold from the fold's positive rate
- Post-hoc calibration per fold (isotonic preferred, Platt fallback)

### Baselines

| Baseline | Type | Description |
|---|---|---|
| `rule_regime_predict` | Rule engine | Directly applies the stress-score formula |
| `transition_heuristic` | VIX threshold | 1 if VIX jumps > 15% in 5 days, else 0 |
| `LogisticTransition` | ML | Logistic regression on full feature set |
| `RandomForestRegime` | ML | Random Forest multiclass regime classifier |

---

## Methodology Summary

| Stage | Technique | Data used | Leakage guard | Output |
|---|---|---|---|---|
| Ingest | yfinance + FRED fetch; Finnhub optional | SPY OHLCV, VIXCLS, EMVOVERALLEMV | Trailing windows end at `t`; no lookahead in fetch | Parquet cache |
| Merge | Business-day alignment; forward-fill macro | All sources | EMVOVERALLEMV is monthly, forward-filled (not interpolated) | `panel.parquet` |
| Features | Rolling windows; percentile ranks | `panel.parquet` | All windows end at `t`; regime-lag features use `regime.shift(1)` | Feature matrix |
| Regime labels | Composite stress score → smoothing | Feature matrix | `smooth_offline` (training) / `smooth_live` (serving, known n-day lag) | Regime series |
| Transition labels | H-day horizon scan + persistence check | Regime series | Turbulent → 0; no future data used beyond the horizon window | Binary label series |
| Trend labels | SMA-50 + 20d return | `panel.parquet` | Both computed at `t` using trailing data only | Trend series |
| Baselines | Rule engine, LogisticRegression, RandomForest | Feature matrix | Walk-forward splits; never trained on test fold | Baseline metrics |
| XGB regime | XGBoost multiclass | Feature matrix | Walk-forward; reference task, not primary ML contribution | Regime probabilities |
| XGB transition | XGBoost binary | Feature matrix | Per-fold calibration on inner holdout (last 20% of train); `scale_pos_weight` per fold | Calibrated risk scores |
| Calibration | Isotonic (n_pos ≥ 200) or Platt | Inner holdout | Calibrator fitted on holdout only; never on test set | Calibrated probabilities |
| Walk-forward eval | Expanding window (≥ 5y initial, 1q step) | Feature + label matrices | `max(train_idx) < min(test_idx)` enforced; never random split | Per-fold metrics |
| Threshold analysis | Sweep {0.10 … 0.70} | OOF predictions | Uses OOF predictions only; no test-set leakage | recall / FAR / lead_time / alert_frequency table |
| Event replay | 2008 / 2020 / 2022 crisis windows | OOF predictions | OOF discipline: each crisis day scored by the fold it fell in as test set | Warning lead-time per event |
| Live inference | `smooth_live` + `predict_current_state` | Latest yfinance + FRED data | `smooth_live` is backward-only (known lag); no model retraining in scheduler | Regime + risk scores → SQLite |

---

## Evaluation Methodology

**Walk-forward expanding window** — no random splits, no leakage.
- Initial training window: ≥ 1,260 trading days (≈5 years)
- Step size: 63 trading days (≈1 quarter)
- `max(train_idx) < min(test_idx)` is enforced in code

**Per-fold calibration**
- Inner holdout: last 20% of each training fold
- Isotonic regression if fold has ≥ 200 positive transitions; Platt (logistic) otherwise
- Calibrator is never fitted on test data

**Threshold analysis**
- Seven thresholds from 0.10 to 0.70
- Reports: recall, false alert rate (FAR), alert frequency, mean warning lead time

**Event replay**
- 2008 financial crisis, 2020 COVID crash, 2022 rate-shock drawdown
- Uses out-of-fold (OOF) predictions only — each crisis day is scored by the fold in which it appeared as the test set
- Reports mean and median warning lead time per event

**Metrics reported:** macro F1, balanced accuracy, ROC-AUC, PR-AUC, recall @ threshold 0.50, mean/median lead time

---

## Dashboard

The dashboard runs at `http://localhost:8501` (local) or as a DEMO replay on HuggingFace Spaces.

A **LIVE** badge indicates the scheduler is running and data is refreshed from yfinance + FRED every 5 minutes during market hours. A **DEMO** badge indicates the dashboard is running from pre-built historical artifacts (no network calls, no live refresh).

| Page | Content |
|---|---|
| **Current State** | Regime label, transition-risk gauge, VIX/RV/drawdown snapshot, SHAP waterfall chart. Optional Finnhub price card if `FINNHUB_API_KEY` is set. |
| **History** | Full regime timeline from 1993, stress-score chart, VIX overlay, drawdown waterfall. |
| **Event Replay** | Interactive selection of 2008, 2020, 2022 crisis windows. Shows model output vs actual regime on a day-by-day basis using OOF predictions only. |
| **Model Drivers** | Walk-forward fold metrics, threshold analysis table, feature importance, calibration reliability curves. |

---

## Setup

```bash
git clone https://github.com/your-username/regime-radar.git
cd regime-radar
cp .env.example .env   # add FRED_API_KEY (required) and FINNHUB_API_KEY (optional)
pip install -r requirements.txt
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `FRED_API_KEY` | **Yes** | Required for VIXCLS and EMVOVERALLEMV data from FRED |
| `FINNHUB_API_KEY` | No | Optional; enables live price-card overlay on Current State page only |
| `APP_API_URL` | Compose | Set to `http://api:8000` in docker compose; dashboard reads regime data from API |
| `APP_ENV` | No | `development` (default) or `production` |
| `APP_LOG_LEVEL` | No | `INFO` (default) or `DEBUG` |

---

## Run Training

```bash
python scripts/bootstrap_data.py
```

This script fetches SPY, VIX, and EMV data, builds the feature matrix, generates all labels, trains both models via walk-forward cross-validation, and writes artifacts to `data/models/`.

---

## Run API

```bash
uvicorn src.api.main:app --reload
# API available at http://localhost:8000
```

---

## Run Dashboard

```bash
streamlit run src/dashboard/app.py
# Dashboard available at http://localhost:8501
```

---

## Docker (Local LIVE Stack)

```bash
docker compose up --build
# API:       http://localhost:8000
# Dashboard: http://localhost:8501
```

The compose stack runs the scheduler (live data refresh every 5 minutes during market hours), the FastAPI model-serving layer, and the Streamlit dashboard as separate services.

---

## Regenerate DEMO Bundle (for HF Space)

```bash
python scripts/build_demo_bundle.py
```

Builds pre-computed historical artifacts for the DEMO replay. No live API keys are required at runtime.

---

## HuggingFace Spaces

**The HF Space runs DEMO replay only — no live data refresh.**

The Space is a single-container Streamlit dashboard served from pre-built artifacts. LIVE mode (real-time regime refresh) requires running the full docker compose stack locally with a FRED API key.

To deploy: push to a HuggingFace Space repository with `spaces/Dockerfile` as the root container definition.

---

## Formal Limitations

- **Single-asset scope.** SPY only. Regime classifications have not been validated across other asset classes, market structures, or international equity markets.

- **Daily granularity.** No intraday modeling in V1. All regime logic operates on end-of-day data; intraday volatility dynamics are not captured.

- **Regime labels are configurable heuristics, not ground truth.** The composite stress thresholds (0.40 / 0.70) are interpretable but arbitrary. Alternative parameterizations produce different label sequences. There is no universally correct regime definition.

- **Live regime label lags offline label by `smoothing_days` days.** At serving time, `smooth_live` (backward-only smoothing) can only confirm a regime flip after it has persisted for N days. Training labels use `smooth_offline` (forward-scan) and attribute the flip to the first day. This is an intentional, documented difference — not a bug. Users should expect a known N-day lag in live regime updates near transition boundaries.

- **EMVOVERALLEMV is a monthly release, forward-filled between releases.** Feature values derived from it (emv_level, emv_chg_5d, emv_lag_5d, emv_lag_20d) are stale by up to 31 days. This is documented in the feature table and the methodology summary.

- **External API availability.** FRED and yfinance are external services with no formal SLA. Rate limits or outages degrade the live refresh path. Finnhub is optional and its unavailability does not affect model inference.

- **Transition target is definitionally lagging.** A transition beginning on day `t` is only labeled on day `t` after observing the next `H` days. At serving time the model predicts risk from features only — no future information is used. The label construction limitation means the last `H` rows of any dataset cannot receive a ground-truth label.

- **Model has not been validated across asset classes, market structures, or international markets.** All validation was performed exclusively on SPY (US large-cap equities).

- **Current-regime classification is a feature-sufficiency reference task.** Because regime labels are a deterministic function of the input features (VIX, realized vol, drawdown), XGBoost closely approximates the rule baseline. The primary ML contribution is the transition-risk model, which predicts an outcome not mechanically derivable from current features.

- **HF Space runs DEMO replay only (no live refresh).** LIVE mode requires running the full docker compose stack locally with a FRED API key (and optionally a Finnhub key for the price-card overlay on the Current State page).

- **Explanations surface correlation, not causation.** SHAP values indicate feature contributions to model output — not causal relationships between market variables and regime transitions. Do not interpret high SHAP magnitude as evidence of a causal mechanism.

---

## Future Improvements

- **Multi-asset extension**: apply regime framework to additional ETFs, sector indices, or bond markets
- **Intraday granularity**: incorporate hourly or 15-minute OHLCV for finer-grained volatility features
- **Alternative macro features**: credit spreads, yield curve slope, put/call ratios
- **Online learning**: incremental model updates as new data arrives rather than periodic full retraining
- **Alert delivery integrations**: webhook, email, or Slack notifications when transition risk exceeds a user-configured threshold
- **Backtesting framework**: structured replay environment for evaluating hypothetical monitoring strategies over historical regimes
