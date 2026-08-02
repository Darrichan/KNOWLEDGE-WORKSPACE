from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exception.errors import PermissionDeniedError
from app.model.workspace import Workspace, WorkspaceMember

EDIT_ROLES = {"owner", "admin", "editor"}
ADMIN_ROLES = {"owner", "admin"}


async def require_workspace_role(
    session: AsyncSession,
    user_id: UUID,
    workspace_id: UUID,
    allowed_roles: set[str] | None = None,
) -> WorkspaceMember:
    membership = await session.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    if membership is None or (allowed_roles is not None and membership.role not in allowed_roles):
        raise PermissionDeniedError()
    return membership


async def list_workspaces(session: AsyncSession, user_id: UUID) -> list[Workspace]:
    result = await session.scalars(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user_id)
        .order_by(Workspace.updated_at.desc())
    )
    return list(result.all())


async def create_workspace(session: AsyncSession, user_id: UUID, name: str) -> Workspace:
    workspace = Workspace(
        name=name.strip(),
        slug=f"space-{uuid4().hex[:12]}",
        owner_id=user_id,
        settings={},
    )
    session.add(workspace)
    await session.flush()
    session.add(WorkspaceMember(workspace_id=workspace.id, user_id=user_id, role="owner"))
    await session.commit()
    return workspace
