"""add wechat mini program scan login sessions

Revision ID: 20260803_0008
Revises: 20260803_0007
Create Date: 2026-08-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260803_0008"
down_revision: str | None = "20260803_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "wechat_scan_login_sessions",
        sa.Column("ticket", sa.String(length=32), nullable=False),
        sa.Column("poll_token_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_wechat_scan_login_sessions_ticket",
        "wechat_scan_login_sessions",
        ["ticket"],
        unique=True,
    )
    op.create_index(
        "ix_wechat_scan_login_sessions_status",
        "wechat_scan_login_sessions",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_wechat_scan_login_sessions_user_id",
        "wechat_scan_login_sessions",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_wechat_scan_login_sessions_expires_at",
        "wechat_scan_login_sessions",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_wechat_scan_login_sessions_expires_at",
        table_name="wechat_scan_login_sessions",
    )
    op.drop_index("ix_wechat_scan_login_sessions_user_id", table_name="wechat_scan_login_sessions")
    op.drop_index("ix_wechat_scan_login_sessions_status", table_name="wechat_scan_login_sessions")
    op.drop_index("ix_wechat_scan_login_sessions_ticket", table_name="wechat_scan_login_sessions")
    op.drop_table("wechat_scan_login_sessions")
