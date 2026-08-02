from copy import deepcopy
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.exception.errors import (
    APIError,
    NotFoundError,
    PermissionDeniedError,
    VersionConflictError,
)
from app.model.document import Document, DocumentShare, DocumentVersion, DocumentView
from app.model.mind_map import MindMap
from app.model.user import User
from app.model.workspace import WorkspaceMember
from app.schema.document import DocumentCreate, DocumentShareCreate, DocumentUpdate
from app.service.workspace_service import EDIT_ROLES, require_workspace_role


def extract_plain_text(node: Any) -> str:
    chunks: list[str] = []

    def visit(value: Any) -> None:
        if isinstance(value, str):
            chunks.append(value)
            return
        if isinstance(value, dict):
            text = value.get("text")
            if isinstance(text, str):
                chunks.append(text)
            name = value.get("name")
            if isinstance(name, str):
                chunks.append(name)
            for child in value.get("content", []):
                visit(child)
            if value.get("type") == "gantt":
                visit(value.get("tasks", []))
            if value.get("type") == "spreadsheet":
                visit(value.get("columns", []))
                visit(value.get("rows", []))
            if value.get("type") in {"paragraph", "heading", "listItem", "blockquote"}:
                chunks.append("\n")
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(node)
    return " ".join("".join(chunks).split())


async def create_document(
    session: AsyncSession, user_id: UUID, payload: DocumentCreate
) -> Document:
    await require_workspace_role(session, user_id, payload.workspace_id, EDIT_ROLES)
    if payload.parent_id is not None:
        parent = await session.scalar(
            select(Document).where(
                Document.id == payload.parent_id,
                Document.workspace_id == payload.workspace_id,
                Document.type == "folder",
                Document.deleted_at.is_(None),
            )
        )
        if parent is None:
            raise APIError("INVALID_PARENT", "目标文件夹不存在", 400)
    document = Document(
        workspace_id=payload.workspace_id,
        parent_id=payload.parent_id,
        type=payload.type,
        title=payload.title.strip(),
        content=payload.content,
        plain_text=extract_plain_text(payload.content),
        created_by=user_id,
        updated_by=user_id,
    )
    session.add(document)
    await session.commit()
    await session.refresh(document)
    return document


async def list_documents(
    session: AsyncSession, user_id: UUID, workspace_id: UUID
) -> list[Document]:
    await require_workspace_role(session, user_id, workspace_id)
    result = await session.scalars(
        select(Document)
        .where(Document.workspace_id == workspace_id, Document.deleted_at.is_(None))
        .order_by(Document.updated_at.desc())
    )
    return list(result.all())


async def get_document_access(
    session: AsyncSession, user_id: UUID, document_id: UUID
) -> tuple[Document, str]:
    row = (
        await session.execute(
            select(Document, WorkspaceMember.role, DocumentShare.permission)
            .outerjoin(
                WorkspaceMember,
                and_(
                    WorkspaceMember.workspace_id == Document.workspace_id,
                    WorkspaceMember.user_id == user_id,
                ),
            )
            .outerjoin(
                DocumentShare,
                and_(
                    DocumentShare.document_id == Document.id,
                    DocumentShare.user_id == user_id,
                ),
            )
            .where(
                Document.id == document_id,
                Document.deleted_at.is_(None),
                or_(WorkspaceMember.user_id.is_not(None), DocumentShare.user_id.is_not(None)),
            )
        )
    ).one_or_none()
    if row is None:
        raise NotFoundError("文档")
    document, workspace_role, share_permission = row
    role = workspace_role or share_permission or "viewer"
    return document, role


async def get_document(session: AsyncSession, user_id: UUID, document_id: UUID) -> Document:
    document, _ = await get_document_access(session, user_id, document_id)
    return document


async def require_document_edit_access(
    session: AsyncSession, user_id: UUID, document_id: UUID
) -> Document:
    document, role = await get_document_access(session, user_id, document_id)
    if role not in EDIT_ROLES and role != "editor":
        raise PermissionDeniedError()
    return document


