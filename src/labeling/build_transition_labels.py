"""Builds binary 5-day transition-up risk labels."""
from __future__ import annotations
import numpy as np
import pandas as pd
from src.utils.config import get_config

REGIME_ORDER = {"calm": 0, "elevated": 1, "turbulent": 2}


def build_transition_labels(
    regime_series: pd.Series,
    config: dict | None = None,
) -> pd.Series:
    """
    Binary label: 1 if the market will transition to a HIGHER regime within
    horizon_days trading days, and that higher regime persists for >= persistence_days
    consecutive days.

    - turbulent rows always get label 0 (no higher regime exists)
    - rows within horizon_days of the series end get label 0 (unknown future)

    Returns pd.Series of int (0 or 1), same index as regime_series.
    """
    if config is None:
        cfg = get_config("labels")["transition"]
    else:
        cfg = config

    horizon = cfg["horizon_days"]
    persistence = cfg["persistence_days"]

    regimes = regime_series.tolist()
    n = len(regimes)
    labels = [0] * n

    for i in range(n - horizon):
        current = regimes[i]
        if current is None or (isinstance(current, float) and current != current):
            continue
        current_order = REGIME_ORDER.get(current, -1)
        if current_order < 0:
            continue
        if current_order == 2:
            continue

        found = False
        for j in range(i + 1, i + horizon + 1):
            if j >= n:
                break
            future_order = REGIME_ORDER.get(regimes[j], 0)
            if future_order > current_order:
                run = 1
                for k in range(j + 1, min(j + persistence, n)):
                    if REGIME_ORDER.get(regimes[k], 0) >= future_order:
                        run += 1
                    else:
                        break
                if run >= persistence:
                    found = True
                    break

        labels[i] = 1 if found else 0

    return pd.Series(labels, index=regime_series.index, name="transition_up", dtype=int)
