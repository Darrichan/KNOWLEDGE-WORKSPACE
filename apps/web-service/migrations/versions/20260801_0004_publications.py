"""add public author ids and article publication fields

Revision ID: 20260801_0004
Revises: 20260801_0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260801_0004"
down_revision: str | None = "20260801_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("public_id", sa.String(length=80), nullable=True))
    op.execute(
        """
        UPDATE users
        SET public_id = left(
            trim(both '-' from regexp_replace(
                lower(split_part(email, '@', 1)), '[^a-z0-9]+', '-', 'g'
            )),
            63
        ) || '-' || substr(replace(id::text, '-', ''), 1, 8)
        """
    )
    op.alter_column("users", "public_id", nullable=False)
    op.create_index("ix_users_public_id", "users", ["public_id"], unique=True)

    op.add_column("documents", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("documents", sa.Column("public_slug", sa.String(length=180), nullable=True))
    op.create_index("ix_documents_published_at", "documents", ["published_at"])
    op.create_index("ix_documents_public_slug", "documents", ["public_slug"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_documents_public_slug", table_name="documents")
    op.drop_index("ix_documents_published_at", table_name="documents")
    op.drop_column("documents", "public_slug")
    op.drop_column("documents", "published_at")
    op.drop_index("ix_users_public_id", table_name="users")
    op.drop_column("users", "public_id")
