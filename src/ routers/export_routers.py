"""
TODO:
GET  /documents/directions?practice_id=   → направления, один .docx
GET  /documents/order/{practice_id}       → приказ
GET  /documents/report?year=              → сводный отчёт
"""

from fastapi import APIRouter, HTTPException, status, Depends

router = APIRouter(prefix="/export", tags=["export"])

#TODO сделать роутер для генерации направления. 
@