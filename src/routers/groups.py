from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_async_session
from src.auth.sessionbased import get_current_user
from src.models.auth import User
from src.repositories.students import GroupRepository
from src.schemas.imports import GroupRead

router = APIRouter(prefix="/groups", tags=["Groups"])


@router.get("", response_model=list[GroupRead])
async def get_groups(
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(get_current_user),
) -> list[GroupRead]:
    return await GroupRepository(
        session, user_id=user.user_id
    ).get_all_groups()
