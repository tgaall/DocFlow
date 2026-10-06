from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.domain import (
    Assignment,
    Group,
    Organization,
    Practice,
    Student,
    Supervisor,
)
from src.schemas.assignments import AssignmentCreate, AssignmentUpdate


class AssignmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_assignment(self, data: AssignmentCreate) -> Assignment:
        assignment = Assignment(**data.model_dump())
        self.session.add(assignment)
        await self.session.flush()
        return assignment

    async def get_assignment(self, assignment_id: int) -> Assignment | None:
        return await self.session.get(Assignment, assignment_id)

    async def update_assignment(
        self, assignment_id: int, data: AssignmentUpdate
    ) -> Assignment:
        assignment = await self.get_assignment(assignment_id)
        if assignment is None:
            raise ValueError(f"Assignment {assignment_id} not found")

        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(assignment, field, value)

        await self.session.flush()
        return assignment

    async def get_by_student_practice(
        self, student_id: int, practice_id: int
    ) -> Assignment | None:
        statement = select(Assignment).where(
            Assignment.student_id == student_id,
            Assignment.practice_id == practice_id,
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_practice(self, practice_id: int) -> list[Assignment]:
        statement = select(Assignment).where(Assignment.practice_id == practice_id)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_directions_data(self, group_name: str) -> list[dict[str, str]]:
        statement = (
            select(Student, Assignment, Organization, Practice, Group)
            .join(Assignment, Assignment.student_id == Student.id)
            .join(Organization, Organization.id == Assignment.organization_id)
            .join(Practice, Practice.id == Assignment.practice_id)
            .join(Group, Group.id == Student.group_id)
            .where(Group.name == group_name)
            .order_by(Student.full_name)
        )
        result = await self.session.execute(statement)

        directions: list[dict[str, str]] = []
        today = date.today()
        for student, assignment, organization, practice, group in result.all():
            student_course = max(
                1,
                today.year - group.year + int(today.month >= 9),
            )
            directions.append(
                {
                    "course": str(student_course),
                    "student_full_name": student.full_name,
                    "group_name": group.name,
                    "practice_type": practice.type,
                    "organization_name": organization.name,
                    "organization_address": organization.address or "",
                    "start_date": practice.start_date.strftime("%d.%m.%Y"),
                    "end_date": practice.end_date.strftime("%d.%m.%Y"),
                    "practice_start_date": practice.start_date.strftime("%d.%m.%Y"),
                    "practice_end_date": practice.end_date.strftime("%d.%m.%Y"),
                    "student_course": str(student_course),
                }
            )

        return directions

    async def mass_assign_to_group(
        self,
        group_id: int,
        organization_id: int,
        practice_id: int,
        supervisor_id: int | None = None,
        practice_form: str | None = None,
        payment_type: str | None = None,
    ) -> list[Assignment]:
        """Create or update this practice's assignment for every student in a group."""
        try:
            statement = select(Student).where(Student.group_id == group_id)
            result = await self.session.execute(statement)
            students = list(result.scalars().all())

            assignments: list[Assignment] = []
            for student in students:
                existing = await self.get_by_student_practice(student.id, practice_id)
                if existing is not None:
                    assignment = existing
                    assignment.organization_id = organization_id
                    assignment.supervisor_id = supervisor_id
                    assignment.practice_form = practice_form
                    assignment.payment_type = payment_type
                else:
                    assignment = Assignment(
                        student_id=student.id,
                        organization_id=organization_id,
                        practice_id=practice_id,
                        supervisor_id=supervisor_id,
                        practice_form=practice_form,
                        payment_type=payment_type,
                    )
                    self.session.add(assignment)
                assignments.append(assignment)

            await self.session.commit()
            for assignment in assignments:
                await self.session.refresh(assignment)
            return assignments
        except Exception:
            await self.session.rollback()
            raise

    async def get_order_rows(
        self,
        practice_type: str,
        groups: list[str] | None = None,
    ) -> list[dict[str, str]]:
        statement = (
            select(Student, Assignment, Organization, Practice, Supervisor, Group)
            .outerjoin(Assignment, Assignment.student_id == Student.id)
            .outerjoin(Organization, Organization.id == Assignment.organization_id)
            .outerjoin(Practice, Practice.id == Assignment.practice_id)
            .outerjoin(Supervisor, Supervisor.id == Assignment.supervisor_id)
            .join(Group, Group.id == Student.group_id)
            .order_by(Student.id, Assignment.id)
        )
        if groups:
            statement = statement.where(Group.name.in_(groups))
        statement = statement.where(Practice.type == practice_type)
        result = await self.session.execute(statement)

        rows: list[dict[str, str]] = []
        for student, assignment, organization, practice, supervisor, group in result.all():
            organization_display = ""
            if organization is not None:
                organization_display = organization.name
                if organization.address:
                    organization_display = f"{organization.name}, {organization.address}"

            rows.append(
                {
                    "full_name": student.full_name,
                    "group": group.name,
                    "org_display": organization_display,
                    "practice_type": practice.type if practice else "",
                    "start_date": (
                        practice.start_date.strftime("%d.%m.%Y")
                        if practice and practice.start_date
                        else ""
                    ),
                    "end_date": (
                        practice.end_date.strftime("%d.%m.%Y")
                        if practice and practice.end_date
                        else ""
                    ),
                    "practice_form": assignment.practice_form if assignment else "",
                    "payment_type": assignment.payment_type if assignment else "",
                    "supervisor": supervisor.full_name if supervisor else "",
                }
            )

        return rows