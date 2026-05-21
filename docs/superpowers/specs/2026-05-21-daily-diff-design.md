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
  "top_drivers_note": "risk-raising only (positive SHAP contributors)",
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
- `top_drivers`: risk-raising (positive SHAP) contributors only, matching the semantics of `/current-state top_drivers`. `plain_label` is the human-readable name so downstream consumers never need to remap raw feature keys.
- `model_version`: both models named separately so that if they ever diverge in training date, the artifact stays self-describing.

### New script: `scripts/save_daily_state.py`

Runs after the data fetch step in the nightly cron. Loads the already-fetched processed parquets from disk and calls `predict_current_state()` — no new inference logic, reuses the existing inference path and model artifacts. Writes the JSON to `data/daily_state/YYYY-MM-DD.json`.

Accepts an optional `--date YYYY-MM-DD` argument for seeding historical artifacts and testing without waiting for the cron.

### Bootstrap

Two initial artifacts are seeded manually before the first deploy so `/daily-diff` is functional immediately:

```bash
python scripts/save_daily_state.py --date 2026-05-20
python scripts/save_daily_state.py --date 2026-05-21
git add data/daily_state/ && git commit -m "chore: seed initial daily state artifacts"
```

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
- `scripts/save_daily_state.py` — new
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

1. **Artifact generation:**
   ```bash
   python scripts/save_daily_state.py --date 2026-05-20
   python scripts/save_daily_state.py --date 2026-05-21
   ```
   Both files exist, all required fields present, `data_through_date` matches panel last row.

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
