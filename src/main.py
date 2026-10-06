from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from src.db.bootstrap import init_db
from src.routers.assignments import router as assignments_router
from src.routers.documents import order_router, router as documents_router
from src.routers.imports import router as imports_router
from src.routers.groups import router as groups_router
from src.routers.orgs import router as organizations_router
from src.routers.practices import practice_list_router, router as practices_router
from src.routers.students import router as students_router
from src.routers.supervisors import router as supervisors_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="DocFlow", lifespan=lifespan)
STATIC_ROOT = Path(__file__).resolve().parent.parent / "frontend"


def resolve_static_dir() -> Path:
    """Return the directory served at ``/app``.

    The React app (``frontend/DocFlow educational app interface``) is built by
    Vite into ``frontend/dist``. That directory is a build artifact, so it may
    be absent on a fresh checkout or in CI where Node.js is not installed.
    Falling back to the legacy static frontend keeps ``src.main`` importable and
    ``/app`` usable until ``npm run build`` has produced the bundle.
    """
    dist = STATIC_ROOT / "dist"
    if (dist / "index.html").is_file():
        return dist
    return STATIC_ROOT


app.mount("/app", StaticFiles(directory=resolve_static_dir(), html=True))
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


@app.get("/")
async def check_health():
    return {"message": "everything is okay"}
