# Dashboard Polish & Interactivity — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the RegimeRadar Streamlit dashboard across 5 existing pages and add a new Scenario Explorer page, improving readability, storytelling, and interactivity without touching the ML pipeline or data sources.

**Architecture:** All changes are confined to `src/dashboard/` and a small set of supporting files (`src/api/state.py`, `src/api/schemas.py`, `src/api/routes.py`). No new API endpoints — one schema extension to `/current-state` (regime probability fields). No model retraining. The new Scenario Explorer page loads the trained XGBoost model in-process for sandbox scoring.

**Tech Stack:** Streamlit, Plotly, XGBoost (joblib artifacts), FastAPI/pydantic, SQLite, Python 3.11.

**Spec:** `docs/superpowers/specs/2026-04-23-dashboard-polish-design.md`

---

## Chunk 1: Shared Foundation

**Files modified in this chunk:**
- `src/dashboard/components.py` — add `DEFAULT_THRESHOLD`, rename mode badge labels, use hex for live badge color
- `src/api/state.py` — add `read_prior_state()` to `AppState`; add `prob_calm/elevated/turbulent` columns to DB + write/read
- `src/api/schemas.py` — add optional probability fields to `CurrentStateResponse`
- `src/api/routes.py` — pass probability fields through in `/current-state` response

---

### Task 1: Add `DEFAULT_THRESHOLD` and rename mode badge in `components.py`

**Files:**
- Modify: `src/dashboard/components.py`

No unit test (Streamlit rendering). Verify by visual inspection after Task 2 when current_state page is updated.

- [ ] **Step 1: Open `src/dashboard/components.py` and read current content**

  Current `_MODE_CONFIG`:
  ```python
  _MODE_CONFIG = {
      "live": {"label": "LIVE", "color": "green"},
      "demo": {"label": "DEMO", "color": "#F9A825"},
  }
  ```

- [ ] **Step 2: Add `DEFAULT_THRESHOLD` constant and update `_MODE_CONFIG`**

  Insert after the imports (before `REGIME_COLORS`):
  ```python
  DEFAULT_THRESHOLD: float = 0.10
  ```

  Update `_MODE_CONFIG`:
  ```python
  _MODE_CONFIG = {
      "live": {"label": "NEAR-LIVE DATA", "color": "#2E7D32"},
      "demo": {"label": "DEMO MODE", "color": "#F9A825"},
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/dashboard/components.py
  git commit -m "feat: add DEFAULT_THRESHOLD and rename mode badge labels"
  ```

---

### Task 2: Add `read_prior_state()` to `AppState` in `state.py`

**Files:**
- Modify: `src/api/state.py`
- Test: `tests/test_api_smoke.py` (add one assertion)

- [ ] **Step 1: Write the failing test**

  In `tests/test_api_smoke.py`, add after existing tests:
  ```python
  def test_read_prior_state_returns_none_on_empty_db(tmp_path):
      from src.api.state import AppState
      state = AppState(db_path=str(tmp_path / "test.db"))
      assert state.read_prior_state() is None

  def test_read_prior_state_returns_second_row(tmp_path):
      from src.api.state import AppState
      state = AppState(db_path=str(tmp_path / "test.db"))
      state.write_state({"regime": "calm", "transition_risk": 0.05, "trend": "uptrend",
                         "vix_level": 15.0, "vix_chg_1d": 0.1, "top_drivers": [],
                         "mode": "demo", "price_card_price": None, "as_of_ts": "2024-01-01"})
      state.write_state({"regime": "elevated", "transition_risk": 0.25, "trend": "neutral",
                         "vix_level": 22.0, "vix_chg_1d": 0.5, "top_drivers": [],
                         "mode": "demo", "price_card_price": None, "as_of_ts": "2024-01-02"})
      prior = state.read_prior_state()
      assert prior is not None
      assert prior["regime"] == "calm"
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd /Users/kanuj/regime-radar
  pytest tests/test_api_smoke.py::test_read_prior_state_returns_none_on_empty_db tests/test_api_smoke.py::test_read_prior_state_returns_second_row -v
  ```
  Expected: FAIL — `AppState` has no `read_prior_state` attribute.

- [ ] **Step 3: Implement `read_prior_state()` in `AppState`**

  In `src/api/state.py`, add after `read_latest_state()` (around line 90):
  ```python
  def read_prior_state(self) -> dict | None:
      """Return the second-most-recent state row, or None if fewer than 2 rows exist."""
      with self._connect() as conn:
          conn.row_factory = sqlite3.Row  # required — without this fetchall() returns tuples
          cur = conn.execute(
              "SELECT * FROM live_state ORDER BY ts DESC LIMIT 2"
          )
          rows = cur.fetchall()
      if len(rows) < 2:
          return None
      row = dict(rows[1])
      if row.get("top_drivers"):
          import json
          row["top_drivers"] = json.loads(row["top_drivers"])
      return row
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  pytest tests/test_api_smoke.py::test_read_prior_state_returns_none_on_empty_db tests/test_api_smoke.py::test_read_prior_state_returns_second_row -v
  ```
  Expected: PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

  ```bash
  pytest -q
  ```
  Expected: all green.

