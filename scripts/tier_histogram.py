# scripts/tier_histogram.py
"""One-shot read-only diagnostic: how do draft stress-tier cutpoints bucket the
real raw-score reference distribution? Run before locking cutpoints in Task 3."""
from __future__ import annotations
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

DRAFT_CUTPOINTS = {"Elevated": 0.85, "High": 0.97, "Extreme": 0.995}
REFERENCE_PATH = Path(__file__).resolve().parent.parent / "data" / "reliability" / "raw_score_reference.json"


def main() -> None:
    ref = json.loads(REFERENCE_PATH.read_text())
    scores = np.asarray(ref["raw_scores_sorted"], dtype=float)
    n = len(scores)
    print(f"reference n={n} version={ref['model_version']}")
    print(f"raw score range: [{scores.min():.4f}, {scores.max():.4f}]")
    qs = sorted(DRAFT_CUTPOINTS.items(), key=lambda kv: kv[1])
    edges = [(name, q, float(np.quantile(scores, q))) for name, q in qs]
    print("\ndraft cutpoints (percentile -> raw threshold):")
    for name, q, thr in edges:
        n_at_or_above = int((scores >= thr).sum())
        print(f"  {name:9s} p>={q:.3f}  raw>={thr:.4f}  days_at_or_above={n_at_or_above} "
              f"({100*n_at_or_above/n:.2f}%)")
    print("\nInterpretation: 'Extreme' should be rare (tens of the most alarming days "
          "in ~30y). If a band is empty or implausibly large, adjust cutpoints in Task 3.")


if __name__ == "__main__":
    main()
