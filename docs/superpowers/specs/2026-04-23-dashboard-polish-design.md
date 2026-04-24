# RegimeRadar Dashboard Polish & Interactivity — Design Spec

**Date:** 2026-04-23
**Scope:** UX polish, interactivity, and product quality improvements to the existing Streamlit dashboard. No new data sources. No new backend routes. No trading language.

---

## Decisions Made

| Decision | Choice |
|---|---|
| Current State layout | Two-Column Split (left: interpretation; right: metrics) |
| Sandbox placement | 5th page — "Scenario Explorer" |
| Event Replay hero stats | Two side-by-side (Warning Lead Time + Max Transition Risk) |
| Default alert threshold | 0.10 (most operationally useful; 54% recall, 33-day avg lead time) |

---

## 1. Current State Page Redesign

### Layout: Two-Column Split

**Left column — interpretation**
- Regime pill (large, color-coded) — existing component, unchanged
- Trend chip — existing component, unchanged
- Auto-generated 2-sentence plain-English narrative using template logic (not ML):
  - Template: `"SPY is in an {regime} regime with {risk_level} transition risk ({risk:.1%}). {trend_sentence} VIX is at {vix:.1f}{vix_direction}."`
  - Risk levels: `< 0.05` → "very low"; `0.05–0.20` → "low"; `0.20–0.40` → "moderate"; `> 0.40` → "elevated"
  - Trend sentence: uptrend → "The trend is positive." / downtrend → "The trend is negative." / neutral → "The trend is neutral."
  - VIX direction: `vix_chg_1d > 0.5` → "rising"; `< -0.5` → "falling"; else → "stable"
- Compact delta panel: shows change since last refresh
  - Show only if ≥ 2 state rows exist in SQLite
  - Fields: transition_risk delta (±%), regime change (if any), top 1 feature delta (if available from SHAP)
  - Style: 3 small `st.metric` calls in a sub-row; compact, not full-width
  - Implementation: add a `read_prior_state() -> dict | None` method to `AppState` in `state.py` that executes `SELECT * FROM live_state ORDER BY ts DESC LIMIT 2` and returns the second row as a dict (index 1), or `None` if fewer than 2 rows exist. The Current State page calls `read_prior_state()` via the embedded client's `AppState` instance to get the delta.
- Regime class probabilities (3 chips: Calm · Elevated · Turbulent with percentages)
  - Requires `prob_calm`, `prob_elevated`, `prob_turbulent` fields in the `/current-state` API response
  - To enable: add these three columns to the SQLite `live_state` table in `state.py`, store them in the scheduler job (from `regime_model.predict_proba()`), and add corresponding optional fields (`prob_calm: float | None`, `prob_elevated: float | None`, `prob_turbulent: float | None`) to `CurrentStateResponse` in `schemas.py`
  - Graceful fallback: chips are hidden (not "N/A") if the fields are `None` — this is the default state until the schema change is applied and a refresh has run

**Right column — metrics**
- Transition risk gauge — existing component, unchanged
- VIX metric card — existing component, unchanged
- Mode badge renamed:
  - `live` → `NEAR-LIVE DATA` (green `#2E7D32` — matches `REGIME_COLORS["calm"]`)
  - `demo` → `DEMO MODE` (amber `#F9A825`)
- Last refresh timestamp (moved from footer to right column)
- Compact threshold note (static from model metadata):
  - `"At the default threshold (0.10): alerts on ~34% of days, detecting 54% of transitions."`

**Full width below — driver chart**
- Top 5 feature driver bar chart — existing component, unchanged
- Fallback message (less developer-specific):
  - Replace: `"No feature driver data available for this refresh."`
  - With: `"Feature driver data will appear here once the model has been run. Contact the administrator or restart with a trained model."`

---

## 2. History Page Chart Polish

