from copy import deepcopy
from io import BytesIO
from pathlib import Path

from docxtpl import DocxTemplate
from docx import Document
from docx.oxml.ns import qn

TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / "templates"
DIRECTION_TEMPLATE = TEMPLATES_DIR / "Direction_template.docx"
ORDER_TEMPLATE = TEMPLATES_DIR / "Order_template.docx"
REPORT_TEMPLATE = TEMPLATES_DIR / "Report_template.docx"


def render_direction(context: dict) -> bytes:
    doc = DocxTemplate(str(DIRECTION_TEMPLATE))
    doc.render(context)

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def render_directions(contexts: list[dict]) -> bytes:
    """Render each direction into one DOCX, separated by page breaks."""
    if not contexts:
        raise ValueError("At least one direction is required")

    document = Document(BytesIO(render_direction(contexts[0])))
    for context in contexts[1:]:
        document.add_page_break()
        rendered_document = Document(BytesIO(render_direction(context)))
        for element in rendered_document._element.body:
            if element.tag != qn("w:sectPr"):
                document._element.body.insert(
                    len(document._element.body) - 1,
                    deepcopy(element),
                )

    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def render_order(rows: list[dict[str, str]]) -> bytes:
    doc = DocxTemplate(str(ORDER_TEMPLATE))
    doc.render({"rows": rows})

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def render_report(groups_data: list[dict], practice_type: str) -> bytes:
    """
    Сгенерировать отчет по шаблону Report_template.docx

    Args:
        groups_data: Список словарей с данными по группам
            Каждый словарь должен содержать:
            - group_name: название группы
            - start_date: дата начала практики
            - end_date: дата окончания практики
            - count_stud: количество студентов
            - payed_students: количество оплачиваемых студентов
        practice_type: тип практики
    """
    doc = DocxTemplate(str(REPORT_TEMPLATE))
    doc.render({"groups": groups_data, "practice_type": practice_type})

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
