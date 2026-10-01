from datetime import date

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base


class Group(Base):
    __tablename__ = "groups"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    department: Mapped[str] = mapped_column(String(255), nullable=True)
    year: Mapped[int] = mapped_column(Integer)
    students: Mapped[list["Student"]] = relationship(back_populates="group")


class Student(Base):
    __tablename__ = "students"
    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255))
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    record_book: Mapped[int] = mapped_column(Integer, unique=True)
    group: Mapped["Group"] = relationship(back_populates="students")


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
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    supervisor_id: Mapped[int] = mapped_column(
        ForeignKey("supervisors.id"), nullable=True
    )


class Assignment(Base):
    __tablename__ = "assignments"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"))
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    supervisor_id: Mapped[int] = mapped_column(
        ForeignKey("supervisors.id"), nullable=True
    )
    practice_id: Mapped[int] = mapped_column(ForeignKey("practices.id"))
    practice_form: Mapped[str] = mapped_column(String(50), nullable=True)
    payment_type: Mapped[str] = mapped_column(nullable=True)
    grade: Mapped[str] = mapped_column(String(50), nullable=True)


class GroupReport(Base):
    __tablename__ = "group_reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    practice_id: Mapped[int] = mapped_column(ForeignKey("practices.id"))
    total_students: Mapped[int] = mapped_column(Integer)
    completed_count: Mapped[int] = mapped_column(Integer, nullable=True)
    average_grade: Mapped[float] = mapped_column(Float, nullable=True)
    report_date: Mapped[date] = mapped_column(default=date.today)
