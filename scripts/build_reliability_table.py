"""Precompute the transition-risk empirical reliability table from OOF predictions.

Reads the committed oof_predictions artifact (7,812 rows of calibrated OOF scores
paired with realized 5-day transition outcomes) and bins them to produce:

  {
    "bins": [
      {"p_low": 0.0, "p_high": 0.02, "p_mid": 0.01, "empirical_rate": 0.012, "n": 820},
      ...
    ],
    "base_rate": 0.074,
    "max_evaluated_p": 0.30   # highest bin high-edge with n >= min_n
  }

This JSON is committed to data/reliability/ and served by the /reliability endpoint.
Re-run this script whenever OOF predictions are regenerated (e.g. after retrain).
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

# Allow running as a script from the repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from src.models.registry import load_artifact, artifact_exists

BIN_EDGES = [0.0, 0.02, 0.05, 0.10, 0.15, 0.20, 0.30, 0.50, 1.0]
MIN_N = 30  # minimum observations required for a bin to be considered "evaluated"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "reliability" / "transition_reliability.json"


def build_table() -> dict:
    if not artifact_exists("oof_predictions"):
        raise RuntimeError("oof_predictions artifact not found. Run bootstrap_data.py first.")

    oof_df = load_artifact("oof_predictions")

    required = {"transition_risk", "transition_actual"}
    missing = required - set(oof_df.columns)
    if missing:
        raise ValueError(f"OOF DataFrame missing columns: {missing}. Columns present: {list(oof_df.columns)}")

    p = oof_df["transition_risk"].astype(float).values
    y = oof_df["transition_actual"].astype(int).values

    base_rate = float(np.mean(y))

    bins = []
    for lo, hi in zip(BIN_EDGES[:-1], BIN_EDGES[1:]):
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

    # max_evaluated_p: highest bin high-edge that has enough observations to be meaningful
    max_evaluated_p = 0.0
    for b in bins:
        if b["n"] >= MIN_N:
            max_evaluated_p = b["p_high"]

    return {
        "bins": bins,
        "base_rate": round(base_rate, 4),
        "max_evaluated_p": max_evaluated_p,
    }


if __name__ == "__main__":
    table = build_table()

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(table, f, indent=2)

    print(f"Wrote {OUTPUT_PATH}")
    print(f"  base_rate: {table['base_rate']:.4f}")
    print(f"  max_evaluated_p: {table['max_evaluated_p']}")
    print(f"  bins:")
    for b in table["bins"]:
        bar = "#" * int(b["empirical_rate"] * 40)
        print(f"    [{b['p_low']:.2f}, {b['p_high']:.2f})  n={b['n']:4d}  rate={b['empirical_rate']:.3f}  {bar}")
