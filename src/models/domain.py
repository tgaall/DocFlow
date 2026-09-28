from datetime import date, datetime, timezone

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class Student(Base):
    __tablename__ = "students"
    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255))
    group: Mapped[str] = mapped_column(String(15))
    record_book: Mapped[int] = mapped_column(Integer, unique=True)

    @hybrid_property
    def course(self) -> int:
        short_year = int(self.group.split("-")[1])
        admission_year = 2000 + short_year
        today = datetime.now(tz=timezone.utc).date()
        academic_year = today.year if today.month > 9 else today.year - 1
        return academic_year - admission_year + 1


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Supervisor(Base):
    __tablename__ = "supervisors"
    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255))
    position: Mapped[str] = mapped_column(String(255))
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))


class Practice(Base):
    __tablename__ = "practices"
    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(100))
    start_date: Mapped[date]
    end_date: Mapped[date]
    group: Mapped[str] = mapped_column(String(15))


class Assignment(Base):
    __tablename__ = "assignments"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"))
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    supervisor_id: Mapped[int] = mapped_column(
        ForeignKey("supervisors.id"), nullable=True
    )
    practice_id: Mapped[int] = mapped_column(ForeignKey("practices.id"))
    grade: Mapped[str] = mapped_column(String(50), nullable=True)
