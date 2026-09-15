from contextlib import asynccontextmanager

from fastapi import FastAPI
from src.routers.import_routers import router as import_router

from src.db.init import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="DocFlow", lifespan=lifespan)
app.include_router(import_router)


@app.get("/")
async def check_health():
    return {"message": "everything is okay"}
