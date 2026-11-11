import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from src.config import (
    PLATFORM_WEB,
    PLATFORM_WINDOWS,
    default_windows_data_dir,
    get_platform,
    get_settings,
)


class WebPlatformConfigTests(unittest.TestCase):
    def test_defaults_to_web_platform(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(get_platform(), PLATFORM_WEB)
            settings = get_settings()
            self.assertEqual(settings.platform, PLATFORM_WEB)
            self.assertTrue(settings.cookie_secure)

    def test_web_reads_database_url_from_environment(self) -> None:
        env = {"DATABASE_URL": "postgresql://user:pass@db.example/docflow"}
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(
                get_settings().database_url,
                "postgresql+asyncpg://user:pass@db.example/docflow",
            )

    def test_web_paths_point_into_repository(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = get_settings()
            self.assertTrue(settings.templates_dir.is_dir())
            self.assertTrue(settings.frontend_dir.is_dir())


class WindowsPlatformConfigTests(unittest.TestCase):
    def _settings(self, data_dir: str):
        env = {
            "DOCFLOW_PLATFORM": "windows",
            "DOCFLOW_DATA_DIR": data_dir,
        }
        with patch.dict(os.environ, env, clear=True):
            return get_settings()

    def test_windows_uses_local_sqlite_in_data_dir(self) -> None:
        with TemporaryDirectory() as tmp:
            settings = self._settings(tmp)
            self.assertEqual(settings.platform, PLATFORM_WINDOWS)
            expected_db = Path(tmp) / "database" / "docflow.db"
            self.assertEqual(
                settings.database_url, f"sqlite+aiosqlite:///{expected_db}"
            )
            self.assertFalse(settings.cookie_secure)
            self.assertEqual(settings.host, "127.0.0.1")

    def test_windows_creates_database_directory(self) -> None:
        with TemporaryDirectory() as tmp:
            data_dir = Path(tmp) / "nested" / "DocFlow"
            self._settings(str(data_dir))
            self.assertTrue((data_dir / "database").is_dir())

    def test_windows_subdirectories(self) -> None:
        with TemporaryDirectory() as tmp:
            settings = self._settings(tmp)
            settings.ensure_data_dirs()
            for directory in (
                settings.imports_dir,
                settings.exports_dir,
                settings.logs_dir,
            ):
                self.assertTrue(directory.is_dir())
                self.assertEqual(directory.parent, Path(tmp))

    def test_data_dir_override_wins_over_localappdata(self) -> None:
        with TemporaryDirectory() as tmp:
            env = {
                "DOCFLOW_PLATFORM": "windows",
                "DOCFLOW_DATA_DIR": tmp,
                "LOCALAPPDATA": "C:\\Should\\Not\\Be\\Used",
            }
            with patch.dict(os.environ, env, clear=True):
                self.assertEqual(default_windows_data_dir(), Path(tmp))

    def test_data_dir_defaults_to_localappdata(self) -> None:
        env = {"LOCALAPPDATA": "C:\\Users\\test\\AppData\\Local"}
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(
                default_windows_data_dir(),
                Path("C:\\Users\\test\\AppData\\Local") / "DocFlow",
            )


if __name__ == "__main__":
    unittest.main()
