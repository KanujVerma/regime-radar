# RegimeRadar Public Deployment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take RegimeRadar from a local portfolio project to a clean public GitHub repository with Vercel (frontend) + Render (backend) deployment, graceful live/demo fallback, and a polished recruiter-ready README.

**Architecture:** FastAPI backend on Render free tier with committed model artifacts; graceful fallback to `data/snapshots/` parquets if live yfinance+FRED refresh fails on cold boot. React frontend on Vercel reading from `VITE_API_URL`. Single clear architecture story — no Streamlit, no HuggingFace Spaces.

**Tech Stack:** Python 3.11, FastAPI, XGBoost, React 18, TypeScript, Vite, Tailwind, Recharts, Render (Docker web service), Vercel (static SPA), SQLite (ephemeral, re-seeded on boot)

**Spec:** `docs/superpowers/specs/2026-04-26-public-deployment-design.md`

---

## Chunk 1: Repo Cleanup

**Scope:** Remove dead code (Streamlit, HuggingFace Spaces), fix `.gitignore`, clean `requirements.txt`.
No TDD needed for file deletions and config changes — verify with `git status` and `git diff`.

---

### Task 1: Delete Streamlit and HuggingFace Spaces artifacts

**Files:**
- Delete: `spaces/` (entire directory)
- Delete: `src/dashboard/` (entire directory)
- Delete: `Dockerfile.dashboard`

- [ ] **Step 1: Delete the three dead-code targets**

```bash
rm -rf spaces/
rm -rf src/dashboard/
rm Dockerfile.dashboard
```

- [ ] **Step 2: Verify nothing in the FastAPI serving path imports from these**

```bash
grep -r "from src.dashboard\|import dashboard\|from spaces" src/api/ src/models/ src/features/ src/data/ src/evaluation/ src/labeling/ src/utils/
```

Expected: no output. If any hits appear, investigate before proceeding.

- [ ] **Step 3: Verify tests still pass after deletion**

```bash
cd /Users/kanuj/regime-radar && python -m pytest tests/ -x -q
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Streamlit dashboard and HuggingFace Spaces"
```

---

### Task 2: Fix `.gitignore`

**Files:**
- Modify: `.gitignore`

Current issues:
- `data/app.db*` not gitignored (leaks SQLite state)
- `data/models/*` excluded (needs to be committed)
- `data/processed/*` excluded (needs to stay excluded — replaced by `data/snapshots/`)
- `data/snapshots/` not present yet (will be created in Chunk 2 — add exclusion exemption now)
- Dev tooling dirs (`.claude-flow/`, `.superpowers/`, etc.) not gitignored
- `frontend/playwright-report/`, `frontend/test-results/` not gitignored

- [ ] **Step 1: Read current `.gitignore`**

```bash
cat .gitignore
```

- [ ] **Step 2: Update `.gitignore`**

Replace the content of `.gitignore` with:

```
__pycache__/
*.pyc
*.pyo
.env
.venv/
venv/

# Live SQLite state — ephemeral, never commit
data/app.db
data/app.db-shm
data/app.db-wal

# Raw data — always fetched fresh
data/raw/*
!data/raw/.gitkeep

# Live-fetched parquets — ephemeral on Render, regenerated on boot
data/processed/

# data/models/ and data/snapshots/ are committed (see MODELS.md)
data/fixtures/*
!data/fixtures/.gitkeep

.pytest_cache/
.ruff_cache/
*.egg-info/
dist/

.DS_Store
.worktrees/

# Dev tooling — not for public repo
.claude-flow/
.superpowers/
frontend/playwright-report/
frontend/test-results/
frontend/src/.claude-flow/
```

- [ ] **Step 3: Verify `.gitignore` correctly unblocks `data/models/`**

```bash
git check-ignore -v data/models/xgb_regime/model.joblib
```

Expected: no output (file is NOT ignored). If it still shows as ignored, the gitignore update didn't take.

- [ ] **Step 4: Verify `data/processed/` is still blocked**

```bash
git check-ignore -v data/processed/
```

Expected: `.gitignore:N:data/processed/    data/processed/` (still ignored). Good.

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: fix gitignore — commit model artifacts, block ephemeral state"
```

---

### Task 3: Clean `requirements.txt`

**Files:**
- Modify: `requirements.txt`

Remove `streamlit>=1.35` and `plotly>=5.20`. Both are dashboard-only. Confirmed not imported anywhere in the FastAPI serving path.

- [ ] **Step 1: Verify neither is imported in the serving path**

```bash
grep -r "import streamlit\|from streamlit\|import plotly\|from plotly" src/api/ src/models/ src/features/ src/data/ src/evaluation/ src/labeling/ src/utils/
```

Expected: no output.

- [ ] **Step 2: Remove both lines from `requirements.txt`**

Delete `streamlit>=1.35` and `plotly>=5.20` from `requirements.txt`. Leave all other lines unchanged.

- [ ] **Step 3: Verify pip can still resolve deps (dry run)**

```bash
pip install -r requirements.txt --dry-run 2>&1 | tail -5
```

Expected: no errors. (If pip isn't available, skip — CI will catch this.)

- [ ] **Step 4: Commit**

```bash
git add requirements.txt
git commit -m "chore: remove streamlit and plotly from requirements (dashboard removed)"
```

---

## Chunk 2: Artifact Strategy — `data/snapshots/`

**Scope:** Create `data/snapshots/` with committed parquets. Add `SNAPSHOTS_DIR` to `paths.py`. The `data/models/` artifacts are already on disk and just need gitignore relaxed (done in Chunk 1 Task 2).

---

### Task 4: Create `data/snapshots/` and commit parquets

**Files:**
- Create: `data/snapshots/` (copy from `data/processed/`)
- Modify: `src/utils/paths.py`
- Create: `MODELS.md`

- [ ] **Step 1: Verify current parquets exist**

```bash
ls -lh data/processed/
```

Expected: `emv.parquet`, `panel.parquet`, `spy.parquet`, `vix.parquet` all present.

- [ ] **Step 2: Copy parquets to `data/snapshots/`**

```bash
mkdir -p data/snapshots
cp data/processed/panel.parquet data/snapshots/
cp data/processed/spy.parquet data/snapshots/
cp data/processed/vix.parquet data/snapshots/
cp data/processed/emv.parquet data/snapshots/
```

- [ ] **Step 3: Add `SNAPSHOTS_DIR` to `src/utils/paths.py`**

Read `src/utils/paths.py` first, then add one line after the existing constants:

Current tail of `src/utils/paths.py`:
```python
PROCESSED_DIR: Path = get_project_root() / "data" / "processed"
RAW_DIR: Path = get_project_root() / "data" / "raw"
MODELS_DIR: Path = get_project_root() / "data" / "models"
FIXTURES_DIR: Path = get_project_root() / "data" / "fixtures"
```

Add:
```python
SNAPSHOTS_DIR: Path = get_project_root() / "data" / "snapshots"
```

- [ ] **Step 4: Verify `data/snapshots/` is not accidentally gitignored**

```bash
git check-ignore -v data/snapshots/panel.parquet
```

Expected: no output (not ignored).

- [ ] **Step 5: Verify `data/models/` artifacts are now tracked**

```bash
git status data/models/
```

Expected: shows untracked files in `data/models/xgb_regime/`, `data/models/xgb_transition/`, etc.

- [ ] **Step 6: Create `MODELS.md`**

```markdown
# Committed Model Artifacts

