from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.exception.errors import APIError
from app.model.user import User, WechatScanLoginSession
from app.service.wechat_scan_login_service import (
    _hash_poll_token,
    confirm_scan_login_session,
    poll_scan_login_session,
)


def make_scan_session(*, status: str = "pending", expires_in: int = 300) -> WechatScanLoginSession:
    return WechatScanLoginSession(
        id=uuid4(),
        ticket="a" * 32,
        poll_token_hash=_hash_poll_token("pc-private-poll-token-1234567890"),
        status=status,
        expires_at=datetime.now(UTC) + timedelta(seconds=expires_in),
    )


def make_user() -> User:
    return User(
        id=uuid4(),
        email="scan-login@example.com",
        public_id="scan-login-user",
        display_name="扫码用户",
        password_hash="not-used-by-this-test",
        is_active=True,
    )


@pytest.mark.asyncio
async def test_confirm_and_poll_scan_login_is_one_time() -> None:
    scan_session = make_scan_session()
    user = make_user()
    session = AsyncMock()
    session.scalar.return_value = scan_session
    session.get.return_value = user

    confirmed = await confirm_scan_login_session(session, scan_session.ticket, user)

    assert confirmed.status == "confirmed"
    assert confirmed.user_id == user.id
    status, expires_in, polled_user, token = await poll_scan_login_session(
        session,
        scan_session.ticket,
        "pc-private-poll-token-1234567890",
    )
    assert status == "confirmed"
    assert expires_in > 0
    assert polled_user is user
    assert token
    assert scan_session.status == "consumed"

    status, expires_in, polled_user, token = await poll_scan_login_session(
        session,
        scan_session.ticket,
        "pc-private-poll-token-1234567890",
    )
    assert (status, expires_in, polled_user, token) == ("consumed", 0, None, None)


@pytest.mark.asyncio
async def test_poll_scan_login_rejects_a_token_not_owned_by_the_pc() -> None:
    session = AsyncMock()
    session.scalar.return_value = make_scan_session()

    with pytest.raises(APIError) as error:
        await poll_scan_login_session(session, "a" * 32, "different-private-token-value")

    assert error.value.code == "WECHAT_SCAN_NOT_FOUND"


@pytest.mark.asyncio
async def test_expired_scan_login_cannot_be_confirmed() -> None:
    scan_session = make_scan_session(expires_in=-1)
    session = AsyncMock()
    session.scalar.return_value = scan_session

    with pytest.raises(APIError) as error:
        await confirm_scan_login_session(session, scan_session.ticket, make_user())

    assert error.value.code == "WECHAT_SCAN_EXPIRED"
    assert scan_session.status == "expired"
