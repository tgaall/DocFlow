from fastapi import FastAPI
from contextlib import asynccontextmanager
from src.db.init import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="DocFlow", lifespan=lifespan)


@app.get("/")
async def check_health():
    return {"message": "everything is okay"}
