import tempfile
import unittest
from datetime import date
from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.db.base import Base
from src.db.bootstrap import migrate_legacy_schema
from src.models.domain import Assignment, Group, Organization, Practice, Student
from src.repositories.assignments import AssignmentRepository
from src.schemas.assignments import AssignmentCreate, AssignmentRead, AssignmentUpdate


class AssignmentFieldTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_and_update_keep_study_mode_and_payment_type_separate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            engine = create_async_engine(
                f"sqlite+aiosqlite:///{Path(temp_dir) / 'assignments.db'}"
            )
            try:
                async with engine.begin() as connection:
                    await connection.run_sync(Base.metadata.create_all)
                sessions = async_sessionmaker(engine, expire_on_commit=False)

                async with sessions() as session:
                    group = Group(name="ГР-25", year=2025)
                    organization = Organization(name="ООО Пример")
                    session.add_all([group, organization])
                    await session.flush()
                    student = Student(
                        full_name="Иванов Иван Иванович",
                        group_id=group.id,
                        record_book=1001,
                    )
                    practice = Practice(
                        type="Учебная",
                        start_date=date(2026, 6, 1),
                        end_date=date(2026, 6, 30),
                        group_id=group.id,
                    )
                    session.add_all([student, practice])
                    await session.flush()

                    repository = AssignmentRepository(session)
                    assignment = await repository.create_assignment(
                        AssignmentCreate(
                            student_id=student.id,
                            organization_id=organization.id,
                            practice_id=practice.id,
                            type_of_study="Очно",
                            payment_type="С оплатой",
                        )
                    )
                    self.assertEqual(assignment.type_of_study, "Очно")
                    self.assertEqual(assignment.payment_type, "С оплатой")
                    self.assertEqual(
                        AssignmentRead.model_validate(assignment).payment_type,
                        "С оплатой",
                    )

                    updated = await repository.update_assignment(
                        assignment.id,
                        AssignmentUpdate(
                            type_of_study="Дистанционно",
                            payment_type="Без оплаты",
                        ),
                    )
                    self.assertEqual(updated.type_of_study, "Дистанционно")
                    self.assertEqual(updated.payment_type, "Без оплаты")
            finally:
                await engine.dispose()

    async def test_migration_adds_payment_type_without_changing_study_mode(self) -> None:
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        try:
            async with engine.begin() as connection:
                await connection.exec_driver_sql(
                    "CREATE TABLE assignments ("
                    "id INTEGER PRIMARY KEY, type_of_study VARCHAR(50)"
                    ")"
                )
                await connection.exec_driver_sql(
                    "INSERT INTO assignments (id, type_of_study) VALUES (1, 'Очно')"
                )

                await migrate_legacy_schema(connection)
                columns = await connection.run_sync(
                    lambda sync_connection: {
                        column["name"]
                        for column in inspect(sync_connection).get_columns(
                            "assignments"
                        )
                    }
                )
                result = await connection.exec_driver_sql(
                    "SELECT type_of_study, payment_type FROM assignments WHERE id = 1"
                )

            self.assertIn("payment_type", columns)
            self.assertEqual(result.one(), ("Очно", None))
        finally:
            await engine.dispose()


if __name__ == "__main__":
    unittest.main()