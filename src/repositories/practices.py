from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.domain import Practice as PracticeModel
from src.models.domain import Student


class PracticeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def group_exists(self, group: str) -> bool:
        stmt = select(Student.id).where(Student.group == group).limit(1)
        return (await self.session.execute(stmt)).scalar_one_or_none() is not None

    async def create(
        self,
        *,
        group: str,
        practice_type: str,
        start_date: date,
        end_date: date,
    ) -> PracticeModel:
        practice = PracticeModel(
            group=group,
            type=practice_type,
            start_date=start_date,
            end_date=end_date,
        )
        self.session.add(practice)
        await self.session.flush()
        return practice