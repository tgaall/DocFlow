import io
import re
from pathlib import Path
from typing import BinaryIO

import pandas as pd
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.domain import Group, Student
from src.repositories.organizations import OrganizationRepository
from src.repositories.students import StudentRepository
from src.schemas.imports import ImportResult

STUDENT_NAME_COLUMN = "Фамилия, имя, отчество"
RECORD_BOOK_COLUMN = "Номер зачетки"
GROUP_TITLE_PATTERN = re.compile(r"Список студентов группы\s+(.+)", re.IGNORECASE)
ADDRESS_SUFFIX_PATTERN = re.compile(r"\s+(?P<address>(?:г|с|д)\.\s*.+)$", re.IGNORECASE)
STATEMENT_GROUP_PATTERN = re.compile(
    r"\b[А-ЯЁA-Z]{2,}\d{2}[А-ЯЁа-яё]?\-?\d{2}-\d{2}\b", re.IGNORECASE
)


def _read_excel(file_bytes: bytes) -> list[tuple[int, str, str, int]]:
    """Extract (Excel row, full name, group, record book number) from the sample layout."""
    df = pd.read_excel(io.BytesIO(file_bytes), header=None, engine="openpyxl")

    group = ""
    header_row: int | None = None
    name_column: int | None = None
    record_book_column: int | None = None

    for row_index, row in df.iterrows():
        values = [str(value).strip() for value in row if pd.notna(value)]
        for value in values:
            match = GROUP_TITLE_PATTERN.search(value)
            if match:
                group = match.group(1).strip()

        normalized = [
            str(value).strip() if pd.notna(value) else "" for value in row.tolist()
        ]
        if STUDENT_NAME_COLUMN in normalized and RECORD_BOOK_COLUMN in normalized:
            header_row = row_index
            name_column = normalized.index(STUDENT_NAME_COLUMN)
            record_book_column = normalized.index(RECORD_BOOK_COLUMN)
            break

    if not group:
        raise ValueError("Не удалось определить группу из заголовка Excel")
    if header_row is None or name_column is None or record_book_column is None:
        raise ValueError(
            f"Не найдены обязательные колонки «{STUDENT_NAME_COLUMN}» "
            f"и «{RECORD_BOOK_COLUMN}»"
        )

    records: list[tuple[int, str, str, int]] = []
    for row_index in range(header_row + 1, len(df)):
        full_name_value = df.iat[row_index, name_column]
        record_book_value = df.iat[row_index, record_book_column]

        if pd.isna(full_name_value) and pd.isna(record_book_value):
            continue

        full_name = str(full_name_value).strip() if pd.notna(full_name_value) else ""
        if not full_name or pd.isna(record_book_value):
            raise ValueError(
                f"Строка Excel {row_index + 1}: отсутствует ФИО или номер зачётки"
            )

        try:
            numeric_record_book = float(record_book_value)
            if not numeric_record_book.is_integer() or numeric_record_book <= 0:
                raise ValueError
            record_book = int(numeric_record_book)
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError(
                f"Строка Excel {row_index + 1}: некорректный номер зачётки"
            ) from exc

        records.append((row_index + 1, full_name, group, record_book))

    if not records:
        raise ValueError("В Excel-файле не найдены записи студентов")

    record_book_numbers = [record[3] for record in records]
    if len(record_book_numbers) != len(set(record_book_numbers)):
        raise ValueError("В Excel-файле повторяются номера зачёток")

    return records


