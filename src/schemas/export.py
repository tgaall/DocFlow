from pydantic import BaseModel, ConfigDict, Field


class AssignmentCreate(BaseModel):
    student_id: int
    organization_id: int
    supervisor_id: int
    practise_id: int


class AssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    supervisor_id: int
    practise_id: int
    grade: int | None = None


class AssignmentGradeUpdate(BaseModel):
    grade: str
