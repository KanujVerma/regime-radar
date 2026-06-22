import numpy as np
import pandas as pd
import pytest
from src.api.risk_reading import build_risk_reading, RiskReading

REF = {"model_version": "v1", "n": 1000,
       "raw_scores_sorted": sorted(np.linspace(0.0, 0.975, 1000))}
COND_REF = pd.DataFrame(
    np.random.default_rng(0).normal(size=(300, 6)),
    columns=["vix_level", "vix_chg_5d", "rv_20d_pct", "drawdown_pct_504d", "ret_20d", "dist_sma50"],
)
IN_SUPPORT_POINT = COND_REF.iloc[5].to_dict()
OUT_SUPPORT_POINT = (COND_REF.mean() + 60 * COND_REF.std()).to_dict()

MAXP = 0.30


def _call(calibrated_p, raw_score, point, analogs=None, applicable=True):
    return build_risk_reading(
        calibrated_p=calibrated_p, raw_score=raw_score, condition_point=point,
        cond_reference=COND_REF, raw_reference=REF, model_version="v1",
        max_evaluated_p=MAXP, find_analogs_fn=(lambda: analogs if analogs is not None else []),
        analogs_applicable=applicable, z_threshold=3.0,
    )


def test_validated_state_in_support_low_p():
    r = _call(calibrated_p=0.12, raw_score=0.4, point=IN_SUPPORT_POINT)
    assert r.display_state == "validated"
    assert r.validated_probability == 0.12
    assert r.stress_percentile is None and r.stress_tier is None
    assert r.analog_status == "not_applicable" and r.nearest_analogs is None
    assert r.support.in_support is True


def test_stress_in_support_high_p():
    r = _call(calibrated_p=0.55, raw_score=0.98, point=IN_SUPPORT_POINT,
              analogs=[{"label": "Mar 2020", "date": "2020-03-16", "raw_score": 0.97}])
    assert r.display_state == "stress_in_support"
    assert r.validated_probability is None
    assert r.stress_percentile is not None and r.stress_tier == "Extreme"
    assert r.analog_status == "available" and len(r.nearest_analogs) == 1


def test_stress_in_support_but_no_analogs_is_unavailable():
    r = _call(calibrated_p=0.55, raw_score=0.98, point=IN_SUPPORT_POINT, analogs=[])
    assert r.display_state == "stress_in_support"
    assert r.analog_status == "unavailable" and r.nearest_analogs is None


def test_scenario_hypothetical_analogs_not_applicable():
    r = _call(calibrated_p=0.55, raw_score=0.98, point=IN_SUPPORT_POINT, applicable=False)
    assert r.display_state == "stress_in_support"
    assert r.analog_status == "not_applicable" and r.nearest_analogs is None


def test_out_of_support_dominates_even_with_high_p():
    r = _call(calibrated_p=0.55, raw_score=0.98, point=OUT_SUPPORT_POINT)
    assert r.display_state == "stress_out_of_support"
    assert r.validated_probability is None
    assert r.analog_status == "not_applicable" and r.nearest_analogs is None
    assert r.support.in_support is False


def test_out_of_support_dominates_even_with_low_p():
    r = _call(calibrated_p=0.10, raw_score=0.2, point=OUT_SUPPORT_POINT)
    assert r.display_state == "stress_out_of_support"
    assert r.validated_probability is None
    assert r.stress_percentile is not None


def test_boundary_p_equals_max_is_validated():
    r = _call(calibrated_p=MAXP, raw_score=0.5, point=IN_SUPPORT_POINT)
    assert r.display_state == "validated"


def test_version_mismatch_suppresses_percentile_but_keeps_validated_in_support():
    r = build_risk_reading(
        calibrated_p=0.55, raw_score=0.98, condition_point=IN_SUPPORT_POINT,
        cond_reference=COND_REF, raw_reference=REF, model_version="DIFFERENT",
        max_evaluated_p=MAXP, find_analogs_fn=lambda: [], z_threshold=3.0,
    )
    assert r.display_state == "validated"
    assert r.validated_probability == 0.55
    assert r.stress_percentile is None and r.stress_tier is None


def test_version_mismatch_still_flags_out_of_support():
    r = build_risk_reading(
        calibrated_p=0.55, raw_score=0.98, condition_point=OUT_SUPPORT_POINT,
        cond_reference=COND_REF, raw_reference=REF, model_version="DIFFERENT",
        max_evaluated_p=MAXP, find_analogs_fn=lambda: [], z_threshold=3.0,
    )
    assert r.display_state == "stress_out_of_support"
    assert r.validated_probability is None
    assert r.stress_percentile is None and r.stress_tier is None


from src.api.schemas import RiskReadingModel
from src.api.risk_reading import RiskReading, SupportInfo


def test_risk_reading_model_from_dataclass():
    rr = RiskReading(
        display_state="stress_out_of_support", validated_probability=None,
        stress_percentile=0.991, stress_tier="High", analog_status="not_applicable",
        nearest_analogs=None, support=SupportInfo(in_support=False, nn_z_distance=14.2),
        max_evaluated_p=0.30,
    )
    m = RiskReadingModel.from_reading(rr)
    assert m.display_state == "stress_out_of_support"
    assert m.support.in_support is False
    assert m.validated_probability is None
    assert m.model_dump()["stress_tier"] == "High"
