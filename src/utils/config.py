import functools
import yaml
from pydantic_settings import BaseSettings, SettingsConfigDict

from src.utils.paths import get_config_path

_cache: dict[str, dict] = {}

_CONFIG_NAMES = ("app", "features", "labels", "model")


def get_config(name: str) -> dict:
    if name not in _cache:
        path = get_config_path(name)
        with path.open() as f:
            _cache[name] = yaml.safe_load(f)
    return _cache[name]


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    finnhub_api_key: str = ""
    fred_api_key: str = ""
    app_api_url: str = "http://localhost:8000"
    app_env: str = "development"
    app_log_level: str = "INFO"


@functools.lru_cache(maxsize=None)
def get_app_settings() -> AppSettings:
    return AppSettings()
