import io
import tempfile
import unittest
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.db.base import Base
from src.db.bootstrap import migrate_legacy_schema
from src.models.domain import Practice
from src.routers.practices import create_practice
from src.schemas.imports import PracticeCreate
from src.services.imports import (
    _parse_organizations,
    _read_excel,
    import_organizations,
    import_students,
)


def make_student_workbook() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet["B4"] = "Список студентов группы БПО09и-25-03"
    for column, value in enumerate(
        ["№", "Фамилия, имя, отчество", "Направление", "Номер зачетки"],
        start=1,
    ):
        sheet.cell(row=5, column=column, value=value)
    sheet.append([1, "Иванов Иван Иванович", "бюджет", 251758])
    sheet.append([2, "Петров Петр Петрович", "платное", 251762])

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


class ImportParsingTests(unittest.TestCase):
    def test_reads_student_names_group_and_record_book_numbers(self) -> None:
        records = _read_excel(make_student_workbook())

        self.assertEqual(
            records,
            [
                (6, "Иванов Иван Иванович", "БПО09и-25-03", 251758),
                (7, "Петров Петр Петрович", "БПО09и-25-03", 251762),
            ],
        )

    def test_parses_company_and_optional_address(self) -> None:
        data = (
            'ООО "Компания", г. Уфа\n'
            'ООО "Компания без запятой" г. Казань\n'
            'ФГБОУ ВО УГНТУ приемная комиссия\n'
        ).encode("cp1251")

        organizations = _parse_organizations(data)

        self.assertEqual(
            organizations,
            [
                (1, 'ООО "Компания"', "г. Уфа"),
                (2, 'ООО "Компания без запятой"', "г. Казань"),
                (3, "ФГБОУ ВО УГНТУ приемная комиссия", None),
            ],
        )


class ImportDatabaseTests(unittest.IsolatedAsyncioTestCase):
    async def test_legacy_organization_address_column_is_renamed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "legacy.db"
            engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
            try:
                async with engine.begin() as connection:
                    await connection.exec_driver_sql(
                        "CREATE TABLE organizations ("
                        "id INTEGER PRIMARY KEY, name VARCHAR(255) NOT NULL, "
                        "addres VARCHAR(255))"
                    )
                    await connection.exec_driver_sql(
                        "INSERT INTO organizations (id, name, addres) "
                        "VALUES (1, 'Тестовая компания', 'г. Уфа')"
                    )
                    await migrate_legacy_schema(connection)

                    columns = await connection.run_sync(
                        lambda sync_connection: {
                            column["name"]
                            for column in inspect(sync_connection).get_columns(
                                "organizations"
                            )
                        }
                    )
                    address = await connection.exec_driver_sql(
                        "SELECT address FROM organizations WHERE id = 1"
                    )

                self.assertIn("address", columns)
                self.assertNotIn("addres", columns)
                self.assertEqual(address.scalar_one(), "г. Уфа")
            finally:
                await engine.dispose()

    async def test_student_and_organization_imports_are_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "test.db"
            engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
            try:
                async with engine.begin() as connection:
                    await connection.run_sync(Base.metadata.create_all)

                session_factory = async_sessionmaker(engine, expire_on_commit=False)
                student_file = make_student_workbook()
                organization_file = (
                    'ООО "Компания", г. Уфа\n'
                    'Организация без адреса\n'
                ).encode("cp1251")

                async with session_factory() as session:
                    result = await import_students(session, student_file)
                    self.assertEqual((result.created, result.skipped), (2, 0))

                async with session_factory() as session:
                    result = await import_students(session, student_file)
                    self.assertEqual((result.created, result.skipped), (0, 2))

                async with session_factory() as session:
                    result = await import_organizations(session, organization_file)
                    self.assertEqual((result.created, result.skipped), (2, 0))

                async with session_factory() as session:
                    result = await import_organizations(session, organization_file)
                    self.assertEqual((result.created, result.skipped), (0, 2))
            finally:
                await engine.dispose()

    async def test_practice_creation_requires_an_imported_group(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "test.db"
            engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
            try:
                async with engine.begin() as connection:
                    await connection.run_sync(Base.metadata.create_all)

                session_factory = async_sessionmaker(engine, expire_on_commit=False)
                async with session_factory() as session:
                    await import_students(session, make_student_workbook())

                async with session_factory() as session:
                    result = await create_practice(
                        practice_data=PracticeCreate(
                            group="БПО09и-25-03",
                            type="Учебная",
                            start_date=date(2026, 6, 1),
                            end_date=date(2026, 6, 30),
                        ),
                        session=session,
                    )
                    self.assertEqual(result.group, "БПО09и-25-03")
                    self.assertEqual(result.type, "Учебная")

                async with session_factory() as session:
                    practices = await session.get(Practice, result.id)
                    self.assertIsNotNone(practices)
            finally:
                await engine.dispose()


if __name__ == "__main__":
    unittest.main()