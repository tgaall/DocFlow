import io

import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession

from src.repositories.get_docs import StudentRepository
from src.schemas.get_docs import ImportResult

# Чтение студентов
STUDENT_COLUMNS = {
    "ФИО": "full_name",
    "Группа": "group",
}
STUDENT_REQUIRED = {"full_name", "group"}


def _read_excel(file_bytes: bytes) -> pd.DataFrame:
    return pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")


async def import_students(session: AsyncSession, file_bytes: bytes) -> ImportResult:
    df = _read_excel(file_bytes).rename(columns=STUDENT_COLUMNS)

    missing = STUDENT_REQUIRED - set(df.columns)
    if missing:
        raise ValueError(f"Отсутствуют колонки: {sorted(missing)}")

    repo = StudentRepository(session)
    created = skipped = 0
    errors: list[str] = []

    for idx, row in df.iterrows():
        full_name = str(row["full_name"]).strip() if pd.notna(row["full_name"]) else ""
        group = str(row["group"]).strip() if pd.notna(row["group"]) else ""
        if not full_name or not group:
            errors.append(f"Строка {idx + 2}: пустое ФИО или группа")
            continue

        _, was_created = await repo.get_or_create(full_name, group)
        created += int(was_created)
        skipped += int(not was_created)

    await session.commit()
    return ImportResult(created=created, skipped=skipped, errors=errors)
