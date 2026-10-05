from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_async_session
from src.repositories.students import GroupRepository
from src.schemas.imports import GroupRead

router = APIRouter(prefix="/groups", tags=["Groups"])


@router.get("", response_model=list[GroupRead])
async def get_groups(
    session: AsyncSession = Depends(get_async_session),
) -> list[GroupRead]:
    return await GroupRepository(session).get_all_groups()