async def record_document_view(
    session: AsyncSession, user_id: UUID, document_id: UUID
) -> DocumentView:
    await get_document_access(session, user_id, document_id)
    view = await session.get(DocumentView, (document_id, user_id))
    if view is None:
        view = DocumentView(document_id=document_id, user_id=user_id, view_count=1)
        session.add(view)
    else:
        view.view_count += 1
        view.last_viewed_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(view)
    return view


async def list_recent_documents(
    session: AsyncSession, user_id: UUID, limit: int = 30
) -> list[tuple[Document, datetime, str | None, str | None, str]]:
    rows = await session.execute(
        select(
            Document,
            DocumentView.last_viewed_at,
            WorkspaceMember.role,
            DocumentShare.permission,
            User.display_name,
        )
        .join(DocumentView, DocumentView.document_id == Document.id)
        .join(User, User.id == Document.created_by)
        .outerjoin(
            WorkspaceMember,
            and_(
                WorkspaceMember.workspace_id == Document.workspace_id,
                WorkspaceMember.user_id == user_id,
            ),
        )
        .outerjoin(
            DocumentShare,
            and_(DocumentShare.document_id == Document.id, DocumentShare.user_id == user_id),
        )
        .where(
            DocumentView.user_id == user_id,
            Document.deleted_at.is_(None),
            or_(WorkspaceMember.user_id.is_not(None), DocumentShare.user_id.is_not(None)),
        )
        .order_by(DocumentView.last_viewed_at.desc())
        .limit(limit)
    )
    return list(rows.all())


async def list_shared_documents(
    session: AsyncSession, user_id: UUID
) -> list[tuple[Document, str, str]]:
    rows = await session.execute(
        select(Document, DocumentShare.permission, User.display_name)
        .join(DocumentShare, DocumentShare.document_id == Document.id)
        .join(User, User.id == Document.created_by)
        .where(DocumentShare.user_id == user_id, Document.deleted_at.is_(None))
        .order_by(DocumentShare.updated_at.desc())
    )
    return list(rows.all())


async def search_documents(
    session: AsyncSession, user_id: UUID, query: str, limit: int = 50
) -> list[tuple[Document, str, str]]:
    pattern = f"%{query.strip()}%"
    rows = await session.execute(
        select(Document, WorkspaceMember.role, DocumentShare.permission, User.display_name)
        .join(User, User.id == Document.created_by)
        .outerjoin(
            WorkspaceMember,
            and_(
                WorkspaceMember.workspace_id == Document.workspace_id,
                WorkspaceMember.user_id == user_id,
            ),
        )
        .outerjoin(
            DocumentShare,
            and_(DocumentShare.document_id == Document.id, DocumentShare.user_id == user_id),
        )
        .where(
            Document.deleted_at.is_(None),
            or_(WorkspaceMember.user_id.is_not(None), DocumentShare.user_id.is_not(None)),
            or_(Document.title.ilike(pattern), Document.plain_text.ilike(pattern)),
        )
        .order_by(Document.updated_at.desc())
        .limit(limit)
    )
    return [
        (document, workspace_role or permission or "viewer", owner_name)
        for document, workspace_role, permission, owner_name in rows.all()
    ]


async def update_document(
    session: AsyncSession,
    user_id: UUID,
    document_id: UUID,
    payload: DocumentUpdate,
) -> Document:
    current = await require_document_edit_access(session, user_id, document_id)

    if payload.base_version != current.version:
        raise VersionConflictError(current.version)

    next_title = current.title if payload.title is None else payload.title.strip()
    next_content = current.content if payload.content is None else payload.content
    if next_title == current.title and next_content == current.content:
        return current

    snapshot = DocumentVersion(
        document_id=current.id,
        version=current.version,
        title=current.title,
        content=current.content,
        created_by=user_id,
        reason=payload.reason,
        created_at=datetime.now(UTC),
    )
    session.add(snapshot)

    values: dict[str, Any] = {
        "updated_by": user_id,
        "updated_at": datetime.now(UTC),
        "version": current.version + 1,
    }
    if payload.title is not None:
        values["title"] = payload.title.strip()
    if payload.content is not None:
        values["content"] = payload.content
        values["plain_text"] = extract_plain_text(payload.content)

    statement = (
        update(Document)
        .where(Document.id == document_id, Document.version == payload.base_version)
        .values(**values)
        .returning(Document)
    )
    updated = (await session.execute(statement)).scalar_one_or_none()
    if updated is None:
        await session.rollback()
        latest_version = await session.scalar(
            select(Document.version).where(Document.id == document_id)
        )
        raise VersionConflictError(latest_version)

    await session.commit()
    return updated


