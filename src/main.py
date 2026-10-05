from contextlib import asynccontextmanager

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
app.mount("/app", StaticFiles(directory="frontend", html=True))
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
