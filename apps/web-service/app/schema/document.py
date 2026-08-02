from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


def empty_document() -> dict[str, Any]:
    return {"type": "doc", "content": [{"type": "paragraph", "content": []}]}


class DocumentCreate(BaseModel):
    workspace_id: UUID
    parent_id: UUID | None = None
    type: str = Field(
        default="document", pattern="^(document|folder|mindmap|gantt|spreadsheet)$"
    )
    title: str = Field(default="无标题文档", min_length=1, max_length=300)
    content: dict[str, Any] = Field(default_factory=empty_document)


class DocumentUpdate(BaseModel):
    base_version: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=300)
    content: dict[str, Any] | None = None
    reason: str = Field(
        default="interval",
        pattern="^(manual|interval|agent|import|migration|restore)$",
    )


class DocumentMoveRequest(BaseModel):
    parent_id: UUID | None = None


class DocumentBatchDeleteRequest(BaseModel):
    document_ids: list[UUID] = Field(min_length=1, max_length=100)


class DocumentBatchDeleteResponse(BaseModel):
    deleted_count: int


class DocumentShareCreate(BaseModel):
    email: EmailStr
    permission: str = Field(default="viewer", pattern="^(viewer|editor)$")


class DocumentShareUpdate(BaseModel):
    permission: str = Field(pattern="^(viewer|editor)$")


class DocumentShareResponse(BaseModel):
    id: UUID
    user_id: UUID
    email: EmailStr
    display_name: str
    permission: str
    created_at: datetime


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    parent_id: UUID | None
    type: str
    title: str
    content: dict[str, Any]
    plain_text: str
    version: int
    created_by: UUID
    updated_by: UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None
    published_at: datetime | None = None
    public_slug: str | None = None
    access_role: str = "owner"
    owner_name: str | None = None
    last_viewed_at: datetime | None = None


class DocumentVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    version: int
    title: str
    content: dict[str, Any]
    created_by: UUID
    actor_name: str | None = None
    reason: str
    created_at: datetime