The following trained model artifacts are committed to this repository to enable reproducible deployment on Render (and any environment) without requiring a full retraining run.

## What is committed

```
data/
  models/
    xgb_regime/
      model.joblib          XGBoost regime classifier (multiclass: calm/elevated/turbulent)
      meta.json             Training metadata: saved_at timestamp, feature names, metrics
    xgb_transition/
      model.joblib          XGBoost transition-risk model (binary: will regime escalate in 5d?)
      meta.json             Training metadata
    xgb_transition_calibrator/
      model.joblib          Isotonic/Platt calibrator for transition probabilities
      meta.json             Calibrator metadata
    oof_predictions/
      meta.json             Out-of-fold prediction metadata for evaluation
  snapshots/
    panel.parquet           Merged feature panel (SPY + VIX + EMV, from 1993)
    spy.parquet             SPY OHLCV history
    vix.parquet             CBOE VIX (FRED VIXCLS)
    emv.parquet             Equity Market Volatility index (FRED EMVOVERALLEMV)
```

## Snapshot date

These artifacts represent the state of the model as of the last `bootstrap_data.py` run.
They are used as a fallback on Render when the live yfinance+FRED refresh fails on cold boot.

## Regenerating

To update the committed artifacts with fresh data and a retrained model:

```bash
cp .env.example .env       # add FRED_API_KEY
pip install -r requirements.txt
python scripts/bootstrap_data.py
# then copy fresh parquets to snapshots
cp data/processed/*.parquet data/snapshots/
git add data/models/ data/snapshots/
git commit -m "chore: update model artifacts and snapshots"
```

`bootstrap_data.py` fetches SPY OHLCV from yfinance and VIX + EMV from FRED (requires `FRED_API_KEY`), builds all features and labels, trains both XGBoost models via walk-forward cross-validation, and writes artifacts to `data/models/`.
```

- [ ] **Step 7: Stage and commit everything**

```bash
git add data/models/ data/snapshots/ src/utils/paths.py MODELS.md
git commit -m "chore: commit model artifacts and snapshots for reproducible deployment"
```

---

## Chunk 3: Backend Changes — Mode Logic, Fallback, Startup Warmup

**Scope:** Three code changes to `src/api/state.py` and `src/api/main.py`, all TDD.

---

### Task 5: Fix `mode` logic in `_do_refresh()`

**Files:**
- Modify: `src/api/state.py` (lines 176–184)
- Test: `tests/test_api_smoke.py`

Currently, `mode` is set to `"live"` only when the Finnhub price-card fetch succeeds (line 179–182 in `state.py`). The fix: set `mode = "live"` at the start of `_do_refresh()` — the yfinance+FRED data is always live; Finnhub is optional price-card enrichment only.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_api_smoke.py`:

```python
def test_do_refresh_sets_live_mode_without_finnhub(tmp_path, monkeypatch):
    """_do_refresh() must write mode='live' even when FINNHUB_API_KEY is not set."""
    import pandas as pd
    import numpy as np
    from src.api.state import AppState

    state = AppState(db_path=str(tmp_path / "test.db"))
    monkeypatch.delenv("FINNHUB_API_KEY", raising=False)

    # Minimal mocks — prevent real network calls
    fake_panel = pd.DataFrame({
        "close": [400.0] * 600,
        "open": [398.0] * 600,
        "high": [402.0] * 600,
        "low": [397.0] * 600,
        "volume": [80_000_000.0] * 600,
        "vixcls": [18.0] * 600,
        "emvoverallemv": [200.0] * 600,
    }, index=pd.bdate_range("2019-01-01", periods=600))
    fake_panel.index.name = "date"

    fake_features = fake_panel.assign(
        ret_1d=0.001, ret_5d=0.005, ret_20d=0.02, momentum_20d=0.02, dist_sma50=0.01,
        rv_10d=0.15, rv_20d=0.15, rv_20d_pct=0.5, vix_level=18.0, vix_chg_1d=0.0,
        vix_chg_5d=0.0, vix_zscore_252d=0.0, vix_pct_504d=0.5, drawdown=0.0,
        drawdown_pct_504d=0.5, days_in_regime_lag1=5, turbulent_count_30d_lag1=0,
        trend_code=1, emv_level=200.0, emv_chg_5d=0.0, emv_lag_5d=200.0, emv_lag_20d=200.0,
    )
    fake_regime = pd.Series(["calm"] * 600, index=fake_panel.index, name="regime")
    fake_trend = pd.Series(["uptrend"] * 600, index=fake_panel.index)

    # IMPORTANT: _do_refresh() uses deferred local imports (lines 145-153 of state.py).
    # Patches must target source modules, not src.api.state, because the names
    # are only bound at call time via 'from <source> import <fn>' inside the method.
    monkeypatch.setattr("src.data.fetch_yfinance.fetch_spy_history",
                        lambda start, cache_path=None: fake_panel[["close","open","high","low","volume"]])
    monkeypatch.setattr("src.data.fetch_vix.fetch_vix_history",
                        lambda start, cache_path=None: fake_panel[["vixcls"]])
    monkeypatch.setattr("src.data.fetch_fred.fetch_emv",
                        lambda start, end=None, cache_path=None: fake_panel[["emvoverallemv"]])
    monkeypatch.setattr("src.data.merge_sources.merge_market_panel",
                        lambda spy, vix, emv: fake_panel)
    monkeypatch.setattr("src.features.build_market_features.build_features",
                        lambda panel, **kw: fake_features)
    monkeypatch.setattr("src.labeling.build_regime_labels.build_regime_labels",
                        lambda panel: fake_regime)
    monkeypatch.setattr("src.labeling.build_trend_labels.build_trend_labels",
                        lambda panel: fake_trend)
    monkeypatch.setattr("src.models.predict_live.predict_current_state",
                        lambda features: {
                            "regime": "calm", "transition_risk": 0.10,
                            "prob_calm": 0.7, "prob_elevated": 0.2, "prob_turbulent": 0.1,
                        })

    state._do_refresh()
    result = state.read_latest_state()
    assert result is not None
    assert result["mode"] == "live", f"Expected mode='live', got mode='{result['mode']}'"
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
python -m pytest tests/test_api_smoke.py::test_do_refresh_sets_live_mode_without_finnhub -v
```

