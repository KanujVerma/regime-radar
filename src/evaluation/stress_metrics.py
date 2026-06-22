"""Pure stress-zone metrics: rank-based percentile + fixed ordinal tiers.

stress_percentile ranks a RAW transition score against the SERVING MODEL'S OWN
historical raw-score distribution (a fraction in [0,1]) — i.e. "louder than X% of
this model's past readings." It is NOT a probability and NOT a market-outcome claim.
stress_tier maps that percentile to an ordinal severity label using FIXED cutpoints
(stable across retrains; the percentile transform already supplies distribution-
relativity). Both are ordinal severity descriptors only.
"""
from __future__ import annotations
import bisect

# Fixed percentile cutpoints (see spec + Task 2 histogram). Ordinal only.
STRESS_TIER_CUTPOINTS = {"Elevated": 0.85, "High": 0.97, "Extreme": 0.995}


def stress_percentile(raw_score: float, raw_reference_sorted) -> float | None:
    """Fraction of the sorted reference at or below `raw_score`. None if no reference."""
    ref = raw_reference_sorted
    n = len(ref)
    if n == 0:
        return None
    count = bisect.bisect_right(ref, raw_score)
    return count / n


def stress_tier(percentile: float | None) -> str | None:
    """Map a stress percentile to an ordinal tier, or None below the lowest band."""
    if percentile is None:
        return None
    if percentile >= STRESS_TIER_CUTPOINTS["Extreme"]:
        return "Extreme"
    if percentile >= STRESS_TIER_CUTPOINTS["High"]:
        return "High"
    if percentile >= STRESS_TIER_CUTPOINTS["Elevated"]:
        return "Elevated"
    return None
