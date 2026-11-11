"""Centralized platform configuration.

The platform is selected with the DOCFLOW_PLATFORM environment variable:
  - "web" (default): server edition, PostgreSQL via DATABASE_URL.
  - "windows": desktop edition, local SQLite under %LOCALAPPDATA%/DocFlow.
"""

import os
from dataclasses import dataclass
from pathlib import Path

from src.db.base import get_database_url
from src.paths import PROJECT_ROOT, resource_path

PLATFORM_ENV = "DOCFLOW_PLATFORM"
DATA_DIR_ENV = "DOCFLOW_DATA_DIR"
PLATFORM_WEB = "web"
PLATFORM_WINDOWS = "windows"


@dataclass(frozen=True)
class Settings:
    platform: str
    database_url: str
    data_dir: Path
    imports_dir: Path
    exports_dir: Path
    logs_dir: Path
    templates_dir: Path
    frontend_dir: Path
    cookie_secure: bool
    host: str
    port: int

    def ensure_data_dirs(self) -> None:
        for directory in (
            self.data_dir,
            self.imports_dir,
            self.exports_dir,
            self.logs_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)


def _env_flag(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).lower() == "true"


def _web_settings() -> Settings:
    return Settings(
        platform=PLATFORM_WEB,
        database_url=get_database_url(),
        data_dir=PROJECT_ROOT,
        imports_dir=PROJECT_ROOT / "imports",
        exports_dir=PROJECT_ROOT / "exports",
        logs_dir=PROJECT_ROOT / "logs",
        templates_dir=PROJECT_ROOT / "templates",
        frontend_dir=PROJECT_ROOT / "frontend",
        cookie_secure=_env_flag("AUTH_COOKIE_SECURE", True),
        host=os.getenv("DOCFLOW_HOST", "127.0.0.1"),
        port=int(os.getenv("DOCFLOW_PORT", "8000")),
    )


def default_windows_data_dir() -> Path:
    override = os.getenv(DATA_DIR_ENV)
    if override:
        return Path(override)
    local_app_data = os.getenv("LOCALAPPDATA")
    if not local_app_data:
        local_app_data = str(Path.home() / "AppData" / "Local")
    return Path(local_app_data) / "DocFlow"


def _windows_settings() -> Settings:
    data_dir = default_windows_data_dir()
    database_dir = data_dir / "database"
    settings = Settings(
        platform=PLATFORM_WINDOWS,
        database_url=f"sqlite+aiosqlite:///{database_dir / 'docflow.db'}",
        data_dir=data_dir,
        imports_dir=data_dir / "imports",
        exports_dir=data_dir / "exports",
        logs_dir=data_dir / "logs",
        templates_dir=resource_path("templates"),
        frontend_dir=resource_path("frontend"),
        cookie_secure=False,
        host="127.0.0.1",
        port=0,
    )
    database_dir.mkdir(parents=True, exist_ok=True)
    return settings


def get_platform() -> str:
    return os.getenv(PLATFORM_ENV, PLATFORM_WEB)


def get_settings() -> Settings:
    if get_platform() == PLATFORM_WINDOWS:
        return _windows_settings()
    return _web_settings()
