from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.domain import (
    Assignment,
    Organization,
    Practice,
    Student,
)


class AssignmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_order_rows(self) -> list[dict[str, str]]:
        statement = (
            select(Student, Assignment, Organization, Practice)
            .outerjoin(Assignment, Assignment.student_id == Student.id)
            .outerjoin(Organization, Organization.id == Assignment.organization_id)
            .outerjoin(Practice, Practice.id == Assignment.practice_id)
            .order_by(Student.id, Assignment.id)
        )
        result = await self.session.execute(statement)

        rows: list[dict[str, str]] = []
        for student, assignment, organization, practice in result.all():
            organization_display = ""
            if organization is not None:
                organization_display = organization.name
                if organization.address:
                    organization_display = f"{organization.name}, {organization.address}"

            rows.append(
                {
                    "full_name": student.full_name,
                    "group": student.group,
                    "org_display": organization_display,
                    "practice_type": practice.type if practice is not None else "",
                    "start_date": (
                        practice.start_date.strftime("%d.%m.%Y")
                        if practice is not None and practice.start_date is not None
                        else ""
                    ),
                    "end_date": (
                        practice.end_date.strftime("%d.%m.%Y")
                        if practice is not None and practice.end_date is not None
                        else ""
                    ),
                    "practice_form": "",
                    "payment_type": "",
                    # The ORM has no department-supervisor relationship.
                    "kafedra_supervisor": "",
                }
            )

        return rows
