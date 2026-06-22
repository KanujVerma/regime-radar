# scripts/build_raw_score_reference.py
"""Build the version-stamped raw-score reference for stress percentiles.

SEMANTICS (precise): the stress percentile is a statement ONLY about the serving
model's own historical output distribution — "today's raw score is higher than X%
of the raw scores THIS model has produced over history." It is NOT a market-outcome
probability and NOT a general 'severity truth'; it is the model talking about how
loud its own alarm is relative to its own past. We therefore score the full
historical feature matrix with the SAME (final) model that serves live readings and
persist the sorted raw vector, stamped with that model's version. In-sample optimism
is harmless: the percentile is a rank, invariant to monotonic inflation. (The
reliability TABLE stays OOF — different job, different reference.)
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

REFERENCE_PATH = Path(__file__).resolve().parent.parent / "data" / "reliability" / "raw_score_reference.json"


def build_reference(model, features: pd.DataFrame, feature_names: list[str],
                    model_version: str) -> dict:
    """Score `features` with `model` (raw), return a sorted-reference dict."""
    X = features[feature_names].fillna(0)
    raw = model.predict_proba(X)[:, 1].astype(float)
    raw_sorted = sorted(float(v) for v in raw)
    return {
        "model_version": model_version,
        "n": len(raw_sorted),
        "raw_scores_sorted": raw_sorted,
    }


def main() -> None:
    from src.models.registry import load_artifact, load_metadata, artifact_exists
    from src.features.build_market_features import build_features
    from src.labeling.build_regime_labels import build_regime_labels
    from src.utils.paths import PROCESSED_DIR

    if not artifact_exists("xgb_transition"):
        raise RuntimeError("xgb_transition artifact not found. Run bootstrap_data.py first.")

    model = load_artifact("xgb_transition")
    meta = load_metadata("xgb_transition")
    feature_names = meta.get("feature_names")
    model_version = meta.get("saved_at", "unknown")
    if not feature_names:
        raise RuntimeError("xgb_transition metadata missing 'feature_names'.")

    panel = pd.read_parquet(Path(PROCESSED_DIR) / "panel.parquet")
    regime = build_regime_labels(panel)
    features = build_features(panel, regime_series=regime).dropna()

    ref = build_reference(model, features, feature_names, model_version)
    REFERENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    REFERENCE_PATH.write_text(json.dumps(ref))
    print(f"Wrote {REFERENCE_PATH}: n={ref['n']} version={ref['model_version']}")


if __name__ == "__main__":
    main()
