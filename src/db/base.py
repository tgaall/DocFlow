import os

from sqlalchemy.orm import DeclarativeBase

DEFAULT_DATABASE_URL = "sqlite+aiosqlite:///./practice.db"


def get_database_url(database_url: str | None = None) -> str:
    """Return a SQLAlchemy URL using the async driver for PostgreSQL."""
    database_url = database_url or os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)

    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+asyncpg://", 1)

    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    return database_url


class Base(DeclarativeBase):
    pass