Expected: FAIL — `AssertionError: Expected mode='live', got mode='demo'`

- [ ] **Step 3: Fix `_do_refresh()` in `src/api/state.py`**

Read the file. In `_do_refresh()`, locate the Finnhub block (around line 174–184):

```python
        # Optional: Finnhub price-card overlay
        price_card_price = None
        mode = "demo"
        try:
            provider = get_provider()
            if provider.mode == "live":
                q = provider.latest_quote("SPY")
                price_card_price = q.price
                mode = "live"
        except Exception as e:
            _logger.warning("Finnhub price-card fetch failed: %s", e)
```

Replace with:

```python
        # mode = "live" because data comes from yfinance+FRED (always live).
        # Finnhub is optional price-card enrichment only — it does not affect mode.
        mode = "live"
        price_card_price = None
        try:
            provider = get_provider()
            if provider.mode == "live":
                q = provider.latest_quote("SPY")
                price_card_price = q.price
        except Exception as e:
            _logger.warning("Finnhub price-card fetch failed: %s", e)
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
python -m pytest tests/test_api_smoke.py::test_do_refresh_sets_live_mode_without_finnhub -v
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
python -m pytest tests/ -x -q
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/state.py tests/test_api_smoke.py
git commit -m "fix: mode='live' tied to yfinance+FRED success, not Finnhub availability"
```

---

### Task 6: Add `_load_from_snapshots()` to `AppState`

**Files:**
- Modify: `src/api/state.py`
- Test: `tests/test_api_smoke.py`

`_load_from_snapshots()` copies committed parquets from `data/snapshots/` to `data/processed/`, calls `_do_refresh()` (which will succeed with the copied data), then overwrites `mode` to `"demo"` in SQLite — because the data came from committed snapshots, not live APIs.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_api_smoke.py`:

```python
def test_load_from_snapshots_sets_demo_mode(tmp_path, monkeypatch):
    """_load_from_snapshots() seeds SQLite with mode='demo' from committed parquets."""
    from src.api.state import AppState
    import src.api.state as state_mod

    # Create fake snapshot parquets in a temp snapshots dir
    import pandas as pd
    snapshots_dir = tmp_path / "snapshots"
    snapshots_dir.mkdir()
    processed_dir = tmp_path / "processed"
    processed_dir.mkdir()

    fake_parquet = pd.DataFrame({"x": [1.0]})
    for name in ("panel.parquet", "spy.parquet", "vix.parquet", "emv.parquet"):
        fake_parquet.to_parquet(snapshots_dir / name)

    # Patch SNAPSHOTS_DIR and PROCESSED_DIR to use tmp_path
    import src.utils.paths as paths_mod
    monkeypatch.setattr(paths_mod, "SNAPSHOTS_DIR", snapshots_dir)
    monkeypatch.setattr(paths_mod, "PROCESSED_DIR", processed_dir)

    # Mock _do_refresh() to write mode='live' (simulates the fixed behavior)
    # _load_from_snapshots() must override this to 'demo'
    def fake_do_refresh(self):
        self.write_state({
            "as_of_ts": "2024-01-01T00:00:00+00:00",
            "regime": "calm", "transition_risk": 0.10,
            "trend": "uptrend", "vix_level": 15.0, "vix_chg_1d": 0.0,
            "top_drivers": [], "mode": "live",  # _do_refresh now sets live
            "price_card_price": None,
        })

    state = AppState(db_path=str(tmp_path / "test.db"))
    monkeypatch.setattr(AppState, "_do_refresh", fake_do_refresh)

    state._load_from_snapshots()

    # Parquets should have been copied
    for name in ("panel.parquet", "spy.parquet", "vix.parquet", "emv.parquet"):
        assert (processed_dir / name).exists(), f"{name} not copied to processed/"

    # Mode must be 'demo' — snapshot data, not live
    result = state.read_latest_state()
    assert result is not None
    assert result["mode"] == "demo", f"Expected mode='demo', got mode='{result['mode']}'"
```

- [ ] **Step 2: Run the test — expect FAIL (AttributeError: AppState has no _load_from_snapshots)**

```bash
python -m pytest tests/test_api_smoke.py::test_load_from_snapshots_sets_demo_mode -v
```

Expected: FAIL — `AttributeError: 'AppState' object has no attribute '_load_from_snapshots'`

- [ ] **Step 3: Implement `_load_from_snapshots()` in `src/api/state.py`**

Add the following method to `AppState`, after the `force_refresh` method:

```python
    def _load_from_snapshots(self) -> None:
        """Fallback: copy committed snapshot parquets to processed dir, run inference.

        Called when live yfinance+FRED refresh fails on startup. After inference,
        mode is forced to 'demo' — the data is from committed snapshots, not live APIs.
        """
        import shutil
        from src.utils.paths import SNAPSHOTS_DIR, PROCESSED_DIR

        PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
        copied = 0
        for src in SNAPSHOTS_DIR.glob("*.parquet"):
            shutil.copy2(src, PROCESSED_DIR / src.name)
            copied += 1
        _logger.info("Copied %d snapshot parquets to %s", copied, PROCESSED_DIR)

        self._do_refresh()

        # Force mode='demo': inference ran on committed snapshot data, not live APIs
        with self._connect() as conn:
            conn.execute(
                "UPDATE live_state SET mode='demo' WHERE id=(SELECT MAX(id) FROM live_state)"
            )
        _logger.info("Snapshot fallback complete — serving committed data as mode=demo")
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
python -m pytest tests/test_api_smoke.py::test_load_from_snapshots_sets_demo_mode -v
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
python -m pytest tests/ -x -q
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/state.py tests/test_api_smoke.py
git commit -m "feat: add _load_from_snapshots() — fallback inference from committed parquets"
```

---

### Task 7: Add startup warmup to `main.py`

**Files:**
- Modify: `src/api/main.py`
- Test: `tests/test_api_smoke.py`

On startup, attempt a live refresh. If it fails, fall back to `_load_from_snapshots()`. Start the scheduler only after this warmup.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_api_smoke.py`:

