import re
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.exception.errors import APIError
from app.model.user import User
from app.model.workspace import Workspace, WorkspaceMember
from app.schema.auth import RegisterRequest


async def register_user(session: AsyncSession, payload: RegisterRequest) -> tuple[User, str]:
    email = payload.email.lower()
    existing = await session.scalar(select(User.id).where(func.lower(User.email) == email))
    if existing:
        raise APIError("EMAIL_ALREADY_EXISTS", "该邮箱已经注册", 409)

    requested_public_id = payload.public_id.lower() if payload.public_id else None
    if requested_public_id and await session.scalar(
        select(User.id).where(User.public_id == requested_public_id)
    ):
        raise APIError("PUBLIC_ID_ALREADY_EXISTS", "该用户名 ID 已被使用", 409)

    user = User(
        email=email,
        public_id=requested_public_id or await _available_public_id(session, email),
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    await session.flush()

    local_part = re.sub(r"[^a-z0-9]+", "-", email.split("@", 1)[0]).strip("-") or "workspace"
    workspace = Workspace(
        name=f"{user.display_name}的空间",
        slug=f"{local_part}-{uuid4().hex[:8]}",
        owner_id=user.id,
        settings={},
    )
    session.add(workspace)
    await session.flush()
    session.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="owner"))
    await session.commit()
    return user, create_access_token(user.id)


async def _available_public_id(session: AsyncSession, email: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", email.split("@", 1)[0]).strip("-") or "user"
    candidate = base[:72]
    if not await session.scalar(select(User.id).where(User.public_id == candidate)):
        return candidate
    while True:
        candidate = f"{base[:63]}-{uuid4().hex[:8]}"
        if not await session.scalar(select(User.id).where(User.public_id == candidate)):
            return candidate


async def authenticate_user(session: AsyncSession, email: str, password: str) -> tuple[User, str]:
    user = await session.scalar(select(User).where(func.lower(User.email) == email.lower()))
    if user is None or not verify_password(password, user.password_hash):
        raise APIError("INVALID_CREDENTIALS", "邮箱或密码错误", 401)
    if not user.is_active:
        raise APIError("USER_DISABLED", "账户已停用", 403)
    return user, create_access_token(user.id)
