from pydantic import BaseModel, ConfigDict


class AssignmentCreate(BaseModel):
    student_id: int
    organization_id: int
    supervisor_id: int | None = None
    practice_id: int


class AssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_id: int
    organization_id: int
    supervisor_id: int | None = None
    practice_id: int
    grade: str | None = None


class AssignmentGradeUpdate(BaseModel):
    grade: str
