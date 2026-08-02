"""support multiple mind maps per document

Revision ID: 20260802_0005
Revises: 20260801_0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260802_0005"
down_revision: str | None = "20260801_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "mind_maps",
        sa.Column(
            "title",
            sa.String(length=300),
            server_default="未命名思维导图",
            nullable=False,
        ),
    )
    op.execute(
        """
        UPDATE mind_maps
        SET title = COALESCE(
            (SELECT documents.title || '导图'
             FROM documents
             WHERE documents.id = mind_maps.document_id),
            '未命名思维导图'
        )
        """
    )
    op.drop_constraint("uq_mind_maps_document_id", "mind_maps", type_="unique")
    op.create_index(
        "ix_mind_maps_document_updated",
        "mind_maps",
        ["document_id", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_mind_maps_document_updated", table_name="mind_maps")
    op.create_unique_constraint(
        "uq_mind_maps_document_id", "mind_maps", ["document_id"]
    )
    op.drop_column("mind_maps", "title")
