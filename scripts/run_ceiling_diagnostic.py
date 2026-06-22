# scripts/run_ceiling_diagnostic.py
"""Predictability-ceiling diagnostic orchestrator (read-only w.r.t. production).

Sweeps the pre-registered label-variant grid, computes ceiling metrics per variant,
measures out-of-support extrapolation, and writes a verdict report selecting Branch
A / A-minus / B per the pre-registered decision rule. Writes ONLY under
data/diagnostics/. Never trains/saves the production model.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.utils.config import get_config
from src.utils.paths import PROCESSED_DIR, get_project_root
from src.labeling.build_regime_labels import build_regime_labels
from src.features.build_market_features import build_features
import src.evaluation.ceiling_diagnostic as cd
from src.evaluation.support_distance import build_support_report

DIAGNOSTICS_DIR = get_project_root() / "data" / "diagnostics"


def decide_branch(metrics: list[dict]) -> str:
    """Pre-registered decision rule. A > A-minus > B."""
    best_mvp = max(m["max_validated_p"] for m in metrics)
    branch_a = any(
        m["max_validated_p"] >= 0.50 and m["top1pct_emp"] >= 0.50
        and m["monotonic_ok"] and m["pr_auc"] > m["base_rate"] * 1.5
        for m in metrics
    )
    if branch_a:
        return "A"
    if best_mvp <= 0.35 and all(m["top1pct_emp"] <= 0.35 for m in metrics):
        return "B"
    return "A-minus"


def _plot_reliability(bins: list[dict], path: Path, title: str) -> None:
    xs = [b["p_mid"] for b in bins]
    ys = [b["empirical_rate"] for b in bins]
    ns = [b["n"] for b in bins]
    fig, ax = plt.subplots(figsize=(5, 4))
    ax.plot([0, 1], [0, 1], "--", color="gray", linewidth=0.8)
    ax.plot(xs, ys, "o-")
    for x, y, n in zip(xs, ys, ns):
        ax.annotate(str(n), (x, y), fontsize=7)
    ax.set_xlabel("predicted p (bin mid)")
    ax.set_ylabel("empirical rate")
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


def run(panel: pd.DataFrame | None = None, min_train_days: int | None = None,
        test_days: int | None = None) -> str:
    ceiling_dir = DIAGNOSTICS_DIR / "ceiling"
    extrap_dir = DIAGNOSTICS_DIR / "extrapolation"
    ceiling_dir.mkdir(parents=True, exist_ok=True)
    extrap_dir.mkdir(parents=True, exist_ok=True)

    if panel is None:
        panel = pd.read_parquet(PROCESSED_DIR / "panel.parquet")

    model_cfg = get_config("model")
    wf_cfg = dict(model_cfg["walk_forward"])
    if min_train_days is not None:
        wf_cfg["min_train_days"] = min_train_days
    if test_days is not None:
        wf_cfg["test_days"] = test_days
    xgb_cfg = {k: v for k, v in model_cfg["xgboost_transition"].items()
               if k not in ("use_label_encoder", "scale_pos_weight")}

    regime = build_regime_labels(panel)
    features = build_features(panel, regime_series=regime).dropna()
    regime_aligned = regime.reindex(features.index)

    rows, metrics_list = [], []
    for v in cd.LABEL_VARIANTS:
        y = cd.build_variant_label(regime_aligned, v["horizon_days"], v["persistence_days"])
        y = y.reindex(features.index).fillna(0).astype(int)
        oof = cd.oof_walk_forward(features, y, wf_cfg, xgb_cfg)
        m = cd.ceiling_metrics(oof)

        vdir = ceiling_dir / v["name"]
        vdir.mkdir(parents=True, exist_ok=True)
        (vdir / "reliability.json").write_text(json.dumps(
            {k: m[k] for k in m if k != "bins"} | {"bins": m["bins"]}, indent=2))
        _plot_reliability(m["bins"], ceiling_dir / f"reliability_{v['name']}.png",
                          f"{v['name']} (max_validated_p={m['max_validated_p']})")

        rows.append({"variant": v["name"], **{k: m[k] for k in m if k != "bins"}})
        metrics_list.append(m)

    summary = pd.DataFrame(rows)
    summary.to_csv(ceiling_dir / "summary.csv", index=False)

    support = build_support_report(features)
    (extrap_dir / "support_report.json").write_text(json.dumps(support, indent=2))

    branch = decide_branch(metrics_list)
    _write_report(ceiling_dir / "report.md", branch, summary, support)
    return branch


def _write_report(path: Path, branch: str, summary: pd.DataFrame, support: dict) -> None:
    lines = [
        "# Predictability-Ceiling Diagnostic — Verdict",
        "",
        f"**Branch: {branch}**",
        "",
        "## Per-variant metrics",
        "",
        summary.to_string(index=False),
        "",
        "## Out-of-support (extrapolation)",
        "",
        f"- reference rows: {support['n_reference_rows']}",
        f"- extrapolation_fraction (probes with no analog within "
        f"{support['z_threshold']}z): **{support['extrapolation_fraction']}**",
        "",
        "## Decision rule (pre-registered)",
        "- **A**: some variant max_validated_p>=0.50 AND top1pct_emp>=0.50 AND monotonic AND pr_auc>1.5x base.",
        "- **B**: all variants max_validated_p<=0.35 AND top1pct_emp<=0.35.",
        "- **A-minus**: otherwise (best in 0.35-0.50).",
    ]
    path.write_text("\n".join(lines))


if __name__ == "__main__":
    b = run()
    print(f"Diagnostic complete. Branch={b}. See data/diagnostics/ceiling/report.md")
