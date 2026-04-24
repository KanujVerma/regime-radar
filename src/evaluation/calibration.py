"""Post-hoc probability calibration for the transition risk model."""
from __future__ import annotations
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression


class PlattWrapper:
    """Thin wrapper around LogisticRegression to expose a unified .predict() interface."""
    def __init__(self, model=None):
        self._inner = model

    def predict(self, scores):
        inner = getattr(self, '_inner', None)
        if inner is None:
            return np.array(scores, dtype=float)
        return inner.predict_proba(np.array(scores).reshape(-1, 1))[:, 1]


def fit_calibrator(y_true: np.ndarray, y_score: np.ndarray, method: str = "auto") -> object:
    """Fit a post-hoc calibrator on holdout predictions.

    Args:
        y_true: binary ground-truth labels
        y_score: uncalibrated predicted probabilities
        method: "isotonic", "platt", or "auto" (auto selects isotonic if n_pos >= 200, else platt)

    Returns:
        fitted calibrator with a .predict(scores) method
    """
    n_pos = int(y_true.sum())
    if method == "auto":
        method = "isotonic" if n_pos >= 200 else "platt"

    if method == "isotonic":
        cal = IsotonicRegression(out_of_bounds="clip")
        cal.fit(y_score, y_true)
        cal.predict = cal.predict  # already has predict
    else:  # platt
        cal = LogisticRegression(C=1.0, solver="lbfgs")
        cal.fit(y_score.reshape(-1, 1), y_true)
        cal = PlattWrapper(cal)

    return cal


def apply_calibrator(calibrator, y_score: np.ndarray) -> np.ndarray:
    """Apply fitted calibrator to scores."""
    return calibrator.predict(y_score)


def calibration_report(
    y_true: np.ndarray,
    y_score_raw: np.ndarray,
    y_score_cal: np.ndarray,
    n_bins: int = 10,
) -> dict:
    """Compute reliability curves and Brier/ECE scores for raw and calibrated predictions.

    Returns dict with keys:
        brier_raw, brier_calibrated, ece_raw, ece_calibrated,
        curve_raw (fraction_of_positives, mean_predicted),
        curve_calibrated (fraction_of_positives, mean_predicted)
    """
    def brier(yt, ys):
        return float(np.mean((ys - yt) ** 2))

    def ece(yt, ys, n_bins):
        bins = np.linspace(0, 1, n_bins + 1)
        total = len(yt)
        ece_val = 0.0
        for lo, hi in zip(bins[:-1], bins[1:]):
            mask = (ys >= lo) & (ys < hi)
            if mask.sum() == 0:
                continue
            acc = yt[mask].mean()
            conf = ys[mask].mean()
            ece_val += mask.sum() / total * abs(acc - conf)
        return float(ece_val)

    frac_raw, mean_raw = calibration_curve(y_true, y_score_raw, n_bins=n_bins, strategy="uniform")
    frac_cal, mean_cal = calibration_curve(y_true, y_score_cal, n_bins=n_bins, strategy="uniform")

    return {
        "brier_raw": brier(y_true, y_score_raw),
        "brier_calibrated": brier(y_true, y_score_cal),
        "ece_raw": ece(y_true, y_score_raw, n_bins),
        "ece_calibrated": ece(y_true, y_score_cal, n_bins),
        "curve_raw": (frac_raw.tolist(), mean_raw.tolist()),
        "curve_calibrated": (frac_cal.tolist(), mean_cal.tolist()),
    }
