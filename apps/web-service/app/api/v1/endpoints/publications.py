from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse

from app.api.dependencies import SessionDep
from app.core.config import get_settings
from app.exception.errors import APIError
from app.schema.publication import (
    PublicArticleDetail,
    PublicArticleSummary,
    PublicAuthorResponse,
)
from app.service.publication_service import (
    first_image_url,
    get_public_article,
    get_public_article_by_id,
    get_public_author,
    list_public_articles,
    public_asset_url,
)

router = APIRouter()
settings = get_settings()
image_types = {
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
}


def author_response(author: object) -> PublicAuthorResponse:
    return PublicAuthorResponse(public_id=author.public_id, display_name=author.display_name)


def article_summary(document: object, author: object) -> PublicArticleSummary:
    return PublicArticleSummary(
        id=document.id,
        slug=document.public_slug,
        title=document.title,
        excerpt=document.plain_text[:220],
        cover_url=public_asset_url(document, first_image_url(document.content)),
        published_at=document.published_at,
        updated_at=document.updated_at,
        author=author_response(author),
    )


@router.get("/authors/{public_id}", response_model=PublicAuthorResponse)
async def get_author(public_id: str, session: SessionDep) -> PublicAuthorResponse:
    return author_response(await get_public_author(session, public_id))


@router.get("/authors/{public_id}/articles", response_model=list[PublicArticleSummary])
async def get_articles(
    public_id: str,
    session: SessionDep,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[PublicArticleSummary]:
    author, documents = await list_public_articles(session, public_id, limit, offset)
    return [article_summary(document, author) for document in documents]


@router.get("/authors/{public_id}/articles/{slug}", response_model=PublicArticleDetail)
async def get_article(
    public_id: str, slug: str, session: SessionDep
) -> PublicArticleDetail:
    author, document = await get_public_article(session, public_id, slug)
    return PublicArticleDetail(
        **article_summary(document, author).model_dump(),
        content=document.content,
    )


@router.get("/articles/{document_id}/assets/{filename}", response_class=FileResponse)
async def get_public_article_asset(
    document_id: UUID, filename: str, session: SessionDep
) -> FileResponse:
    await get_public_article_by_id(session, document_id)
    safe_name = Path(filename).name
    mime_type = image_types.get(Path(safe_name).suffix.lower())
    if safe_name != filename or mime_type is None:
        raise APIError("INVALID_ASSET_NAME", "图片地址无效", 400)
    target = Path(settings.upload_dir) / str(document_id) / safe_name
    if not target.is_file():
        raise APIError("ASSET_NOT_FOUND", "图片不存在", 404)
    return FileResponse(target, media_type=mime_type, filename=safe_name)
