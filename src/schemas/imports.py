from datetime import date

from pydantic import BaseModel


# import
class ImportResult(BaseModel):
    created: int
    skipped: int
    errors: list[str] = []


# Students
class StudentBase(BaseModel):
    full_name: str
    group: str


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
    pass


class PracticeRead(PracticeBase):
    id: int


# Organizations
class OrganizationBase(BaseModel):
    name: str
    addres: str


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationRead(OrganizationBase):
    id: int


# Supervisors


class SupervisorBase(BaseModel):
    full_name: str
    company: str
    position: str


class SupervisorCreate(SupervisorBase):
    pass


class SupervisorRead(SupervisorBase):
    id: int


# TODO Ведомости