- [ ] **Step 6: Commit**

  ```bash
  git add src/api/state.py tests/test_api_smoke.py
  git commit -m "feat: add read_prior_state to AppState"
  ```

---

### Task 3: Add regime probability fields to DB, schema, and API response

**Files:**
- Modify: `src/api/state.py` — add columns to `_init_db`, `write_state`, `read_latest_state`
- Modify: `src/api/schemas.py` — add optional fields to `CurrentStateResponse`
- Modify: `src/api/routes.py` — pass probability fields in `/current-state` response

This is additive only — existing rows without these columns will return `None`, which is the correct fallback behavior.

- [ ] **Step 1: Add columns to `_init_db()` in `state.py`**

  In `_init_db()`, add three columns to the `CREATE TABLE IF NOT EXISTS live_state` statement:
  ```sql
  prob_calm REAL,
  prob_elevated REAL,
  prob_turbulent REAL,
  ```
  Place them after `price_card_price REAL`.

  Note: `CREATE TABLE IF NOT EXISTS` means the columns won't be added to an existing DB automatically. Add an `ALTER TABLE` migration:
  ```python
  for col in ("prob_calm", "prob_elevated", "prob_turbulent"):
      try:
          conn.execute(f"ALTER TABLE live_state ADD COLUMN {col} REAL")
      except Exception:
          pass  # column already exists
  ```
  Place this after the `CREATE TABLE` statement in `_init_db()`.

- [ ] **Step 2: Pass probability fields in `write_state()`**

  `write_state()` uses a parameterized INSERT. Update the INSERT statement to include the three new columns. The `state_dict` passed in may or may not have these keys — use `.get("prob_calm")` etc. with `None` default.

  Updated INSERT (add to existing column list):
  ```python
  conn.execute(
      """INSERT INTO live_state
         (as_of_ts, regime, transition_risk, trend, vix_level, vix_chg_1d,
          top_drivers, mode, price_card_price, prob_calm, prob_elevated, prob_turbulent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
      (
          s.get("as_of_ts"), s.get("regime"), s.get("transition_risk"),
          s.get("trend"), s.get("vix_level"), s.get("vix_chg_1d"),
          json.dumps(s.get("top_drivers") or []), s.get("mode"),
          s.get("price_card_price"),
          s.get("prob_calm"), s.get("prob_elevated"), s.get("prob_turbulent"),
      ),
  )
  ```

- [ ] **Step 3: Read probability fields in `read_latest_state()`**

  `read_latest_state()` uses `SELECT *` so the new columns appear automatically once they exist. No change needed to the SELECT — the returned dict will have the keys `prob_calm`, `prob_elevated`, `prob_turbulent` (possibly `None` if the column was just migrated).