```python
def test_startup_warmup_succeeds_with_live_refresh(tmp_path, monkeypatch):
    """When _do_refresh() succeeds, startup completes with no fallback called."""
    from src.api.state import AppState
    from src.api.main import create_app
    from fastapi.testclient import TestClient

    refresh_called = []
    snapshots_called = []

    class WarmupState(AppState):
        def _do_refresh(self):
            refresh_called.append(True)
            self.write_state({
                "as_of_ts": "2024-01-01T00:00:00+00:00",
                "regime": "calm", "transition_risk": 0.10,
                "trend": "uptrend", "vix_level": 15.0, "vix_chg_1d": 0.0,
                "top_drivers": [], "mode": "live", "price_card_price": None,
            })
        def _load_from_snapshots(self):
            snapshots_called.append(True)

    state = WarmupState(db_path=str(tmp_path / "test.db"))
    app = create_app(app_state=state, start_scheduler=False)
    client = TestClient(app)

    # TestClient triggers lifespan startup
    resp = client.get("/health")
    assert resp.status_code == 200
    assert len(refresh_called) >= 1, "_do_refresh() should have been called"
    assert len(snapshots_called) == 0, "_load_from_snapshots() should NOT be called on success"


def test_startup_warmup_falls_back_on_refresh_failure(tmp_path, monkeypatch):
    """When _do_refresh() raises, startup calls _load_from_snapshots() and doesn't crash."""
    from src.api.state import AppState
    from src.api.main import create_app
    from fastapi.testclient import TestClient

    snapshots_called = []

    class FallbackState(AppState):
        def _do_refresh(self):
            raise RuntimeError("yfinance unavailable in test")
        def _load_from_snapshots(self):
            snapshots_called.append(True)
            self.write_state({
                "as_of_ts": "2024-01-01T00:00:00+00:00",
                "regime": "calm", "transition_risk": 0.10,
                "trend": "uptrend", "vix_level": 15.0, "vix_chg_1d": 0.0,
                "top_drivers": [], "mode": "demo", "price_card_price": None,
            })

    state = FallbackState(db_path=str(tmp_path / "test.db"))
    app = create_app(app_state=state, start_scheduler=False)
    client = TestClient(app)

    # Should not raise — fallback handles the failure
    resp = client.get("/health")
    assert resp.status_code == 200
    assert len(snapshots_called) == 1, "_load_from_snapshots() should be called on refresh failure"
```

- [ ] **Step 2: Run the tests — expect FAIL**

```bash
python -m pytest tests/test_api_smoke.py::test_startup_warmup_succeeds_with_live_refresh tests/test_api_smoke.py::test_startup_warmup_falls_back_on_refresh_failure -v
```

Expected: both FAIL — startup handler currently only calls `start_scheduler()`.

- [ ] **Step 3: Update the `startup()` handler in `src/api/main.py`**

Read `src/api/main.py` first. Find the `startup()` async handler:

```python
    @app.on_event("startup")
    async def startup():
        _logger.info("RegimeRadar API starting up")
        if start_scheduler:
            app_state.start_scheduler()
```

Replace with:

```python
    @app.on_event("startup")
    async def startup():
        _logger.info("RegimeRadar API starting up")
        # Warmup: try live refresh; fall back to committed snapshots on failure.
        # _do_refresh() is called directly (bypasses the market-hours gate in the scheduler job).
        try:
            app_state._do_refresh()
            _logger.info("Startup warmup complete — live data seeded")
        except Exception as exc:
            _logger.warning("Live refresh failed on startup (%s), loading committed snapshots", exc)
            try:
                app_state._load_from_snapshots()
            except Exception as snap_exc:
                _logger.error("Snapshot fallback also failed: %s — API will serve 503 until refresh", snap_exc)
        if start_scheduler:
            app_state.start_scheduler()
```

- [ ] **Step 4: Run the tests — expect PASS**

```bash
python -m pytest tests/test_api_smoke.py::test_startup_warmup_succeeds_with_live_refresh tests/test_api_smoke.py::test_startup_warmup_falls_back_on_refresh_failure -v
```

Expected: both PASS

- [ ] **Step 5: Run full test suite**

```bash
python -m pytest tests/ -x -q
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/main.py tests/test_api_smoke.py
git commit -m "feat: add startup warmup — live refresh with snapshot fallback on cold boot"
```

---

## Chunk 4: Deployment Configs and Environment Files

**Scope:** `render.yaml`, `Dockerfile.api`, `docker-compose.yml`, `frontend/vercel.json`, `.env.example` (root), `frontend/.env.example`.

---

### Task 8: Update `Dockerfile.api`

**Files:**
- Modify: `Dockerfile.api`

Changes: remove any Streamlit references, fix `$PORT` using shell form, add Python-based HEALTHCHECK.

- [ ] **Step 1: Read current `Dockerfile.api`**

```bash
cat Dockerfile.api
```

