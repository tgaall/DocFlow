from datetime import date

from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base
from src.models import auth as auth_models  # noqa: F401 — register User foreign keys


class Group(Base):
    __tablename__ = "groups"
    __table_args__ = (UniqueConstraint("user_id", "name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id"), nullable=True, index=True
    )
    name: Mapped[str]
    department: Mapped[str] = mapped_column(String(255), nullable=True)
    year: Mapped[int] = mapped_column(Integer)
    students: Mapped[list["Student"]] = relationship(back_populates="group")


class Student(Base):
    __tablename__ = "students"
    __table_args__ = (UniqueConstraint("user_id", "record_book"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id"), nullable=True, index=True
    )
    full_name: Mapped[str] = mapped_column(String(255))
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    record_book: Mapped[int] = mapped_column(Integer)
    grade: Mapped[int] = mapped_column(Integer, nullable=True)
    group: Mapped["Group"] = relationship(back_populates="students")


class Organization(Base):
    __tablename__ = "organizations"
    __table_args__ = (UniqueConstraint("user_id", "name", "address"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Supervisor(Base):
    __tablename__ = "supervisors"
    __table_args__ = (UniqueConstraint("user_id", "full_name", "position"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id"), nullable=True, index=True
    )
    full_name: Mapped[str] = mapped_column(String(255))
    position: Mapped[str] = mapped_column(String(255))


class Practice(Base):
    __tablename__ = "practices"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id"), nullable=True, index=True
    )
    type: Mapped[str] = mapped_column(String(100))
    start_date: Mapped[date]
    end_date: Mapped[date]
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    supervisor_id: Mapped[int] = mapped_column(
        ForeignKey("supervisors.id"), nullable=True
    )
    supervisor: Mapped["Supervisor"] = relationship()


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
    payment_type: Mapped[str] = mapped_column(String(50), nullable=True)
    grade: Mapped[str] = mapped_column(String(50), nullable=True)

    supervisor: Mapped["Supervisor"] = relationship()


class GroupReport(Base):
    __tablename__ = "group_reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id"), nullable=True, index=True
    )
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    practice_id: Mapped[int] = mapped_column(ForeignKey("practices.id"))
    total_students: Mapped[int] = mapped_column(Integer)
    completed_count: Mapped[int] = mapped_column(Integer, nullable=True)
    average_grade: Mapped[float] = mapped_column(Float, nullable=True)
    report_date: Mapped[date] = mapped_column(default=date.today)
    payed_students_count: Mapped[int] = mapped_column(Integer, nullable=True)
