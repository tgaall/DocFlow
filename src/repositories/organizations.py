from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.domain import Organization as OrganizationModel


class OrganizationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_all(self) -> list[OrganizationModel]:
        result = await self.session.execute(select(OrganizationModel))
        return list(result.scalars().all())

    async def get_or_create(
        self, name: str, address: str | None
    ) -> tuple[OrganizationModel, bool]:
        stmt = select(OrganizationModel).where(
            OrganizationModel.name == name,
            OrganizationModel.address == address,
        )
        existing = (await self.session.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            return existing, False

        organization = OrganizationModel(name=name, address=address)
        self.session.add(organization)
        await self.session.flush()
        return organization, True