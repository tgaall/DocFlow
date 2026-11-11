from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from src.config import PLATFORM_WINDOWS, get_settings
from src.db.bootstrap import init_db
from src.auth.sessionbased import router as auth_router
from src.routers.assignments import router as assignments_router
from src.routers.documents import order_router
from src.routers.documents import router as documents_router
from src.routers.groups import router as groups_router
from src.routers.imports import router as imports_router
from src.routers.orgs import router as organizations_router
from src.routers.practices import practice_list_router
from src.routers.practices import router as practices_router
from src.routers.students import router as students_router
from src.routers.supervisors import router as supervisors_router

_LOCAL_HOSTNAMES = {"127.0.0.1", "localhost", "::1"}
_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class LocalhostOnlyMiddleware(BaseHTTPMiddleware):
    """Windows desktop edition hardening.

    Rejects requests whose Host header is not a loopback name (DNS rebinding)
    and mutating requests with a foreign Origin (CSRF). Active only when the
    windows platform profile is selected.
    """

    async def dispatch(self, request: Request, call_next):
        if get_settings().platform == PLATFORM_WINDOWS:
            host = request.headers.get("host", "").rsplit(":", 1)[0]
            if host not in _LOCAL_HOSTNAMES:
                return JSONResponse({"detail": "Forbidden"}, status_code=403)
            if request.method in _MUTATING_METHODS:
                origin = request.headers.get("origin")
                if origin and urlparse(origin).hostname not in _LOCAL_HOSTNAMES:
                    return JSONResponse({"detail": "Forbidden"}, status_code=403)
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="DocFlow", lifespan=lifespan)
app.add_middleware(LocalhostOnlyMiddleware)
app.mount("/app", StaticFiles(directory=get_settings().frontend_dir, html=True))
app.include_router(auth_router)
app.include_router(imports_router)
app.include_router(practices_router)
app.include_router(practice_list_router)
app.include_router(groups_router)
app.include_router(students_router)
app.include_router(organizations_router)
app.include_router(supervisors_router)
app.include_router(documents_router)
app.include_router(order_router)
app.include_router(assignments_router)


@app.get("/", include_in_schema=False)
async def homepage():
    return RedirectResponse(url="/app/", status_code=307)


@app.get("/health")
async def check_health():
    return {"message": "everything is okay"}
