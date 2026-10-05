import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.domain import Group
from src.models.domain import Student as StudentModel

INTAKE_YEAR_PATTERN = re.compile(r"-(\d{2})-")


class StudentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_or_create(
        self, full_name: str, group: str, record_book: int
    ) -> tuple[StudentModel, bool]:
        stmt = select(StudentModel).where(StudentModel.record_book == record_book)
        existing = (await self.session.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            existing_group = await self.session.get(Group, existing.group_id)
            if (
                existing.full_name != full_name
                or existing_group is None
                or existing_group.name != group
            ):
                raise ValueError(
                    f"Номер зачётки {record_book} уже связан с другими данными"
                )
            return existing, False

        group_result = await self.session.execute(
            select(Group).where(Group.name == group)
        )
        group_model = group_result.scalar_one_or_none()
        if group_model is None:
            match = INTAKE_YEAR_PATTERN.search(group)
            if match is None:
                raise ValueError(
                    f"Не удалось определить год набора из названия группы {group!r}"
                )
            group_model = Group(name=group, year=2000 + int(match.group(1)))
            self.session.add(group_model)
            await self.session.flush()

        student = StudentModel(
            full_name=full_name,
            group_id=group_model.id,
            record_book=record_book,
        )
        self.session.add(student)
        await self.session.flush()
        return student, True

    async def get_students(self, group_id: int | None = None) -> list[StudentModel]:
        stmt = select(StudentModel)
        if group_id is not None:
            stmt = stmt.where(StudentModel.group_id == group_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


class GroupRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def is_exist(self, group_name: str) -> bool:
        stmt = select(Group).where(Group.name == group_name)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def get_group(self, group_name: str) -> Group | None:
        stmt = select(Group).where(Group.name == group_name)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_groups(self) -> list[Group]:
        stmt = select(Group)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
