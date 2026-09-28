from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_async_session
from src.repositories.practices import PracticeRepository
from src.schemas.imports import PracticeCreate, PracticeRead

router = APIRouter(prefix="/practice", tags=["Practice"])


@router.post(
    "/create",
    response_model=PracticeRead,
    status_code=status.HTTP_201_CREATED,
    summary="Создать практику для группы",
)
async def create_practice(
    practice_data: PracticeCreate,
    session: AsyncSession = Depends(get_async_session),
) -> PracticeRead:
    if practice_data.end_date < practice_data.start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Дата окончания практики не может быть раньше даты начала",
        )

    repo = PracticeRepository(session)
    if not await repo.group_exists(practice_data.group):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Группа {practice_data.group} не найдена",
        )

    try:
        practice = await repo.create(
            group=practice_data.group,
            practice_type=practice_data.type,
            start_date=practice_data.start_date,
            end_date=practice_data.end_date,
        )
        await session.commit()
    except Exception:
        await session.rollback()
        raise

    return PracticeRead.model_validate(practice)
