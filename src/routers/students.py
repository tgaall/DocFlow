from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_async_session
from src.repositories.students import StudentRepository
from src.schemas.imports import StudentRead

router = APIRouter(prefix="/students", tags=["Students"])


@router.get("", response_model=list[StudentRead])
async def get_students(
    group_id: int | None = Query(default=None, gt=0),
    session: AsyncSession = Depends(get_async_session),
) -> list[StudentRead]:
    return await StudentRepository(session).get_students(group_id=group_id)