async def move_document(
    session: AsyncSession, user_id: UUID, document_id: UUID, parent_id: UUID | None
) -> Document:
    document = await require_document_edit_access(session, user_id, document_id)
    if parent_id == document_id:
        raise APIError("INVALID_PARENT", "文档不能移动到自身", 400)
    if document.type == "folder" and parent_id is not None:
        subtree_ids = await _collect_subtree_ids(
            session, {document.id}, active_only=True
        )
        if parent_id in subtree_ids:
            raise APIError(
                "INVALID_PARENT", "文件夹不能移动到自己的子文件夹", 400
            )
    if parent_id is not None:
        parent = await session.scalar(
            select(Document).where(
                Document.id == parent_id,
                Document.workspace_id == document.workspace_id,
                Document.type == "folder",
                Document.deleted_at.is_(None),
            )
        )
        if parent is None:
            raise APIError("INVALID_PARENT", "目标文件夹不存在", 400)
    document.parent_id = parent_id
    document.updated_by = user_id
    await session.commit()
    await session.refresh(document)
    return document


async def duplicate_document(
    session: AsyncSession, user_id: UUID, document_id: UUID
) -> Document:
    source = await get_document(session, user_id, document_id)
    await require_workspace_role(session, user_id, source.workspace_id, EDIT_ROLES)
    source_maps = list(
        (
            await session.scalars(
                select(MindMap).where(MindMap.document_id == source.id)
            )
        ).all()
    )
    map_id_mapping = {item.id: uuid4() for item in source_maps}
    duplicate_content = deepcopy(source.content)

    def remap_embedded_maps(value: object) -> None:
        if isinstance(value, dict):
            attrs = value.get("attrs")
            if value.get("type") == "mindMapBlock" and isinstance(attrs, dict):
                old_id = str(attrs.get("mapId", ""))
                for source_id, duplicate_id in map_id_mapping.items():
                    if old_id == str(source_id):
                        attrs["mapId"] = str(duplicate_id)
                        break
            for child in value.values():
                remap_embedded_maps(child)
        elif isinstance(value, list):
            for child in value:
                remap_embedded_maps(child)

    remap_embedded_maps(duplicate_content)
    duplicate = Document(
        workspace_id=source.workspace_id,
        parent_id=source.parent_id,
        type=source.type,
        title=f"{source.title} 副本",
        content=duplicate_content,
        plain_text=source.plain_text,
        created_by=user_id,
        updated_by=user_id,
    )
    session.add(duplicate)
    await session.flush()
    for source_map in source_maps:
        session.add(
            MindMap(
                id=map_id_mapping[source_map.id],
                document_id=duplicate.id,
                title=source_map.title,
                graph=source_map.graph,
                version=1,
                updated_by=user_id,
            )
        )
    await session.commit()
    await session.refresh(duplicate)
    return duplicate


async def delete_document(session: AsyncSession, user_id: UUID, document_id: UUID) -> None:
    await batch_delete_documents(session, user_id, [document_id])


async def _collect_subtree_ids(
    session: AsyncSession, root_ids: set[UUID], *, active_only: bool = False
) -> set[UUID]:
    collected = set(root_ids)
    frontier = set(root_ids)
    while frontier:
        conditions = [Document.parent_id.in_(frontier)]
        if active_only:
            conditions.append(Document.deleted_at.is_(None))
        children = set((await session.scalars(select(Document.id).where(*conditions))).all())
        frontier = children - collected
        collected.update(frontier)
    return collected


