from pydantic import BaseModel


class DirectionContext(BaseModel):
    student_full_name: str
    group_name: str
    student_course: str
    practice_type: str
    practice_start_date: str
    practice_end_date: str
    organization_name: str
    organization_address: str | None = None
