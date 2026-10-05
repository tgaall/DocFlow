from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_async_session
from src.repositories.practices import SupervisorRepository
from src.schemas.imports import SupervisorRead

router = APIRouter(prefix="/supervisors", tags=["Supervisors"])


@router.get("", response_model=list[SupervisorRead])
async def get_supervisors(
    session: AsyncSession = Depends(get_async_session),
) -> list[SupervisorRead]:
    return await SupervisorRepository(session).get_supervisors()
