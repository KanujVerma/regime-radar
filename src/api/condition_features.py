"""Feature sets for product-specific condition surfaces."""
from __future__ import annotations


CURRENT_STATE_CONDITION_FEATURES = [
    "vix_level",
    "vix_chg_5d",
    "rv_20d_pct",
    "drawdown_pct_504d",
    "ret_20d",
    "dist_sma50",
]

SCENARIO_BASELINE_FEATURES = [
    "vix_level",
    "vix_chg_5d",
    "rv_20d_pct",
    "drawdown_pct_504d",
    "ret_20d",
    "dist_sma50",
]
