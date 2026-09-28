from io import BytesIO
import tempfile
import unittest
from datetime import date
from pathlib import Path

from docx import Document
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.db.base import Base
from src.models.domain import Assignment, Organization, Practice, Student
from src.repositories.assignments import AssignmentRepository
from src.services.documents import render_order


class OrderGenerationTests(unittest.IsolatedAsyncioTestCase):
    async def test_order_has_all_students_in_import_order_and_assignment_data(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "order.db"
            engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
            try:
                async with engine.begin() as connection:
                    await connection.run_sync(Base.metadata.create_all)

                sessions = async_sessionmaker(engine, expire_on_commit=False)
                async with sessions() as session:
                    students = [
                        Student(
                            full_name="Иванов Иван Иванович",
                            group="ГР-25",
                            record_book=1001,
                        ),
                        Student(
                            full_name="Петров Петр Петрович",
                            group="ГР-25",
                            record_book=1002,
                        ),
                        Student(
                            full_name="Сидорова Анна Сергеевна",
                            group="ГР-24",
                            record_book=1003,
                        ),
                    ]
                    organizations = [
                        Organization(name="ООО Ромашка", address="г. Уфа"),
                        Organization(name="АО Пример", address=None),
                    ]
                    practice = Practice(
                        type="Учебная",
                        start_date=date(2026, 6, 1),
                        end_date=date(2026, 6, 30),
                        group="ГР-25",
                    )
                    session.add_all([*students, *organizations, practice])
                    await session.flush()
                    session.add_all(
                        [
                            Assignment(
                                student_id=students[0].id,
                                organization_id=organizations[0].id,
                                practice_id=practice.id,
                            ),
                            Assignment(
                                student_id=students[1].id,
                                organization_id=organizations[1].id,
                                practice_id=practice.id,
                            ),
                        ]
                    )
                    await session.commit()

                    rows = await AssignmentRepository(session).get_order_rows()

                self.assertEqual(
                    [row["full_name"] for row in rows],
                    [student.full_name for student in students],
                )
                self.assertEqual(rows[0]["org_display"], "ООО Ромашка, г. Уфа")
                self.assertEqual(rows[0]["practice_type"], "Учебная")
                self.assertEqual(rows[0]["start_date"], "01.06.2026")
                self.assertEqual(rows[1]["org_display"], "АО Пример")
                self.assertEqual(rows[2]["org_display"], "")

                document_bytes = render_order(rows)
                output = Path(temp_dir) / "generated-order.docx"
                output.write_bytes(document_bytes)
                document = Document(output)
                table = document.tables[0]
                generated_names = [
                    table.cell(i, 1).text for i in range(1, len(table.rows))
                ]
                self.assertEqual(
                    generated_names,
                    [student.full_name for student in students],
                )
                self.assertEqual(table.cell(1, 0).text, "1")
                self.assertEqual(table.cell(2, 0).text, "2")
                self.assertEqual(table.cell(3, 0).text, "3")
                self.assertEqual(table.cell(1, 2).text, "ООО Ромашка, г. Уфа")
                self.assertEqual(table.cell(3, 2).text, "")
            finally:
                await engine.dispose()

    async def test_order_endpoint_returns_downloadable_docx(self) -> None:
        from src.routers.documents import download_order

        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "order-endpoint.db"
            engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
            try:
                async with engine.begin() as connection:
                    await connection.run_sync(Base.metadata.create_all)
                sessions = async_sessionmaker(engine, expire_on_commit=False)
                async with sessions() as session:
                    session.add(
                        Student(
                            full_name="Тест Тест Тестович",
                            group="ГР-25",
                            record_book=2001,
                        )
                    )
                    await session.commit()
                    response = await download_order(session)

                self.assertEqual(
                    response.media_type,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
                self.assertEqual(
                    response.headers["content-disposition"],
                    'attachment; filename="order.docx"',
                )
                document = Document(BytesIO(response.body))
                self.assertEqual(document.tables[0].cell(1, 1).text, "Тест Тест Тестович")
                self.assertTrue(response.body.startswith(b"PK"))
            finally:
                await engine.dispose()

    async def test_order_endpoint_returns_404_when_there_are_no_students(self) -> None:
        from src.routers.documents import download_order

        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "empty-order.db"
            engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
            try:
                async with engine.begin() as connection:
                    await connection.run_sync(Base.metadata.create_all)
                sessions = async_sessionmaker(engine, expire_on_commit=False)
                async with sessions() as session:
                    with self.assertRaises(HTTPException) as error:
                        await download_order(session)

                self.assertEqual(error.exception.status_code, 404)
            finally:
                await engine.dispose()


if __name__ == "__main__":
    unittest.main()