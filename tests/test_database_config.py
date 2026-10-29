import os
import unittest
from unittest.mock import patch

from src.db.base import DEFAULT_DATABASE_URL, get_database_url


class DatabaseConfigTests(unittest.TestCase):
    def test_defaults_to_sqlite_when_database_url_is_not_set(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(get_database_url(), DEFAULT_DATABASE_URL)

    def test_reads_database_url_from_environment(self) -> None:
        url = "postgresql://user:password@db.example/docflow"
        with patch.dict(os.environ, {"DATABASE_URL": url}, clear=True):
            self.assertEqual(
                get_database_url(),
                "postgresql+asyncpg://user:password@db.example/docflow",
            )

    def test_converts_postgres_scheme_to_asyncpg(self) -> None:
        self.assertEqual(
            get_database_url("postgres://user:password@db.example/docflow"),
            "postgresql+asyncpg://user:password@db.example/docflow",
        )

    def test_converts_postgresql_scheme_to_asyncpg(self) -> None:
        self.assertEqual(
            get_database_url("postgresql://user:password@db.example/docflow"),
            "postgresql+asyncpg://user:password@db.example/docflow",
        )

    def test_preserves_explicit_async_driver(self) -> None:
        url = "postgresql+asyncpg://user:password@db.example/docflow"
        self.assertEqual(get_database_url(url), url)

    def test_preserves_sqlite_url(self) -> None:
        self.assertEqual(
            get_database_url("sqlite+aiosqlite:///./test.db"),
            "sqlite+aiosqlite:///./test.db",
        )


if __name__ == "__main__":
    unittest.main()