#!/usr/bin/env python3
"""Seed daily state artifacts from committed git snapshot history.

One-time utility. Extracts panel.parquet from each recent snapshot commit,
runs inference, writes data/daily_state/YYYY-MM-DD.json. The artifact date
comes from the panel's last row — never from a CLI argument — preventing
synthetic relabeling (writing today's inference under yesterday's filename).

panel.parquet is the fully merged snapshot (contains VIX, EMV, SPY data),
so no other parquet files need to be extracted from git history.
"""
from __future__ import annotations
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.models.daily_state import build_daily_state
from src.utils.paths import get_project_root


def find_snapshot_commits(count: int) -> list[tuple[str, str]]:
    """Return [(commit_hash, date_str)] for recent snapshot commits (newest first).

    Scans all commits that touched panel.parquet (no count heuristic) and stops
    once we have the requested number of snapshot-update commits. This is robust
    to any number of non-snapshot commits in between.
    """
    result = subprocess.run(
        ["git", "log", "--format=%H %s", "--", "data/snapshots/panel.parquet"],
        capture_output=True, text=True, check=True,
    )
    commits: list[tuple[str, str]] = []
    for line in result.stdout.strip().splitlines():
        if not line.strip():
            continue
        hash_, _, subject = line.partition(" ")
        if "update snapshots to " in subject:
            date_str = subject.split("update snapshots to ")[-1].strip()
            commits.append((hash_, date_str))
        if len(commits) >= count:
            break
    return commits


def extract_panel_and_build(commit_hash: str, commit_date: str, output_dir: Path) -> None:
    """Checkout panel.parquet from git commit, run inference, write dated artifact."""
    with tempfile.TemporaryDirectory() as tmp_str:
        tmp = Path(tmp_str)
        panel_bytes = subprocess.run(
            ["git", "show", f"{commit_hash}:data/snapshots/panel.parquet"],
            capture_output=True, check=True,
        ).stdout
        (tmp / "panel.parquet").write_bytes(panel_bytes)
        state = build_daily_state(tmp)

    # Sanity check: artifact date must come from the data, not from commit_date.
    # Print a warning if they differ (e.g. snapshot was one day stale when committed).
    if state["data_through_date"] != commit_date:
        print(f"  NOTE: artifact date {state['data_through_date']} differs "
              f"from commit date {commit_date} — using data date (this is correct)")

    out_path = output_dir / f"{state['as_of_date']}.json"
    out_path.write_text(json.dumps(state, indent=2) + "\n")
    print(f"  Written: {out_path}  (data through {state['data_through_date']})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=2,
                        help="Number of historical artifacts to generate (default: 2)")
    args = parser.parse_args()

    output_dir = get_project_root() / "data" / "daily_state"
    output_dir.mkdir(parents=True, exist_ok=True)

    commits = find_snapshot_commits(args.count)
    if not commits:
        print("ERROR: No 'chore: update snapshots to YYYY-MM-DD' commits found.")
        sys.exit(1)

    print(f"Generating {len(commits)} artifact(s) from git history...")
    for commit_hash, commit_date in commits:
        print(f"Processing {commit_hash[:8]} (commit date: {commit_date})...")
        extract_panel_and_build(commit_hash, commit_date, output_dir)

    print(f"\nDone. Commit with:")
    print(f"  git add data/daily_state/ && git commit -m 'chore: seed initial daily state artifacts'")


if __name__ == "__main__":
    main()
