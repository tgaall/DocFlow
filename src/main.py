from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.db.bootstrap import init_db
from src.routers.documents import router as documents_router
from src.routers.imports import router as imports_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="DocFlow", lifespan=lifespan)
app.include_router(imports_router)
app.include_router(documents_router)


@app.get("/")
async def check_health():
    return {"message": "everything is okay"}
