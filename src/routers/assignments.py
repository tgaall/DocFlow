from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_async_session
from src.repositories.assignments import AssignmentRepository
from src.schemas.assignments import (
    AssignmentCreate,
    AssignmentUpdate,
    AssignmentRead,
    MassAssignmentCreate,
)

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.post("/", response_model=AssignmentRead)
async def create_assignment(
    assignment_data: AssignmentCreate,
    session: AsyncSession = Depends(get_async_session),
):
    """
    Создать новое назначение студенту
    
    Если для данного студента и практики уже есть назначение, 
    оно будет обновлено новыми данными.
    """
    repo = AssignmentRepository(session)
    
    try:
        existing = await repo.get_by_student_practice(
            assignment_data.student_id,
            assignment_data.practice_id,
        )

        if existing:
            assignment = await repo.update_assignment(
                existing.id,
                AssignmentUpdate(
                    organization_id=assignment_data.organization_id,
                    supervisor_id=assignment_data.supervisor_id,
                    practice_form=assignment_data.practice_form,
                    payment_type=assignment_data.payment_type,
                    grade=assignment_data.grade,
                ),
            )
        else:
            assignment = await repo.create_assignment(assignment_data)

        await session.commit()
        await session.refresh(assignment)
    except Exception:
        await session.rollback()
        raise

    return assignment


@router.post("/mass", response_model=list[AssignmentRead])
async def mass_create_assignments(
    mass_data: MassAssignmentCreate,
    session: AsyncSession = Depends(get_async_session),
):
    """
    Массовое назначение организации всем студентам группы
    
    Создает или обновляет назначения для всех студентов указанной группы.
    """
    repo = AssignmentRepository(session)
    
    try:
        return await repo.mass_assign_to_group(
            group_id=mass_data.group_id,
            organization_id=mass_data.organization_id,
            practice_id=mass_data.practice_id,
            supervisor_id=mass_data.supervisor_id,
            practice_form=mass_data.practice_form,
            payment_type=mass_data.payment_type,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Ошибка массового назначения: {exc}",
        ) from exc


@router.patch("/{assignment_id}", response_model=AssignmentRead)
async def update_assignment(
    assignment_id: int,
    update_data: AssignmentUpdate,
    session: AsyncSession = Depends(get_async_session),
):
    """Обновить существующее назначение"""
    repo = AssignmentRepository(session)
    
    try:
        assignment = await repo.update_assignment(assignment_id, update_data)
        await session.commit()
        await session.refresh(assignment)
        return assignment
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        await session.rollback()
        raise


@router.get("/practice/{practice_id}", response_model=list[AssignmentRead])
async def get_assignments_by_practice(
    practice_id: int,
    session: AsyncSession = Depends(get_async_session),
):
    """Получить все назначения для практики"""
    repo = AssignmentRepository(session)
    assignments = await repo.get_by_practice(practice_id)
    return assignments


@router.get("/{assignment_id}", response_model=AssignmentRead)
async def get_assignment(
    assignment_id: int,
    session: AsyncSession = Depends(get_async_session),
):
    """Получить назначение по ID"""
    repo = AssignmentRepository(session)
    assignment = await repo.get_assignment(assignment_id)
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Назначение не найдено")
    
    return assignment