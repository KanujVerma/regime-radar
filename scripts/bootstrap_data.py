"""One-shot bootstrap: fetch data → build features → train models."""
from __future__ import annotations
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.utils.paths import PROCESSED_DIR, FIXTURES_DIR
from src.utils.logging import get_logger

_logger = get_logger("bootstrap")


def main():
    from pathlib import Path
    from src.data.fetch_yfinance import fetch_spy_history
    from src.data.fetch_fred import fetch_emv
    from src.data.fetch_vix import fetch_vix_history
    from src.data.merge_sources import merge_market_panel, save_panel
    from src.features.build_market_features import build_features
    from src.labeling.build_regime_labels import build_regime_labels
    from src.labeling.build_transition_labels import build_transition_labels
    from src.labeling.build_trend_labels import build_trend_labels
    from src.models.train_regime_model import train_regime_model
    from src.models.train_transition_model import train_transition_model

    _logger.info("=== RegimeRadar Bootstrap ===")

    # 1. Fetch data (full available history)
    _logger.info("Fetching SPY history from 1993...")
    spy = fetch_spy_history(start="1993-01-01", cache_path=Path(PROCESSED_DIR) / "spy.parquet")

    _logger.info("Fetching VIX from FRED VIXCLS (from 1990)...")
    vix = fetch_vix_history(start="1990-01-01", cache_path=Path(PROCESSED_DIR) / "vix.parquet")

    _logger.info("Fetching EMVOVERALLEMV from FRED...")
    emv = fetch_emv(start="1985-01-01", cache_path=Path(PROCESSED_DIR) / "emv.parquet")

    # 2. Merge
    _logger.info("Merging panel...")
    panel = merge_market_panel(spy, vix, emv)
    save_panel(panel, Path(PROCESSED_DIR) / "panel.parquet")

    # 3. Labels
    _logger.info("Building regime labels...")
    regime = build_regime_labels(panel)

    _logger.info("Building transition labels...")
    transition = build_transition_labels(regime)

    _logger.info("Building trend labels...")
    trend = build_trend_labels(panel)

    # 4. Features
    _logger.info("Building features...")
    features = build_features(panel, regime_series=regime)

    # Align everything and drop NaN rows
    df = features.copy()
    df["regime"] = regime
    df["transition_up"] = transition
    df["trend"] = trend
    df = df.dropna(subset=list(features.columns) + ["regime", "transition_up"])
    feat_cols = list(features.columns)

    X = df[feat_cols]
    y_regime = df["regime"]
    y_transition = df["transition_up"]

    _logger.info("Training set: %d rows, %d features", len(X), len(feat_cols))

    # 5. Train
    _logger.info("Training regime model...")
    regime_summary = train_regime_model(X, y_regime)
    _logger.info("Regime model: macro_f1=%.3f", regime_summary["mean_macro_f1"])

    _logger.info("Training transition model...")
    trans_summary = train_transition_model(X, y_transition, regime_labels=y_regime)
    _logger.info("Transition model: roc_auc=%.3f pr_auc=%.3f",
                 trans_summary["mean_roc_auc"], trans_summary["mean_pr_auc"])

    _logger.info("=== Bootstrap complete ===")


if __name__ == "__main__":
    main()
