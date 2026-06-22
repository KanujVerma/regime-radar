# tests/test_ceiling_diagnostic_cli.py
import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
import scripts.run_ceiling_diagnostic as rcd


def _tiny_panel(n=1700, seed=3):
    """A panel small enough to run a few folds fast but real-shaped.

    build_features reads: close, vixcls, emvoverallemv
    build_regime_labels reads: close, vixcls
    """
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2010-01-01", periods=n, freq="B")
    close = 100 * np.cumprod(1 + rng.normal(0, 0.01, size=n))
    vix = np.clip(15 + 5 * rng.normal(size=n).cumsum() / np.sqrt(np.arange(1, n + 1)), 9, 80)
    emv = np.clip(100 + 20 * rng.normal(size=n).cumsum() / np.sqrt(np.arange(1, n + 1)), 1, 500)
    return pd.DataFrame({"close": close, "vixcls": vix, "emvoverallemv": emv}, index=idx)


def test_decide_branch_rule():
    # Pure decision-rule unit: thresholds are pre-registered.
    a = [{"max_validated_p": 0.55, "top1pct_emp": 0.6, "monotonic_ok": True, "pr_auc": 0.4, "base_rate": 0.1}]
    assert rcd.decide_branch(a) == "A"
    b = [{"max_validated_p": 0.30, "top1pct_emp": 0.2, "monotonic_ok": True, "pr_auc": 0.2, "base_rate": 0.1}]
    assert rcd.decide_branch(b) == "B"
    mid = [{"max_validated_p": 0.42, "top1pct_emp": 0.4, "monotonic_ok": True, "pr_auc": 0.3, "base_rate": 0.1}]
    assert rcd.decide_branch(mid) == "A-minus"


def test_cli_writes_all_artifacts_and_touches_no_production(tmp_path, monkeypatch):
    out_root = tmp_path / "diagnostics"
    monkeypatch.setattr(rcd, "DIAGNOSTICS_DIR", out_root)
    # Run on a tiny panel + a reduced 2-variant grid for speed.
    monkeypatch.setattr(rcd.cd, "LABEL_VARIANTS", [
        {"name": "baseline_h5_p3", "horizon_days": 5, "persistence_days": 3},
        {"name": "h21_p3", "horizon_days": 21, "persistence_days": 3},
    ])
    # Guard: fail if anything tries to persist a model artifact.
    import src.models.registry as reg
    monkeypatch.setattr(reg, "save_artifact",
                        lambda *a, **k: (_ for _ in ()).throw(AssertionError("no writes to models")))

    rcd.run(panel=_tiny_panel(), min_train_days=600, test_days=300)

    assert (out_root / "ceiling" / "summary.csv").exists()
    assert (out_root / "ceiling" / "report.md").exists()
    assert (out_root / "extrapolation" / "support_report.json").exists()
    report = (out_root / "ceiling" / "report.md").read_text()
    assert "Branch" in report
    # Verdict JSON is parseable from summary
    rows = pd.read_csv(out_root / "ceiling" / "summary.csv")
    assert {"variant", "max_validated_p", "top1pct_emp", "pr_auc"}.issubset(rows.columns)