async def batch_delete_documents(
    session: AsyncSession, user_id: UUID, document_ids: list[UUID]
) -> int:
    root_ids = set(document_ids)
    for document_id in root_ids:
        await require_document_edit_access(session, user_id, document_id)
    all_ids = await _collect_subtree_ids(session, root_ids, active_only=True)
    deleted_at = datetime.now(UTC)
    await session.execute(
        update(Document)
        .where(Document.id.in_(all_ids), Document.deleted_at.is_(None))
        .values(deleted_at=deleted_at, updated_by=user_id, updated_at=deleted_at)
    )
    await session.commit()
    return len(all_ids)


async def list_trashed_documents(
    session: AsyncSession, user_id: UUID
) -> list[tuple[Document, str, str]]:
    rows = await session.execute(
        select(Document, WorkspaceMember.role, User.display_name)
        .join(User, User.id == Document.created_by)
        .join(
            WorkspaceMember,
            and_(
                WorkspaceMember.workspace_id == Document.workspace_id,
                WorkspaceMember.user_id == user_id,
            ),
        )
        .where(Document.deleted_at.is_not(None), WorkspaceMember.role.in_(EDIT_ROLES))
        .order_by(Document.deleted_at.desc())
    )
    return list(rows.all())


async def _require_trashed_document_access(
    session: AsyncSession, user_id: UUID, document_id: UUID
) -> Document:
    document = await session.scalar(
        select(Document)
        .join(
            WorkspaceMember,
            and_(
                WorkspaceMember.workspace_id == Document.workspace_id,
                WorkspaceMember.user_id == user_id,
            ),
        )
        .where(
            Document.id == document_id,
            Document.deleted_at.is_not(None),
            WorkspaceMember.role.in_(EDIT_ROLES),
        )
    )
    if document is None:
        raise NotFoundError("回收站文档")
    return document


async def restore_document(
    session: AsyncSession, user_id: UUID, document_id: UUID
) -> Document:
    document = await _require_trashed_document_access(session, user_id, document_id)
    deletion_time = document.deleted_at
    all_ids = await _collect_subtree_ids(session, {document.id})
    restored_at = datetime.now(UTC)
    await session.execute(
        update(Document)
        .where(Document.id.in_(all_ids), Document.deleted_at == deletion_time)
        .values(deleted_at=None, updated_by=user_id, updated_at=restored_at)
    )
    await session.commit()
    await session.refresh(document)
    return document


async def permanently_delete_document(
    session: AsyncSession, user_id: UUID, document_id: UUID
) -> list[UUID]:
    return await batch_permanently_delete_documents(
        session, user_id, [document_id]
    )


async def batch_permanently_delete_documents(
    session: AsyncSession, user_id: UUID, document_ids: list[UUID]
) -> list[UUID]:
    root_ids = set(document_ids)
    for document_id in root_ids:
        await _require_trashed_document_access(session, user_id, document_id)
    all_ids = await _collect_subtree_ids(session, root_ids)
    documents = list(
        (await session.scalars(select(Document).where(Document.id.in_(all_ids)))).all()
    )
    for item in documents:
        await session.delete(item)
    await session.commit()
    return [item.id for item in documents]


async def purge_expired_documents(
    session: AsyncSession, retention_days: int
) -> list[UUID]:
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    documents = list(
        (
            await session.scalars(
                select(Document).where(
                    Document.deleted_at.is_not(None), Document.deleted_at <= cutoff
                )
            )
        ).all()
    )
    for document in documents:
        await session.delete(document)
    await session.commit()
    return [document.id for document in documents]


