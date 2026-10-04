from datetime import date

from pydantic import BaseModel, ConfigDict


# import
class ImportResult(BaseModel):
    created: int
    skipped: int
    errors: list[str] = []


# Students
class StudentBase(BaseModel):
    full_name: str
    group: str
    record_book: int


class StudentCreate(StudentBase):
    pass


class StudentRead(StudentBase):
    id: int


# Practises


class PracticeBase(BaseModel):
    type: str
    start_date: date
    end_date: date
    group: str


class PracticeCreate(PracticeBase):
    supervisor_id: int | None = None


class PracticeRead(PracticeBase):
    id: int
    supervisor_id: int | None = None


# Organizations
class OrganizationBase(BaseModel):
    name: str
    address: str | None = None


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationRead(OrganizationBase):
    id: int


# Supervisors


class SupervisorBase(BaseModel):
    full_name: str
    position: str


class SupervisorCreate(SupervisorBase):
    pass


class SupervisorRead(SupervisorBase):
    id: int


# TODO Ведомости
