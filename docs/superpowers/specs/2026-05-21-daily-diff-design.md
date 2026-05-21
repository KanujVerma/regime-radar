# RegimeRadar — Sub-project A: Daily Diff System

_Date: 2026-05-21. Part of the Phase 2 return-loop roadmap. Sub-project B (RSS/Atom + daily state card) and Sub-project C (email alerts) follow after this ships._

---

## Goal

Give returning users a true "what changed since the last trading day" signal on the Current State page — backed by a committed artifact rather than an in-memory or ephemeral database row. The artifact is rich enough to serve all future downstream consumers (RSS, shareable card, changelog) without those consumers needing to remap or recompute anything.

---

## 1. Daily State Artifact

### Location

`data/daily_state/YYYY-MM-DD.json` — one file per nightly cron run, committed to git alongside `data/snapshots/`.

### Schema

```json
{
  "as_of_date": "2026-05-21",
  "generated_at": "2026-05-21T22:14:03Z",
  "data_through_date": "2026-05-21",
  "regime": "elevated",
  "transition_risk": 0.81,
  "prob_calm": 0.01,
  "prob_elevated": 0.99,
  "prob_turbulent": 0.0002,
  "vix_level": 18.4,
  "trend": "uptrend",
  "top_drivers": [
    {"feature": "vix_30d_chg", "plain_label": "VIX 30-day change", "importance": 0.042},
    {"feature": "emv_3m_chg", "plain_label": "EMV 3-month change", "importance": 0.031}
  ],
  "model_version": {
    "transition_model": "xgb_transition",
    "transition_trained_as_of": "2026-04-24",
    "regime_model": "xgb_regime",
    "regime_trained_as_of": "2026-04-24"
  }
}
```

**Field notes:**
- `data_through_date`: the last row date in the panel parquet — immediately visible if the data feed was stale when the artifact was written.
- `top_drivers`: risk-raising (positive SHAP) contributors only — the same semantics as `/current-state top_drivers`. Each entry includes `plain_label` so downstream consumers (RSS, card, changelog) never need to remap raw feature keys. The risk-raising-only constraint is documented here in the spec, not repeated as a runtime field in every artifact.
- `model_version`: both models named separately so that if they ever diverge in training date, the artifact stays self-describing.

### New script: `scripts/save_daily_state.py`

Runs after the data fetch step in the nightly cron. Loads the already-fetched processed parquets from disk and calls `predict_current_state()` — no new inference logic, reuses the existing inference path and model artifacts. Writes the JSON to `data/daily_state/YYYY-MM-DD.json` where YYYY-MM-DD is today's UTC date.

