from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.db.bootstrap import init_db
from src.routers.documents import order_router, router as documents_router
from src.routers.imports import router as imports_router
from src.routers.practices import router as practices_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="DocFlow", lifespan=lifespan)
app.include_router(imports_router)
app.include_router(practices_router)
app.include_router(documents_router)
app.include_router(order_router)


@app.get("/")
async def check_health():
    return {"message": "everything is okay"}
