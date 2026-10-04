from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.domain import Group, Supervisor
from src.models.domain import Practice as PracticeModel


class PracticeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def group_exists(self, group: str) -> bool:
        stmt = select(Group.id).where(Group.name == group).limit(1)
        return (await self.session.execute(stmt)).scalar_one_or_none() is not None

    async def create(
        self,
        *,
        group: str,
        practice_type: str,
        start_date: date,
        end_date: date,
        supervisor_id: int | None = None,
    ) -> PracticeModel:
        group_result = await self.session.execute(
            select(Group).where(Group.name == group)
        )
        group_model = group_result.scalar_one()
        practice = PracticeModel(
            group_id=group_model.id,
            type=practice_type,
            start_date=start_date,
            end_date=end_date,
            supervisor_id=supervisor_id,
        )
        self.session.add(practice)
        await self.session.flush()
        return practice


class SupervisorRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def supervisor_exists(self, supervisor: str) -> bool:
        stmt = select(Supervisor.id).where(Supervisor.full_name == supervisor).limit(1)
        return (await self.session.execute(stmt)).scalar_one_or_none() is not None

    async def create_supervisor(
        self,
        *,
        full_name: str,
        position: str,
    ) -> Supervisor:
        sup = Supervisor(full_name=full_name, position=position)
        self.session.add(sup)
        await self.session.flush()
        return sup
