from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_async_session
from src.repositories.practices import PracticeRepository, SupervisorRepository
from src.schemas.imports import (
    PracticeCreate,
    PracticeListRead,
    PracticeRead,
    SupervisorCreate,
    SupervisorRead,
)

router = APIRouter(prefix="/practice", tags=["Practice"])
practice_list_router = APIRouter(prefix="/practices", tags=["Practices"])


@practice_list_router.get(
    "", response_model=list[PracticeListRead], summary="Получить список практик"
)
async def get_practices(
    session: AsyncSession = Depends(get_async_session),
) -> list[PracticeListRead]:
    return await PracticeRepository(session).get_practices()


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
            supervisor_id=practice_data.supervisor_id,
        )
        await session.commit()
    except Exception:
        await session.rollback()
        raise

    return PracticeRead(
        id=practice.id,
        group=practice_data.group,
        type=practice.type,
        start_date=practice.start_date,
        end_date=practice.end_date,
        supervisor_id=practice.supervisor_id,
    )


@router.post(
    "/create_supervisor",
    response_model=SupervisorRead,
    status_code=status.HTTP_201_CREATED,
    summary="Создать руководителя практики",
)
async def create_supervisor(
    sup_data: SupervisorCreate, session: AsyncSession = Depends(get_async_session)
) -> SupervisorRead:
    repo = SupervisorRepository(session)
    try:
        sup = await repo.create_supervisor(
            full_name=sup_data.full_name, position=sup_data.position
        )
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return SupervisorRead(id=sup.id, full_name=sup.full_name, position=sup.position)
