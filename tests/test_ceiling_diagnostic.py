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


# ---------------------------------------------------------------------------
# ceiling_metrics tests
# ---------------------------------------------------------------------------
from src.evaluation.ceiling_diagnostic import ceiling_metrics


def _oof_frame(cal, y):
    idx = pd.date_range("2012-01-01", periods=len(cal), freq="B")
    return pd.DataFrame({"oof_raw": cal, "oof_cal": cal, "y": y}, index=idx)


def test_ceiling_metrics_low_ceiling_when_scores_capped():
    # 400 rows, scores never exceed 0.30, ~9% base rate -> low ceiling
    rng = np.random.default_rng(1)
    cal = rng.uniform(0.0, 0.30, size=400)
    y = (rng.uniform(size=400) < 0.09).astype(int)
    m = ceiling_metrics(_oof_frame(cal, y))
    assert m["max_validated_p"] <= 0.30
    assert m["cal_max"] <= 0.30
    assert 0.0 <= m["base_rate"] <= 0.2
    assert set(m).issuperset({
        "base_rate", "max_validated_p", "top1pct_emp", "top5pct_emp",
        "raw_max", "cal_max", "monotonic_ok", "roc_auc", "pr_auc", "n_oof",
    })


def test_ceiling_metrics_top_group_tracks_outcomes():
    # Construct scores perfectly ranking outcomes: top group should be ~all positive.
    n = 1000
    y = np.array([0] * 900 + [1] * 100)
    cal = np.concatenate([np.linspace(0.0, 0.4, 900), np.linspace(0.6, 0.95, 100)])
    m = ceiling_metrics(_oof_frame(cal, y))
    assert m["top1pct_emp"] >= 0.9   # top 1% are all the high-score positives
    assert m["roc_auc"] > 0.95


# ---------------------------------------------------------------------------
# LABEL_VARIANTS + build_variant_label tests
# ---------------------------------------------------------------------------
from src.evaluation.ceiling_diagnostic import LABEL_VARIANTS, build_variant_label


def test_label_variants_are_the_pre_registered_grid():
    names = {v["name"] for v in LABEL_VARIANTS}
    # baseline + horizon sweep + persistence sweep (<=8 runs)
    assert "baseline_h5_p3" in names
    assert {"h10_p3", "h21_p3", "h42_p3", "h63_p3"}.issubset(names)
    assert {"h5_p1", "h21_p1"}.issubset(names)
    assert len(LABEL_VARIANTS) <= 8
    for v in LABEL_VARIANTS:
        assert v["horizon_days"] >= 1 and v["persistence_days"] >= 1


def test_build_variant_label_changes_base_rate_with_horizon():
    # Longer horizon -> at least as many positives as the baseline.
    regimes = pd.Series(
        (["calm"] * 10 + ["elevated"] * 2) * 40,
        index=pd.date_range("2015-01-01", periods=480, freq="B"),
    )
    y5 = build_variant_label(regimes, horizon_days=5, persistence_days=1)
    y42 = build_variant_label(regimes, horizon_days=42, persistence_days=1)
    assert y42.sum() >= y5.sum()
    assert set(y5.unique()).issubset({0, 1})
