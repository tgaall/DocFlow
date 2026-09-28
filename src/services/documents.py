from io import BytesIO
from pathlib import Path

from docxtpl import DocxTemplate

TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / "templates"
DIRECTION_TEMPLATE = TEMPLATES_DIR / "Napravlenie.docx"
ORDER_TEMPLATE = TEMPLATES_DIR / "Order.docx"


def render_direction(context: dict) -> bytes:
    doc = DocxTemplate(str(DIRECTION_TEMPLATE))
    doc.render(context)

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def render_order(rows: list[dict[str, str]]) -> bytes:
    doc = DocxTemplate(str(ORDER_TEMPLATE))
    doc.render({"rows": rows})

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
