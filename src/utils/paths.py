from pathlib import Path


def get_project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def get_data_path(subdir: str) -> Path:
    path = get_project_root() / "data" / subdir
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_config_path(name: str) -> Path:
    return get_project_root() / "configs" / f"{name}.yaml"


PROCESSED_DIR: Path = get_project_root() / "data" / "processed"
RAW_DIR: Path = get_project_root() / "data" / "raw"
MODELS_DIR: Path = get_project_root() / "data" / "models"
FIXTURES_DIR: Path = get_project_root() / "data" / "fixtures"
SNAPSHOTS_DIR: Path = get_project_root() / "data" / "snapshots"
