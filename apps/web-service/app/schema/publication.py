from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class PublicAuthorResponse(BaseModel):
    public_id: str
    display_name: str


class PublicArticleSummary(BaseModel):
    id: UUID
    slug: str
    title: str
    excerpt: str
    cover_url: str | None = None
    published_at: datetime
    updated_at: datetime
    author: PublicAuthorResponse


class PublicArticleDetail(PublicArticleSummary):
    content: dict[str, Any]
