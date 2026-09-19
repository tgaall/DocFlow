"""from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.models.static import Assignment as assignment


context = {
    "student_full_name": assignment.student.full_name,
    "group_name":        assignment.student.group,
    "student_course":    assignment.student.course,   # см. проблему ниже
    "practice_type":     assignment.practice.type,
    "practice_start_date": assignment.practice.start_date.strftime("%d.%m.%Y"),
    "practice_end_date":   assignment.practice.end_date.strftime("%d.%m.%Y"),
    "organization_name": assignment.organization.name,
}


class AssignmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_assignment_data(
            self,
    ):

"""