- [ ] **Step 2: Write updated `Dockerfile.api`**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Python-based healthcheck: python:3.11-slim does not include curl.
# Uses stdlib urllib — no extra dependencies.
# Hardcodes port 8000 for local compose (Render uses healthCheckPath from render.yaml).
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Shell form required — Docker exec form does not expand $PORT.
# ${PORT:-8000} falls back to 8000 when PORT is not set (local dev).
CMD ["sh", "-c", "uvicorn src.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

- [ ] **Step 3: Verify the build works**

```bash
docker build -f Dockerfile.api -t regime-radar-api-test . 2>&1 | tail -5
```

Expected: `Successfully built <id>` (or equivalent). If Docker isn't running, skip and note for CI.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile.api
git commit -m "fix: Dockerfile.api — Python healthcheck, shell form CMD for PORT expansion"
```

---

### Task 9: Simplify `docker-compose.yml`

**Files:**
- Modify: `docker-compose.yml`

Remove the `dashboard` service. Switch from named volume to bind mount (`./data:/app/data`). This lets the container read committed model artifacts from the repo directly.

- [ ] **Step 1: Write updated `docker-compose.yml`**

```yaml
version: "3.9"

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s

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

- [ ] **Step 2: Verify `data/app.db` is gitignored (so local SQLite state isn't committed)**

```bash
git check-ignore -v data/app.db
```

Expected: shows gitignored. (We added this in Chunk 1 Task 2.)

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: simplify docker-compose — remove dashboard, bind mount data/"
```

---

### Task 10: Create `render.yaml`

**Files:**
- Create: `render.yaml` (repo root)

- [ ] **Step 1: Create `render.yaml`**

```yaml
services:
  - type: web
    name: regime-radar-api
    runtime: docker
    dockerfilePath: Dockerfile.api
    plan: free
    healthCheckPath: /health
    envVars:
      - key: FRED_API_KEY
        sync: false
      - key: CORS_ORIGIN
        sync: false
      - key: APP_ENV
        value: production
      - key: FINNHUB_API_KEY
        sync: false
```

- [ ] **Step 2: Commit**

```bash
git add render.yaml
git commit -m "feat: add render.yaml for Render deployment"
```

---

### Task 11: Create `frontend/vercel.json`

**Files:**
- Create: `frontend/vercel.json`

- [ ] **Step 1: Create `frontend/vercel.json`**

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

This enables SPA routing — Vercel serves `index.html` for all non-asset paths rather than returning 404 on direct URL access.

- [ ] **Step 2: Commit**

```bash
git add frontend/vercel.json
git commit -m "feat: add vercel.json for SPA routing"
```

---

### Task 12: Update environment files

**Files:**
- Modify: `.env.example` (root)
- Create: `frontend/.env.example`

- [ ] **Step 1: Update root `.env.example`**

```bash
# RegimeRadar — Backend Environment Variables
# Copy this to .env and fill in your values.

# ── Required for live data refresh ──────────────────────────────────
# Obtain a free key at: https://fred.stlouisfed.org/docs/api/api_key.html
FRED_API_KEY=

# ── Optional ────────────────────────────────────────────────────────
# Enables live price-card overlay on the Current State page only.
# Not required for ML inference, regime classification, or historical views.
# Obtain at: https://finnhub.io
FINNHUB_API_KEY=

# ── Production (set in Render dashboard) ───────────────────────────
# Your Vercel frontend URL, no trailing slash.
# Example: https://regime-radar.vercel.app
# Leave blank for local development.
CORS_ORIGIN=

# ── Application settings ────────────────────────────────────────────
APP_ENV=development          # development | production
APP_LOG_LEVEL=INFO           # INFO | DEBUG
```

- [ ] **Step 2: Create `frontend/.env.example`**

```bash
# RegimeRadar — Frontend Environment Variables
# Copy this to frontend/.env and fill in your values.

# URL of the FastAPI backend.
# Local development:  http://localhost:8000
# Production:         https://<your-render-service>.onrender.com
VITE_API_URL=http://localhost:8000
```

- [ ] **Step 3: Commit**

```bash
git add .env.example frontend/.env.example
git commit -m "chore: update env examples — add CORS_ORIGIN, frontend env, cleaner comments"
```

---

## Chunk 5: Frontend UI — Mode Badge and Fallback Copy

**Scope:** Make the Sidebar mode indicator dynamic (LIVE vs DEMO). Add fallback note to CurrentState when mode is "demo". Add `HealthResponse` type and `useHealthStatus` hook.

---

### Task 13: Add `HealthResponse` type and `useHealthStatus` hook

**Files:**
- Modify: `frontend/src/types/api.ts`
- Create: `frontend/src/hooks/useHealthStatus.ts`

- [ ] **Step 1: Add `HealthResponse` to `frontend/src/types/api.ts`**

Read `frontend/src/types/api.ts` first. Add at the end:

```typescript
export interface HealthResponse {
  status: string
  mode: string
  last_refresh_ts: string | null
  model_versions: Record<string, string>
}
```

- [ ] **Step 2: Add `health` to the api client**

Read `frontend/src/api/client.ts`. Add to the `api` export object:

```typescript
  health: () => get<HealthResponse>('/health'),
```

Don't forget to import `HealthResponse`:
```typescript
import type { ..., HealthResponse } from '../types/api'
```

- [ ] **Step 3: Create `frontend/src/hooks/useHealthStatus.ts`**

```typescript
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { HealthResponse } from '../types/api'

export function useHealthStatus() {
  const [data, setData] = useState<HealthResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetch = async () => {
      try {
        const d = await api.health()
        if (!cancelled) setData(d)
      } catch {
        // health endpoint unavailable — leave data null
      }
    }
    fetch()
    const interval = setInterval(fetch, 60_000) // refresh every 60s
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return data
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/api/client.ts frontend/src/hooks/useHealthStatus.ts
git commit -m "feat: add HealthResponse type and useHealthStatus hook"
```

---

### Task 14: Make Sidebar mode indicator dynamic

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`

Currently the Sidebar shows a hardcoded green dot + "Near-live data". Replace with a dynamic LIVE / DEMO indicator derived from `useHealthStatus`.

- [ ] **Step 1: Read `frontend/src/components/layout/Sidebar.tsx`**

Identify the bottom section:
```jsx
<div className="flex items-center gap-1.5">
  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
  <span className="text-[9px] font-bold tracking-widest uppercase text-slate-500">Near-live data</span>
</div>
```

- [ ] **Step 2: Update `Sidebar.tsx`**

Add the import at the top:
```typescript
import { useHealthStatus } from '../../hooks/useHealthStatus'
```

Inside the `Sidebar` function, add before the return:
```typescript
const health = useHealthStatus()
const isLive = health?.mode === 'live'
```

Replace the hardcoded indicator div with:
```jsx
<div className="flex items-center gap-1.5">
  <div className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-green-400' : 'bg-amber-400'}`} />
  <span className="text-[9px] font-bold tracking-widest uppercase text-slate-500">
    {isLive ? 'Live data' : health ? 'Demo mode' : 'Connecting…'}
  </span>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: dynamic LIVE/DEMO indicator in Sidebar"
```

---

### Task 15: Add demo fallback note to `CurrentState`

**Files:**
- Modify: `frontend/src/pages/CurrentState.tsx`

When `data.mode === "demo"`, show a one-line amber banner below the topbar: "Using cached fallback state — live refresh unavailable. Data as of [as_of_ts]."

- [ ] **Step 1: Read `frontend/src/pages/CurrentState.tsx`**

Find where the Topbar is rendered and the main content begins.

- [ ] **Step 2: Add the demo fallback banner**

After the `<Topbar>` component and before the first content section, insert:

```jsx
{data.mode === 'demo' && (
  <div
    className="px-6 py-2 text-[10px] font-medium text-amber-300"
    style={{ background: '#1a1200', borderBottom: '1px solid #2d1f00' }}
  >
    Using cached fallback state — live refresh unavailable.
    {data.as_of_ts && (
      <> Data as of {new Date(data.as_of_ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.</>
    )}
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/CurrentState.tsx
git commit -m "feat: demo mode fallback banner on CurrentState — shows as-of date"
```

---

## Chunk 6: Documentation — README and MODELS.md

**Scope:** Full README rewrite. `MODELS.md` was already created in Chunk 2 Task 4.

---

### Task 16: Write the full public README

**Files:**
- Modify: `README.md` (full rewrite)

- [ ] **Step 1: Write `README.md`**

```markdown
# RegimeRadar

**Live market regime classification and transition-risk forecasting for SPY.**

[![Frontend](https://img.shields.io/badge/frontend-Vercel-black)](https://vercel.com)
[![Backend](https://img.shields.io/badge/backend-Render-46E3B7)](https://render.com)

---

## What is RegimeRadar?

RegimeRadar classifies the current equity market regime — **calm**, **elevated**, or **turbulent** — and estimates the probability that conditions will escalate to a higher-stress state within the next five trading days.

It is a monitoring and situational-awareness tool. It does not generate trade signals, predict prices, or advise action.

> **What this is NOT:** RegimeRadar does not generate trade recommendations, entry/exit points, or alpha signals. It is a regime-awareness dashboard for structured observation of market conditions.

---

## Why it exists

Most retail market monitoring tools show price and volume. RegimeRadar surfaces the *latent stress state* underneath — the regime that shapes the environment in which returns happen. Understanding whether the market is in a calm, elevated, or turbulent regime is useful context for any discretionary decision-making process.

The transition-risk model adds a forward-looking dimension: not just "what regime are we in?" but "how likely is it to get worse?"

---

## Demo notes

- **Frontend** is deployed on [Vercel](https://vercel.com) — fast, globally cached, always available.
- **Backend** is deployed on [Render free tier](https://render.com) — may experience a **15–30 second cold start** after inactivity. Render spins down free services after ~15 minutes of no traffic.
- On cold start, the backend attempts a **live refresh** from yfinance + FRED. If successful, the dashboard shows current market conditions with a **LIVE** indicator.
- If the live refresh fails (APIs unavailable, rate limit, network error), the backend falls back to committed model artifacts and data snapshots. The dashboard shows the last committed snapshot with a **DEMO** indicator and the data's as-of date.
- Finnhub is optional. It provides a live price-card overlay on the Current State page only. All regime and risk functionality works without it.

---

## Product overview

| Page | Description |
|---|---|
| **Current State** | Today's regime, 5-day transition-risk score, VIX/RV/drawdown snapshot, top model drivers |
| **History** | Full regime timeline from 1993, stress-score history, VIX overlay, drawdown chart |
| **Event Replay** | 2008, 2020, and 2022 crisis windows with out-of-fold model warning lead times |
| **Model Drivers** | Walk-forward fold metrics, threshold analysis, feature importance, calibration curves |
| **Scenario Explorer** | Adjust key market inputs and see how the model's risk estimate responds |

---

## Screenshots

<!-- TODO: add screenshots after public deployment -->
<!-- Suggested captures:
  - Current State page (LIVE mode with regime badge and risk gauge)
  - History page (regime timeline with color bands)
  - Event Replay page (2020 COVID crash with warning lead time)
  - Model Drivers page (threshold sweep table)
  - Scenario Explorer page (risk delta comparison)
-->

---

## Why this architecture

- **FastAPI** keeps ML inference co-located with the Python data and model stack. No rewriting logic across language boundaries. Model loading, feature computation, and regime scoring all happen in Python.
- **Vercel** provides zero-config static frontend hosting with a global CDN. The React build deploys on every push to `main` automatically.
- **Render** hosts the FastAPI service on a free-tier Docker web service. Automatic deploys on push to `main`. Model artifacts are committed to the repo (~4MB) so Render doesn't need to retrain on deploy.
- **No Supabase.** SQLite re-seeds from committed parquets on every cold boot (~15–30s), which is sufficient for a demo portfolio project.

---

## Architecture

```
┌─────────────────────────────┐
│   GitHub (public repo)      │
│   main → auto-deploys both  │
└──────────┬──────────────────┘
           │
     ┌─────┴───────┐
     ▼             ▼
┌──────────┐   ┌────────────────────────────────┐
│  Vercel  │   │  Render (free tier)             │
│  React   │◄──│  FastAPI + XGBoost              │
│  frontend│   │  data/models/    (committed)    │
│  CDN     │   │  data/snapshots/ (committed)    │
└──────────┘   │  data/processed/ (ephemeral)    │
VITE_API_URL   │  SQLite:         (ephemeral)    │
→ Render URL   └────────────────────────────────┘
                            │
                FRED_API_KEY → live reseed on boot
                Fallback → data/snapshots/ → mode: demo
```

---

## Frontend stack

| Library | Role |
|---|---|
| React 18 + TypeScript | UI framework |
| Vite | Build tool |
| Tailwind CSS v4 | Styling |
| Recharts | Charts (regime timeline, risk rails, driver bars) |
| Framer Motion | Page transitions |
| React Router v7 | Client-side routing |
| Radix UI | Accessible slider, tooltip primitives |
| Lucide React | Icons |

---

## Backend stack

| Library | Role |
|---|---|
| FastAPI | REST API framework |
| Uvicorn | ASGI server |
| XGBoost | Regime classifier + transition-risk model |
| scikit-learn | Calibration (isotonic/Platt), baselines |
| SHAP | Feature importance / driver explanations |
| pandas + numpy | Feature engineering |
| APScheduler | Background data refresh scheduler |
| SQLite | Ephemeral live-state persistence |
| yfinance | SPY OHLCV data |
| fredapi | FRED API (VIX, EMV) |
| pydantic-settings | Environment config |

---

## Data sources

| Source | Series | Coverage | Role |
|---|---|---|---|
| **yfinance** | SPY OHLCV | From 1993 | Primary; always required |
| **FRED VIXCLS** | CBOE Volatility Index (daily) | From 1990 | Primary VIX source; required |
| **FRED EMVOVERALLEMV** | Equity Market Volatility index | From inception (monthly) | Macro context feature; required |
| **Finnhub** | Real-time price card | Live only | Optional; Current State price overlay only |

---

## Feature design

All features are computed at time `t` using only trailing data. Regime-lag features use `regime.shift(1)` — no lookahead.

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
| `turbulent_count_30d_lag1` | Turbulent days in prior 30-day window (lagged) |
| `trend_code` | Trend state: +1 (above SMA50 + positive 20d return), −1, 0 (mixed) |

### Macro
| Feature | Description |
|---|---|
| `emv_level` | FRED EMVOVERALLEMV level |
| `emv_chg_5d` | 5-day change in EMV |
| `emv_lag_5d` | EMV lagged 5 days |
| `emv_lag_20d` | EMV lagged 20 days |

---

## Regime labeling

The regime label is derived from a **composite stress score** — a weighted sum of three trailing percentile ranks, each computed over a 504-trading-day (≈2-year) window:

```
stress = 0.45 × vix_percentile
       + 0.35 × realized_vol_percentile
       + 0.20 × drawdown_percentile
```

Thresholds: `calm` < 0.40 ≤ `elevated` < 0.70 ≤ `turbulent`

Raw labels are smoothed to suppress single-day noise:

- **`smooth_offline`** (training labels): forward-scan — a regime flip is accepted only when the new label holds for ≥ N consecutive days. The flip is attributed to the first day of the run. Uses future data; training only.
- **`smooth_live`** (serving): backward-only — a flip is confirmed only after the new label has held for ≥ N trailing days. Introduces a known N-day reporting lag. Never looks ahead.

> **Intentional difference:** `smooth_offline` and `smooth_live` produce slightly different label sequences near transition boundaries. This is by design — not a leakage bug. The live system has a known N-day lag near regime transitions.

---

## Transition-risk target

**Binary label:** within `H = 5` trading days, does the regime rise to a strictly higher level AND hold for ≥ 3 consecutive days?

- Turbulent rows always receive label `0` (no higher regime is possible)
- The last `H` rows of any dataset receive label `0` (future unknown)
- Parameters configurable via `configs/labels.yaml`

---

## Modeling

### Regime classifier (XGBoost multiclass) — reference task

Because regime labels are a deterministic function of the input features (VIX percentile, realized-vol percentile, drawdown percentile), XGBoost closely approximates the rule baseline. This is an intentional and documented property. The regime classifier serves as a feature-sufficiency check.

### Transition-risk model (XGBoost binary) — primary ML task

Predicts the probability that the regime will escalate within the next 5 trading days. The target is not a mechanical function of current features — the model must learn temporal structure from the walk-forward training history.

Config: `objective: binary:logistic`, eval metric `aucpr`, 500 estimators, `scale_pos_weight` per fold, post-hoc per-fold calibration (isotonic ≥200 positive samples, Platt otherwise).

### Baselines

| Baseline | Type | Description |
|---|---|---|
| `rule_regime_predict` | Rule engine | Directly applies the stress-score formula |
| `transition_heuristic` | VIX threshold | 1 if VIX jumps >15% in 5 days |
| `LogisticTransition` | ML | Logistic regression on full feature set |
| `RandomForestRegime` | ML | Random Forest multiclass regime classifier |

---

## Evaluation methodology

**Walk-forward expanding window** — no random splits, no leakage.
- Initial training window: ≥1,260 trading days (≈5 years)
- Step size: 63 trading days (≈1 quarter)
- `max(train_idx) < min(test_idx)` enforced in code

**Per-fold calibration:** inner holdout (last 20% of training fold). Isotonic if ≥200 positive transitions, Platt otherwise. Calibrator never fitted on test data.

**Threshold analysis:** 7 thresholds from 0.10–0.70. Reports recall, false alert rate (FAR), alert frequency, mean warning lead time.

**Event replay:** 2008, 2020, 2022 crisis windows. Uses out-of-fold (OOF) predictions only — each crisis day scored by the fold in which it appeared as the test set.

**Metrics:** macro F1, balanced accuracy, ROC-AUC, PR-AUC, recall @ 0.50, mean/median lead time.

---

## Calibration and threshold tradeoff

The transition-risk model outputs a calibrated probability. Calibration is post-hoc, per fold, using the inner holdout of each training window.

There is an explicit tradeoff between recall (catching real transitions) and false alert rate (FAR). The threshold analysis table on the Model Drivers page shows this tradeoff across 7 thresholds. A lower threshold catches more transitions earlier but generates more false alerts.

---

## Scenario Explorer

Adjust six key market inputs (VIX level, 5-day VIX change, realized vol percentile, drawdown percentile, 20-day return, distance from SMA-50) and see how the model's transition-risk estimate changes. The scenario panel shows:
- Baseline risk (current market)
- Scenario risk (your adjusted inputs)
- Delta (change in probability)
- Per-feature driver deltas (how each input shift contributed)

---

## Event Replay

Replay the model's output through three historical crisis windows using out-of-fold predictions:
- **2008 Financial Crisis** — Sep 2008 to Mar 2009
- **2020 COVID Crash** — Feb 2020 to May 2020
- **2022 Rate-Shock Drawdown** — Jan 2022 to Dec 2022

The replay shows how many days of advance warning the transition-risk model provided before each regime escalation. All replay data uses OOF predictions — no test-set leakage.

---

## Limitations

- **Single-asset scope.** SPY only. Not validated across other asset classes, market structures, or international equity markets.
- **Daily granularity.** No intraday modeling. All regime logic operates on end-of-day data.
- **Regime labels are configurable heuristics, not ground truth.** The composite stress thresholds (0.40 / 0.70) are interpretable but arbitrary. Alternative parameterizations produce different label sequences.
- **Live regime label lags offline label by `smoothing_days` days.** `smooth_live` (backward-only) can only confirm a regime flip after it has persisted for N trailing days. This is an intentional, documented difference — not a bug.
- **EMVOVERALLEMV is a monthly release, forward-filled.** EMV-derived features are stale by up to 31 days.
- **External API availability.** FRED and yfinance are external services with no formal SLA. Rate limits or outages degrade the live refresh path.
- **Regime classifier is a feature-sufficiency reference task.** XGBoost closely approximates the rule baseline because labels are a deterministic function of inputs. The primary ML contribution is the transition-risk model.
- **Explanations surface correlation, not causation.** SHAP values indicate feature contributions to model output — not causal relationships. High SHAP magnitude does not imply a causal mechanism.
- **Render cold starts.** The public demo backend runs on Render free tier. After ~15 minutes of inactivity it spins down. First request after inactivity may take 15–30 seconds to respond.

---

## Local development setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- A free FRED API key: [api.stlouisfed.org/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html)

### Clone and configure

```bash
git clone https://github.com/<your-username>/regime-radar.git
cd regime-radar
cp .env.example .env          # add FRED_API_KEY (required for live mode)
```

---

## Environment variables

### Backend

| Variable | Required | Description |
|---|---|---|
| `FRED_API_KEY` | **Yes** | FRED API key for VIX and EMV data |
| `CORS_ORIGIN` | Production | Vercel frontend URL (no trailing slash) |
| `FINNHUB_API_KEY` | No | Optional price-card overlay on Current State only |
| `APP_ENV` | No | `development` (default) or `production` |
| `APP_LOG_LEVEL` | No | `INFO` (default) or `DEBUG` |

### Frontend

| Variable | Description |
|---|---|
| `VITE_API_URL` | FastAPI backend URL. Local: `http://localhost:8000` |

---

## Run backend locally

```bash
pip install -r requirements.txt
uvicorn src.api.main:app --reload
# API available at http://localhost:8000
# Swagger UI at http://localhost:8000/docs
```

On startup, the API attempts a live refresh from yfinance + FRED (requires `FRED_API_KEY`). If that fails, it falls back to committed snapshots in `data/snapshots/`.

---

## Run frontend locally

```bash
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:8000
npm install
npm run dev
# Frontend available at http://localhost:5173
```

---

## Docker local full-stack

```bash
cp .env.example .env          # add FRED_API_KEY
docker compose up --build
# API:      http://localhost:8000
# Frontend: http://localhost:3000
```

The compose stack runs the API (with live scheduler) and the React frontend as separate services. The `./data` directory is bind-mounted so committed model artifacts are available inside the container.

---

## Deploy: Vercel

1. Fork this repo to your GitHub account
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your fork
3. Configure the project:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Set environment variable:
   - `VITE_API_URL` → your Render backend URL (e.g. `https://regime-radar-api.onrender.com`)
5. Deploy. Subsequent pushes to `main` auto-deploy.

---

## Deploy: Render

1. Fork this repo to your GitHub account
2. Go to [render.com](https://render.com) → **New Web Service** → connect your fork
3. Render will detect `render.yaml` automatically. Confirm the service settings.
4. Set environment variables in the Render dashboard:
   - `FRED_API_KEY` — required for live data refresh
   - `CORS_ORIGIN` — your Vercel frontend URL (e.g. `https://regime-radar.vercel.app`)
   - `FINNHUB_API_KEY` — optional; leave blank to run in demo-fallback mode
5. Deploy. Subsequent pushes to `main` auto-deploy.

**Cold-start note:** On Render free tier, the service spins down after ~15 minutes of inactivity. First request after inactivity takes 15–30 seconds. During this time the frontend shows a loading state.

**Startup behavior:** On every cold boot, the API runs a startup warmup:
1. Attempts a live refresh from yfinance + FRED. If successful → **LIVE** mode.
2. If live refresh fails → loads committed snapshots from `data/snapshots/` → **DEMO** mode.
3. The background scheduler continues attempting live refreshes every 5 minutes during market hours.

---

## Repo structure

```
regime-radar/
├── src/
│   ├── api/                  FastAPI app, routes, schemas, state machine
│   ├── data/                 Data fetchers (yfinance, FRED, Finnhub)
│   ├── features/             Feature engineering pipeline
│   ├── labeling/             Regime, transition, and trend label builders
│   ├── models/               XGBoost training, prediction, model registry
│   ├── evaluation/           Walk-forward metrics, calibration, event replay
│   └── utils/                Config, logging, paths, calendar utilities
├── frontend/                 React/TypeScript frontend (Vite + Tailwind)
│   ├── src/
│   │   ├── api/              API client (fetch wrapper)
│   │   ├── components/       Shared UI components and charts
│   │   ├── hooks/            Data-fetching hooks
│   │   ├── pages/            Page components (Current State, History, etc.)
│   │   └── types/            TypeScript API types
│   └── vercel.json           SPA routing rewrite for Vercel
├── data/
│   ├── models/               Committed XGBoost artifacts (model.joblib + meta.json)
│   └── snapshots/            Committed parquet snapshots (panel, spy, vix, emv)
├── configs/                  YAML config files (app, model, features, labels)
├── scripts/                  bootstrap_data.py — full data fetch + model training
├── tests/                    pytest test suite
├── Dockerfile.api            Docker image for FastAPI backend
├── docker-compose.yml        Local full-stack (api + frontend)
├── render.yaml               Render deployment manifest
├── requirements.txt          Python dependencies
├── MODELS.md                 Committed artifact documentation
└── README.md                 This file
```

---

## Future improvements

- **Multi-asset extension:** apply the regime framework to additional ETFs, sector indices, or bond markets
- **Intraday granularity:** incorporate hourly or 15-minute OHLCV for finer-grained volatility features
- **Alternative macro features:** credit spreads, yield curve slope, put/call ratios
- **Online learning:** incremental model updates as new data arrives
- **Alert delivery:** webhook, email, or Slack notifications when transition risk exceeds a threshold
- **Backtesting framework:** structured replay environment for evaluating hypothetical monitoring strategies

---

*RegimeRadar is a portfolio and educational project. It is not financial advice.*
```

- [ ] **Step 2: Verify README renders well**

```bash
# Preview in terminal (optional)
wc -l README.md
# Should be ~350–400 lines
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: full public README — architecture, ML methodology, deployment guide"
```

---

### Task 17: Final verification

- [ ] **Step 1: Run full test suite**

```bash
python -m pytest tests/ -v
```

Expected: all pass. Note any failures and investigate.

- [ ] **Step 2: Verify git status is clean**

```bash
git status
```

Expected: nothing to commit, working tree clean. If untracked files remain, decide whether to gitignore them or commit them.

- [ ] **Step 3: Verify no secrets in tracked files**

```bash
git grep -i "api_key\|secret\|password\|token" -- '*.py' '*.ts' '*.tsx' '*.yaml' '*.json' | grep -v ".example\|MODELS.md\|README.md\|test_\|conftest\|render.yaml"
```

Expected: no hits containing actual key values (variable names like `FRED_API_KEY=` in example files are fine).

- [ ] **Step 4: Verify `data/models/` and `data/snapshots/` are tracked**

```bash
git ls-files data/models/ data/snapshots/ | head -20
```

Expected: lists the `.joblib` and `.parquet` files.

- [ ] **Step 5: Verify `data/app.db` is not tracked**

```bash
git ls-files data/app.db
```

Expected: no output.

- [ ] **Step 6: Final commit summary**

```bash
git log --oneline -15
```

Review the commit history. Ensure it tells a clean story.

---

## Deployment checklist (manual steps after merging)

These steps happen outside the repo and are not automated:

- [ ] Create Vercel project: Root Directory = `frontend`, env var `VITE_API_URL` = Render URL
- [ ] Create Render web service from `render.yaml`: set `FRED_API_KEY`, `CORS_ORIGIN`, optionally `FINNHUB_API_KEY`
- [ ] Push `main` to GitHub — triggers both deploys
- [ ] Visit the Vercel URL — verify LIVE/DEMO badge appears, Current State loads
- [ ] Hit the Render `/health` endpoint directly — verify `"status": "ok"` and `"mode"` field
- [ ] (Optional) Test cold-start: wait 20 minutes, reload the frontend, observe cold-start delay
