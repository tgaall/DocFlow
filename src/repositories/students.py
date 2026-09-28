from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.domain import Student as StudentModel


class StudentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_or_create(
        self, full_name: str, group: str, record_book: int
    ) -> tuple[StudentModel, bool]:
        stmt = select(StudentModel).where(StudentModel.record_book == record_book)
        existing = (await self.session.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            if existing.full_name != full_name or existing.group != group:
                raise ValueError(
                    f"Номер зачётки {record_book} уже связан с другими данными"
                )
            return existing, False

        student = StudentModel(
            full_name=full_name,
            group=group,
            record_book=record_book,
        )
        self.session.add(student)
        await self.session.flush()
        return student, True
