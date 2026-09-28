from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncConnection

from src.db.base import Base
from src.db.session import engine

# Import models before create_all so SQLAlchemy knows about their tables.
from src.models import domain  # noqa: F401  (register tables before create_all)


async def migrate_legacy_schema(connection: AsyncConnection) -> None:
    """Rename the old misspelled organization column without losing its data."""
    if connection.dialect.name != "sqlite":
        return

    def get_organization_columns(sync_connection) -> set[str]:
        inspector = inspect(sync_connection)
        if not inspector.has_table("organizations"):
            return set()
        return {column["name"] for column in inspector.get_columns("organizations")}

    columns = await connection.run_sync(get_organization_columns)
    if "addres" in columns and "address" not in columns:
        await connection.exec_driver_sql(
            'ALTER TABLE "organizations" RENAME COLUMN "addres" TO "address"'
        )


async def init_db() -> None:
    async with engine.begin() as connection:
        await migrate_legacy_schema(connection)
        await connection.run_sync(Base.metadata.create_all)
