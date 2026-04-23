"""Live inference: load trained artifacts and score the latest feature row."""
from __future__ import annotations
import pandas as pd
from src.models.registry import load_artifact, artifact_exists
from src.evaluation.calibration import apply_calibrator
from src.labeling.build_regime_labels import smooth_live
from src.utils.logging import get_logger

_logger = get_logger(__name__)

REGIME_NAMES = {0: "calm", 1: "elevated", 2: "turbulent"}


def predict_current_state(
    features: pd.DataFrame,
    smoothing_days: int = 2,
) -> dict:
    """Score the latest row of a feature DataFrame.

    Args:
        features: Full feature DataFrame (all historical rows up to now).
                  Inference uses only the last row after computing smoothed regime.
        smoothing_days: n for smooth_live

    Returns:
        dict with keys: regime, transition_risk, regime_history (last 5 labels)
    """
    if not artifact_exists("xgb_regime") or not artifact_exists("xgb_transition"):
        raise RuntimeError(
            "Model artifacts not found. Run scripts/bootstrap_data.py first."
        )

    regime_model = load_artifact("xgb_regime")
    transition_model = load_artifact("xgb_transition")
    calibrator = load_artifact("xgb_transition_calibrator") if artifact_exists("xgb_transition_calibrator") else None

    # Score all rows (needed for smooth_live to have history)
    X = features.fillna(0)
    regime_probs = regime_model.predict_proba(X)
    regime_raw = pd.Series(
        [REGIME_NAMES[i] for i in regime_model.predict(X)],
        index=features.index,
    )
    regime_smoothed = smooth_live(regime_raw, n=smoothing_days)

    transition_raw = transition_model.predict_proba(X)[:, 1]
    if calibrator is not None:
        transition_cal = apply_calibrator(calibrator, transition_raw)
    else:
        transition_cal = transition_raw

    latest_regime = regime_smoothed.iloc[-1]
    latest_risk = float(transition_cal[-1])

    return {
        "regime": latest_regime,
        "transition_risk": round(latest_risk, 4),
        "regime_history": regime_smoothed.iloc[-5:].tolist(),
    }
