from pydantic import BaseModel, ConfigDict
from typing import Optional


class AssignmentBase(BaseModel):
    """Базовая схема для назначения"""
    student_id: int
    organization_id: int
    practice_id: int
    supervisor_id: Optional[int] = None
    practice_form: Optional[str] = None
    payment_type: Optional[str] = None
    grade: Optional[str] = None


class AssignmentCreate(AssignmentBase):
    """Схема для создания назначения"""
    pass


class AssignmentUpdate(BaseModel):
    """Схема для обновления назначения"""
    organization_id: Optional[int] = None
    supervisor_id: Optional[int] = None
    practice_form: Optional[str] = None
    payment_type: Optional[str] = None
    grade: Optional[str] = None


class AssignmentRead(AssignmentBase):
    """Схема для чтения назначения"""
    model_config = ConfigDict(from_attributes=True)
    id: int


class AssignmentGradeUpdate(BaseModel):
    """Схема для обновления оценки (уже существующая)"""
    grade: str


class MassAssignmentCreate(BaseModel):
    """Схема для массового назначения всей группе"""
    group_id: int
    organization_id: int
    practice_id: int
    supervisor_id: Optional[int] = None
    practice_form: Optional[str] = None
    payment_type: Optional[str] = None
