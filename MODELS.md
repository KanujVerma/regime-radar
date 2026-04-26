# Committed Artifacts

This repo commits trained model artifacts and data snapshots so the app can run on Render's free tier without re-training or re-fetching data from scratch.

## What is committed

```
data/
  models/
    xgb_regime/              model.joblib + meta.json  (~1.8 MB)
    xgb_transition/          model.joblib + meta.json  (~712 KB)
    xgb_transition_calibrator/ model.joblib + meta.json (~8 KB)
    oof_predictions/         model.joblib + meta.json  (~416 KB)
  snapshots/
    panel.parquet            feature panel             (~460 KB)
    spy.parquet              SPY OHLCV history         (~424 KB)
    vix.parquet              VIX history               (~108 KB)
    emv.parquet              FRED EMV series           (~12 KB)
```

Total committed size: ~4 MB.

## Why snapshots/ not processed/

The fetch functions (`fetch_spy_history`, `fetch_vix_history`, `fetch_emv`) are cache-first: if a file exists at their `cache_path` (in `data/processed/`), they return it immediately without making a network call. Committed parquets live in `data/snapshots/` to avoid silently bypassing live API calls. On Render, `data/processed/` is empty on cold boot, so fetchers always attempt live APIs first.

The fallback path (`_load_from_snapshots`) copies `data/snapshots/*.parquet` → `data/processed/` only when the live refresh fails at startup.

## Regenerating artifacts

To regenerate model artifacts and update snapshots after retraining:

```bash
# 1. Fetch fresh data and retrain models
python bootstrap_data.py

# 2. Copy the resulting parquets to snapshots/
cp data/processed/*.parquet data/snapshots/

# 3. Commit everything
git add data/models/ data/snapshots/
git commit -m "chore: update committed model artifacts and snapshots"
```

The committed artifacts represent the public release snapshot (trained on data through the date in `data/models/xgb_regime/meta.json`).
