from io import BytesIO
from pathlib import Path

from docxtpl import DocxTemplate

TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / "templates"
DIRECTION_TEMPLATE = TEMPLATES_DIR / "Napravlenie.docx"


def render_direction(context: dict) -> bytes:
    doc = DocxTemplate(str(DIRECTION_TEMPLATE))
    doc.render(context)

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
