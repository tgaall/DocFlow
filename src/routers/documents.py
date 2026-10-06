from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_async_session
from src.repositories.assignments import AssignmentRepository
from src.repositories.reports import ReportRepository
from src.schemas.documents import DirectionContext
from src.services.documents import (
    render_direction,
    render_directions,
    render_order,
    render_report,
)

router = APIRouter(prefix="/export", tags=["export"])
order_router = APIRouter(prefix="/documents", tags=["Documents"])
DOCX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


async def render_direction_test(context: DirectionContext) -> Response:
    return Response(
        content=render_direction(context.model_dump()),
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="direction.docx"'},
    )


@order_router.get(
    "/directions",
    status_code=status.HTTP_200_OK,
    summary="Скачать направления студентов по практике",
    responses={
        200: {
            "content": {DOCX_MEDIA_TYPE: {}},
            "description": "Единый документ DOCX с направлениями по практике",
        },
        404: {"description": "Нет назначенных студентов по практике"},
    },
)
async def download_directions(
    practice_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    directions = await AssignmentRepository(session).get_directions_data(practice_id)
    if not directions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Нет назначенных студентов по практике",
        )

    return Response(
        content=render_directions(directions),
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="directions.docx"'},
    )


@order_router.get(
    "/order",
    status_code=status.HTTP_200_OK,
    summary="Скачать приказ по выбранным группам или всем студентам",
    responses={
        200: {
            "content": {DOCX_MEDIA_TYPE: {}},
            "description": "Готовый приказ в формате DOCX",
        },
        404: {"description": "Нет импортированных студентов"},
    },
)
async def download_order(
    practice_type: str,
    session: AsyncSession = Depends(get_async_session),
    groups: Annotated[list[str] | None, Query()] = None,
) -> Response:
    rows = await AssignmentRepository(session).get_order_rows(
        groups=groups,
        practice_type=practice_type,
    )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Нет импортированных студентов",
        )

    return Response(
        content=render_order(rows),
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="order.docx"'},
    )


@order_router.get(
    "/report",
    status_code=status.HTTP_200_OK,
    summary="Скачать сводный отчет по выбранным группам и типу практики",
    responses={
        200: {
            "content": {DOCX_MEDIA_TYPE: {}},
            "description": "Готовый отчет в формате DOCX",
        },
        404: {"description": "Нет данных для отчета"},
    },
)
async def download_report(
    practice_type: str | None = None,
    groups: Annotated[list[str] | None, Query()] = None,
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    groups_data = await ReportRepository(session).get_groups_report_data(
        practice_type=practice_type,
        groups=groups,
    )
    if not groups_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Нет данных для отчета",
        )

    return Response(
        content=render_report(groups_data, practice_type or "Практика"),
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="report.docx"'},
    )
