from copy import deepcopy
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.exception.errors import MindMapVersionConflictError, NotFoundError
from app.model.mind_map import MindMap, MindMapVersion
from app.model.user import User
from app.schema.mind_map import MindMapCreate, MindMapUpdate
from app.service.document_service import get_document, require_document_edit_access


def snapshot_mind_map(
    session: AsyncSession, mind_map: MindMap, user_id: UUID, reason: str
) -> None:
    session.add(
        MindMapVersion(
            mind_map_id=mind_map.id,
            version=mind_map.version,
            title=mind_map.title,
            graph=deepcopy(mind_map.graph),
            created_by=user_id,
            reason=reason,
            created_at=datetime.now(UTC),
        )
    )


async def get_mind_map(session: AsyncSession, user_id: UUID, document_id: UUID) -> MindMap:
    await get_document(session, user_id, document_id)
    mind_map = await session.scalar(
        select(MindMap)
        .where(MindMap.document_id == document_id)
        .order_by(MindMap.created_at.asc())
        .limit(1)
    )
    if mind_map is None:
        raise NotFoundError("思维导图")
    return mind_map


async def save_mind_map(
    session: AsyncSession,
    user_id: UUID,
    document_id: UUID,
    payload: MindMapUpdate,
) -> MindMap:
    await require_document_edit_access(session, user_id, document_id)

    existing = await session.scalar(
        select(MindMap)
        .where(MindMap.document_id == document_id)
        .order_by(MindMap.created_at.asc())
        .limit(1)
    )
    if existing is None:
        if payload.base_version is not None:
            raise MindMapVersionConflictError(None)
        mind_map = MindMap(
            document_id=document_id,
            title=payload.title or "未命名思维导图",
            graph=payload.graph,
            version=1,
            updated_by=user_id,
        )
        session.add(mind_map)
        await session.commit()
        await session.refresh(mind_map)
        return mind_map

    if payload.base_version is None:
        raise MindMapVersionConflictError(existing.version)
    if payload.base_version != existing.version:
        raise MindMapVersionConflictError(existing.version)

    next_title = payload.title.strip() if payload.title else existing.title
    if payload.graph == existing.graph and next_title == existing.title:
        return existing

    existing_id = existing.id
    next_version = existing.version + 1
    snapshot_mind_map(session, existing, user_id, payload.reason)
    statement = (
        update(MindMap)
        .where(MindMap.id == existing_id, MindMap.version == payload.base_version)
        .values(
            graph=payload.graph,
            **({"title": payload.title.strip()} if payload.title else {}),
            version=next_version,
            updated_by=user_id,
            updated_at=datetime.now(UTC),
        )
        .returning(MindMap)
    )
    updated = (await session.execute(statement)).scalar_one_or_none()
    if updated is None:
        await session.rollback()
        latest_version = await session.scalar(
            select(MindMap.version).where(MindMap.id == existing_id)
        )
        raise MindMapVersionConflictError(latest_version)

    await session.commit()
    return updated


async def list_mind_maps(
    session: AsyncSession, user_id: UUID, document_id: UUID
) -> list[MindMap]:
    await get_document(session, user_id, document_id)
    return list(
        (
            await session.scalars(
                select(MindMap)
                .where(MindMap.document_id == document_id)
                .order_by(MindMap.created_at.asc())
            )
        ).all()
    )


async def create_mind_map(
    session: AsyncSession,
    user_id: UUID,
    document_id: UUID,
    payload: MindMapCreate,
) -> MindMap:
    await require_document_edit_access(session, user_id, document_id)
    mind_map = MindMap(
        document_id=document_id,
        title=payload.title.strip(),
        graph=payload.graph,
        version=1,
        updated_by=user_id,
    )
    session.add(mind_map)
    await session.commit()
    await session.refresh(mind_map)
    return mind_map


async def get_mind_map_by_id(
    session: AsyncSession, user_id: UUID, document_id: UUID, mind_map_id: UUID
) -> MindMap:
    await get_document(session, user_id, document_id)
    mind_map = await session.scalar(
        select(MindMap).where(
            MindMap.id == mind_map_id, MindMap.document_id == document_id
        )
    )
    if mind_map is None:
        raise NotFoundError("思维导图")
    return mind_map


