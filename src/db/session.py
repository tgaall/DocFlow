from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from src.config import get_settings

_engines: dict[str, AsyncEngine] = {}
_session_factories: dict[str, async_sessionmaker[AsyncSession]] = {}


def get_engine() -> AsyncEngine:
    database_url = get_settings().database_url
    if database_url not in _engines:
        _engines[database_url] = create_async_engine(database_url, echo=False)
    return _engines[database_url]


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    database_url = get_settings().database_url
    if database_url not in _session_factories:
        _session_factories[database_url] = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factories[database_url]


async def dispose_engines() -> None:
    for engine in _engines.values():
        await engine.dispose()
    _engines.clear()
    _session_factories.clear()


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with get_session_factory()() as session:
        yield session
