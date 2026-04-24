"""Shared application state and near-live refresh scheduler.

The scheduler performs daily yfinance+FRED data refresh and re-scores
features using already-trained artifacts. It does NOT retrain the model.
Finnhub (if configured) provides an optional price-card overlay only.
"""
from __future__ import annotations
import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import pandas as pd
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from src.utils.config import get_config, get_app_settings
from src.utils.logging import get_logger
from src.utils.calendar import is_market_open
from src.utils.paths import PROCESSED_DIR

_logger = get_logger(__name__)


class AppState:
    """Holds live inference state, scheduler, and DB connection."""

    def __init__(self, db_path: str | Path | None = None):
        cfg = get_config("app")
        self.db_path = Path(db_path or cfg["paths"]["data_db"])
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
        self._scheduler: BackgroundScheduler | None = None

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS live_state (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    as_of_ts TEXT NOT NULL,
                    regime TEXT,
                    transition_risk REAL,
                    trend TEXT,
                    vix_level REAL,
                    vix_chg_1d REAL,
                    top_drivers TEXT,
                    mode TEXT,
                    price_card_price REAL
                )
            """)
            conn.commit()

    def write_state(self, state: dict) -> None:
        """Write latest inference result to SQLite."""
        with self._connect() as conn:
            conn.execute("""
                INSERT INTO live_state
                (as_of_ts, regime, transition_risk, trend, vix_level, vix_chg_1d, top_drivers, mode, price_card_price)
                VALUES (?,?,?,?,?,?,?,?,?)
            """, (
                state.get("as_of_ts"),
                state.get("regime"),
                state.get("transition_risk"),
                state.get("trend"),
                state.get("vix_level"),
                state.get("vix_chg_1d"),
                json.dumps(state.get("top_drivers", [])),
                state.get("mode"),
                state.get("price_card_price"),
            ))
            conn.commit()

    def read_latest_state(self) -> dict | None:
        """Read the most recent inference result from SQLite."""
        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM live_state ORDER BY id DESC LIMIT 1"
            ).fetchone()
        if row is None:
            return None
        d = dict(row)
        if isinstance(d.get("top_drivers"), str):
            d["top_drivers"] = json.loads(d["top_drivers"])
        return d

    def read_prior_state(self) -> dict | None:
        """Return the second-most-recent state row, or None if fewer than 2 rows exist."""
        with self._connect() as conn:
            conn.row_factory = sqlite3.Row  # required — without this fetchall() returns tuples
            cur = conn.execute(
                "SELECT * FROM live_state ORDER BY id DESC LIMIT 2"
            )
            rows = cur.fetchall()
        if len(rows) < 2:
            return None
        row = dict(rows[1])
        if row.get("top_drivers"):
            import json
            row["top_drivers"] = json.loads(row["top_drivers"])
        return row

    def start_scheduler(self) -> None:
        cfg = get_config("app")["scheduler"]
        if not cfg.get("enabled", True):
            _logger.info("Scheduler disabled in config")
            return
        interval = cfg.get("refresh_interval_minutes", 5)
        self._scheduler = BackgroundScheduler(timezone="UTC")
        self._scheduler.add_job(
            self._refresh_job,
            trigger=IntervalTrigger(minutes=interval),
            id="data_refresh",
            replace_existing=True,
        )
        self._scheduler.start()
        _logger.info("Scheduler started: refresh every %d minutes", interval)

    def stop_scheduler(self) -> None:
        if self._scheduler and self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    def _refresh_job(self) -> None:
        """Scheduled job: refresh yfinance+FRED data and re-score."""
        if not is_market_open():
            _logger.debug("Market closed — skipping refresh")
            return
        _logger.info("Running scheduled data refresh")
        try:
            self._do_refresh()
        except Exception as e:
            _logger.error("Refresh job failed: %s", e)

    def _do_refresh(self) -> None:
        """Core refresh: fetch latest daily data from yfinance+FRED, re-score."""
        from src.data.fetch_yfinance import fetch_spy_history
        from src.data.fetch_vix import fetch_vix_history
        from src.data.fetch_fred import fetch_emv
        from src.data.merge_sources import merge_market_panel
        from src.features.build_market_features import build_features
        from src.labeling.build_regime_labels import build_regime_labels
        from src.labeling.build_trend_labels import build_trend_labels
        from src.models.predict_live import predict_current_state
        from src.data.providers.factory import get_provider
        from src.utils.paths import PROCESSED_DIR

        processed = Path(PROCESSED_DIR)

        # Fetch fresh data (yfinance+FRED are the authoritative sources)
        spy = fetch_spy_history(start="1993-01-01", cache_path=processed / "spy.parquet")
        vix = fetch_vix_history(start="1990-01-01", cache_path=processed / "vix.parquet")
        emv = fetch_emv(start="1985-01-01", cache_path=processed / "emv.parquet")

        panel = merge_market_panel(spy, vix, emv)
        regime = build_regime_labels(panel)
        trend = build_trend_labels(panel)
        features = build_features(panel, regime_series=regime)
        features = features.dropna()

        result = predict_current_state(features)
        latest_row = panel.iloc[-1]
        latest_features = features.iloc[-1]
        trend_latest = trend.iloc[-1] if trend is not None else "neutral"

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

        state = {
            "as_of_ts": datetime.now(timezone.utc).isoformat(),
            "regime": result["regime"],
            "transition_risk": result["transition_risk"],
            "trend": trend_latest,
            "vix_level": float(latest_row.get("vixcls", 0)) if "vixcls" in latest_row.index else None,
            "vix_chg_1d": float(latest_features.get("vix_chg_1d", 0)) if "vix_chg_1d" in latest_features.index else None,
            "top_drivers": [],  # populated by model_drivers endpoint
            "mode": mode,
            "price_card_price": price_card_price,
        }
        self.write_state(state)
        _logger.info("State refreshed: regime=%s risk=%.3f mode=%s",
                     state["regime"], state["transition_risk"], state["mode"])

    def force_refresh(self) -> None:
        """Manually trigger a refresh (used by /refresh-data endpoint)."""
        self._do_refresh()
