"""
TODO:
POST /import/students
POST /import/organizations
POST /import/supervisors
POST /import/practices
POST /import/gradesheets
"""

from fastapi import APIRouter, HTTPException, status, Depends

router = APIRouter(prefix="/import", tags=["Import"])

@router.get