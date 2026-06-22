# tests/test_support_distance.py
import numpy as np
import pandas as pd
from src.evaluation.support_distance import (
    standardize_reference, nn_distance, build_support_report,
)


def _ref(n=500, seed=0):
    rng = np.random.default_rng(seed)
    cols = ["vix_level", "vix_chg_5d", "rv_20d_pct", "drawdown_pct_504d", "ret_20d", "dist_sma50"]
    return pd.DataFrame(rng.normal(size=(n, len(cols))), columns=cols)


def test_nn_distance_zero_for_in_distribution_point():
    ref = _ref()
    mean, std = standardize_reference(ref)
    z_ref = (ref - mean) / std
    # A point equal to a reference row has ~0 nearest-neighbour distance.
    probe = ref.iloc[10]
    d = nn_distance((probe - mean) / std, z_ref.to_numpy())
    assert d < 1e-6


def test_nn_distance_large_for_extreme_extrapolation():
    ref = _ref()
    mean, std = standardize_reference(ref)
    z_ref = (ref - mean) / std
    probe = ref.mean() + 50 * ref.std()   # absurd extrapolation
    d = nn_distance((probe - mean) / std, z_ref.to_numpy())
    assert d > 10


def test_build_support_report_flags_extrapolation_fraction():
    ref = _ref()
    report = build_support_report(ref, z_threshold=3.0)
    assert 0.0 <= report["extrapolation_fraction"] <= 1.0
    assert "probes" in report and len(report["probes"]) > 0
    # Each probe row records its multiplier and whether it has an analog.
    for pr in report["probes"]:
        assert "label" in pr and "nn_z_distance" in pr and "in_support" in pr


from src.evaluation.support_distance import classify_support


def test_classify_support_in_distribution_point_is_supported():
    ref = _ref()  # existing helper (6 SCENARIO_BASELINE_FEATURES)
    point = ref.iloc[10].to_dict()
    in_support, dist = classify_support(point, ref, z_threshold=3.0)
    assert in_support is True
    assert dist < 1e-6


def test_classify_support_extreme_point_is_unsupported():
    ref = _ref()
    point = (ref.mean() + 50 * ref.std()).to_dict()
    in_support, dist = classify_support(point, ref, z_threshold=3.0)
    assert in_support is False
    assert dist > 10
