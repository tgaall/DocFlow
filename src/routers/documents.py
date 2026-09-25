"""
TODO:
GET  /documents/assignment?practice_id=   → направления, один .docx
GET  /documents/order/{practice_id}       → приказ
GET  /documents/report?year=              → сводный отчёт
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response

from src.schemas.documents import DirectionContext
from src.services.documents import render_direction

router = APIRouter(prefix="/export", tags=["export"])


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
