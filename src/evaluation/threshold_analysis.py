"""Threshold sweep analysis for the transition risk model."""
from __future__ import annotations
import numpy as np
import pandas as pd
from src.evaluation.metrics import lead_time as compute_lead_time

THRESHOLDS = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70]


def threshold_sweep(
    y_true: pd.Series,
    y_score: pd.Series,
    thresholds: list[float] = THRESHOLDS,
    events_df: pd.DataFrame | None = None,
    lookback_days: int = 20,
) -> pd.DataFrame:
    """Sweep thresholds and report recall, FAR, lead time, and alert frequency.

    Returns DataFrame with columns:
        threshold, recall, false_alert_rate, alert_frequency,
        avg_lead_time_days, n_events_detected, n_events_total

    Plain-language note: 'false_alert_rate' is the fraction of non-event days
    that triggered an alert; 'alert_frequency' is the fraction of ALL days
    with an alert fired. Use both together to interpret operating cost.
    """
    rows = []
    for thr in thresholds:
        y_pred = (y_score >= thr).astype(int)

        tp = int(((y_pred == 1) & (y_true == 1)).sum())
        fn = int(((y_pred == 0) & (y_true == 1)).sum())
        fp = int(((y_pred == 1) & (y_true == 0)).sum())
        tn = int(((y_pred == 0) & (y_true == 0)).sum())

        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        far = fp / (fp + tn) if (fp + tn) > 0 else 0.0
        alert_freq = y_pred.mean()

        if events_df is not None and len(events_df) > 0:
            lt = compute_lead_time(events_df, y_score, threshold=thr, lookback_days=lookback_days)
            avg_lead = lt["mean_lead_days"]
            n_detected = lt["n_detected"]
            n_total = lt["n_events"]
        else:
            avg_lead = float("nan")
            n_detected = tp  # approximate
            n_total = int(y_true.sum())

        rows.append({
            "threshold": thr,
            "recall": round(recall, 4),
            "false_alert_rate": round(far, 4),
            "alert_frequency": round(float(alert_freq), 4),
            "avg_lead_time_days": round(avg_lead, 1) if not np.isnan(avg_lead) else float("nan"),
            "n_events_detected": n_detected,
            "n_events_total": n_total,
        })

    return pd.DataFrame(rows)
