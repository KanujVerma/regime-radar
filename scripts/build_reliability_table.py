"""Precompute transition-risk empirical reliability tables.

Two modes:
  --mode production (default)
    Scores the historical feature matrix with the final production model +
    calibrator. Uses the same rows and realized outcomes as the OOF artifact
    but scores them with the live model family. Output: transition_reliability.json
    Source field: "production_insample"
    NOTE: scores are in-sample for the final model — upper-tail bins are
    inflated vs true OOF, but grounded in real realized outcomes.

  --mode oof
    Existing behavior: loads oof_predictions artifact (fold-model calibrated
    scores paired with realized outcomes). Output: transition_reliability_oof.json
    Source field: "oof"

Re-run both modes whenever OOF predictions are regenerated (e.g. after retrain).
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd

from src.models.registry import load_artifact, artifact_exists

# OOF bin edges: concentrated resolution in 0-30% where OOF scores live
OOF_BIN_EDGES = [0.0, 0.02, 0.05, 0.10, 0.15, 0.20, 0.30, 0.50, 1.0]

# Production bin edges: finer resolution in 0.30-0.80 where live scores concentrate
PRODUCTION_BIN_EDGES = [0.0, 0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 1.0]

MIN_N = 30
PRODUCTION_OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "reliability" / "transition_reliability.json"
OOF_OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "reliability" / "transition_reliability_oof.json"


def _build_bins(p: np.ndarray, y: np.ndarray, edges: list[float]) -> tuple[list[dict], float]:
    """Bin (scores, labels) pairs and compute empirical rates. Returns (bins, base_rate)."""
    base_rate = float(np.mean(y))
    bins = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (p >= lo) & (p < hi)
        n = int(mask.sum())
        empirical_rate = float(np.mean(y[mask])) if n > 0 else 0.0
        bins.append({
            "p_low": lo,
            "p_high": hi,
            "p_mid": round((lo + hi) / 2, 4),
            "empirical_rate": round(empirical_rate, 4),
            "n": n,
        })
    return bins, base_rate


def _max_evaluated_p(bins: list[dict]) -> float:
    max_p = 0.0
    for b in bins:
        if b["n"] >= MIN_N:
            max_p = b["p_high"]
    return max_p


def build_oof_table() -> dict:
    if not artifact_exists("oof_predictions"):
        raise RuntimeError("oof_predictions artifact not found. Run scripts/bootstrap_data.py first.")

    oof_df = load_artifact("oof_predictions")
    required = {"transition_risk", "transition_actual"}
    missing = required - set(oof_df.columns)
    if missing:
        raise ValueError(f"OOF DataFrame missing columns: {missing}")

    p = oof_df["transition_risk"].astype(float).values
    y = oof_df["transition_actual"].astype(int).values

    bins, base_rate = _build_bins(p, y, OOF_BIN_EDGES)
    return {
        "bins": bins,
        "base_rate": round(base_rate, 4),
        "max_evaluated_p": _max_evaluated_p(bins),
        "source": "oof",
    }


def build_production_table() -> dict:
    """Score the historical feature matrix with the final production model + calibrator.

    Uses OOF artifact dates and transition_actual labels so outcomes are identical
    to the OOF table — only the scoring system differs (final model vs fold models).
    """
    if not artifact_exists("oof_predictions"):
        raise RuntimeError("oof_predictions artifact not found.")
    if not artifact_exists("xgb_transition"):
        raise RuntimeError("xgb_transition artifact not found.")
    if not artifact_exists("xgb_transition_calibrator"):
        raise RuntimeError("xgb_transition_calibrator artifact not found.")

    from src.features.build_market_features import build_features
    from src.labeling.build_regime_labels import build_regime_labels
    from src.evaluation.calibration import apply_calibrator
    from src.models.registry import load_metadata
    from src.utils.paths import PROCESSED_DIR

    oof_df = load_artifact("oof_predictions")
    transition_model = load_artifact("xgb_transition")
    calibrator = load_artifact("xgb_transition_calibrator")

    # Load expected feature column order from model metadata
    meta = load_metadata("xgb_transition")
    expected_features = meta.get("feature_names")
    if not expected_features:
        raise RuntimeError(
            "xgb_transition metadata has no 'feature_names'. "
            "Re-run training to regenerate the artifact with feature metadata."
        )

    panel = pd.read_parquet(PROCESSED_DIR / "panel.parquet")
    regime = build_regime_labels(panel)
    features = build_features(panel, regime_series=regime).dropna()

    # Ensure OOF index has no duplicate dates before label alignment
    assert oof_df.index.is_unique, "oof_predictions index has duplicate dates — cannot safely align labels"

    # Restrict to dates with known realized outcomes (OOF dates only)
    features_oof = features[features.index.isin(oof_df.index)]

    # Warn if feature NaNs silently dropped OOF rows
    n_dropped = len(oof_df) - len(features_oof)
    if n_dropped > 0:
        import warnings
        warnings.warn(
            f"{n_dropped} OOF dates dropped due to feature NaNs — "
            f"production table built on {len(features_oof)}/{len(oof_df)} rows."
        )

    labels_oof = oof_df.loc[features_oof.index, "transition_actual"].astype(int)

    # Feature column alignment guard: fail loudly on mismatch
    missing_cols = set(expected_features) - set(features_oof.columns)
    extra_cols = set(features_oof.columns) - set(expected_features)
    if missing_cols:
        raise ValueError(
            f"Feature matrix is missing columns expected by the model: {sorted(missing_cols)}"
        )
    if extra_cols:
        raise ValueError(
            f"Feature matrix has unexpected columns not in model training set: {sorted(extra_cols)}"
        )
    # Reorder to exact training column order
    features_oof = features_oof[expected_features]

    raw = transition_model.predict_proba(features_oof)[:, 1]
    p = apply_calibrator(calibrator, raw)
    y = labels_oof.values

    bins, base_rate = _build_bins(p, y, PRODUCTION_BIN_EDGES)
    return {
        "bins": bins,
        "base_rate": round(base_rate, 4),
        "max_evaluated_p": _max_evaluated_p(bins),
        "source": "production_insample",
    }


def _print_table(table: dict) -> None:
    print(f"  source: {table['source']}")
    print(f"  base_rate: {table['base_rate']:.4f}")
    print(f"  max_evaluated_p: {table['max_evaluated_p']}")
    print(f"  bins:")
    for b in table["bins"]:
        bar = "#" * int(b["empirical_rate"] * 40)
        flag = "" if b["n"] >= MIN_N else " (sparse)"
        print(f"    [{b['p_low']:.2f}, {b['p_high']:.2f})  n={b['n']:4d}  rate={b['empirical_rate']:.3f}  {bar}{flag}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build reliability table")
    parser.add_argument(
        "--mode",
        choices=["oof", "production"],
        default="production",
        help="'production' scores with final model (default); 'oof' uses walk-forward fold scores",
    )
    args = parser.parse_args()

    if args.mode == "oof":
        table = build_oof_table()
        output_path = OOF_OUTPUT_PATH
    else:
        table = build_production_table()
        output_path = PRODUCTION_OUTPUT_PATH

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(table, f, indent=2)

    print(f"Wrote {output_path}")
    _print_table(table)
