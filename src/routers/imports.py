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
from src.schemas.imports import ImportResult
from src.services.imports import import_organizations, import_students

router = APIRouter(prefix="/import", tags=["Import"])


@router.post(
    "/students",
    response_model=ImportResult,
    status_code=status.HTTP_200_OK,
    summary="Импорт студентов из Excel",
)
async def import_students_endpoint(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_async_session),
) -> ImportResult:
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ожидается .xlsx файл",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Пустой файл")

    try:
        return await import_students(session, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/organizations",
    response_model=ImportResult,
    status_code=status.HTTP_200_OK,
    summary="Импорт компаний из TXT Windows-1251",
)
async def import_organizations_endpoint(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_async_session),
) -> ImportResult:
    if not file.filename or not file.filename.lower().endswith(".txt"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ожидается .txt файл",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Пустой файл")

    try:
        return await import_organizations(session, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
