"""add WeChat OAuth identities

Revision ID: 20260803_0007
Revises: 20260802_0006
Create Date: 2026-08-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260803_0007"
down_revision: str | None = "20260802_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "wechat_identities",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("openid", sa.String(length=128), nullable=False),
        sa.Column("unionid", sa.String(length=128), nullable=True),
        sa.Column("nickname", sa.String(length=120), nullable=False),
        sa.Column("avatar_url", sa.String(length=1000), nullable=True),
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
    op.create_index("ix_wechat_identities_user_id", "wechat_identities", ["user_id"], unique=True)
    op.create_index("ix_wechat_identities_openid", "wechat_identities", ["openid"], unique=True)
    op.create_index("ix_wechat_identities_unionid", "wechat_identities", ["unionid"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_wechat_identities_unionid", table_name="wechat_identities")
    op.drop_index("ix_wechat_identities_openid", table_name="wechat_identities")
    op.drop_index("ix_wechat_identities_user_id", table_name="wechat_identities")
    op.drop_table("wechat_identities")