### Chart changes
- SPY line: weight `1.5 → 2.0px`, color `#1565C0 → #42A5F5` (brighter, more visible on dark background)
- Regime background bands: opacity `0.12 → 0.08` (more subtle; SPY line becomes visually dominant)
- VIX overlay: line width `1.2 → 1.0px` (thinner, secondary feel)
- Transition risk chart: replace bare dashed threshold lines with labeled annotations:
  - The existing code has unlabeled numeric lines at 0.30 and 0.60 (`annotation_text="0.3"` and `annotation_text="0.6"`)
  - After change: add `0.10` line labeled `"Watch (default threshold)"` — thin amber dashed
  - Relabel the existing 0.30 line to `"Alert (high sensitivity)"` — amber dashed
  - Remove the 0.60 line (model never reaches it in practice)
- Add `st.write("")` spacer between the regime chart and transition risk chart

### Tooltip improvement
- Ensure hover shows: date, SPY close, regime label (e.g., "Elevated"), transition risk value
- The History page uses regime as Plotly `shapes` (background bands), not scatter traces, so there is no numeric trace to fix here. Tooltip improvement on this page is limited to ensuring the SPY hover shows date + close + transition risk from the risk subplot.

---

## 3. Event Replay Page — Storytelling

### Summary card (above chart)

**Hero stats row** (two large metrics side by side):
- **Warning Lead Time**: `{N} trading days early` or `"No early warning detected"` (never blank); read from `warning_lead_days` field in the event replay API response
- **Peak Transition Risk**: `{peak_risk:.0%}` peak risk reached during the window; computed client-side as `max(p["transition_risk"] for p in data if p["transition_risk"] is not None)` — no new API field needed

**Supporting stats row** (four smaller metrics, all computed client-side from the `data` array):
- Alert days: `sum(1 for p in data if (p["transition_risk"] or 0) > DEFAULT_THRESHOLD)`
- First threshold crossing: earliest date string where `transition_risk > DEFAULT_THRESHOLD`, or `"—"` if none
- Regime match rate: `{pct:.0%}` of days where `regime_actual == regime_predicted`; denominator = days where both fields are non-`"unknown"` and non-`None`
- High-stress days: `sum(1 for p in data if p["regime_actual"] in ("elevated", "turbulent"))`

### Context paragraph (per event, hardcoded)
One sentence for each window (below the summary card, above the chart):
- 2008: *"Replay metrics are computed from out-of-fold predictions, so each day in this window was scored by a model that did not train on that day."*
- 2020: Same methodology sentence.
- 2022: Same methodology sentence.

(All three windows get the same methodology note — consistent, honest, no per-event narrative that could be seen as interpretation.)

### Chart improvements
- Add vertical dashed line at first day risk crossed `DEFAULT_THRESHOLD` (0.10) on the risk subplot (if any such day exists in the window)
- Transition event markers (red ✕) kept unchanged
- Regime traces in the Event Replay chart use numeric encoding (`0.1/0.5/0.9`) for actual and predicted. Add `customdata` with text labels (`"Calm"/"Elevated"/"Turbulent"`) to both traces and use `%{customdata}` in `hovertemplate` so hover shows `"Elevated"` not `"0.5"`. Mapping: `0.1 → "Calm"`, `0.5 → "Elevated"`, `0.9 → "Turbulent"`.

---

## 4. Model Drivers Page — Plain-English Narrative

Replace the current single `st.info` line with a structured explanation block, rendered between the global importance chart and the local explanation chart.

**When SHAP values are available:**
```
What pushed risk higher:
  • {feature_1_label} contributed most strongly upward (SHAP: +{val:.3f})
  • {feature_2_label} also added upward pressure

What held risk down:
  • {feature_3_label} was the strongest downward contributor
```

**When only global importance is available:**
```
Overall, {feature_1_label} has the largest influence on this model's transition risk
estimates across all historical predictions.
```