async def update_mind_map(
    session: AsyncSession,
    user_id: UUID,
    document_id: UUID,
    mind_map_id: UUID,
    payload: MindMapUpdate,
) -> MindMap:
    await require_document_edit_access(session, user_id, document_id)
    existing = await get_mind_map_by_id(session, user_id, document_id, mind_map_id)
    if payload.base_version is None or payload.base_version != existing.version:
        raise MindMapVersionConflictError(existing.version)
    next_title = payload.title.strip() if payload.title else existing.title
    if payload.graph == existing.graph and next_title == existing.title:
        return existing
    snapshot_mind_map(session, existing, user_id, payload.reason)
    values = {
        "graph": payload.graph,
        "version": existing.version + 1,
        "updated_by": user_id,
        "updated_at": datetime.now(UTC),
    }
    if payload.title:
        values["title"] = payload.title.strip()
    statement = (
        update(MindMap)
        .where(MindMap.id == mind_map_id, MindMap.version == payload.base_version)
        .values(**values)
        .returning(MindMap)
    )
    updated = (await session.execute(statement)).scalar_one_or_none()
    if updated is None:
        await session.rollback()
        latest_version = await session.scalar(
            select(MindMap.version).where(MindMap.id == mind_map_id)
        )
        raise MindMapVersionConflictError(latest_version)
    await session.commit()
    return updated


async def duplicate_mind_map(
    session: AsyncSession, user_id: UUID, document_id: UUID, mind_map_id: UUID
) -> MindMap:
    await require_document_edit_access(session, user_id, document_id)
    source = await get_mind_map_by_id(session, user_id, document_id, mind_map_id)
    duplicate = MindMap(
        document_id=document_id,
        title=f"{source.title} 副本",
        graph=source.graph,
        version=1,
        updated_by=user_id,
    )
    session.add(duplicate)
    await session.commit()
    await session.refresh(duplicate)
    return duplicate


async def remove_mind_map(
    session: AsyncSession, user_id: UUID, document_id: UUID, mind_map_id: UUID
) -> None:
    await require_document_edit_access(session, user_id, document_id)
    result = await session.execute(
        delete(MindMap).where(
            MindMap.id == mind_map_id, MindMap.document_id == document_id
        )
    )
    if not result.rowcount:
        raise NotFoundError("思维导图")
    await session.commit()


async def list_mind_map_versions(
    session: AsyncSession, user_id: UUID, document_id: UUID, mind_map_id: UUID
) -> list[tuple[MindMapVersion, str]]:
    await get_mind_map_by_id(session, user_id, document_id, mind_map_id)
    result = await session.execute(
        select(MindMapVersion, User.display_name)
        .join(User, User.id == MindMapVersion.created_by)
        .where(MindMapVersion.mind_map_id == mind_map_id)
        .order_by(MindMapVersion.version.desc())
    )
    return [(version, actor_name) for version, actor_name in result.all()]


async def restore_mind_map_version(
    session: AsyncSession,
    user_id: UUID,
    document_id: UUID,
    mind_map_id: UUID,
    version_id: UUID,
) -> MindMap:
    current = await get_mind_map_by_id(session, user_id, document_id, mind_map_id)
    await require_document_edit_access(session, user_id, document_id)
    version = await session.scalar(
        select(MindMapVersion).where(
            MindMapVersion.id == version_id,
            MindMapVersion.mind_map_id == mind_map_id,
        )
    )
    if version is None:
        raise NotFoundError("思维导图历史版本")
    return await update_mind_map(
        session,
        user_id,
        document_id,
        mind_map_id,
        MindMapUpdate(
            base_version=current.version,
            title=version.title,
            graph=deepcopy(version.graph),
            reason="restore",
        ),
    )


async def delete_mind_map_version(
    session: AsyncSession,
    user_id: UUID,
    document_id: UUID,
    mind_map_id: UUID,
    version_id: UUID,
) -> None:
    await require_document_edit_access(session, user_id, document_id)
    await get_mind_map_by_id(session, user_id, document_id, mind_map_id)
    version = await session.scalar(
        select(MindMapVersion).where(
            MindMapVersion.id == version_id,
            MindMapVersion.mind_map_id == mind_map_id,
        )
    )
    if version is None:
        raise NotFoundError("思维导图历史版本")
    await session.delete(version)
    await session.commit()