- [ ] **Step 4: Add optional fields to `CurrentStateResponse` in `schemas.py`**

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
  ```

- [ ] **Step 5: Pass probability fields in `routes.py` `/current-state` endpoint**

  In the `return CurrentStateResponse(...)` call, add:
  ```python
  prob_calm=latest.get("prob_calm"),
  prob_elevated=latest.get("prob_elevated"),
  prob_turbulent=latest.get("prob_turbulent"),
  ```

- [ ] **Step 6: Verify API smoke test still passes**

  ```bash
  pytest tests/test_api_smoke.py -v
  ```
  Expected: all pass (new optional fields default to `None` so existing fixture data works).

- [ ] **Step 7: Commit**

  ```bash
  git add src/api/state.py src/api/schemas.py src/api/routes.py
  git commit -m "feat: add regime probability fields to DB, schema, and API"
  ```

---

## Chunk 2: Current State Page Redesign

**Files modified in this chunk:**
- `src/dashboard/pages/current_state.py` — full Two-Column Split redesign

No Streamlit unit tests (project decision). Smoke test: `streamlit run src/dashboard/app.py` and navigate to Current State.

---

### Task 4: Redesign Current State page — Two-Column Split

**Files:**
- Modify: `src/dashboard/pages/current_state.py`

- [ ] **Step 1: Read the current file**

  Read `src/dashboard/pages/current_state.py` in full before editing.

- [ ] **Step 2: Add narrative generator function**

  Add after the existing helper functions (before `_load_health`):
  ```python
  def _build_narrative(regime: str, risk: float, trend: str, vix: float | None, vix_chg: float | None) -> str:
      risk_level = (
          "very low" if risk < 0.05
          else "low" if risk < 0.20
          else "moderate" if risk < 0.40
          else "elevated"
      )
      trend_sentence = {
          "uptrend": "The trend is positive.",
          "downtrend": "The trend is negative.",
      }.get(trend, "The trend is neutral.")
      if vix is None:
          vix_str = ""
      else:
          chg = vix_chg or 0.0
          direction = "rising" if chg > 0.5 else "falling" if chg < -0.5 else "stable"
          vix_str = f" VIX is at {vix:.1f} and {direction}."
      return (
          f"SPY is in a {regime} regime with {risk_level} transition risk ({risk:.1%})."
          f" {trend_sentence}{vix_str}"
      )
  ```

- [ ] **Step 3: Add regime probability chips function**

  ```python
  def _regime_prob_chips(prob_calm: float | None, prob_elevated: float | None, prob_turbulent: float | None) -> None:
      """Render three inline chips showing regime class probabilities. Hidden if any value is None."""
      if any(v is None for v in (prob_calm, prob_elevated, prob_turbulent)):
          return
      cols = st.columns(3)
      labels = [("Calm", prob_calm, "#2E7D32"), ("Elevated", prob_elevated, "#F9A825"), ("Turbulent", prob_turbulent, "#C62828")]
      for col, (label, prob, color) in zip(cols, labels):
          col.markdown(
              f'<span style="background:{color}22;color:{color};border:1px solid {color}66;'
              f'border-radius:12px;padding:2px 10px;font-size:0.82rem;font-weight:600;">'
              f'{label} {prob:.0%}</span>',
              unsafe_allow_html=True,
          )
  ```

- [ ] **Step 4: Add delta panel function**

  ```python
  def _delta_panel(current: dict, prior: dict | None) -> None:
      """Render compact 3-metric delta row. Skipped if prior is None."""
      if prior is None:
          return
      risk_now = current.get("transition_risk") or 0.0
      risk_prev = prior.get("transition_risk") or 0.0
      delta_risk = risk_now - risk_prev
      regime_now = current.get("regime", "")
      regime_prev = prior.get("regime", "")
      regime_change = f"{regime_prev} → {regime_now}" if regime_now != regime_prev else "No change"
      c1, c2, c3 = st.columns(3)
      c1.metric("Risk Δ since last refresh", f"{risk_now:.1%}", f"{delta_risk:+.1%}")
      c2.metric("Regime", regime_now, regime_change if regime_now != regime_prev else None)
      c3.metric("Mode", current.get("mode", "demo").upper())
  ```

- [ ] **Step 5: Rewrite `render()` with Two-Column Split layout**

  Replace the existing `render()` function body with:
  ```python
  def render() -> None:
      st.title("Current Market State")

      health = _load_health()
      state = _load_current_state()
      if state is None:
          st.error("No state data available. Run a data refresh first.")
          return

      # --- import shared components ---
      from src.dashboard.components import (
          DEFAULT_THRESHOLD, REGIME_COLORS, mode_badge, regime_pill, apply_regime_colormap
      )
      from src.dashboard.api_client import get_client as _get_client

      # --- prior state for delta panel ---
      prior: dict | None = None
      try:
          client = _get_client()
          if hasattr(client, "_state"):
              prior = client._state.read_prior_state()
      except Exception:
          pass

      left, right = st.columns([1, 1])

      with left:
          regime_pill(state.get("regime", "unknown"))
          _trend_chip(state.get("trend", "neutral"))
          st.write("")
          narrative = _build_narrative(
              state.get("regime", "unknown"),
              state.get("transition_risk") or 0.0,
              state.get("trend", "neutral"),
              state.get("vix_level"),
              state.get("vix_chg_1d"),
          )
          st.markdown(narrative)
          st.write("")
          _regime_prob_chips(
              state.get("prob_calm"),
              state.get("prob_elevated"),
              state.get("prob_turbulent"),
          )
          st.write("")
          _delta_panel(state, prior)

      with right:
          _make_gauge(state.get("transition_risk") or 0.0)
          _vix_sparkline(state.get("vix_level"), state.get("vix_chg_1d"))
          st.write("")
          mode = state.get("mode", "demo")
          mode_badge(mode)
          as_of = state.get("as_of_ts", "")
          if as_of:
              st.caption(f"Last refresh: {as_of}")
          st.write("")
          st.caption(
              f"At the default threshold ({DEFAULT_THRESHOLD:.2f}): "
              "alerts on ~34% of days, detecting 54% of transitions."
          )

      st.divider()
      st.subheader("Feature Drivers")
      drivers = state.get("top_drivers") or []
      if drivers:
          _drivers_bar(drivers)
      else:
          st.info("Detailed driver explanations are unavailable for this refresh.")
  ```

- [ ] **Step 6: Smoke test**

  Start the dashboard: `streamlit run src/dashboard/app.py`
  - Navigate to Current State
  - Confirm two-column layout renders
  - Confirm narrative text appears in left column
  - Confirm gauge + VIX + mode badge appear in right column
  - Confirm "Detailed driver explanations are unavailable for this refresh." shows when no driver data

- [ ] **Step 7: Commit**

  ```bash
  git add src/dashboard/pages/current_state.py
  git commit -m "feat: redesign Current State page with Two-Column Split layout"
  ```

---

## Chunk 3: History Page Chart Polish

**Files modified in this chunk:**
- `src/dashboard/pages/history.py`

---

### Task 5: Polish History page charts

**Files:**
- Modify: `src/dashboard/pages/history.py`

- [ ] **Step 1: Read the current file**

  Read `src/dashboard/pages/history.py` in full before editing.

- [ ] **Step 2: Update SPY line style in `_build_price_chart()`**

  Find the SPY close trace (currently has `line=dict(color="#1565C0", width=1.5)`). Update:
  ```python
  line=dict(color="#42A5F5", width=2.0)
  ```

- [ ] **Step 3: Reduce regime band opacity in `apply_regime_colormap()`**

  `apply_regime_colormap()` in `src/dashboard/components.py` has the opacity value hardcoded inside the function body as a literal `0.12` in the `shapes` dict (not a parameter). Update that literal directly:
  ```python
  # Find the line that reads: "opacity": 0.12
  # Change it to:
  "opacity": 0.08,
  ```
  Do not add an `opacity` parameter to the function signature — the literal is the correct place to change this.

- [ ] **Step 4: Thin the VIX overlay line**

  In `_build_price_chart()`, find the VIX trace (currently `line=dict(color=..., width=1.2)`). Update:
  ```python
  line=dict(width=1.0)
  ```

- [ ] **Step 5: Update threshold annotations in `_build_risk_chart()`**

  **Dependency:** Task 1 must be complete before this step — `DEFAULT_THRESHOLD` is added to `components.py` in Task 1.

  Current code has lines at 0.3 and 0.6. Replace entirely:
  ```python
  from src.dashboard.components import DEFAULT_THRESHOLD

  # Remove old 0.3 and 0.6 lines, replace with:
  threshold_lines = [
      (DEFAULT_THRESHOLD, f"Watch (default threshold)"),
      (0.30, "Alert (high sensitivity)"),
  ]
  for level, label in threshold_lines:
      fig.add_hline(
          y=level,
          line_dash="dash",
          line_color="#F9A825",
          line_width=1,
          annotation_text=label,
          annotation_position="top right",
          annotation_font_size=10,
      )
  ```
  Remove any existing `add_hline` calls for 0.3 and 0.6.

- [ ] **Step 6: Add spacer between charts in `render()`**

  In the `render()` function, between the two `st.plotly_chart(...)` calls, add:
  ```python
  st.write("")
  ```

- [ ] **Step 7: Smoke test**

  - Navigate to History page
  - Confirm SPY line is brighter blue
  - Confirm regime bands are more subtle (SPY line visually dominant)
  - Confirm risk chart shows "Watch (default threshold)" at 0.10 and "Alert (high sensitivity)" at 0.30
  - Confirm no line at 0.60

- [ ] **Step 8: Commit**

  ```bash
  git add src/dashboard/pages/history.py src/dashboard/components.py
  git commit -m "feat: polish History page charts — SPY line, band opacity, threshold labels"
  ```

---

## Chunk 4: Event Replay Summary Cards & Chart Improvements

**Files modified in this chunk:**
- `src/dashboard/pages/event_replay.py`

---

### Task 6: Add summary cards and chart improvements to Event Replay

**Files:**
- Modify: `src/dashboard/pages/event_replay.py`

- [ ] **Step 1: Read the current file**

  Read `src/dashboard/pages/event_replay.py` in full before editing.

- [ ] **Step 2: Add event context data at the top of the module**

  After `EVENT_OPTIONS`, add:
  ```python
  EVENT_DESCRIPTIONS = {
      "financial_crisis_2008": "The 2008 financial crisis saw SPY fall more than 50% from peak as credit markets seized.",
      "covid_2020": "The COVID-19 market crash in early 2020 was one of the fastest equity declines on record.",
      "tightening_2022": "The 2022 rate-tightening cycle saw aggressive Fed hikes as inflation reached 40-year highs.",
  }

  _METHODOLOGY_NOTE = (
      "Replay metrics are computed from out-of-fold predictions — each day in this window "
      "was scored by a model that did not train on that day."
  )

  _REGIME_NUM_TO_LABEL = {0.1: "Calm", 0.5: "Elevated", 0.9: "Turbulent"}
  ```

- [ ] **Step 3: Add summary card builder function**

  ```python
  import math
  from src.dashboard.components import DEFAULT_THRESHOLD

  def _summary_card(warning_lead_days: float | None, data: list[dict]) -> None:
      """Render hero stats row + supporting stats row above the chart."""
      risk_values = [p["transition_risk"] for p in data if p.get("transition_risk") is not None]
      peak_risk = max(risk_values) if risk_values else 0.0

      # Hero stats
      h1, h2 = st.columns(2)
      with h1:
          if warning_lead_days is not None and not math.isnan(warning_lead_days) and warning_lead_days > 0:
              st.metric("Warning Lead Time", f"{int(warning_lead_days)} trading days early")
          else:
              st.metric("Warning Lead Time", "No early warning detected")
      with h2:
          st.metric("Peak Transition Risk", f"{peak_risk:.0%}")

      # Supporting stats
      alert_days = sum(1 for p in data if (p.get("transition_risk") or 0) > DEFAULT_THRESHOLD)
      first_cross_dates = [
          p["date"] for p in data
          if (p.get("transition_risk") or 0) > DEFAULT_THRESHOLD
      ]
      first_cross = first_cross_dates[0] if first_cross_dates else "—"

      valid_pairs = [
          p for p in data
          if p.get("regime_actual") not in (None, "unknown")
          and p.get("regime_predicted") not in (None, "unknown")
      ]
      match_rate = (
          sum(1 for p in valid_pairs if p["regime_actual"] == p["regime_predicted"]) / len(valid_pairs)
          if valid_pairs else 0.0
      )

      high_stress_days = sum(
          1 for p in data if p.get("regime_actual") in ("elevated", "turbulent")
      )

      s1, s2, s3, s4 = st.columns(4)
      s1.metric("Alert Days", alert_days)
      s2.metric("First Alert", first_cross)
      s3.metric("Regime Match Rate", f"{match_rate:.0%}")
      s4.metric("High-Stress Days", high_stress_days)
  ```

- [ ] **Step 4: Update `_build_event_chart()` — add `customdata` regime labels and threshold crossing line**

  In the chart function, find the actual and predicted regime traces. For each scatter trace that plots numeric regime values (0.1/0.5/0.9), add:
  ```python
  customdata=[_REGIME_NUM_TO_LABEL.get(v, "Unknown") for v in y_values],
  hovertemplate="%{x}<br>%{customdata}<extra></extra>",
  ```

  After building the figure, add vertical line at first threshold crossing:
  ```python
  cross_dates = [
      p["date"] for p in data
      if (p.get("transition_risk") or 0) > DEFAULT_THRESHOLD
  ]
  if cross_dates:
      fig.add_vline(
          x=cross_dates[0],
          line_dash="dash",
          line_color="#F9A825",
          line_width=1,
          row=2, col=1,
      )
  ```

- [ ] **Step 5: Update `render()` to show summary card and event context**

  In the `render()` function, after loading event data and before showing the chart:
  ```python
  event_key = EVENT_OPTIONS[selected_event]
  result = _load_event(event_key)
  data = result.get("data", [])
  warning_lead = result.get("warning_lead_days")

  # Event description
  desc = EVENT_DESCRIPTIONS.get(event_key, "")
  if desc:
      st.markdown(desc)
  st.caption(_METHODOLOGY_NOTE)
  st.write("")

  # Summary card
  _summary_card(warning_lead, data)
  st.write("")

  # Chart — pass the data list (not result dict) to match existing function signature
  fig = _build_event_chart(data)
  st.plotly_chart(fig, use_container_width=True)
  ```

  Remove the old single-line warning callout that was previously the only output above the chart.

- [ ] **Step 6: Smoke test**

  - Navigate to Event Replay
  - Select each of the three windows
  - Confirm event description sentence shows above the methodology caption
  - Confirm hero stats row (Warning Lead Time + Peak Risk) renders
  - Confirm four supporting metrics render
  - Confirm regime hover labels show "Elevated" not "0.5"
  - Confirm vertical dashed line at first threshold crossing (if any)

- [ ] **Step 7: Commit**

  ```bash
  git add src/dashboard/pages/event_replay.py
  git commit -m "feat: add Event Replay summary cards, context descriptions, and chart improvements"
  ```

---

## Chunk 5: Model Drivers Plain-English Narrative

**Files modified in this chunk:**
- `src/dashboard/pages/model_drivers.py`

---

### Task 7: Add plain-English narrative to Model Drivers page

**Files:**
- Modify: `src/dashboard/pages/model_drivers.py`

- [ ] **Step 1: Read the current file**

  Read `src/dashboard/pages/model_drivers.py` in full before editing.

- [ ] **Step 2: Add `FEATURE_LABELS` dict at module level**

  After imports, add:
  ```python
  FEATURE_LABELS: dict[str, str] = {
      "vix_pct_504d": "VIX relative to 2-year history",
      "vix_level": "Current VIX level",
      "vix_zscore_252d": "VIX z-score (1-year)",
      "vix_chg_5d": "VIX 5-day change",
      "rv_20d_pct": "Realized volatility percentile",
      "drawdown_pct_504d": "Drawdown relative to 2-year history",
      "ret_20d": "20-day SPY return",
      "momentum_20d": "20-day momentum",
      "dist_sma50": "Distance from 50-day moving average",
      "emv_level": "Equity market volatility index",
      "days_in_regime_lag1": "Days in current regime (lagged)",
      "turbulent_count_30d_lag1": "Turbulent days in past 30 days (lagged)",
      "trend_code": "Trend direction",
  }

  def _label(feature: str) -> str:
      return FEATURE_LABELS.get(feature, feature)
  ```

- [ ] **Step 3: Add narrative builder function**

  ```python
  def _shap_narrative(local_explanation: dict[str, float], global_importance: list[dict]) -> None:
      """Render plain-English explanation block between global and local charts."""
      if local_explanation:
          # Sort by absolute SHAP value descending
          sorted_shap = sorted(local_explanation.items(), key=lambda x: abs(x[1]), reverse=True)
          # De-duplicate: if both momentum_20d and ret_20d appear in same direction, keep momentum_20d only
          seen_ret = False
          deduped = []
          for feat, val in sorted_shap:
              if feat == "ret_20d" and any(f == "momentum_20d" for f, _ in sorted_shap):
                  continue  # skip ret_20d when momentum_20d is present
              deduped.append((feat, val))

          upward = [(f, v) for f, v in deduped if v > 0]
          downward = [(f, v) for f, v in deduped if v < 0]

          lines = []
          if upward:
              lines.append("**What pushed risk higher:**")
              for i, (feat, val) in enumerate(upward[:2]):
                  qualifier = "contributed most strongly upward" if i == 0 else "also added upward pressure"
                  lines.append(f"- {_label(feat)} {qualifier} (SHAP: {val:+.3f})")
          if downward:
              lines.append("\n**What held risk down:**")
              lines.append(f"- {_label(downward[0][0])} was the strongest downward contributor")

          if lines:
              st.markdown("\n".join(lines))

      elif global_importance:
          top = global_importance[0]
          st.info(
              f"Overall, {_label(top['feature'])} has the largest influence on this model's "
              "transition risk estimates across all historical predictions."
          )
  ```

- [ ] **Step 4: Insert narrative call in `render()` between global and local charts**

  In `render()`, find where global importance chart is displayed and where local explanation chart is displayed. Add between them:
  ```python
  st.write("")
  _shap_narrative(local_explanation, global_importance)
  st.write("")
  ```

  Also remove the existing single `st.info(...)` line that shows just the top driver name (the old narrative placeholder).

- [ ] **Step 5: Smoke test**

  - Navigate to Model Drivers
  - Confirm narrative block appears between global and local charts
  - Confirm human-readable feature names appear (not raw column names)
  - Confirm "What pushed risk higher" / "What held risk down" sections appear when SHAP data is available

- [ ] **Step 6: Commit**

  ```bash
  git add src/dashboard/pages/model_drivers.py
  git commit -m "feat: add plain-English SHAP narrative to Model Drivers page"
  ```

---

## Chunk 6: Scenario Explorer — New 5th Page

**Files modified in this chunk:**
- Create: `src/dashboard/pages/scenario_explorer.py`
- Modify: `src/dashboard/app.py` — register 5th page

---

### Task 8: Create `scenario_explorer.py`

**Files:**
- Create: `src/dashboard/pages/scenario_explorer.py`

No Streamlit unit tests (project decision). Full smoke test below.

- [ ] **Step 1: Create the file with Part 1 (Scenario Sandbox)**

  Create `src/dashboard/pages/scenario_explorer.py`:
  ```python
  """Scenario Explorer — sandbox scoring and threshold tuning."""
  from __future__ import annotations

  import math
  from pathlib import Path

  import pandas as pd
  import streamlit as st

  from src.dashboard.components import DEFAULT_THRESHOLD
  from src.models.registry import load_artifact

  # ---------------------------------------------------------------------------
  # Feature label map (same as model_drivers.py — kept local to avoid coupling)
  # ---------------------------------------------------------------------------
  _LABELS: dict[str, str] = {
      "vix_level": "VIX level",
      "vix_chg_5d": "VIX 5-day change",
      "rv_20d_pct": "Realized-vol percentile",
      "drawdown_pct_504d": "Drawdown (2-year percentile)",
      "ret_20d": "20-day return",
      "dist_sma50": "Distance from SMA-50",
  }

  _SANDBOX_FEATURES = ["vix_level", "vix_chg_5d", "rv_20d_pct", "drawdown_pct_504d", "ret_20d", "dist_sma50"]

  _SLIDER_CONFIG: dict[str, tuple] = {
      # feature_key: (min, max, step, default)
      "vix_level":         (5.0,   80.0,  0.5,  20.0),
      "vix_chg_5d":        (-15.0, 15.0,  0.1,  0.0),
      "rv_20d_pct":        (0.0,   1.0,   0.01, 0.50),
      "drawdown_pct_504d": (0.0,   1.0,   0.01, 0.05),
      "ret_20d":           (-0.30, 0.30,  0.01, 0.02),
      "dist_sma50":        (-0.15, 0.15,  0.005, 0.01),
  }
  ```

- [ ] **Step 2: Add model and panel loading helpers**

  ```python
  @st.cache_resource
  def _load_transition_model():
      """Load xgb_transition model and metadata from registry."""
      from src.models.registry import load_artifact, load_metadata
      model = load_artifact("xgb_transition")
      meta = load_metadata("xgb_transition")
      return model, meta

  @st.cache_data(ttl=300)
  def _load_live_values() -> dict[str, float | None]:
      """Try to read live feature values from the latest panel row."""
      panel_path = Path("data/processed/panel.parquet")
      if not panel_path.exists():
          return {}
      try:
          df = pd.read_parquet(panel_path)
          if df.empty:
              return {}
          row = df.iloc[-1]
          return {k: float(row[k]) for k in _SANDBOX_FEATURES if k in row and not math.isnan(float(row[k]))}
      except Exception:
          return {}

  def _score(model, meta, feature_row: dict[str, float]) -> float:
      """Run model.predict_proba on a single feature row, returning P(transition)."""
      feature_names = meta.get("feature_names")
      if not feature_names:
          raise ValueError("Model metadata missing 'feature_names' — cannot construct feature vector.")
      X = pd.DataFrame([{f: feature_row.get(f, 0.0) for f in feature_names}])
      return float(model.predict_proba(X)[0, 1])
  ```

- [ ] **Step 3: Add Part 1 render function (Scenario Sandbox)**

  ```python
  def _render_sandbox(model, meta, live_vals: dict) -> None:
      st.subheader("Scenario Sandbox")
      st.caption(
          "Adjust individual model inputs to see how transition risk responds. "
          "All other inputs are held at their current values."
      )

      # Load baseline feature row from panel
      panel_path = Path("data/processed/panel.parquet")
      baseline_features: dict[str, float] = {}
      if panel_path.exists():
          try:
              df = pd.read_parquet(panel_path)
              if not df.empty:
                  row = df.iloc[-1]
                  feature_names = meta.get("feature_names", [])
                  baseline_features = {f: float(row[f]) for f in feature_names if f in row}
          except Exception:
              pass

      # Reset button
      if st.button("Reset to current market state"):
          if live_vals:
              for k, v in live_vals.items():
                  st.session_state[f"sandbox_{k}"] = v
          else:
              for k, (mn, mx, step, default) in _SLIDER_CONFIG.items():
                  st.session_state[f"sandbox_{k}"] = default
              st.caption("Showing default values — live data unavailable.")

      # Sliders
      sandbox_vals: dict[str, float] = {}
      for feat, (mn, mx, step, default) in _SLIDER_CONFIG.items():
          live_default = live_vals.get(feat, default)
          key = f"sandbox_{feat}"
          sandbox_vals[feat] = st.slider(
              _LABELS[feat],
              min_value=mn, max_value=mx, step=step,
              value=st.session_state.get(key, live_default),
              key=key,
          )

      # Score baseline vs adjusted
      adjusted_features = {**baseline_features, **sandbox_vals}
      baseline_risk = _score(model, meta, baseline_features) if baseline_features else _score(model, meta, sandbox_vals)
      adjusted_risk = _score(model, meta, adjusted_features)
      delta = adjusted_risk - baseline_risk

      c1, c2, c3 = st.columns(3)
      c1.metric("Baseline Risk", f"{baseline_risk:.1%}")
      c2.metric("Adjusted Risk", f"{adjusted_risk:.1%}")
      c3.metric("Delta", f"{delta:+.1%}", delta_color="inverse")

      # Narrative
      changed = [
          _LABELS[f] for f in _SANDBOX_FEATURES
          if abs(sandbox_vals.get(f, 0.0) - baseline_features.get(f, sandbox_vals.get(f, 0.0))) > 1e-6
      ]
      changed_str = ", ".join(changed) if changed else "these inputs"
      direction = "increases" if adjusted_risk > baseline_risk + 1e-4 else "decreases" if adjusted_risk < baseline_risk - 1e-4 else "does not change"
      st.markdown(f"Adjusting **{changed_str}** {direction} transition risk from {baseline_risk:.1%} to {adjusted_risk:.1%}.")

      st.info(
          "This is a scenario tool. Sliders adjust individual model inputs to illustrate "
          "model sensitivity — not a forecast of actual future market conditions."
      )
  ```

- [ ] **Step 4: Add Part 2 render function (Threshold Tuning)**

  ```python
  def _render_threshold_tuning(meta: dict) -> None:
      st.subheader("Threshold Tuning")
      st.caption(
          "Explore how the alert threshold trades off recall against false-alert frequency. "
          "Lower thresholds catch more transitions but generate more noise."
      )

      sweep = meta.get("threshold_sweep", [])
      if not sweep:
          st.warning("Threshold sweep data not available in model metadata.")
          return

      thresholds = [r["threshold"] for r in sweep]
      # Guard: select_slider raises StreamlitAPIException if value not in options
      default_threshold = DEFAULT_THRESHOLD if DEFAULT_THRESHOLD in thresholds else thresholds[0]
      threshold = st.select_slider(
          "Alert threshold", options=thresholds, value=default_threshold
      )

      row = next((r for r in sweep if abs(r["threshold"] - threshold) < 1e-9), None)
      if row is None:
          st.warning(f"No sweep data for threshold {threshold}.")
          return

      recall = row["recall"]
      far = row["false_alert_rate"]
      freq = row["alert_frequency"]
      lead = row["avg_lead_time_days"]

      m1, m2, m3, m4 = st.columns(4)
      m1.metric("Recall", f"{recall:.0%}")
      m2.metric("False Alert Rate", f"{far:.0%}")
      m3.metric("Alert Frequency", f"{freq:.0%}")
      m4.metric("Avg Lead Time", f"{int(lead)} days" if not math.isnan(lead) else "—")

      if not math.isnan(lead):
          st.markdown(
              f"At **{threshold:.2f}**: alerts on {freq:.0%} of trading days, "
              f"catching {recall:.0%} of actual transitions an average of {int(lead)} days before they occur."
          )
      else:
          st.markdown(
              f"At **{threshold:.2f}**: alerts on {freq:.0%} of trading days, "
              f"catching {recall:.0%} of actual transitions — no early warning detected at this threshold."
          )
  ```

- [ ] **Step 5: Add Part 3 methodology note and `render()` entry point**

  ```python
  def _render_methodology() -> None:
      with st.expander("How does RegimeRadar work?"):
          st.markdown("""
  - **Market regime** — SPY is classified as Calm, Elevated, or Turbulent using a composite stress score built from VIX percentile, realized volatility percentile, and drawdown.
  - **Transition risk** — the probability that the regime escalates within the next 5 trading days, estimated by an XGBoost model trained on 30+ years of daily data.
  - **Thresholds** — lower values are more sensitive (fewer missed transitions) but produce more frequent alerts. Use the tuning panel to find your preferred operating point.
  - **Near-live, not intraday** — the model refreshes daily using end-of-day data; it is not suitable for intraday timing decisions.
  - **HF Spaces** — demo-only (pre-built historical replay); NEAR-LIVE DATA mode requires running the full docker compose stack locally.
  """)


  def render() -> None:
      st.title("Scenario Explorer")

      try:
          model, meta = _load_transition_model()
      except Exception as exc:
          st.error(f"Could not load transition model: {exc}")
          return

      live_vals = _load_live_values()

      _render_sandbox(model, meta, live_vals)
      st.divider()
      _render_threshold_tuning(meta)
      st.divider()
      _render_methodology()
  ```

- [ ] **Step 6: Register 5th page in `app.py`**

  In `src/dashboard/app.py`, add import:
  ```python
  from src.dashboard.pages import scenario_explorer
  ```

  In `main()`, add to the navigation list:
  ```python
  st.Page(scenario_explorer.render, title="Scenario Explorer", icon="🧪", url_path="scenario-explorer"),
  ```

- [ ] **Step 7: Smoke test**

  - Navigate to Scenario Explorer
  - Confirm all 6 sliders render with correct ranges
  - Move a slider — confirm Adjusted Risk and Delta update
  - Click "Reset to current market state" — confirm sliders return to defaults
  - Confirm threshold tuning panel shows 4 metrics
  - Confirm methodology expander opens and shows 5 bullets

- [ ] **Step 8: Commit**

  ```bash
  git add src/dashboard/pages/scenario_explorer.py src/dashboard/app.py
  git commit -m "feat: add Scenario Explorer as 5th dashboard page"
  ```

---

## Final Verification

- [ ] **Run full test suite**

  ```bash
  pytest -q
  ```
  Expected: all green.

- [ ] **Full dashboard smoke test**

  Start the app: `streamlit run src/dashboard/app.py`

  Navigate to each page in order and verify:
  1. **Current State** — two-column layout, narrative, gauge, NEAR-LIVE DATA / DEMO MODE badge
  2. **History** — brighter SPY line, "Watch (default threshold)" at 0.10, "Alert (high sensitivity)" at 0.30, no 0.60 line
  3. **Event Replay** — event description + methodology caption, hero stats row, 4 supporting metrics, regime hover labels
  4. **Model Drivers** — narrative block between global and local charts with human-readable feature names
  5. **Scenario Explorer** — sliders, sandbox scoring, threshold tuning, methodology note

- [ ] **Positioning audit**

  ```bash
  grep -Ei "signal|buy|sell|alpha|beat the market|price prediction" src/dashboard/pages/ -r
  ```
  Expected: no hits.

- [ ] **Final commit (if any cleanup needed)**

  ```bash
  git add -p
  git commit -m "chore: dashboard polish final cleanup"
  ```