**Feature name → human-readable label mapping** (defined as a dict in the page module):
```python
FEATURE_LABELS = {
    "vix_pct_504d": "VIX relative to 2-year history",
    "vix_level": "Current VIX level",
    "vix_zscore_252d": "VIX z-score (1-year)",
    "vix_chg_5d": "VIX 5-day change",
    "rv_20d_pct": "Realized volatility percentile",
    "drawdown_pct_504d": "Drawdown relative to 2-year history",
    "ret_20d": "20-day SPY return",
    "momentum_20d": "20-day momentum",  # NOTE: identical computation to ret_20d in the codebase
    "dist_sma50": "Distance from 50-day moving average",
    "emv_level": "Equity market volatility index",
    "days_in_regime_lag1": "Days in current regime (lagged)",
    "turbulent_count_30d_lag1": "Turbulent days in past 30 days (lagged)",
    "trend_code": "Trend direction",
    # fallback: use raw name if not in dict
}
```

**De-duplication note:** `momentum_20d` and `ret_20d` are computed identically in `build_market_features.py`. If both appear in the top-N SHAP contributors in the same direction, show only `momentum_20d` and skip `ret_20d` to avoid confusing duplicate entries in the narrative.

---

## 5. Scenario Explorer — New 5th Page

**File:** `src/dashboard/pages/scenario_explorer.py`  
**Registration:** Added to `app.py` navigation as the 5th page, icon `🧪`, url_path `"scenario-explorer"`

### Part 1: Scenario Sandbox

**Inputs** (6 sliders, pre-seeded from current live state or sensible defaults):

| Slider | Feature key | Range | Default |
|---|---|---|---|
| VIX level | `vix_level` | 5–80 | live `vix_level` or 20.0 |
| VIX 5-day change | `vix_chg_5d` | -15–15 | live `vix_chg_5d` or 0.0 |
| Realized-vol percentile | `rv_20d_pct` | 0.0–1.0 | 0.50 |
| Drawdown (2-year percentile) | `drawdown_pct_504d` | 0.0–1.0 | 0.05 |
| 20-day return | `ret_20d` | -0.30–0.30 | 0.02 |
| Distance from SMA-50 | `dist_sma50` | -0.15–0.15 | 0.01 |

**"Reset to current market state" button**: restores all sliders to live values. Uses `st.session_state` to trigger reset. If live state is unavailable (demo mode or API unreachable), the button restores sliders to the same hardcoded defaults listed in the table above — no error is shown, but a `st.caption("Showing default values — live data unavailable.")` is displayed beneath the button.

**Scoring**: import the trained `xgb_transition` model and its metadata from registry. Feature vector construction:
1. Load `meta["feature_names"]` from the model metadata — this is the canonical ordered list of features the model expects.
2. Start from a baseline row: attempt to read the latest feature values from `data/processed/panel.parquet` (last row); if unavailable, use zeros for all features.
3. Override the 6 sandbox feature keys (`vix_level`, `vix_chg_5d`, `rv_20d_pct`, `drawdown_pct_504d`, `ret_20d`, `dist_sma50`) with slider values.
4. Construct a single-row DataFrame with columns in the exact order of `meta["feature_names"]`.
5. Call `model.predict_proba(X)[0, 1]` for the adjusted risk. Baseline risk = same but using the unmodified panel row values.

Result is instantaneous (in-memory inference). No API call.

**Output display** (3 `st.metric` cards in a row):
- Baseline Risk: `{baseline:.1%}`
- Adjusted Risk: `{adjusted:.1%}`
- Delta: `{delta:+.1%}` (positive = higher risk, shown in red; negative = lower, shown in green)

**Narrative** (1 sentence, template-based):
- `changed_features` = comma-separated human-readable labels of sliders whose current value differs from the baseline panel row by more than a small epsilon (1e-6). If all sliders match baseline, use `"these inputs"` as a fallback.
- `direction` = `"increases"` if `adjusted > baseline`, `"decreases"` if `adjusted < baseline`, `"does not change"` if equal.
- Full sentence: `"Adjusting {changed_features} {direction} transition risk from {baseline:.1%} to {adjusted:.1%}."`

**Disclaimer** (`st.info`):
- `"This is a scenario tool. Sliders adjust individual model inputs to illustrate model sensitivity — not a forecast of actual future market conditions."`

### Part 2: Threshold Tuning

