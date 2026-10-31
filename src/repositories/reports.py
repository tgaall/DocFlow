from datetime import date

from sqlalchemy import case, func, select

from sqlalchemy.ext.asyncio import AsyncSession

from src.models.domain import (
    Assignment,
    Group,
    GroupReport,
    Organization,
    Practice,
    Student,
    Supervisor,
)


class ReportRepository:
    def __init__(self, session: AsyncSession, user_id: int | None = None) -> None:
        self.session = session
        self.user_id = user_id

    async def get_groups_report_data(
        self,
        practice_ids: list[int] | None = None,
        practice_type: str | None = None,
        groups: list[str] | None = None,
    ) -> list[dict]:
        """
        Получить данные для отчета по группам

        Returns:
            Список словарей с данными по группам для шаблона Report_template.docx
        """
        # Базовый запрос для получения практик с группами
        stmt = (
            select(
                Group.name.label("group_name"),
                Practice.type.label("practice_type"),
                Practice.start_date,
                Practice.end_date,
                func.count(func.distinct(Student.id)).label("total_students"),
                *[
                    func.count(
                        func.distinct(
                            case((Student.grade == grade, Student.id), else_=None)
                        )
                    ).label(f"count{grade}")
                    for grade in (5, 4, 3, 2)
                ],
                func.count(
                    func.distinct(
                        case(
                            (
                                Assignment.payment_type == "С оплатой",
                                Student.id,
                            ),
                            else_=None,
                        )
                    )
                ).label("payed_students_count"),
            )
            .join(Practice, Practice.group_id == Group.id)
            .join(Student, Student.group_id == Group.id)
            .outerjoin(
                Assignment,
                (Assignment.student_id == Student.id)
                & (Assignment.practice_id == Practice.id),
            )
            .group_by(
                Group.id,
                Group.name,
                Practice.id,
                Practice.type,
                Practice.start_date,
                Practice.end_date,
            )
            .order_by(Group.name)
            .where(
                Practice.user_id == self.user_id,
                Group.user_id == self.user_id,
                Student.user_id == self.user_id,
            )
        )

        # Применить фильтры
        if practice_ids:
            stmt = stmt.where(Practice.id.in_(practice_ids))
        if practice_type:
            stmt = stmt.where(Practice.type == practice_type)
        if groups:
            stmt = stmt.where(Group.name.in_(groups))

        result = await self.session.execute(stmt)
        rows = result.all()

        # Преобразовать в формат для шаблона
        report_data: list[dict[str, str | int]] = []
        for row in rows:
            report_data.append(
                {
                    "group_name": row.group_name,
                    "practice_type": row.practice_type,
                    "start_date": (
                        row.start_date.strftime("%d.%m.%Y") if row.start_date else ""
                    ),
                    "end_date": (
                        row.end_date.strftime("%d.%m.%Y") if row.end_date else ""
                    ),
                    "count_stud": row.total_students or 0,
                    "count5": row.count5 or 0,
                    "count4": row.count4 or 0,
                    "count3": row.count3 or 0,
                    "count2": row.count2 or 0,
                    "payed_students": row.payed_students_count or 0,
                }
            )

        return report_data

    async def get_companies_report_data(
        self, practice_ids: list[int] | None = None
    ) -> list[dict[str, str | int]]:
        """Return organizations, student counts, and workplace supervisors."""
        stmt = (
            select(
                Organization.id,
                Organization.name,
                Student.id,
                Supervisor.full_name,
            )
            .join(Assignment, Assignment.organization_id == Organization.id)
            .join(Student, Student.id == Assignment.student_id)
            .join(Practice, Practice.id == Assignment.practice_id)
            .outerjoin(
                Supervisor,
                (Supervisor.id == Assignment.supervisor_id)
                & (Supervisor.user_id == self.user_id),
            )
            .where(
                Practice.user_id == self.user_id,
                Organization.user_id == self.user_id,
                Student.user_id == self.user_id,
            )
        )
        if practice_ids:
            stmt = stmt.where(Practice.id.in_(practice_ids))

        result = await self.session.execute(stmt)
        companies: dict[int, tuple[str, set[int], set[str]]] = {}
        for (
            organization_id,
            organization_name,
            student_id,
            supervisor_name,
        ) in result.all():
            company = companies.get(organization_id)
            if company is None:
                company = (organization_name, set(), set())
                companies[organization_id] = company
            company[1].add(student_id)
            if supervisor_name:
                company[2].add(supervisor_name)

        return [
            {
                "name": name,
                "count": len(student_ids),
                "supervisors": ", ".join(sorted(supervisors)),
            }
            for name, student_ids, supervisors in sorted(
                companies.values(), key=lambda company: company[0]
            )
        ]

    async def get_department_supervisors(
        self, practice_ids: list[int] | None = None
    ) -> str:
        """Return unique faculty practice supervisors as a display string."""
        stmt = (
            select(Supervisor.full_name)
            .join(Practice, Practice.supervisor_id == Supervisor.id)
            .distinct()
            .where(
                Practice.user_id == self.user_id,
                Supervisor.user_id == self.user_id,
            )
        )
        if practice_ids:
            stmt = stmt.where(Practice.id.in_(practice_ids))

        result = await self.session.execute(stmt)
        return ", ".join(sorted(result.scalars().all()))

    async def create_group_report(
        self,
        group_id: int,
        practice_id: int,
        total_students: int,
        completed_count: int | None = None,
        average_grade: float | None = None,
        payed_students_count: int | None = None,
    ) -> GroupReport:
        """Создать запись отчета по группе"""
        report = GroupReport(
            user_id=self.user_id,
            group_id=group_id,
            practice_id=practice_id,
            total_students=total_students,
            completed_count=completed_count,
            average_grade=average_grade,
            payed_students_count=payed_students_count,
            report_date=date.today(),
        )

        self.session.add(report)
        await self.session.commit()
        await self.session.refresh(report)
        return report

    async def get_group_report(self, report_id: int) -> GroupReport | None:
        """Получить отчет по ID"""
        return await self.session.get(GroupReport, report_id)

    async def get_reports_by_group(self, group_id: int) -> list[GroupReport]:
        """Получить все отчеты по группе"""
        stmt = select(GroupReport).where(GroupReport.group_id == group_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
