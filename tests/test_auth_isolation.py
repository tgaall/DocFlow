import unittest
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from fastapi.routing import APIRoute
from starlette.requests import Request
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.auth.sessionbased import (
    SESSION_COOKIE,
    _hash_token,
    get_current_user,
    get_user_hash,
    login,
    logout,
    register,
    verify_password,
)
from src.db.base import Base
from src.models.auth import User
from src.models.auth import Session as UserSession
from src.models.domain import (
    Assignment,
    Group,
    Organization,
    Practice,
    Student,
    Supervisor,
)
from src.repositories.assignments import AssignmentRepository
from src.repositories.organizations import OrganizationRepository
from src.repositories.practices import PracticeRepository, SupervisorRepository
from src.repositories.reports import ReportRepository
from src.repositories.students import GroupRepository, StudentRepository
from src.main import app


class AuthenticationIsolationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def test_passwords_are_hashed_and_verifiable(self) -> None:
        hashed = get_user_hash("a-long-password")
        self.assertNotEqual(hashed, "a-long-password")
        self.assertTrue(verify_password("a-long-password", hashed))
        self.assertFalse(verify_password("wrong-password", hashed))

    async def test_all_non_public_api_routes_require_authentication(self) -> None:
        from src.auth.sessionbased import get_current_user, router as auth_router
        from src.routers.assignments import router as assignments_router
        from src.routers.documents import order_router
        from src.routers.groups import router as groups_router
        from src.routers.imports import router as imports_router
        from src.routers.orgs import router as organizations_router
        from src.routers.practices import (
            practice_list_router,
            router as practices_router,
        )
        from src.routers.students import router as students_router
        from src.routers.supervisors import router as supervisors_router

        routers = [
            auth_router,
            assignments_router,
            order_router,
            groups_router,
            imports_router,
            organizations_router,
            practice_list_router,
            practices_router,
            students_router,
            supervisors_router,
        ]
        routes = [route for router in routers for route in router.routes]
        public_paths = {"/auth/register", "/auth/login", "/auth/logout"}
        for route in routes:
            if route.path in public_paths:
                continue
            self.assertIsInstance(route, APIRoute)
            self.assertIn(
                get_current_user,
                {dependency.call for dependency in route.dependant.dependencies},
                route.path,
            )

    async def test_session_cookie_authenticates_user_and_missing_cookie_is_rejected(self) -> None:
        async with self.sessions() as session:
            user = User(username="session-user", hashed_password=get_user_hash("secure-password"))
            session.add(user)
            await session.flush()
            session.add(
                UserSession(
                    token_hash=_hash_token("valid-token"),
                    account_id=user.user_id,
                    expires_at=datetime.now(timezone.utc).replace(tzinfo=None)
                    + timedelta(days=1),
                )
            )
            await session.commit()

            request = Request(
                {
                    "type": "http",
                    "headers": [(b"cookie", f"{SESSION_COOKIE}=valid-token".encode())],
                    "method": "GET",
                    "path": "/groups",
                    "query_string": b"",
                    "server": ("test", 80),
                    "client": ("test", 1234),
                    "scheme": "http",
                }
            )
            current_user = await get_current_user(request, session)
            self.assertEqual(current_user.username, "session-user")

            anonymous_request = Request(
                {
                    "type": "http",
                    "headers": [],
                    "method": "GET",
                    "path": "/groups",
                    "query_string": b"",
                    "server": ("test", 80),
                    "client": ("test", 1234),
                    "scheme": "http",
                }
            )
            with self.assertRaises(HTTPException) as error:
                await get_current_user(anonymous_request, session)
            self.assertEqual(error.exception.status_code, 401)

    async def test_registration_login_and_logout_lifecycle(self) -> None:
        from src.schemas.auth import Credentials
        from starlette.responses import Response

        async with self.sessions() as session:
            response = Response()
            user = await register(
                Credentials(username="lifecycle", password="secure-password"),
                response,
                session,
            )
            self.assertEqual(user.username, "lifecycle")
            self.assertNotEqual(user.hashed_password, "secure-password")
            self.assertIn(f"{SESSION_COOKIE}=", response.headers["set-cookie"])

            login_response = Response()
            logged_in = await login(
                Credentials(username="lifecycle", password="secure-password"),
                login_response,
                session,
            )
            self.assertEqual(logged_in.user_id, user.user_id)
            login_cookie = login_response.headers["set-cookie"].split(";", 1)[0]
            request = Request(
                {
                    "type": "http",
                    "headers": [(b"cookie", login_cookie.encode())],
                    "method": "POST",
                    "path": "/auth/logout",
                    "query_string": b"",
                    "server": ("test", 80),
                    "client": ("test", 1234),
                    "scheme": "http",
                }
            )
            logout_response = Response()
            await logout(request, logout_response, session)
            self.assertIn("Max-Age=0", logout_response.headers["set-cookie"])

            with self.assertRaises(HTTPException) as error:
                await get_current_user(request, session)
            self.assertEqual(error.exception.status_code, 401)

    async def test_imported_entities_are_isolated_between_users(self) -> None:
        async with self.sessions() as session:
            first = User(username="first", hashed_password="hash")
            second = User(username="second", hashed_password="hash")
            session.add_all([first, second])
            await session.flush()

            first_user_id, second_user_id = first.user_id, second.user_id
            for user_id in (first_user_id, second_user_id):
                await StudentRepository(session, user_id).get_or_create(
                    "Иванов Иван Иванович", "ГР-25-01", 5001
                )
                await OrganizationRepository(session, user_id).get_or_create(
                    "ООО Ромашка", "г. Уфа"
                )
                await SupervisorRepository(session, user_id).create_supervisor(
                    full_name="Петров Петр Петрович", position="Руководитель"
                )

            await session.commit()

            for user_id in (first_user_id, second_user_id):
                groups = await GroupRepository(session, user_id).get_all_groups()
                students = await StudentRepository(session, user_id).get_students()
                organizations = await OrganizationRepository(session, user_id).get_all()
                supervisors = await SupervisorRepository(session, user_id).get_supervisors()
                self.assertEqual([item.name for item in groups], ["ГР-25-01"])
                self.assertEqual([item.record_book for item in students], [5001])
                self.assertEqual([item.name for item in organizations], ["ООО Ромашка"])
                self.assertEqual(len(supervisors), 1)

    async def test_practices_and_assignments_are_owner_scoped(self) -> None:
        async with self.sessions() as session:
            users = [
                User(username="owner-a", hashed_password="hash"),
                User(username="owner-b", hashed_password="hash"),
            ]
            session.add_all(users)
            await session.flush()
            practice_ids: list[int] = []
            assignment_ids: list[int] = []

            for user in users:
                group = Group(name="ГР-25-01", year=2025, user_id=user.user_id)
                organization = Organization(name="ООО Ромашка", user_id=user.user_id)
                supervisor = Supervisor(
                    full_name="Руководитель", position="Должность", user_id=user.user_id
                )
                session.add_all([group, organization, supervisor])
                await session.flush()
                student = Student(
                    full_name="Студент", group_id=group.id,
                    record_book=7001, user_id=user.user_id,
                )
                session.add(student)
                practice = Practice(
                    type="Учебная", start_date=date(2026, 6, 1),
                    end_date=date(2026, 6, 30), group_id=group.id,
                    supervisor_id=supervisor.id, user_id=user.user_id,
                )
                session.add(practice)
                await session.flush()
                assignment = Assignment(
                    student_id=student.id, organization_id=organization.id,
                    practice_id=practice.id, supervisor_id=supervisor.id,
                )
                session.add(assignment)
                await session.flush()
                practice_ids.append(practice.id)
                assignment_ids.append(assignment.id)

            await session.commit()

            for index, user in enumerate(users):
                repository = PracticeRepository(session, user.user_id)
                practices = await repository.get_practices()
                assignments = await AssignmentRepository(
                    session, user.user_id
                ).get_by_practice(practice_ids[index])
                directions = await AssignmentRepository(
                    session, user.user_id
                ).get_directions_data(practice_ids[index])
                order_rows = await AssignmentRepository(
                    session, user.user_id
                ).get_order_rows()
                report_rows = await ReportRepository(
                    session, user.user_id
                ).get_groups_report_data()
                self.assertEqual([item.id for item in practices], [practice_ids[index]])
                self.assertEqual([item.id for item in assignments], [assignment_ids[index]])
                self.assertEqual(len(directions), 1)
                self.assertEqual(len(order_rows), 1)
                self.assertEqual(order_rows[0]["group"], "ГР-25-01")
                self.assertEqual(len(report_rows), 1)

                other = await AssignmentRepository(
                    session, user.user_id
                ).get_assignment(assignment_ids[1 - index])
                self.assertIsNone(other)

    async def test_cannot_create_assignment_for_another_users_practice(self) -> None:
        from src.schemas.assignments import AssignmentCreate

        async with self.sessions() as session:
            owner, other = User(username="assignment-owner", hashed_password="hash"), User(
                username="assignment-other", hashed_password="hash"
            )
            session.add_all([owner, other])
            await session.flush()
            group = Group(name="ГР-26-01", year=2026, user_id=owner.user_id)
            organization = Organization(name="ООО", user_id=owner.user_id)
            student = Student(
                full_name="Ученик", record_book=8001, user_id=owner.user_id,
                group_id=1,
            )
            session.add_all([group, organization])
            await session.flush()
            student.group_id = group.id
            practice = Practice(
                type="Учебная", start_date=date(2026, 6, 1),
                end_date=date(2026, 6, 30), group_id=group.id,
                user_id=owner.user_id,
            )
            session.add_all([student, practice])
            await session.flush()

            repository = AssignmentRepository(session, user_id=other.user_id)
            with self.assertRaisesRegex(ValueError, "Practice not found"):
                await repository.create_assignment(
                    AssignmentCreate(
                        student_id=student.id,
                        organization_id=organization.id,
                        practice_id=practice.id,
                    )
                )


if __name__ == "__main__":
    unittest.main()