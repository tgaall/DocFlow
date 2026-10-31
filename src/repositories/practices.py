from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.domain import Group, Supervisor
from src.models.domain import Practice as PracticeModel


class PracticeRepository:
    def __init__(self, session: AsyncSession, user_id: int | None = None) -> None:
        self.session = session
        self.user_id = user_id

    async def group_exists(self, group: str) -> bool:
        stmt = (
            select(Group.id)
            .where(Group.name == group, Group.user_id == self.user_id)
            .limit(1)
        )
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
            select(Group).where(Group.name == group, Group.user_id == self.user_id)
        )
        group_model = group_result.scalar_one()
        if supervisor_id is not None:
            supervisor_result = await self.session.execute(
                select(Supervisor.id).where(
                    Supervisor.id == supervisor_id,
                    Supervisor.user_id == self.user_id,
                )
            )
            if supervisor_result.scalar_one_or_none() is None:
                raise ValueError("Supervisor not found")
        practice = PracticeModel(
            group_id=group_model.id,
            type=practice_type,
            start_date=start_date,
            end_date=end_date,
            supervisor_id=supervisor_id,
            user_id=self.user_id,
        )
        self.session.add(practice)
        await self.session.flush()
        return practice

    async def get_practices(self) -> list[PracticeModel]:
        stmt = select(PracticeModel).where(PracticeModel.user_id == self.user_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


class SupervisorRepository:
    def __init__(self, session: AsyncSession, user_id: int | None = None) -> None:
        self.session = session
        self.user_id = user_id

    async def supervisor_exists(self, supervisor: str) -> bool:
        stmt = (
            select(Supervisor.id)
            .where(
                Supervisor.full_name == supervisor,
                Supervisor.user_id == self.user_id,
            )
            .limit(1)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none() is not None

    async def create_supervisor(
        self,
        *,
        full_name: str,
        position: str,
    ) -> Supervisor:
        sup = Supervisor(full_name=full_name, position=position, user_id=self.user_id)
        self.session.add(sup)
        await self.session.flush()
        return sup

    async def get_supervisors(self) -> list[Supervisor]:
        stmt = select(Supervisor).where(Supervisor.user_id == self.user_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
