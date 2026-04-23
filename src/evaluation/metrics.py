"""Evaluation metrics for regime classification and transition risk prediction."""
from __future__ import annotations
import numpy as np
import pandas as pd
from sklearn.metrics import (
    f1_score, balanced_accuracy_score, confusion_matrix,
    roc_auc_score, average_precision_score,
)


def regime_metrics(y_true: pd.Series, y_pred: pd.Series) -> dict:
    """Compute classification metrics for 3-class regime prediction."""
    classes = ["calm", "elevated", "turbulent"]
    cm = confusion_matrix(y_true, y_pred, labels=classes)
    per_class = {
        cls: (cm[i, i] / cm[i].sum() if cm[i].sum() > 0 else 0.0)
        for i, cls in enumerate(classes)
    }
    return {
        "macro_f1": f1_score(y_true, y_pred, average="macro", labels=classes, zero_division=0),
        "balanced_accuracy": balanced_accuracy_score(y_true, y_pred),
        "confusion_matrix": cm.tolist(),
        "per_class_recall": per_class,
    }


def transition_metrics(y_true: pd.Series, y_score: pd.Series, threshold: float = 0.5) -> dict:
    """Compute binary transition prediction metrics."""
    y_pred = (y_score >= threshold).astype(int)
    tn = ((y_pred == 0) & (y_true == 0)).sum()
    fp = ((y_pred == 1) & (y_true == 0)).sum()
    fn = ((y_pred == 0) & (y_true == 1)).sum()
    tp = ((y_pred == 1) & (y_true == 1)).sum()

    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    far = fp / (fp + tn) if (fp + tn) > 0 else 0.0

    try:
        roc = roc_auc_score(y_true, y_score)
    except ValueError:
        roc = float("nan")
    try:
        pr = average_precision_score(y_true, y_score)
    except ValueError:
        pr = float("nan")

    return {
        "roc_auc": roc,
        "pr_auc": pr,
        "recall_at_threshold": recall,
        "false_alert_rate": far,
        "tp": int(tp), "tn": int(tn), "fp": int(fp), "fn": int(fn),
    }


def lead_time(
    events_df: pd.DataFrame,
    risk_series: pd.Series,
    threshold: float = 0.5,
    lookback_days: int = 20,
) -> dict:
    """
    For each actual up-transition event, find how many days before the event
    the risk score first crossed the threshold within a lookback window.

    Args:
        events_df: DataFrame with DatetimeIndex; column 'event_date' or uses index.
                   Must have column 'transition_up' == 1 to mark event days.
        risk_series: DatetimeIndex Series of transition risk scores [0,1].
        threshold: risk score threshold for alerting.
        lookback_days: how far back to search for the first crossing before event.

    Returns:
        dict with keys: mean_lead_days, median_lead_days, n_events, n_detected, lead_times_list
    """
    if "transition_up" not in events_df.columns:
        raise ValueError("events_df must have 'transition_up' column")

    event_dates = events_df.index[events_df["transition_up"] == 1]
    lead_times_list = []

    for event_date in event_dates:
        # Find transition events (first day of an up-transition run)
        window_start = event_date - pd.Timedelta(days=lookback_days * 2)
        window = risk_series.loc[window_start:event_date]
        crossings = window[window >= threshold]
        if len(crossings) > 0:
            first_crossing = crossings.index[0]
            days = (event_date - first_crossing).days
            lead_times_list.append(days)

    n_detected = len(lead_times_list)
    n_events = len(event_dates)
    arr = np.array(lead_times_list) if lead_times_list else np.array([])

    return {
        "mean_lead_days": float(np.mean(arr)) if len(arr) > 0 else float("nan"),
        "median_lead_days": float(np.median(arr)) if len(arr) > 0 else float("nan"),
        "n_events": n_events,
        "n_detected": n_detected,
        "lead_times_list": lead_times_list,
    }
