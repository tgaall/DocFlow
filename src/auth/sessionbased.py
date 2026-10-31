import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_async_session
from src.models.auth import Session as UserSession
from src.models.auth import User
from src.schemas.auth import Credentials, UserRead

router = APIRouter(prefix="/auth", tags=["Authentication"])
password_hash = PasswordHash.recommended()
SESSION_COOKIE = "docflow_session"
SESSION_LIFETIME = timedelta(days=14)


def _utcnow() -> datetime:
    """Return UTC as a naive value for the database's timezone-naive columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_user_hash(password: str) -> str:
    return password_hash.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_hash.verify(plain_password, hashed_password)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    result = await session.execute(
        select(User)
        .join(UserSession, UserSession.account_id == User.user_id)
        .where(
            UserSession.token_hash == _hash_token(token),
            UserSession.expires_at > _utcnow(),
        )
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        secure=os.getenv("AUTH_COOKIE_SECURE", "true").lower() == "true",
        samesite="lax",
        max_age=int(SESSION_LIFETIME.total_seconds()),
        path="/",
    )


def _delete_session_cookie(response: Response) -> None:
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        httponly=True,
        secure=os.getenv("AUTH_COOKIE_SECURE", "true").lower() == "true",
        samesite="lax",
    )


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(
    credentials: Credentials,
    response: Response,
    session: AsyncSession = Depends(get_async_session),
) -> User:
    username = credentials.username.strip()
    if not username:
        raise HTTPException(status_code=422, detail="Username cannot be empty")

    user = User(username=username, hashed_password=get_user_hash(credentials.password))
    session.add(user)
    try:
        await session.flush()
        token = secrets.token_urlsafe(32)
        session.add(
            UserSession(
                token_hash=_hash_token(token),
                account_id=user.user_id,
                expires_at=_utcnow() + SESSION_LIFETIME,
            )
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Username is already registered") from exc

    _set_session_cookie(response, token)
    return user


@router.post("/login", response_model=UserRead)
async def login(
    credentials: Credentials,
    response: Response,
    session: AsyncSession = Depends(get_async_session),
) -> User:
    result = await session.execute(
        select(User).where(User.username == credentials.username.strip())
    )
    user = result.scalar_one_or_none()
    if user is None or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = secrets.token_urlsafe(32)
    session.add(
        UserSession(
            token_hash=_hash_token(token),
            account_id=user.user_id,
            expires_at=_utcnow() + SESSION_LIFETIME,
        )
    )
    await session.commit()
    _set_session_cookie(response, token)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        result = await session.execute(
            select(UserSession).where(UserSession.token_hash == _hash_token(token))
        )
        user_session = result.scalar_one_or_none()
        if user_session is not None:
            await session.delete(user_session)
            await session.commit()
    _delete_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserRead)
async def get_me(user: User = Depends(get_current_user)) -> User:
    return user