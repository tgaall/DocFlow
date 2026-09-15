from datetime import date

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class Student(Base):
    __tablename__ = "students"
    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255))
    group: Mapped[str] = mapped_column(String(15))


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    addres: Mapped[str] = mapped_column(String(255))


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
    supervisor_id: Mapped[int] = mapped_column(ForeignKey("supervisors.id"))
    practice_id: Mapped[int] = mapped_column(ForeignKey("practices.id"))
    grade: Mapped[str] = mapped_column(String(50), nullable=True)
