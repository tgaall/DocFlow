from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.static import Student as StudentModel


class StudentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_or_create(
        self, full_name: str, group: str
    ) -> tuple[StudentModel, bool]:
        stmt = select(StudentModel).where(
            StudentModel.full_name == full_name,
            StudentModel.group == group,
        )
        existing = (await self.session.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            return existing, False

        student = StudentModel(full_name=full_name, group=group)
        self.session.add(student)
        await self.session.flush()
        return student, True
