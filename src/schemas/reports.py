from pydantic import BaseModel, ConfigDict
from datetime import date
from typing import Optional


class GroupReportBase(BaseModel):
    """Базовая схема для отчета по группе"""
    group_id: int
    practice_id: int
    total_students: int
    completed_count: Optional[int] = None
    average_grade: Optional[float] = None
    payed_students_count: Optional[int] = None


class GroupReportCreate(GroupReportBase):
    """Схема для создания отчета"""
    pass


class GroupReportRead(GroupReportBase):
    """Схема для чтения отчета"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    report_date: date


class ReportFilter(BaseModel):
    """Фильтры для генерации отчета"""
    practice_type: Optional[str] = None
    year: Optional[int] = None


class GroupReportData(BaseModel):
    """Данные группы для отчета (шаблон Report_template.docx)"""
    group_name: str
    start_date: str
    end_date: str
    count_stud: int
    payed_students: int