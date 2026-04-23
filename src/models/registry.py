"""Artifact save/load helpers with metadata tracking."""
from __future__ import annotations
import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path
import joblib
import pandas as pd
from src.utils.paths import MODELS_DIR
from src.utils.logging import get_logger

_logger = get_logger(__name__)


def save_artifact(model, name: str, metadata: dict) -> Path:
    """Save model + metadata JSON to data/models/{name}/."""
    out_dir = Path(MODELS_DIR) / name
    out_dir.mkdir(parents=True, exist_ok=True)

    model_path = out_dir / "model.joblib"
    meta_path = out_dir / "meta.json"

    joblib.dump(model, model_path)

    meta = {
        "name": name,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        **metadata,
    }
    meta_path.write_text(json.dumps(meta, indent=2, default=str))
    _logger.info("Saved artifact '%s' to %s", name, out_dir)
    return out_dir


def load_artifact(name: str):
    """Load model from data/models/{name}/model.joblib."""
    model_path = Path(MODELS_DIR) / name / "model.joblib"
    if not model_path.exists():
        raise FileNotFoundError(f"No artifact found at {model_path}")
    return joblib.load(model_path)


def load_metadata(name: str) -> dict:
    """Load meta.json for a saved artifact."""
    meta_path = Path(MODELS_DIR) / name / "meta.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"No metadata found at {meta_path}")
    return json.loads(meta_path.read_text())


def artifact_exists(name: str) -> bool:
    return (Path(MODELS_DIR) / name / "model.joblib").exists()
