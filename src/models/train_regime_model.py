"""XGBoost regime classifier (reference/feature-sufficiency task).

NOTE: Because regime labels are a deterministic function of the input features
(VIX, realized vol, drawdown), this model is expected to closely approximate
the rule-based baseline. Its primary purpose is to validate feature sufficiency
and serve as a comparison point — it is NOT the primary ML contribution.
The 5-day transition-risk model is the primary ML task.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
import xgboost as xgb
from src.utils.config import get_config
from src.utils.logging import get_logger
from src.models.registry import save_artifact
from src.evaluation.walk_forward import walk_forward_splits
from src.evaluation.metrics import regime_metrics
from src.evaluation.calibration import (
    fit_calibrator, apply_calibrator, calibration_report
)

_logger = get_logger(__name__)

LABEL_MAP = {"calm": 0, "elevated": 1, "turbulent": 2}
LABEL_NAMES = {v: k for k, v in LABEL_MAP.items()}


def train_regime_model(
    features: pd.DataFrame,
    labels: pd.Series,
    config: dict | None = None,
) -> dict:
    """Train XGBoost regime classifier with walk-forward evaluation.

    Args:
        features: feature DataFrame (no NaN — caller must dropna)
        labels: regime label Series aligned to features
        config: optional model config dict; defaults to configs/model.yaml

    Returns:
        dict with walk-forward metrics summary and trained final model artifact name
    """
    if config is None:
        config = get_config("model")

    wf_cfg = config["walk_forward"]
    xgb_cfg = {k: v for k, v in config["xgboost_regime"].items()
                if k not in ("use_label_encoder",)}

    y_num = labels.map(LABEL_MAP).astype(int)
    X = features

    fold_metrics = []
    n = len(X)

    for fold_i, (tr_idx, te_idx) in enumerate(
        walk_forward_splits(n, wf_cfg["min_train_days"], wf_cfg["test_days"])
    ):
        X_train, y_train = X.iloc[tr_idx], y_num.iloc[tr_idx]
        X_test, y_test = X.iloc[te_idx], y_num.iloc[te_idx]

        model = xgb.XGBClassifier(**xgb_cfg, random_state=42, verbosity=0)
        model.fit(X_train, y_train)

        y_pred_num = model.predict(X_test)
        y_pred = pd.Series(y_pred_num, index=X_test.index).map(LABEL_NAMES)
        y_true = y_test.map(LABEL_NAMES)

        m = regime_metrics(y_true, y_pred)
        m["fold"] = fold_i
        fold_metrics.append(m)
        _logger.debug("Fold %d: macro_f1=%.3f", fold_i, m["macro_f1"])

    # Train final model on all data
    final_model = xgb.XGBClassifier(**xgb_cfg, random_state=42, verbosity=0)
    final_model.fit(X, y_num)

    avg_f1 = np.mean([m["macro_f1"] for m in fold_metrics]) if fold_metrics else float("nan")
    avg_bal_acc = np.mean([m["balanced_accuracy"] for m in fold_metrics]) if fold_metrics else float("nan")

    summary = {
        "task": "regime_classification",
        "framing": "reference/feature-sufficiency — not the primary ML contribution",
        "n_folds": len(fold_metrics),
        "mean_macro_f1": round(float(avg_f1), 4),
        "mean_balanced_accuracy": round(float(avg_bal_acc), 4),
        "feature_names": list(features.columns),
    }

    save_artifact(final_model, "xgb_regime", summary)
    _logger.info("Regime model trained: macro_f1=%.3f (avg over %d folds)", avg_f1, len(fold_metrics))
    return summary