def parse_statement(source: str | Path | BinaryIO) -> list[dict[str, str | int]]:
    """Parse a text-based PDF gradesheet into student records."""
    grade_values = {
        "отлично": 5,
        "хорошо": 4,
        "удовлетворительно": 3,
        "неявка": 2,
    }
    reader = PdfReader(source)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)

    group_match = STATEMENT_GROUP_PATTERN.search(text)
    if group_match is None:
        raise ValueError("Не удалось определить группу в ведомости")
    group = group_match.group(0)

    students: list[dict[str, str | int]] = []
    fragments = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    record_number_pattern = re.compile(r"^\d{5,}$")
    student_number_pattern = re.compile(r"^\d{1,3}$")
    index = 0
    while index < len(fragments):
        if not student_number_pattern.fullmatch(fragments[index]):
            index += 1
            continue

        full_name_parts: list[str] = []
        index += 1
        while index < len(fragments) and not record_number_pattern.fullmatch(
            fragments[index]
        ):
            full_name_parts.append(fragments[index])
            index += 1

        if index >= len(fragments):
            break

        full_name = " ".join(full_name_parts).strip()
        index += 1  # Skip the student's record book number.
        while index < len(fragments) and not fragments[index]:
            index += 1
        if index >= len(fragments):
            break

        grade_text = fragments[index].lower()
        grade = grade_values.get(grade_text)
        if not full_name or not 2 <= len(full_name.split()) <= 4:
            index += 1
            continue
        if grade is None:
            raise ValueError(
                f"Неизвестная оценка {grade_text!r} для студента {full_name!r}"
            )
        students.append({"group": group, "full_name": full_name, "grade": grade})
        index += 1

    if not students:
        raise ValueError("В PDF-ведомости не найдены студенты с оценками")
    return students


def _parse_organizations(file_bytes: bytes) -> list[tuple[int, str, str | None]]:
    try:
        text = file_bytes.decode("cp1251")
    except UnicodeDecodeError as exc:
        raise ValueError("Не удалось прочитать TXT в кодировке Windows-1251") from exc

    organizations: list[tuple[int, str, str | None]] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue

        if "," in line:
            name, address = (part.strip() for part in line.rsplit(",", 1))
            if not name or not address:
                raise ValueError(
                    f"Строка {line_number}: ожидаются название и адрес компании"
                )
        else:
            # A subset of supplied lines puts the city/village after the name
            # without a comma, e.g. `ООО "Company" г. Уфа`.
            match = ADDRESS_SUFFIX_PATTERN.search(line)
            if match:
                name = line[: match.start()].strip()
                address = match.group("address").strip()
            else:
                # Keep entries with no explicit address intact instead of
                # guessing where a company name ends.
                name, address = line, None

        organizations.append((line_number, name, address))

    if not organizations:
        raise ValueError("В TXT-файле не найдены компании")

    return organizations


async def import_students(session: AsyncSession, file_bytes: bytes) -> ImportResult:
    repo = StudentRepository(session)
    created = skipped = 0
    try:
        for _, full_name, group, record_book in _read_excel(file_bytes):
            _, was_created = await repo.get_or_create(full_name, group, record_book)
            created += int(was_created)
            skipped += int(not was_created)

        await session.commit()
    except Exception:
        await session.rollback()
        raise

    return ImportResult(created=created, skipped=skipped)


async def import_gradesheet(
    session: AsyncSession, source: str | Path | BinaryIO
) -> ImportResult:
    records = parse_statement(source)
    updated = 0
    try:
        group_result = await session.execute(
            select(Group).where(Group.name == records[0]["group"])
        )
        group = group_result.scalar_one_or_none()
        if group is None:
            raise ValueError(f"Группа {records[0]['group']!r} не найдена в базе данных")

        for record in records:
            stmt = select(Student).where(
                Student.group_id == group.id,
                Student.full_name == record["full_name"],
            )
            result = await session.execute(stmt)
            matching_students = list(result.scalars().all())
            if not matching_students:
                raise ValueError(
                    f"Студент {record['full_name']!r} не найден в группе "
                    f"{record['group']!r}"
                )
            if len(matching_students) > 1:
                raise ValueError(
                    f"В группе {record['group']!r} найдено несколько студентов "
                    f"с ФИО {record['full_name']!r}"
                )
            matching_students[0].grade = record["grade"]
            updated += 1

        await session.commit()
    except Exception:
        await session.rollback()
        raise

    return ImportResult(created=updated, skipped=0)


async def import_organizations(
    session: AsyncSession, file_bytes: bytes
) -> ImportResult:
    repo = OrganizationRepository(session)
    created = skipped = 0
    try:
        for _, name, address in _parse_organizations(file_bytes):
            _, was_created = await repo.get_or_create(name, address)
            created += int(was_created)
            skipped += int(not was_created)

        await session.commit()
    except Exception:
        await session.rollback()
        raise

    return ImportResult(created=created, skipped=skipped)
