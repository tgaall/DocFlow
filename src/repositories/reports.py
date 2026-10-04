from datetime import date

from sqlalchemy import case, func, select

from sqlalchemy.ext.asyncio import AsyncSession

from src.models.domain import Assignment, Group, GroupReport, Practice, Student


class ReportRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_groups_report_data(
        self,
        practice_type: str | None = None,
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
                func.count(
                    func.distinct(
                        case(
                            (Assignment.payment_type.is_not(None), Student.id),
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
                & (Assignment.practice_id == Practice.id)
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
        )
        
        # Применить фильтры
        if practice_type:
            stmt = stmt.where(Practice.type == practice_type)
        
        result = await self.session.execute(stmt)
        rows = result.all()
        
        # Преобразовать в формат для шаблона
        report_data: list[dict[str, str | int]] = []
        for row in rows:
            report_data.append(
                {
                    "group_name": row.group_name,
                    "start_date": (
                        row.start_date.strftime("%d.%m.%Y") if row.start_date else ""
                    ),
                    "end_date": (
                        row.end_date.strftime("%d.%m.%Y") if row.end_date else ""
                    ),
                    "count_stud": row.total_students or 0,
                    "payed_students": row.payed_students_count or 0,
                }
            )
        
        return report_data

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