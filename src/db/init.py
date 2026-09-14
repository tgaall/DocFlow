from src.db.base import Base
from src.db.session import engine

# Import models before create_all so SQLAlchemy knows about their tables.
from src.models import static


async def init_db() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
