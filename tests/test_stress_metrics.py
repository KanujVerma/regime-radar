import numpy as np
import pytest
from src.evaluation.stress_metrics import stress_percentile, stress_tier, STRESS_TIER_CUTPOINTS


def test_percentile_is_fraction_at_or_below():
    ref = sorted(np.linspace(0.0, 1.0, 1001))
    assert stress_percentile(0.50, ref) == pytest.approx(0.5, abs=0.01)
    assert stress_percentile(-1.0, ref) == pytest.approx(0.0, abs=1e-6)
    assert stress_percentile(2.0, ref) == 1.0


def test_percentile_rank_preserving():
    ref = sorted(np.random.default_rng(0).uniform(size=500))
    assert stress_percentile(0.9, ref) >= stress_percentile(0.4, ref)


def test_percentile_empty_reference_returns_none():
    assert stress_percentile(0.5, []) is None


def test_tier_bands():
    assert stress_tier(0.80) is None
    assert stress_tier(0.85) == "Elevated"
    assert stress_tier(0.96) == "Elevated"
    assert stress_tier(0.97) == "High"
    assert stress_tier(0.994) == "High"
    assert stress_tier(0.995) == "Extreme"
    assert stress_tier(1.0) == "Extreme"
    assert stress_tier(None) is None


def test_cutpoints_are_ordered():
    vals = [STRESS_TIER_CUTPOINTS[k] for k in ("Elevated", "High", "Extreme")]
    assert vals == sorted(vals)
