from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = "sqlite+aiosqlite:///./practice.db"


class Base(DeclarativeBase):
    pass
