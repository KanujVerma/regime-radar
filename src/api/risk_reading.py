"""Assemble the typed RiskReading honesty contract.

Two orthogonal primitives -> one derived display_state (support evaluated first):
  not in_support              -> stress_out_of_support
  in_support, p > ceiling     -> stress_in_support
  in_support, p <= ceiling    -> validated

Version guard: the stress PERCENTILE is only valid against a reference produced by
the SAME model that serves live readings. On a version mismatch we suppress the
percentile/tier (set to None) and log loudly — but support classification does NOT
depend on the model version (it is computed from condition vectors), so
stress_out_of_support is STILL honored on a mismatch. An in-support reading that
can no longer be ranked falls back to validated (show the honest calibrated p).

analogs_applicable: scenario hypotheticals have no live query-date, so analogs are
'not_applicable' there (distinct from 'unavailable' = applicable but none found).
"""
from __future__ import annotations
import logging
from dataclasses import dataclass

import pandas as pd

from src.evaluation.stress_metrics import stress_percentile, stress_tier
from src.evaluation.support_distance import classify_support

_logger = logging.getLogger(__name__)


@dataclass
class SupportInfo:
    in_support: bool
    nn_z_distance: float


@dataclass
class RiskReading:
    display_state: str                    # validated | stress_in_support | stress_out_of_support
    validated_probability: float | None
    stress_percentile: float | None
    stress_tier: str | None
    analog_status: str                    # not_applicable | available | unavailable
    nearest_analogs: list | None
    support: SupportInfo
    max_evaluated_p: float


def _validated_only(calibrated_p, max_evaluated_p, support) -> RiskReading:
    return RiskReading(
        display_state="validated",
        validated_probability=round(float(calibrated_p), 4),
        stress_percentile=None, stress_tier=None,
        analog_status="not_applicable", nearest_analogs=None,
        support=support, max_evaluated_p=max_evaluated_p,
    )


def build_risk_reading(*, calibrated_p: float, raw_score: float, condition_point: dict,
                       cond_reference: pd.DataFrame, raw_reference: dict, model_version: str,
                       max_evaluated_p: float, find_analogs_fn, analogs_applicable: bool = True,
                       z_threshold: float = 3.0) -> RiskReading:
    in_support, nn_dist = classify_support(condition_point, cond_reference, z_threshold)
    support = SupportInfo(in_support=bool(in_support), nn_z_distance=round(float(nn_dist), 4))

    version_ok = raw_reference.get("model_version") == model_version
    if not version_ok:
        _logger.warning(
            "RAW-SCORE REFERENCE VERSION MISMATCH: reference=%s serving_model=%s — "
            "severity percentile suppressed; rebuild data/reliability/raw_score_reference.json",
            raw_reference.get("model_version"), model_version,
        )

    pct = stress_percentile(float(raw_score), raw_reference.get("raw_scores_sorted", [])) if version_ok else None
    tier = stress_tier(pct) if version_ok else None

    if not in_support:
        display_state = "stress_out_of_support"
    elif version_ok and float(calibrated_p) > max_evaluated_p:
        display_state = "stress_in_support"
    else:
        display_state = "validated"

    if display_state == "validated":
        return _validated_only(calibrated_p, max_evaluated_p, support)

    if display_state == "stress_in_support":
        if not analogs_applicable:
            analog_status, nearest = "not_applicable", None
        else:
            analogs = find_analogs_fn() or []
            if analogs:
                analog_status, nearest = "available", analogs
            else:
                analog_status, nearest = "unavailable", None
    else:  # stress_out_of_support
        analog_status, nearest = "not_applicable", None

    return RiskReading(
        display_state=display_state,
        validated_probability=None,
        stress_percentile=round(pct, 4) if pct is not None else None,
        stress_tier=tier,
        analog_status=analog_status,
        nearest_analogs=nearest,
        support=support,
        max_evaluated_p=max_evaluated_p,
    )
