from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MindMapUpdate(BaseModel):
    base_version: int | None = Field(default=None, ge=1)
    graph: dict[str, Any]
    title: str | None = Field(default=None, min_length=1, max_length=300)
    reason: str = Field(default="interval", pattern="^(manual|interval|restore)$")


class MindMapCreate(BaseModel):
    title: str = Field(default="未命名思维导图", min_length=1, max_length=300)
    graph: dict[str, Any]


class MindMapRename(BaseModel):
    title: str = Field(min_length=1, max_length=300)


class MindMapResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    title: str
    graph: dict[str, Any]
    version: int
    updated_by: UUID
    created_at: datetime
    updated_at: datetime


class MindMapVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    mind_map_id: UUID
    version: int
    title: str
    graph: dict[str, Any]
    created_by: UUID
    actor_name: str | None = None
    reason: str
    created_at: datetime
