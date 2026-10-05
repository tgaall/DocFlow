from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_async_session
from src.repositories.organizations import OrganizationRepository
from src.schemas.imports import OrganizationRead

router = APIRouter(prefix="/organizations", tags=["Organizations"])


@router.get("", response_model=list[OrganizationRead])
async def get_organizations(
    session: AsyncSession = Depends(get_async_session),
) -> list[OrganizationRead]:
    return await OrganizationRepository(session).get_all()
