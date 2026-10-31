from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.domain import Organization as OrganizationModel


class OrganizationRepository:
    def __init__(self, session: AsyncSession, user_id: int | None = None) -> None:
        self.session = session
        self.user_id = user_id

    async def get_all(self) -> list[OrganizationModel]:
        result = await self.session.execute(
            select(OrganizationModel).where(OrganizationModel.user_id == self.user_id)
        )
        return list(result.scalars().all())

    async def get_or_create(
        self, name: str, address: str | None
    ) -> tuple[OrganizationModel, bool]:
        stmt = select(OrganizationModel).where(
            OrganizationModel.name == name,
            OrganizationModel.address == address,
            OrganizationModel.user_id == self.user_id,
        )
        existing = (await self.session.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            return existing, False

        organization = OrganizationModel(
            name=name, address=address, user_id=self.user_id
        )
        self.session.add(organization)
        await self.session.flush()
        return organization, True