No date-override argument. The date is always derived from the data, not passed in. This prevents synthetic relabeling (writing today's inference to a file named yesterday).

### New script: `scripts/bootstrap_daily_states.py`

A one-time utility that generates genuinely historical daily state artifacts by checking out the panel parquet from each recent snapshot commit in git and running inference on that historical data. The data determines the date — the output filename matches the parquet's last row date, not a CLI argument.

```bash
# Usage: generate artifacts for the N most recent snapshot commits
python scripts/bootstrap_daily_states.py --count 5
git add data/daily_state/ && git commit -m "chore: seed initial daily state artifacts"
```

**How it works:**
1. Finds commits matching `chore: update snapshots to YYYY-MM-DD` in git log.
2. For each commit, checks out `data/snapshots/panel.parquet` into a temp directory using `git show <hash>:data/snapshots/panel.parquet`.
3. Calls `predict_current_state()` with that temp parquet as input, producing a genuine historical inference for that date's data.
4. Writes `data/daily_state/YYYY-MM-DD.json` where YYYY-MM-DD comes from the panel's last row date — never from a CLI argument.

Two initial artifacts bootstrapped this way give `/daily-diff` a working, honest diff from day one.

### Cron change: `update-snapshots.yml`

New step after `Refresh snapshots`:

```yaml
- name: Save daily state artifact
  env:
    FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
  run: python scripts/save_daily_state.py

- name: Commit updated snapshots and daily state
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add data/snapshots/ data/daily_state/
    git diff --staged --quiet || git commit -m "chore: update snapshots to $(date -u +%Y-%m-%d)"
    git push
```

---

## 2. Diff Computation and API

### Lookup logic

`GET /daily-diff` scans `data/daily_state/` for all `*.json` files, sorts by filename (ISO dates sort lexicographically), and takes the two most recent. This is artifact-driven: the artifact set is the source of truth. Weekends and holidays are handled naturally because the cron only writes on trading days; missed cron runs produce a larger `gap_days` value rather than a lookup error.

### Response schema

```json
{
  "current": { ...DailyStateSnapshot... },
  "previous": { ...DailyStateSnapshot... },
  "diff": {
    "regime_changed": false,
    "prior_regime": null,
    "risk_delta": -0.03,
    "vix_delta": -1.2,
    "trend_changed": false,
    "prior_trend": null,
    "top_driver_changed": true,
    "prior_top_driver":   {"feature": "emv_3m_chg", "plain_label": "EMV 3-month change"},
    "current_top_driver": {"feature": "vix_30d_chg", "plain_label": "VIX 30-day change"}
  },
  "metadata": {
    "current_date": "2026-05-21",
    "previous_date": "2026-05-20",
    "gap_days": 1,
    "is_stale": false
  }
}
```

**`gap_days`**: calendar-date difference between `current_date` and `previous_date`.

**`is_stale`**: `gap_days > 5` — a week without a cron run is anomalous.

**Error case**: fewer than 2 artifacts → `404` with `{"detail": "not enough daily snapshots to compute diff"}`. The frontend silently hides the block on 404.

### Endpoint properties

- Reads committed JSON files only — no SQLite, no model load, cold-start safe.
- Module-level cache (same pattern as `/reliability`) so repeated requests don't re-scan the directory.
- Cache is invalidated on restart, which is acceptable since new artifacts only arrive once per day via the cron.

### Schemas in `src/api/schemas.py`

New types: `DailyStateSnapshot`, `DailyDriverEntry`, `DailyDiff`, `DailyDiffMetadata`, `DailyDiffResponse`.

---

## 3. Frontend — "Since yesterday" Block

### Placement

Between the transition-risk row and the horizontal divider on `CurrentState.tsx`. Visually distinct from the existing "Since last refresh" section, which remains inside the "What this means right now" panel where it currently lives, rendered at a smaller/secondary weight.

### Label logic

Never implies it was literally yesterday unless it was:

| `gap_days` | Label |
|---|---|
| 1 | "Since last trading day (Wed May 20)" |
| > 1 | "Compared with snapshot as of May 15" |
| `is_stale` | + muted warning: "Snapshot is unusually old — comparison may not reflect recent conditions" |

### Row display and suppression thresholds

Rows are only shown when a change is meaningful:

| Signal | Shown when |
|---|---|
| Regime change | `regime_changed === true` |
| Risk delta | `Math.abs(risk_delta) >= 0.01` |
| VIX delta | `Math.abs(vix_delta) >= 0.5` |
| Top driver change | `top_driver_changed === true` |

If no rows pass their threshold: "No notable market-state change since the last snapshot."

### Row copy

- Regime: "Regime shifted from Calm → Elevated"
- Risk: "Transition risk +4pp" / "Transition risk –3pp"
- VIX: "VIX +1.2" / "VIX –0.8"
- Top driver: "Top risk driver: EMV 3-month change → VIX 30-day change"

### New files

| File | Purpose |
|---|---|
| `frontend/src/types/api.ts` | `DailyStateSnapshot`, `DailyDiff`, `DailyDiffResponse` interfaces |
| `frontend/src/api/client.ts` | `dailyDiff()` call |
| `frontend/src/hooks/useDailyDiff.ts` | hook (same pattern as `useReliability`) |
| `frontend/src/pages/CurrentState.tsx` | `DailyDiffBlock` inline component + placement |

---

## 4. Files Touched

**Backend:**
- `scripts/save_daily_state.py` — new (cron artifact writer)
- `scripts/bootstrap_daily_states.py` — new (one-time historical seed utility)
- `.github/workflows/update-snapshots.yml` — add artifact step + commit path
- `src/api/schemas.py` — new daily diff types
- `src/api/routes.py` — `GET /daily-diff` endpoint
- `data/daily_state/` — new committed directory (two bootstrap artifacts)

**Frontend:**
- `frontend/src/types/api.ts`
- `frontend/src/api/client.ts`
- `frontend/src/hooks/useDailyDiff.ts` — new
- `frontend/src/pages/CurrentState.tsx`

---

## 5. Verification

1. **Bootstrap:**
   ```bash
   python scripts/bootstrap_daily_states.py --count 2
   ```
   Produces two genuinely historical artifacts (e.g. `2026-05-20.json`, `2026-05-21.json`). Verify that `data_through_date` in each file matches the panel parquet's last row date for that commit — not today's date. This confirms no synthetic relabeling occurred.

2. **Endpoint — normal case:** `GET /daily-diff` returns correct `current`, `previous`, `diff`, and `metadata` for the two seeded artifacts. Confirm `gap_days = 1`, `is_stale = false`.

3. **Endpoint — 404 case:** delete all but one artifact (or test with a fixture that provides one file), confirm endpoint returns 404.

4. **Endpoint — stale case:** seed two artifacts 6 calendar days apart, confirm `is_stale = true`.

5. **Frontend — block renders:** diff block shows correct label "Since last trading day (Wed May 20)"; rows render correctly.

6. **Frontend — 404 hidden:** mock the hook to return null/404, confirm block does not render.

7. **Frontend — row suppression:** with `risk_delta = 0.005` (below 0.01 threshold) and `vix_delta = 0.3` (below 0.5 threshold), confirm those rows are hidden and "No notable market-state change" copy appears.

8. **Frontend — staleness note:** with `is_stale = true`, confirm the muted staleness warning appears.

9. **pytest green** — new smoke tests for `/daily-diff` (normal, 404, stale).

10. **`npm run build` clean.**

---

## Out of Scope

- Sub-project B: RSS/Atom feed + daily shareable state card (next spec after this ships)
- Sub-project C: email alerts
- Historical diff API (diff any two arbitrary dates)
- Monthly retrain / drift gate
