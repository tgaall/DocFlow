from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_async_session
from src.auth.sessionbased import get_current_user
from src.models.auth import User
from src.repositories.organizations import OrganizationRepository
from src.schemas.imports import OrganizationRead

router = APIRouter(prefix="/organizations", tags=["Organizations"])


@router.get("", response_model=list[OrganizationRead])
async def get_organizations(
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(get_current_user),
) -> list[OrganizationRead]:
    return await OrganizationRepository(
        session, user_id=user.user_id
    ).get_all()
