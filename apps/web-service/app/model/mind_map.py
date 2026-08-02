import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.model.base import Base, JSONValue, TimestampMixin, UUIDPrimaryKeyMixin


class MindMap(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "mind_maps"
    __table_args__ = (Index("ix_mind_maps_document_updated", "document_id", "updated_at"),)

    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), default="未命名思维导图", nullable=False)
    graph: Mapped[dict] = mapped_column(JSONValue, default=dict, nullable=False)
    version: Mapped[int] = mapped_column(BigInteger, default=1, nullable=False)
    updated_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)


class MindMapVersion(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "mind_map_versions"
    __table_args__ = (UniqueConstraint("mind_map_id", "version"),)

    mind_map_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("mind_maps.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(BigInteger, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    graph: Mapped[dict] = mapped_column(JSONValue, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    reason: Mapped[str] = mapped_column(String(30), default="interval", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
