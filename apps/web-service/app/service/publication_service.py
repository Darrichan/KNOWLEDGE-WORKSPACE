import re
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exception.errors import APIError, NotFoundError
from app.model.document import Document
from app.model.user import User
from app.service.document_service import require_document_edit_access


def first_image_url(node: Any) -> str | None:
    if isinstance(node, dict):
        if node.get("type") == "image" and isinstance(node.get("attrs", {}).get("src"), str):
            return node["attrs"]["src"]
        for child in node.get("content", []):
            found = first_image_url(child)
            if found:
                return found
    elif isinstance(node, list):
        for child in node:
            found = first_image_url(child)
            if found:
                return found
    return None


def public_asset_url(document: Document, source_url: str | None) -> str | None:
    if not source_url:
        return None
    marker = f"/documents/{document.id}/assets/"
    if marker not in source_url:
        return source_url
    filename = source_url.rsplit("/", 1)[-1]
    return f"/api/v1/public/articles/{document.id}/assets/{filename}"


async def _available_article_slug(session: AsyncSession, document: Document) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", document.title.lower()).strip("-")[:150]
    if not base:
        base = f"article-{document.id.hex[:8]}"
    candidate = base
    counter = 2
    while await session.scalar(
        select(Document.id).where(Document.public_slug == candidate, Document.id != document.id)
    ):
        candidate = f"{base[:165]}-{counter}"
        counter += 1
    return candidate


async def publish_document(
    session: AsyncSession, user_id: UUID, document_id: UUID
) -> Document:
    document = await require_document_edit_access(session, user_id, document_id)
    if document.type != "document":
        raise APIError("INVALID_PUBLICATION_TYPE", "只有文档可以发布到前台", 400)
    if not document.public_slug:
        document.public_slug = await _available_article_slug(session, document)
    document.published_at = document.published_at or datetime.now(UTC)
    document.updated_by = user_id
    await session.commit()
    await session.refresh(document)
    return document


async def unpublish_document(
    session: AsyncSession, user_id: UUID, document_id: UUID
) -> Document:
    document = await require_document_edit_access(session, user_id, document_id)
    document.published_at = None
    document.updated_by = user_id
    await session.commit()
    await session.refresh(document)
    return document


async def get_public_author(session: AsyncSession, public_id: str) -> User:
    author = await session.scalar(
        select(User).where(User.public_id == public_id.lower(), User.is_active.is_(True))
    )
    if author is None:
        raise NotFoundError("作者")
    return author


async def list_public_articles(
    session: AsyncSession, public_id: str, limit: int, offset: int
) -> tuple[User, list[Document]]:
    author = await get_public_author(session, public_id)
    documents = list(
        (
            await session.scalars(
                select(Document)
                .where(
                    Document.created_by == author.id,
                    Document.type == "document",
                    Document.published_at.is_not(None),
                    Document.deleted_at.is_(None),
                )
                .order_by(Document.published_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    return author, documents


async def get_public_article(
    session: AsyncSession, public_id: str, slug: str
) -> tuple[User, Document]:
    author = await get_public_author(session, public_id)
    document = await session.scalar(
        select(Document).where(
            Document.created_by == author.id,
            Document.public_slug == slug,
            Document.type == "document",
            Document.published_at.is_not(None),
            Document.deleted_at.is_(None),
        )
    )
    if document is None:
        raise NotFoundError("文章")
    return author, document


async def get_public_article_by_id(
    session: AsyncSession, document_id: UUID
) -> Document:
    document = await session.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.type == "document",
            Document.published_at.is_not(None),
            Document.deleted_at.is_(None),
        )
    )
    if document is None:
        raise NotFoundError("文章")
    return document
