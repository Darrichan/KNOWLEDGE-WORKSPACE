from typing import Annotated

import jwt
from fastapi import Cookie, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import decode_access_token
from app.exception.errors import APIError
from app.model.user import User

SessionDep = Annotated[AsyncSession, Depends(get_db_session)]
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    session: SessionDep,
    bearer: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    access_token: Annotated[str | None, Cookie()] = None,
) -> User:
    token = bearer.credentials if bearer is not None else access_token
    if not token:
        raise APIError("AUTHENTICATION_REQUIRED", "请先登录", 401)
    try:
        user_id = decode_access_token(token)
    except (jwt.InvalidTokenError, ValueError):
        raise APIError("INVALID_ACCESS_TOKEN", "登录状态已失效，请重新登录", 401) from None

    user = await session.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if user is None:
        raise APIError("INVALID_ACCESS_TOKEN", "登录状态已失效，请重新登录", 401)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
