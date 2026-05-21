#!/usr/bin/env python3
"""Write today's daily state artifact from the current committed snapshots.

Called by the nightly GitHub Actions cron after refresh_snapshots.py has
written fresh parquets to data/snapshots/. No date argument — the artifact
date is always derived from the panel's last row, never from a CLI argument.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.models.daily_state import build_daily_state
from src.utils.paths import SNAPSHOTS_DIR, get_project_root


def main() -> None:
    state = build_daily_state(SNAPSHOTS_DIR)
    out_dir = get_project_root() / "data" / "daily_state"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{state['as_of_date']}.json"
    out_path.write_text(json.dumps(state, indent=2))
    print(f"Written: {out_path}  (data through {state['data_through_date']})")


if __name__ == "__main__":
    main()
