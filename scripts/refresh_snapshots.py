#!/usr/bin/env python3
"""Regenerate committed snapshot parquets from live yfinance + FRED data.

Run from repo root. Requires FRED_API_KEY in the environment.
"""
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.data.fetch_yfinance import fetch_spy_history
from src.data.fetch_vix import fetch_vix_history
from src.data.fetch_fred import fetch_emv
from src.data.merge_sources import merge_market_panel
from src.utils.paths import PROCESSED_DIR, SNAPSHOTS_DIR

PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

# Force fresh fetch by removing cached files from any previous run
for fname in ("spy.parquet", "vix.parquet", "emv.parquet"):
    p = PROCESSED_DIR / fname
    if p.exists():
        p.unlink()

print("Fetching SPY history...")
spy = fetch_spy_history(start="1993-01-01", cache_path=PROCESSED_DIR / "spy.parquet")
print(f"  SPY: {len(spy)} rows, last: {spy.index[-1].date()}")

print("Fetching VIX history...")
vix = fetch_vix_history(start="1990-01-01", cache_path=PROCESSED_DIR / "vix.parquet")
print(f"  VIX: {len(vix)} rows, last: {vix.index[-1].date()}")

print("Fetching EMV (FRED)...")
emv = fetch_emv(start="1985-01-01", cache_path=PROCESSED_DIR / "emv.parquet", fallback_path=SNAPSHOTS_DIR / "emv.parquet")
print(f"  EMV: {len(emv)} rows")

print("Merging panel...")
panel = merge_market_panel(spy, vix, emv)
panel.to_parquet(PROCESSED_DIR / "panel.parquet")
print(f"  Panel: {panel.shape}, last: {panel.index.max().date()}")

print("Syncing to snapshots/...")
for fname in ("spy.parquet", "vix.parquet", "emv.parquet", "panel.parquet"):
    shutil.copy2(PROCESSED_DIR / fname, SNAPSHOTS_DIR / fname)
    print(f"  copied {fname}")

print("Done.")
