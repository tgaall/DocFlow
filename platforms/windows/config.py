"""Windows edition configuration.

Re-exports the centralized windows profile from `src.config` so the launcher
has a single, explicit configuration entry point.
"""

import os

from src.config import PLATFORM_WINDOWS, Settings, get_settings


def configure_windows_platform() -> None:
    os.environ["DOCFLOW_PLATFORM"] = PLATFORM_WINDOWS


def get_windows_settings() -> Settings:
    configure_windows_platform()
    return get_settings()
