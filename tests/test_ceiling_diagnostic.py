import numpy as np
import pandas as pd
from src.evaluation.ceiling_diagnostic import oof_walk_forward


def _synthetic(n=1600, seed=0):
    rng = np.random.default_rng(seed)
    # one informative feature: higher x -> higher P(y=1)
    x = rng.normal(size=n)
    p = 1 / (1 + np.exp(-(x - 1.5)))  # base rate well below 0.5
    y = (rng.uniform(size=n) < p).astype(int)
    idx = pd.date_range("2010-01-01", periods=n, freq="B")
    X = pd.DataFrame({"x": x, "noise": rng.normal(size=n)}, index=idx)
    return X, pd.Series(y, index=idx, name="transition_up")


def test_oof_walk_forward_returns_aligned_oof_frame():
    X, y = _synthetic()
    wf_cfg = {"min_train_days": 500, "test_days": 250, "calibration_holdout_fraction": 0.2}
    xgb_cfg = {"n_estimators": 40, "max_depth": 3, "learning_rate": 0.1,
               "objective": "binary:logistic", "eval_metric": "logloss"}
    out = oof_walk_forward(X, y, wf_cfg, xgb_cfg)
    assert set(out.columns) == {"oof_raw", "oof_cal", "y"}
    assert out["oof_raw"].notna().all()
    assert len(out) > 0
    assert out.index.is_monotonic_increasing


def test_oof_walk_forward_persists_nothing(tmp_path, monkeypatch):
    import src.evaluation.ceiling_diagnostic as cd
    if hasattr(cd, "save_artifact"):
        def _boom(*a, **k):
            raise AssertionError("diagnostic must not persist artifacts")
        monkeypatch.setattr(cd, "save_artifact", _boom, raising=False)
    X, y = _synthetic(n=900)
    wf_cfg = {"min_train_days": 400, "test_days": 200, "calibration_holdout_fraction": 0.2}
    xgb_cfg = {"n_estimators": 20, "max_depth": 2, "learning_rate": 0.1,
               "objective": "binary:logistic", "eval_metric": "logloss"}
    oof_walk_forward(X, y, wf_cfg, xgb_cfg)  # must not raise
