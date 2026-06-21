"""Read-only predictability-ceiling diagnostic helpers.

This module NEVER persists model artifacts. It replicates the walk-forward OOF
loop from src/models/train_transition_model.py (minus save_artifact) so it can be
run repeatedly over label variants without mutating production models/reliability.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
import xgboost as xgb

from src.evaluation.walk_forward import walk_forward_splits
from src.evaluation.calibration import fit_calibrator, apply_calibrator


def oof_walk_forward(
    X: pd.DataFrame,
    y: pd.Series,
    wf_cfg: dict,
    xgb_cfg: dict,
) -> pd.DataFrame:
    """Produce out-of-fold raw + calibrated transition scores. Persists nothing.

    Mirrors the per-fold procedure in train_transition_model: each fold carves its
    last `calibration_holdout_fraction` as a calibration holdout, fits XGB on the
    rest, fits an auto calibrator on the holdout, scores the test fold.

    Returns a DataFrame indexed by date with columns: oof_raw, oof_cal, y
    (NaN burn-in rows dropped).
    """
    y = y.astype(int)
    n = len(X)
    holdout_frac = wf_cfg.get("calibration_holdout_fraction", 0.20)
    oof_raw = pd.Series(np.nan, index=X.index)
    oof_cal = pd.Series(np.nan, index=X.index)

    for tr_idx, te_idx in walk_forward_splits(n, wf_cfg["min_train_days"], wf_cfg["test_days"]):
        cal_size = max(1, int(len(tr_idx) * holdout_frac))
        model_tr_idx = tr_idx[:-cal_size]
        cal_idx = tr_idx[-cal_size:]

        X_model_tr, y_model_tr = X.iloc[model_tr_idx], y.iloc[model_tr_idx]
        X_cal, y_cal = X.iloc[cal_idx], y.iloc[cal_idx]
        X_test = X.iloc[te_idx]

        pos = y_model_tr.sum()
        neg = (y_model_tr == 0).sum()
        spw = float(neg / pos) if pos > 0 else 1.0

        model = xgb.XGBClassifier(**xgb_cfg, scale_pos_weight=spw, random_state=42, verbosity=0)
        model.fit(X_model_tr, y_model_tr)

        calibrator = fit_calibrator(y_cal.values, model.predict_proba(X_cal)[:, 1], method="auto")
        test_raw = model.predict_proba(X_test)[:, 1]
        oof_raw.iloc[te_idx] = test_raw
        oof_cal.iloc[te_idx] = apply_calibrator(calibrator, test_raw)

    out = pd.DataFrame({"oof_raw": oof_raw, "oof_cal": oof_cal, "y": y})
    return out[out["oof_cal"].notna()].sort_index()