async def list_document_shares(
    session: AsyncSession, user_id: UUID, document_id: UUID
) -> list[tuple[DocumentShare, User]]:
    document = await get_document(session, user_id, document_id)
    await require_workspace_role(session, user_id, document.workspace_id, EDIT_ROLES)
    rows = await session.execute(
        select(DocumentShare, User)
        .join(User, User.id == DocumentShare.user_id)
        .where(DocumentShare.document_id == document_id)
        .order_by(DocumentShare.created_at.asc())
    )
    return list(rows.all())


async def share_document(
    session: AsyncSession,
    user_id: UUID,
    document_id: UUID,
    payload: DocumentShareCreate,
) -> tuple[DocumentShare, User]:
    document = await get_document(session, user_id, document_id)
    await require_workspace_role(session, user_id, document.workspace_id, EDIT_ROLES)
    target = await session.scalar(
        select(User).where(func.lower(User.email) == payload.email.lower())
    )
    if target is None:
        raise NotFoundError("用户")
    if target.id == user_id:
        raise APIError("CANNOT_SHARE_WITH_SELF", "无需将文档分享给自己", 400)
    share = await session.scalar(
        select(DocumentShare).where(
            DocumentShare.document_id == document_id,
            DocumentShare.user_id == target.id,
        )
    )
    if share is None:
        share = DocumentShare(
            document_id=document_id,
            user_id=target.id,
            permission=payload.permission,
            shared_by=user_id,
        )
        session.add(share)
    else:
        share.permission = payload.permission
        share.shared_by = user_id
    await session.commit()
    await session.refresh(share)
    return share, target


async def update_document_share(
    session: AsyncSession,
    user_id: UUID,
    document_id: UUID,
    share_id: UUID,
    permission: str,
) -> tuple[DocumentShare, User]:
    document = await get_document(session, user_id, document_id)
    await require_workspace_role(session, user_id, document.workspace_id, EDIT_ROLES)
    row = (
        await session.execute(
            select(DocumentShare, User)
            .join(User, User.id == DocumentShare.user_id)
            .where(DocumentShare.id == share_id, DocumentShare.document_id == document_id)
        )
    ).one_or_none()
    if row is None:
        raise NotFoundError("协作者")
    share, target = row
    share.permission = permission
    await session.commit()
    await session.refresh(share)
    return share, target


async def delete_document_share(
    session: AsyncSession, user_id: UUID, document_id: UUID, share_id: UUID
) -> None:
    document = await get_document(session, user_id, document_id)
    await require_workspace_role(session, user_id, document.workspace_id, EDIT_ROLES)
    share = await session.scalar(
        select(DocumentShare).where(
            DocumentShare.id == share_id,
            DocumentShare.document_id == document_id,
        )
    )
    if share is None:
        raise NotFoundError("协作者")
    await session.delete(share)
    await session.commit()


async def list_versions(
    session: AsyncSession, user_id: UUID, document_id: UUID
) -> list[tuple[DocumentVersion, str]]:
    await get_document(session, user_id, document_id)
    result = await session.execute(
        select(DocumentVersion, User.display_name)
        .join(User, User.id == DocumentVersion.created_by)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version.desc())
    )
    return [(version, actor_name) for version, actor_name in result.all()]


async def restore_document_version(
    session: AsyncSession,
    user_id: UUID,
    document_id: UUID,
    version_id: UUID,
) -> Document:
    current = await require_document_edit_access(session, user_id, document_id)
    version = await session.scalar(
        select(DocumentVersion).where(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == document_id,
        )
    )
    if version is None:
        raise NotFoundError("历史版本")
    return await update_document(
        session,
        user_id,
        document_id,
        DocumentUpdate(
            base_version=current.version,
            title=version.title,
            content=deepcopy(version.content),
            reason="restore",
        ),
    )


async def delete_document_version(
    session: AsyncSession,
    user_id: UUID,
    document_id: UUID,
    version_id: UUID,
) -> None:
    await require_document_edit_access(session, user_id, document_id)
    version = await session.scalar(
        select(DocumentVersion).where(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == document_id,
        )
    )
    if version is None:
        raise NotFoundError("历史版本")
    await session.delete(version)
    await session.commit()
