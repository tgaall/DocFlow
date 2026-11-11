import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def resource_path(relative: str) -> Path:
    """Resolve a project resource, inside or outside a PyInstaller bundle."""
    base = Path(getattr(sys, "_MEIPASS", PROJECT_ROOT))
    return base / relative
