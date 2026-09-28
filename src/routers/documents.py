"""
TODO:
GET  /documents/assignment?practice_id=   → направления, один .docx
GET  /documents/order/{practice_id}       → приказ
GET  /documents/report?year=              → сводный отчёт
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_async_session
from src.repositories.assignments import AssignmentRepository
from src.schemas.documents import DirectionContext
from src.services.documents import render_direction, render_order

router = APIRouter(prefix="/export", tags=["export"])
order_router = APIRouter(prefix="/documents", tags=["Documents"])
DOCX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


# TODO сделать роутер для генерации направления.
@router.post(
    "/directions/test",
    status_code=status.HTTP_200_OK,
    responses={
        200: {
            "content": {
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {}
            },
            "description": "Готовый .docx",
        }
    },
)
async def render_direction_test(context: DirectionContext) -> Response:
    docx_bytes = render_direction(context.model_dump())
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": 'attachment; filename="direction.docx"',
        },
    )


@order_router.get(
    "/order",
    status_code=status.HTTP_200_OK,
    summary="Скачать приказ по всем студентам",
    responses={
        200: {
            "content": {DOCX_MEDIA_TYPE: {}},
            "description": "Готовый приказ в формате DOCX",
        },
        404: {"description": "Нет импортированных студентов"},
    },
)
async def download_order(
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    rows = await AssignmentRepository(session).get_order_rows()
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
