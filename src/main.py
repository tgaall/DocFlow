from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.db.init import init_db
from src.routers.export_routers import router as export_router
from src.routers.import_routers import router as import_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="DocFlow", lifespan=lifespan)
app.include_router(import_router)
app.include_router(export_router)


@app.get("/")
async def check_health():
    return {"message": "everything is okay"}
