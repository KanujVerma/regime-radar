"""XGBoost 5-day transition-up risk model (primary ML task)."""
from __future__ import annotations
import numpy as np
import pandas as pd
import xgboost as xgb
from src.utils.config import get_config
from src.utils.logging import get_logger
from src.models.registry import save_artifact
from src.evaluation.walk_forward import walk_forward_splits
from src.evaluation.metrics import transition_metrics
from src.evaluation.calibration import (
    fit_calibrator, apply_calibrator, calibration_report
)
from src.evaluation.threshold_analysis import threshold_sweep
from src.evaluation.event_replay import build_oof_dataframe

_logger = get_logger(__name__)


def train_transition_model(
    features: pd.DataFrame,
    transition_labels: pd.Series,
    regime_labels: pd.Series | None = None,
    config: dict | None = None,
) -> dict:
    """Train XGBoost transition-risk model with walk-forward evaluation and calibration.

    Per-fold calibration procedure:
    - Each fold carves its chronologically-last 20% as a calibration holdout.
    - Model trained on remaining 80% of train fold.
    - Calibrator (isotonic if n_pos >= 200, else Platt) fit on calibration holdout.
    - Calibrated probabilities applied to test fold.

    Returns summary dict with walk-forward metrics, calibration report,
    threshold sweep, and OOF prediction DataFrame.
    """
    if config is None:
        config = get_config("model")

    wf_cfg = config["walk_forward"]
    xgb_cfg = {k: v for k, v in config["xgboost_transition"].items()
                if k not in ("use_label_encoder", "scale_pos_weight")}

    holdout_frac = wf_cfg.get("calibration_holdout_fraction", 0.20)

    X = features
    y = transition_labels.astype(int)
    n = len(X)

    oof_scores_raw = pd.Series(np.nan, index=X.index)
    oof_scores_cal = pd.Series(np.nan, index=X.index)
    oof_regime_pred = pd.Series(index=X.index, dtype=str)
    fold_metrics = []

    for fold_i, (tr_idx, te_idx) in enumerate(
        walk_forward_splits(n, wf_cfg["min_train_days"], wf_cfg["test_days"])
    ):
        # Carve calibration holdout from train
        cal_size = max(1, int(len(tr_idx) * holdout_frac))
        model_tr_idx = tr_idx[:-cal_size]
        cal_idx = tr_idx[-cal_size:]

        X_model_tr = X.iloc[model_tr_idx]
        y_model_tr = y.iloc[model_tr_idx]
        X_cal = X.iloc[cal_idx]
        y_cal = y.iloc[cal_idx]
        X_test = X.iloc[te_idx]
        y_test = y.iloc[te_idx]

        # Compute scale_pos_weight from model training portion
        pos = y_model_tr.sum()
        neg = (y_model_tr == 0).sum()
        spw = float(neg / pos) if pos > 0 else 1.0

        model = xgb.XGBClassifier(**xgb_cfg, scale_pos_weight=spw, random_state=42, verbosity=0)
        model.fit(X_model_tr, y_model_tr)

        # Calibrate
        cal_raw = model.predict_proba(X_cal)[:, 1]
        calibrator = fit_calibrator(y_cal.values, cal_raw, method="auto")

        # Score test fold
        test_raw = model.predict_proba(X_test)[:, 1]
        test_cal = apply_calibrator(calibrator, test_raw)

        oof_scores_raw.iloc[te_idx] = test_raw
        oof_scores_cal.iloc[te_idx] = test_cal

        m = transition_metrics(y_test, pd.Series(test_cal, index=X_test.index))
        m["fold"] = fold_i
        m["scale_pos_weight"] = round(spw, 2)
        fold_metrics.append(m)
        _logger.debug("Fold %d: roc_auc=%.3f pr_auc=%.3f recall=%.3f far=%.3f",
                      fold_i, m["roc_auc"], m["pr_auc"], m["recall_at_threshold"], m["false_alert_rate"])

    # OOF coverage — drop NaN rows
    oof_mask = oof_scores_cal.notna()
    oof_y = y[oof_mask]
    oof_cal = oof_scores_cal[oof_mask]
    oof_raw = oof_scores_raw[oof_mask]

    # Calibration report over OOF
    cal_report = {}
    if len(oof_y) > 0:
        try:
            cal_report = calibration_report(oof_y.values, oof_raw.values, oof_cal.values)
        except Exception as e:
            _logger.warning("Calibration report failed: %s", e)

    # Threshold sweep over OOF
    sweep_df = pd.DataFrame()
    if len(oof_y) > 0:
        events_df = pd.DataFrame({"transition_up": oof_y}, index=oof_y.index)
        sweep_df = threshold_sweep(oof_y, oof_cal, events_df=events_df)

    # Train final model on all data
    pos_all = y.sum()
    neg_all = (y == 0).sum()
    spw_final = float(neg_all / pos_all) if pos_all > 0 else 1.0
    final_model = xgb.XGBClassifier(**xgb_cfg, scale_pos_weight=spw_final, random_state=42, verbosity=0)
    final_model.fit(X, y)

    # Final calibrator: fit on last 20% of full data
    cal_size_final = max(1, int(n * holdout_frac))
    cal_raw_final = final_model.predict_proba(X.iloc[-cal_size_final:])[:, 1]
    final_calibrator = fit_calibrator(y.iloc[-cal_size_final:].values, cal_raw_final, method="auto")

    avg_roc = np.mean([m["roc_auc"] for m in fold_metrics if not np.isnan(m["roc_auc"])]) if fold_metrics else float("nan")
    avg_pr = np.mean([m["pr_auc"] for m in fold_metrics if not np.isnan(m["pr_auc"])]) if fold_metrics else float("nan")

    summary = {
        "task": "transition_risk",
        "framing": "primary ML task — 5-day regime transition-up risk",
        "n_folds": len(fold_metrics),
        "mean_roc_auc": round(float(avg_roc), 4),
        "mean_pr_auc": round(float(avg_pr), 4),
        "brier_raw": cal_report.get("brier_raw"),
        "brier_calibrated": cal_report.get("brier_calibrated"),
        "ece_raw": cal_report.get("ece_raw"),
        "ece_calibrated": cal_report.get("ece_calibrated"),
        "feature_names": list(features.columns),
        "threshold_sweep": sweep_df.to_dict("records") if not sweep_df.empty else [],
    }

    save_artifact(final_model, "xgb_transition", summary)
    save_artifact(final_calibrator, "xgb_transition_calibrator", {"method": "auto"})

    # Build OOF DataFrame for event replay
    if regime_labels is not None:
        oof_regime_df = build_oof_dataframe(
            all_dates=X.index,
            regime_actual=regime_labels,
            regime_predicted=pd.Series("unknown", index=X.index),  # regime model separate
            transition_actual=y,
            transition_risk=oof_scores_cal,
        )
        save_artifact(oof_regime_df, "oof_predictions", {"n_rows": len(oof_regime_df)})

    _logger.info("Transition model: roc_auc=%.3f pr_auc=%.3f (%d folds)", avg_roc, avg_pr, len(fold_metrics))
    return summary
