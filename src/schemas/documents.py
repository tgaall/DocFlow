"""Контексты рендера для .docx-документов (ТЗ §5: направление, приказ, сводный отчёт).

Каждому виду документа — своя схема-контекст. Имена полей совпадают с
Jinja2-плейсхолдерами в templates/*.docx, поэтому правки бланка и здесь
делаются синхронно.
"""

from pydantic import BaseModel


class DirectionContext(BaseModel):
    """Направление (templates/Napravlenie.docx)."""

    student_full_name: str
    group_name: str
    student_course: str
    practice_type: str
    practice_start_date: str
    practice_end_date: str
    organization_name: str
