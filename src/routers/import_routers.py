"""
TODO:
POST /import/students -- сделано
POST /import/organizations
POST /import/supervisors
POST /import/practices
POST /import/gradesheets
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_async_session
from src.schemas.get_docs import ImportResult
from src.services.get_docs import import_students

router = APIRouter(prefix="/import", tags=["Import"])


@router.post(
    "/students",
    response_model=ImportResult,
    status_code=status.HTTP_200_OK,
    summary="Импорт студентов из Excel (ФИО, Группа)",
)
async def import_students_endpoint(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_async_session),
) -> ImportResult:
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ожидается .xlsx/.xls файл",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Пустой файл")

    try:
        return await import_students(session, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
