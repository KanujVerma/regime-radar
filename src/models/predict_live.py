"""Live inference: load trained artifacts and score the latest feature row."""
from __future__ import annotations
import pandas as pd
from src.models.registry import load_artifact, artifact_exists, load_metadata
from src.evaluation.calibration import apply_calibrator
from src.evaluation.shap_utils import get_shap_explanation
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
        dict with keys: regime, transition_risk, regime_history (last 5 labels),
        top_drivers (top risk-raising SHAP contributors for the latest row)
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

    latest_probs = regime_probs[-1]
    # Use raw-probability argmax so the regime label is always consistent with
    # the displayed confidence percentages. smooth_live introduces a 2-day lag
    # that causes the label to contradict the probabilities (e.g. "elevated"
    # while showing 78% calm confidence).
    latest_regime = REGIME_NAMES[int(latest_probs.argmax())]
    latest_risk = float(transition_cal[-1])

    # Compute per-day SHAP for the latest row using the same get_shap_explanation
    # path as /model-drivers, so both endpoints reflect the same signal source.
    # Only positive (risk-raising) contributors are returned; the UI labels them
    # accordingly and does not imply they are the full driver picture.
    top_drivers: list[dict] = []
    try:
        meta = load_metadata("xgb_transition")
        feature_names = meta.get("feature_names") or list(features.columns)
        shap_map = get_shap_explanation(transition_model, features, feature_names)
        # Sort by signed SHAP descending; keep only positive (risk-raising) contributors
        risk_raising = sorted(
            ((f, v) for f, v in shap_map.items() if v > 0),
            key=lambda x: x[1],
            reverse=True,
        )
        top_drivers = [
            {"feature": f, "importance": round(abs(v), 6)}
            for f, v in risk_raising[:5]
        ]
    except Exception as e:
        _logger.warning("SHAP top_drivers computation failed: %s", e)

    return {
        "regime": latest_regime,
        "transition_risk": round(latest_risk, 4),
        "transition_risk_raw": round(float(transition_raw[-1]), 4),
        "regime_history": regime_smoothed.iloc[-5:].tolist(),
        "prob_calm": round(float(latest_probs[0]), 4),
        "prob_elevated": round(float(latest_probs[1]), 4),
        "prob_turbulent": round(float(latest_probs[2]), 4),
        "top_drivers": top_drivers,
    }
