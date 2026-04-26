# RegimeRadar — Public Deployment Design Spec

**Date:** 2026-04-26  
**Status:** Approved (rev 2 — post spec-review fixes)  
**Approach:** Lean & Ship (Approach A)

---

## Goal

Take RegimeRadar from a local portfolio project to a clean, polished public GitHub repository with:

- React/TypeScript frontend deployed on Vercel
- FastAPI backend deployed on Render
- No Supabase (adds no real value at this scope)
- One clear architecture story (no Streamlit, no HuggingFace Spaces)
- Graceful fallback when Render cold-starts without live API access
- Polished, recruiter-ready README

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
→ Render URL  │  SQLite: ephemeral, re-seeds    │
              └────────────────────────────────┘
                          │
              FRED_API_KEY → live reseed on boot
              Fallback: data/snapshots/ → data/processed/
```

**No Supabase.** SQLite is ephemeral on Render free tier; it re-seeds from model artifacts and either live-fetched or snapshot parquets on every cold boot (~15–30s). This is acceptable for a portfolio project.

---

## 1. Repo Cleanup

### Remove entirely
- `spaces/` — HuggingFace Spaces Streamlit shim
- `src/dashboard/` — Streamlit dashboard pages
- `Dockerfile.dashboard` — Streamlit Docker image

### Keep (updated)
- `docker-compose.yml` — simplified to `api` + `frontend` services only; retains local full-stack convenience. Switch from named volume to bind mount (`./data:/app/data`) so the container sees committed model artifacts and snapshots directly.
- `Dockerfile.api` — updated to remove Streamlit deps, fix `$PORT` handling, add healthcheck
- `frontend/Dockerfile` — retained for local compose use

### `.gitignore` additions
```
data/app.db
data/app.db-shm
data/app.db-wal
data/processed/
.claude-flow/
.superpowers/
frontend/playwright-report/
frontend/test-results/
frontend/src/.claude-flow/
```

### `.gitignore` removals
Remove the blanket exclusions for model artifacts so they are committed. `data/processed/` is replaced by `data/snapshots/` (see Section 2), so the processed exclusion stays:
```
# Remove these lines (models are now committed):
data/models/*
!data/models/.gitkeep

# Keep this exclusion (processed/ is still ephemeral/live-fetched):
# data/processed/ remains gitignored
```

### `requirements.txt` cleanup
- Remove `streamlit>=1.35` (Streamlit is removed entirely)
- Remove `plotly>=5.20` — confirmed not imported in any FastAPI serving path (`src/api/`, `src/models/`, `src/evaluation/`); it was a dashboard-only dependency

---

## 2. Committed Artifacts — Directory Strategy

### Critical: cache-first logic interaction

The fetch functions (`fetch_spy_history`, `fetch_vix_history`, `fetch_emv`) are **cache-first**: if a file exists at `cache_path`, they return it immediately without making a network call. This means that if committed parquets lived in `data/processed/`, the "live refresh" on cold boot would silently use the committed cache and never call yfinance or FRED — defeating the live-mode design.

### Solution: `data/snapshots/` for committed artifacts

Committed parquets go in `data/snapshots/` (new directory, committed to git). The `data/processed/` directory remains gitignored and is populated only by live fetches at runtime.

On Render (ephemeral filesystem):
- `data/models/` — present (committed, copied into container by Docker)
- `data/snapshots/` — present (committed, copied into container by Docker)
- `data/processed/` — **empty** on fresh cold boot → fetchers hit live APIs

### Committed artifacts

```
data/
  models/
    xgb_regime/         model.joblib + meta.json   (~1.8MB)
    xgb_transition/     model.joblib + meta.json   (~712KB)
    xgb_transition_calibrator/  model.joblib + meta.json  (~8KB)
    oof_predictions/    (OOF eval artifacts)         (~416KB)
  snapshots/            (new dir, committed)
    panel.parquet        (~460KB)
    spy.parquet          (~428KB)
    vix.parquet          (~108KB)
    emv.parquet          (~12KB)
```

Total committed artifact size: ~4MB. Acceptable for a portfolio project.

### `MODELS.md` documents
- What artifacts are committed and where
- How to regenerate with `bootstrap_data.py` + copy to `data/snapshots/`
- That committed artifacts represent the public release snapshot

---

## 3. Graceful Fallback on Render Cold Boot

### Critical: `mode` logic fix

Currently in `_do_refresh()` (state.py line 176–182), `mode` is set to `"live"` only when the Finnhub price-card fetch succeeds — meaning a successful yfinance+FRED refresh with no `FINNHUB_API_KEY` still produces `mode = "demo"`. This is wrong.

**Fix:** `mode` is set at the top of `_do_refresh()` to `"live"` unconditionally — the data always comes from yfinance+FRED, which is what makes it live. Finnhub is optional price-card enrichment only and has no bearing on the mode badge.

```python
# In _do_refresh(), replace the mode block:
mode = "live"   # yfinance+FRED data is always live; Finnhub is optional enrichment only
try:
    provider = get_provider()
    if provider.mode == "live":
        q = provider.latest_quote("SPY")
        price_card_price = q.price
except Exception as e:
    _logger.warning("Finnhub price-card fetch failed: %s", e)
```

### Critical: startup warmup — try/except and market-hours bypass

`force_refresh()` currently has no error handling. The startup warmup must:
1. Call `_do_refresh()` directly (bypasses the `is_market_open()` gate in the scheduled job — important because Render may cold-boot outside market hours)
2. Wrap in try/except

### Startup sequence (updated `main.py` + `AppState`)

On application startup (`startup()` handler in `main.py`):

```
1. Try:
     _do_refresh()          # calls yfinance+FRED, writes live state to SQLite
     → If succeeds: mode = "live", log success
   Except Exception:
     _load_from_snapshots() # copies data/snapshots/ → data/processed/, runs inference
     → mode = "demo", log warning

2. start_scheduler()        # periodic refresh during market hours, independently
```

The APScheduler background job continues as-is, refreshing during market hours. If a live refresh succeeds after startup, it overwrites the demo state and mode flips to `"live"`.

### New `AppState` method: `_load_from_snapshots()`

Add to `src/api/state.py`:
1. Copy all parquets from `data/snapshots/` to `data/processed/` (shutil.copy2 for each `.parquet`)
2. Call `_do_refresh()` — the fetchers are cache-first and will immediately read the just-copied parquets from `data/processed/`, so no pipeline duplication is needed
3. After `_do_refresh()` writes state, **explicitly overwrite `mode` to `"demo"`** in the most recent SQLite row — because `_do_refresh()` will now set `mode = "live"` unconditionally, which is wrong for the snapshot path

```python
def _load_from_snapshots(self) -> None:
    import shutil
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    for src in SNAPSHOTS_DIR.glob("*.parquet"):
        shutil.copy2(src, PROCESSED_DIR / src.name)
    _logger.info("Copied snapshots to processed dir, running inference from committed data")
    self._do_refresh()
    # Force mode = "demo": data came from committed snapshots, not live APIs
    with self._connect() as conn:
        conn.execute(
            "UPDATE live_state SET mode='demo' WHERE id=(SELECT MAX(id) FROM live_state)"
        )
    _logger.info("Snapshot fallback complete — mode forced to demo")
```

This method is called only when the startup live refresh fails. It does not duplicate the inference pipeline.

The `data/snapshots/` path should be added as `SNAPSHOTS_DIR` constant in `src/utils/paths.py` alongside the existing `PROCESSED_DIR` and `MODELS_DIR`.

### API schema: no changes needed

The `/health` and `/current-state` endpoints already return `mode` and `as_of_ts`. No new fields required.

### Frontend behavior updates

When `mode === "demo"`:
- Show **DEMO** badge (already implemented)
- Surface `as_of_ts` timestamp with label "as of [date]"
- Add one-line note: "Using cached fallback state — live refresh unavailable"

When `mode === "live"`:
- Show **LIVE** badge
- Surface `as_of_ts` as "as of [timestamp]"

---

## 4. Deployment Config Files

### `render.yaml` (repo root)
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

`healthCheckPath: /health` uses Render's routing-level health check (distinct from the Docker `HEALTHCHECK`). Both should be set.

### `Dockerfile.api` — `$PORT` fix

Render injects `$PORT` as an environment variable. Docker's exec form (JSON array) does **not** expand shell variables. Use shell form:

```dockerfile
CMD ["sh", "-c", "uvicorn src.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

`${PORT:-8000}` falls back to port 8000 for local use (where `$PORT` is not set).

Full updated `Dockerfile.api`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Python-based healthcheck: python:3.11-slim does not include curl.
# Uses stdlib urllib — no extra deps. Hardcodes port 8000 for local compose use;
# Render uses healthCheckPath from render.yaml instead of this HEALTHCHECK.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["sh", "-c", "uvicorn src.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

### `vercel.json` (in `frontend/`)
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Note: Vercel project must be configured with **Root Directory: `frontend`** in the Vercel dashboard. With that setting, `frontend/vercel.json` is the effective project root config.

### `docker-compose.yml` (simplified, local dev only)
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
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
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

Uses a **bind mount** (`./data:/app/data`) instead of the old named volume. This lets the container read committed model artifacts and snapshots directly from the repo. `data/app.db*` is gitignored, so local SQLite state is never committed.

---

## 5. Environment Config

### Backend `.env.example` (updated)
```bash
# Required for live data refresh (yfinance + FRED)
FRED_API_KEY=

# Optional: enables live price-card overlay on Current State page only.
# Not required for ML inference, regime classification, or historical views.
FINNHUB_API_KEY=

# Set in production to your Vercel frontend URL (no trailing slash).
# Example: https://regime-radar.vercel.app
CORS_ORIGIN=

# Application settings
APP_ENV=development          # development | production
APP_LOG_LEVEL=INFO           # INFO | DEBUG
```

`APP_API_URL` is removed — it was used by the Streamlit dashboard service, which is being deleted.

### Frontend `.env.example` (new, in `frontend/`)
```bash
# URL of the FastAPI backend.
# Local dev:    http://localhost:8000
# Production:   https://<your-render-service>.onrender.com
VITE_API_URL=http://localhost:8000
```

### Render env vars
| Variable | Required | Description |
|---|---|---|
| `FRED_API_KEY` | **Yes** | From api.stlouisfed.org/api/key — required for live regime refresh |
| `CORS_ORIGIN` | **Yes** | Your Vercel URL, e.g. `https://regime-radar.vercel.app` |
| `APP_ENV` | No | Set to `production` |
| `FINNHUB_API_KEY` | No | Optional price-card overlay on Current State page only |

### Vercel env vars
| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<your-render-service>.onrender.com` |

---

## 6. README Structure

Sections (in order):

1. Title + one-line positioning
2. What RegimeRadar is
3. Why it exists
4. Demo notes *(new — honest about cold starts)*
5. Product overview (pages / features)
6. Screenshots / demo section placeholders
7. Why this architecture *(new)*
8. Architecture overview (diagram)
9. Frontend stack
10. Backend stack
11. Data sources
12. Feature design (feature table)
13. Regime labeling methodology
14. Transition-risk target definition
15. Modeling (two models + baselines)
16. Evaluation methodology
17. Calibration / threshold tradeoff
18. Scenario Explorer explanation
19. Event Replay explanation
20. Limitations
21. Local development setup
22. Environment variables
23. Run backend locally
24. Run frontend locally
25. Docker local full-stack
26. Deploy: Vercel *(includes: set Root Directory to `frontend`)*
27. Deploy: Render *(includes: render.yaml, env vars, cold-start notes)*
28. Repo structure
29. Future improvements

### "Why this architecture" (key points)
FastAPI keeps ML inference co-located with the Python data/model stack — no rewriting logic across language boundaries. Vercel gives zero-config static frontend hosting with a global CDN. Render hosts the FastAPI service on a free-tier web service with automatic deploys on push to main. No Supabase — SQLite re-seeds from committed artifacts on every cold boot, which is sufficient for a demo portfolio project.

### "Demo notes" (honest, for recruiters/visitors)
- Frontend on Vercel — fast, globally cached, always available
- Backend on Render free tier — **may experience a 15–30 second cold start** after inactivity (Render spins down free services after ~15 minutes of no traffic)
- On cold start, the backend attempts a **live refresh** from yfinance + FRED; if successful, the dashboard shows current market conditions (LIVE badge)
- If live refresh fails or APIs are unavailable, the backend falls back to committed model artifacts and data snapshots; the dashboard shows the last committed snapshot with a **DEMO** badge and the data's as-of date
- Finnhub is optional and only affects the live price-card overlay on the Current State page — all regime/risk logic works without it

---

## 7. Files Affected Summary

| File | Action |
|---|---|
| `.gitignore` | Add `data/app.db*`, `data/processed/`, dev-tool dirs; remove `data/models/` exclusions |
| `requirements.txt` | Remove `streamlit`; remove `plotly` (confirmed dashboard-only) |
| `Dockerfile.api` | Remove Streamlit, fix `$PORT` (shell form), add `HEALTHCHECK` |
| `Dockerfile.dashboard` | **Delete** |
| `docker-compose.yml` | Remove `dashboard` service; switch from named volume to bind mount |
| `src/api/main.py` | Add startup warmup: try live refresh, except → load snapshots |
| `src/api/state.py` | Fix `mode` logic (tie to yfinance+FRED success, not Finnhub); add `_load_from_snapshots()` |
| `src/utils/paths.py` | Add `SNAPSHOTS_DIR` constant |
| `spaces/` | **Delete** |
| `src/dashboard/` | **Delete** |
| `render.yaml` | **Create** |
| `frontend/vercel.json` | **Create** |
| `frontend/.env.example` | **Create** |
| `.env.example` | Update: add `CORS_ORIGIN`, remove `APP_API_URL`, cleaner comments |
| `README.md` | Full rewrite |
| `MODELS.md` | **Create** — committed artifact policy |
| `data/models/**` | **Commit** (relax gitignore) |
| `data/snapshots/` | **Create + Commit** (copy current `data/processed/` contents here) |

---

## 8. Out of Scope

- CI/CD (GitHub Actions)
- Supabase / external database
- Custom domain setup
- Auth / login
- Multi-asset extension
- Intraday data
