import asyncio
import base64
import hashlib
from datetime import UTC, datetime, timedelta
from secrets import compare_digest, token_hex, token_urlsafe
from time import monotonic

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import create_access_token
from app.exception.errors import APIError
from app.model.user import User, WechatScanLoginSession

WECHAT_ACCESS_TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token"
WECHAT_MINI_CODE_URL = "https://api.weixin.qq.com/wxa/getwxacodeunlimit"

_access_token = ""
_access_token_expires_at = 0.0
_access_token_lock = asyncio.Lock()


def _hash_poll_token(poll_token: str) -> str:
    return hashlib.sha256(poll_token.encode()).hexdigest()


async def _get_mini_program_access_token() -> str:
    global _access_token, _access_token_expires_at
    settings = get_settings()
    if not settings.wechat_mini_app_id or not settings.wechat_mini_app_secret:
        raise APIError("WECHAT_MINI_NOT_CONFIGURED", "微信小程序登录尚未配置", 503)
    if _access_token and monotonic() < _access_token_expires_at:
        return _access_token
    async with _access_token_lock:
        if _access_token and monotonic() < _access_token_expires_at:
            return _access_token
        try:
            async with httpx.AsyncClient(timeout=12) as client:
                response = await client.get(
                    WECHAT_ACCESS_TOKEN_URL,
                    params={
                        "grant_type": "client_credential",
                        "appid": settings.wechat_mini_app_id,
                        "secret": settings.wechat_mini_app_secret,
                    },
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise APIError(
                "WECHAT_SERVICE_UNAVAILABLE", "微信小程序码服务暂时不可用", 502
            ) from error
        token = str(payload.get("access_token") or "")
        if not token:
            raise APIError(
                "WECHAT_MINI_CODE_FAILED",
                "未能获取微信小程序码凭证",
                502,
                {"wechatErrorCode": payload.get("errcode")},
            )
        expires_in = max(300, int(payload.get("expires_in") or 7200))
        _access_token = token
        _access_token_expires_at = monotonic() + expires_in - 120
        return token


async def generate_scan_login_code(ticket: str) -> str:
    settings = get_settings()
    access_token = await _get_mini_program_access_token()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                WECHAT_MINI_CODE_URL,
                params={"access_token": access_token},
                json={
                    "scene": ticket,
                    "page": "pages/scan-login/index",
                    "check_path": False,
                    "env_version": settings.wechat_mini_env_version,
                    "width": 430,
                    "auto_color": False,
                    "line_color": {"r": 61, "g": 91, "b": 157},
                    "is_hyaline": False,
                },
            )
            response.raise_for_status()
    except httpx.HTTPError as error:
        raise APIError("WECHAT_SERVICE_UNAVAILABLE", "微信小程序码服务暂时不可用", 502) from error
    content_type = response.headers.get("content-type", "")
    if "image" not in content_type:
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        raise APIError(
            "WECHAT_MINI_CODE_FAILED",
            "微信小程序码生成失败",
            502,
            {"wechatErrorCode": payload.get("errcode")},
        )
    image_type = content_type.split(";", 1)[0]
    return f"data:{image_type};base64,{base64.b64encode(response.content).decode()}"


async def create_scan_login_session(
    session: AsyncSession,
) -> tuple[WechatScanLoginSession, str, str]:
    settings = get_settings()
    ticket = token_hex(16)
    poll_token = token_urlsafe(32)
    now = datetime.now(UTC)
    scan_session = WechatScanLoginSession(
        ticket=ticket,
        poll_token_hash=_hash_poll_token(poll_token),
        status="pending",
        expires_at=now + timedelta(seconds=settings.wechat_scan_login_ttl_seconds),
    )
    session.add(scan_session)
    await session.commit()
    await session.refresh(scan_session)
    try:
        qr_code_data_url = await generate_scan_login_code(ticket)
    except APIError:
        await session.delete(scan_session)
        await session.commit()
        raise
    return scan_session, poll_token, qr_code_data_url


async def confirm_scan_login_session(
    session: AsyncSession,
    ticket: str,
    user: User,
) -> WechatScanLoginSession:
    now = datetime.now(UTC)
    scan_session = await session.scalar(
        select(WechatScanLoginSession)
        .where(WechatScanLoginSession.ticket == ticket)
        .with_for_update()
    )
    if scan_session is None:
        raise APIError("WECHAT_SCAN_NOT_FOUND", "登录二维码无效，请在电脑端刷新", 404)
    if scan_session.expires_at <= now or scan_session.status == "expired":
        scan_session.status = "expired"
        await session.commit()
        raise APIError("WECHAT_SCAN_EXPIRED", "登录二维码已过期，请在电脑端刷新", 410)
    if scan_session.status == "consumed":
        raise APIError("WECHAT_SCAN_CONSUMED", "该登录二维码已经使用", 409)
    if scan_session.user_id and scan_session.user_id != user.id:
        raise APIError("WECHAT_SCAN_ALREADY_CONFIRMED", "该登录请求已由其他账号确认", 409)
    scan_session.user_id = user.id
    scan_session.status = "confirmed"
    scan_session.confirmed_at = now
    await session.commit()
    await session.refresh(scan_session)
    return scan_session


async def poll_scan_login_session(
    session: AsyncSession,
    ticket: str,
    poll_token: str,
) -> tuple[str, int, User | None, str | None]:
    now = datetime.now(UTC)
    scan_session = await session.scalar(
        select(WechatScanLoginSession)
        .where(WechatScanLoginSession.ticket == ticket)
        .with_for_update()
    )
    if scan_session is None or not compare_digest(
        scan_session.poll_token_hash, _hash_poll_token(poll_token)
    ):
        raise APIError("WECHAT_SCAN_NOT_FOUND", "登录二维码无效，请重新生成", 404)
    expires_in = max(0, int((scan_session.expires_at - now).total_seconds()))
    if scan_session.expires_at <= now or scan_session.status == "expired":
        scan_session.status = "expired"
        await session.commit()
        return "expired", 0, None, None
    if scan_session.status == "pending":
        return "pending", expires_in, None, None
    if scan_session.status == "consumed":
        return "consumed", 0, None, None
    user = await session.get(User, scan_session.user_id)
    if user is None or not user.is_active:
        raise APIError("USER_DISABLED", "账户不存在或已停用", 403)
    token = create_access_token(user.id)
    scan_session.status = "consumed"
    scan_session.consumed_at = now
    await session.commit()
    return "confirmed", expires_in, user, token
