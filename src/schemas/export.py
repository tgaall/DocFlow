from pydantic import BaseModel, ConfigDict


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


# temporaly
class AssignmentContext(BaseModel):
    student_full_name: str
    group_name: str
    student_course: str
    practice_type: str
    practice_start_date: str
    practice_end_date: str
    organization_name: str
