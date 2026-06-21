# src/evaluation/support_distance.py
"""Prong 2: how much of the scenario input space has any historical analog.

Works in the 6-D scenario condition subspace (SCENARIO_BASELINE_FEATURES). Builds
probe points by pushing each condition toward and beyond its historical extreme,
then measures nearest-neighbour distance (in z-units) to the historical distribution.
A probe with no neighbour within `z_threshold` is genuine extrapolation — a region
no model can validate, regardless of any label/model rebuild.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

from src.api.condition_features import SCENARIO_BASELINE_FEATURES

# Joint multipliers applied to the historical column extremes to build probes.
PROBE_QUANTILES = {"p95": 0.95, "p99": 0.99, "max": 1.0}
PROBE_BEYOND = {"x1.25_max": 1.25, "x1.5_max": 1.5}


def standardize_reference(ref: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    """Return (mean, std) for z-scoring; std floored to avoid divide-by-zero."""
    mean = ref.mean()
    std = ref.std().replace(0.0, 1e-9)
    return mean, std


def nn_distance(z_point: pd.Series, z_ref: np.ndarray) -> float:
    """Euclidean distance (z-units) from a standardized point to its nearest ref row."""
    diffs = z_ref - z_point.to_numpy()
    return float(np.sqrt((diffs ** 2).sum(axis=1)).min())


def build_support_report(features: pd.DataFrame, z_threshold: float = 3.0) -> dict:
    """Measure extrapolation across joint-extreme probes of the condition subspace."""
    cols = [c for c in SCENARIO_BASELINE_FEATURES if c in features.columns]
    ref = features[cols].dropna()
    mean, std = standardize_reference(ref)
    z_ref = ((ref - mean) / std).to_numpy()

    probes = []
    # In-distribution quantile probes.
    for label, q in PROBE_QUANTILES.items():
        point = ref.quantile(q) if q < 1.0 else ref.max()
        d = nn_distance((point - mean) / std, z_ref)
        probes.append({"label": label, "nn_z_distance": round(d, 4), "in_support": d <= z_threshold})
    # Beyond-historical probes (what the scenario sliders let users reach).
    col_max = ref.max()
    for label, mult in PROBE_BEYOND.items():
        point = col_max * mult
        d = nn_distance((point - mean) / std, z_ref)
        probes.append({"label": label, "nn_z_distance": round(d, 4), "in_support": d <= z_threshold})

    extrap = [p for p in probes if not p["in_support"]]
    return {
        "condition_features": cols,
        "z_threshold": z_threshold,
        "n_reference_rows": int(len(ref)),
        "extrapolation_fraction": round(len(extrap) / len(probes), 4),
        "probes": probes,
    }