**Data source**: loaded from `xgb_transition` model metadata `threshold_sweep` — no API call, no model inference.

**Input**: single `st.slider` for threshold, range `0.10–0.70`, step `0.10`, default `0.10`.

Note: the threshold sweep is stored at steps of `0.10` (`[0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70]`). The slider step must match — do not use `0.05` because intermediate values will not exist in the sweep data.

**Reading the sweep data**: the `threshold_sweep` key in the model metadata contains a list of dicts. For each slider value, find the matching row with `row = next(r for r in sweep if abs(r["threshold"] - threshold) < 1e-9)`, then read: `recall = row["recall"]`, `far = row["false_alert_rate"]`, `freq = row["alert_frequency"]`, `lead = row["avg_lead_time_days"]` (may be `None` if no events detected at that threshold).

**Output** (4 `st.metric` cards in a row):
- Recall: `{recall:.0%}`
- False Alert Rate: `{far:.0%}`
- Alert Frequency: `{freq:.0%}` of trading days
- Avg Lead Time: `{lead:.0f} days` (or `"—"` if lead is NaN)

**Detecting missing lead time**: `avg_lead_time_days` is stored as `float("nan")` when no events were detected at that threshold — never `None`. Use `import math; math.isnan(lead)` (or `pd.isna(lead)`) as the check.

**Narrative** (1 sentence, template-based):
- If `not math.isnan(lead)`: `"At {threshold:.2f}: alerts on {freq:.0%} of trading days, catching {recall:.0%} of actual transitions an average of {lead:.0f} days before they occur."`
- If `math.isnan(lead)`: `"At {threshold:.2f}: alerts on {freq:.0%} of trading days, catching {recall:.0%} of actual transitions — no early warning detected at this threshold."`

### Part 3: Methodology Note

`st.expander("How does RegimeRadar work?")` containing 5 bullet points:
1. **Market regime** — what calm / elevated / turbulent mean (VIX percentile + realized vol + drawdown composite score)
2. **Transition risk** — what it measures (probability of regime escalation within 5 days)
3. **Thresholds** — how to read the tuning panel; lower = more sensitive but more noise
4. **Near-live, not intraday** — model refreshes daily using end-of-day data; not suitable for intraday timing
5. **HF Spaces** — demo-only (pre-built historical replay); NEAR-LIVE DATA mode requires running the full docker compose stack locally

---

## 6. Shared: Default Alert Threshold

Define `DEFAULT_THRESHOLD = 0.10` in `src/dashboard/components.py`.

Used consistently in:
- Current State threshold note
- History risk chart primary annotation label
- Event Replay alert day count (`risk > DEFAULT_THRESHOLD`)
- Scenario Explorer threshold panel initial value

---

## Files to Create / Modify

| File | Action |
|---|---|
| `src/dashboard/components.py` | Add `DEFAULT_THRESHOLD = 0.10`, update `_MODE_CONFIG` labels |
| `src/dashboard/pages/current_state.py` | Full redesign per Two-Column Split spec |
| `src/dashboard/pages/history.py` | Chart polish per Section 2 |
| `src/dashboard/pages/event_replay.py` | Summary card + chart improvements per Section 3 |
| `src/dashboard/pages/model_drivers.py` | Plain-English narrative + `FEATURE_LABELS` per Section 4 |
| `src/dashboard/pages/scenario_explorer.py` | New file — full Scenario Explorer per Section 5; imports `DEFAULT_THRESHOLD` from `src.dashboard.components` |
| `src/dashboard/app.py` | Add 5th page to navigation |
| `src/api/state.py` | Add `read_prior_state() -> dict | None` method to `AppState` — `SELECT * FROM live_state ORDER BY ts DESC LIMIT 2`, return second row or `None` |
| `src/api/routes.py` | `/current-state` optionally include regime probabilities if available |

---

## What is NOT in scope

- No new data sources
- No model retraining
- No new API endpoints (sandbox uses in-process model loading, threshold tuning uses cached metadata)
- No Streamlit tests (existing decision)
- No changes to the ML pipeline
- No trading language anywhere
