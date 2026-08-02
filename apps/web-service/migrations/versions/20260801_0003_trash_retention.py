"""add trash retention indexes and cascade agent runs

Revision ID: 20260801_0003
Revises: 20260801_0002
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260801_0003"
down_revision: str | None = "20260801_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_documents_deleted_at", "documents", ["deleted_at"])
    op.drop_constraint(
        "fk_agent_runs_document_id_documents", "agent_runs", type_="foreignkey"
    )
    op.create_foreign_key(
        "fk_agent_runs_document_id_documents",
        "agent_runs",
        "documents",
        ["document_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_agent_runs_document_id_documents", "agent_runs", type_="foreignkey"
    )
    op.create_foreign_key(
        "fk_agent_runs_document_id_documents",
        "agent_runs",
        "documents",
        ["document_id"],
        ["id"],
    )
    op.drop_index("ix_documents_deleted_at", table_name="documents")
