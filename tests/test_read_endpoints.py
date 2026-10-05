import unittest
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory

from pydantic import TypeAdapter
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.db.base import Base
from src.main import app
from src.models.domain import Group, Organization, Practice, Student, Supervisor
from src.routers.groups import get_groups
from src.routers.orgs import get_organizations
from src.routers.practices import get_practices
from src.routers.students import get_students
from src.routers.supervisors import get_supervisors
from src.schemas.imports import (
    GroupRead,
    OrganizationRead,
    PracticeListRead,
    StudentRead,
    SupervisorRead,
)


class ReadEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        database_path = Path(self.temp_dir.name) / "read_endpoints.db"
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)

        async with self.session_factory() as session:
            group_one = Group(name="ГР-25", department="ИТ", year=2025)
            group_two = Group(name="ГР-24", department=None, year=2024)
            supervisor = Supervisor(full_name="Иванов И.И.", position="Преподаватель")
            organization = Organization(name="ООО Пример", address="г. Уфа")
            session.add_all([group_one, group_two, supervisor, organization])
            await session.flush()

            session.add_all(
                [
                    Student(
                        full_name="Петров П.П.",
                        group_id=group_one.id,
                        record_book=2501,
                    ),
                    Student(
                        full_name="Сидорова А.А.",
                        group_id=group_two.id,
                        record_book=2401,
                    ),
                ]
            )
            session.add(
                Practice(
                    type="Учебная",
                    start_date=date(2026, 6, 1),
                    end_date=date(2026, 6, 30),
                    group_id=group_one.id,
                    supervisor_id=supervisor.id,
                )
            )
            await session.commit()

        self.group_id = group_one.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()
        self.temp_dir.cleanup()

    async def test_groups_endpoint_returns_group_schema(self) -> None:
        async with self.session_factory() as session:
            groups = await get_groups(session)

        parsed = TypeAdapter(list[GroupRead]).validate_python(groups)
        self.assertEqual({group.name for group in parsed}, {"ГР-25", "ГР-24"})
        group_without_department = next(
            group for group in parsed if group.name == "ГР-24"
        )
        self.assertIsNone(group_without_department.department)

    async def test_students_endpoint_can_filter_by_group_id(self) -> None:
        async with self.session_factory() as session:
            all_students = await get_students(group_id=None, session=session)
            group_students = await get_students(
                group_id=self.group_id,
                session=session,
            )

        parsed_all_students = TypeAdapter(list[StudentRead]).validate_python(
            all_students
        )
        self.assertEqual(len(parsed_all_students), 2)
        parsed_group_students = TypeAdapter(list[StudentRead]).validate_python(
            group_students
        )
        self.assertEqual(len(parsed_group_students), 1)
        self.assertEqual(parsed_group_students[0].group_id, self.group_id)

    async def test_organizations_endpoint_returns_organization_schema(self) -> None:
        async with self.session_factory() as session:
            organizations = await get_organizations(session)

        parsed = TypeAdapter(list[OrganizationRead]).validate_python(organizations)
        self.assertEqual(parsed[0].name, "ООО Пример")

    async def test_supervisors_endpoint_returns_supervisor_schema(self) -> None:
        async with self.session_factory() as session:
            supervisors = await get_supervisors(session)

        parsed = TypeAdapter(list[SupervisorRead]).validate_python(supervisors)
        self.assertEqual(parsed[0].full_name, "Иванов И.И.")

    async def test_practices_endpoint_returns_practice_schema(self) -> None:
        async with self.session_factory() as session:
            practices = await get_practices(session)

        parsed = TypeAdapter(list[PracticeListRead]).validate_python(practices)
        self.assertEqual(parsed[0].group_id, self.group_id)
        self.assertEqual(parsed[0].start_date, date(2026, 6, 1))

    def test_read_routes_are_registered_at_expected_paths(self) -> None:
        paths = app.openapi()["paths"]

        for path in (
            "/groups",
            "/students",
            "/organizations",
            "/supervisors",
            "/practices",
        ):
            self.assertIn(path, paths)
            self.assertIn("get", paths[path])


if __name__ == "__main__":
    unittest.main()