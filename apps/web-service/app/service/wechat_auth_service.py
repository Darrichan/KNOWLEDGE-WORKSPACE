import hashlib
from secrets import compare_digest, token_urlsafe
from typing import Any

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import create_access_token, hash_password
from app.exception.errors import APIError
from app.model.user import User, WechatIdentity
from app.model.workspace import Workspace, WorkspaceMember

WECHAT_TOKEN_URL = "https://api.weixin.qq.com/sns/oauth2/access_token"
WECHAT_USERINFO_URL = "https://api.weixin.qq.com/sns/userinfo"
WECHAT_MINI_SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session"


def validate_wechat_invite_code(invite_code: str) -> None:
    configured_codes = get_settings().registration_invite_codes
    supplied_code = invite_code.strip()
    if not configured_codes or not any(
        compare_digest(supplied_code, configured_code) for configured_code in configured_codes
    ):
        raise APIError(
            "WECHAT_INVITE_REQUIRED",
            "该微信尚未绑定账号，请切换到注册并填写有效邀请码",
            403,
        )


async def _wechat_get(url: str, params: dict[str, str]) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise APIError("WECHAT_SERVICE_UNAVAILABLE", "微信授权服务暂时不可用", 502) from error
    if payload.get("errcode"):
        raise APIError(
            "WECHAT_OAUTH_FAILED",
            "微信授权失败，请重新扫码",
            400,
            {"wechatErrorCode": payload.get("errcode")},
        )
    return payload


async def exchange_wechat_code(code: str) -> dict[str, Any]:
    settings = get_settings()
    token_payload = await _wechat_get(
        WECHAT_TOKEN_URL,
        {
            "appid": settings.wechat_open_app_id,
            "secret": settings.wechat_open_app_secret,
            "code": code,
            "grant_type": "authorization_code",
        },
    )
    openid = str(token_payload.get("openid") or "")
    access_token = str(token_payload.get("access_token") or "")
    if not openid or not access_token:
        raise APIError("WECHAT_OAUTH_FAILED", "微信授权信息不完整，请重新扫码", 400)
    profile = await _wechat_get(
        WECHAT_USERINFO_URL,
        {"access_token": access_token, "openid": openid, "lang": "zh_CN"},
    )
    profile.setdefault("openid", openid)
    profile.setdefault("unionid", token_payload.get("unionid"))
    return profile


async def exchange_mini_program_code(code: str) -> dict[str, str | None]:
    settings = get_settings()
    if not settings.wechat_mini_app_id or not settings.wechat_mini_app_secret:
        raise APIError("WECHAT_MINI_NOT_CONFIGURED", "微信小程序登录尚未配置", 503)
    payload = await _wechat_get(
        WECHAT_MINI_SESSION_URL,
        {
            "appid": settings.wechat_mini_app_id,
            "secret": settings.wechat_mini_app_secret,
            "js_code": code,
            "grant_type": "authorization_code",
        },
    )
    openid = str(payload.get("openid") or "")
    if not openid:
        raise APIError("WECHAT_MINI_LOGIN_FAILED", "未能识别当前微信，请重新尝试", 400)
    return {
        "openid": openid,
        "unionid": str(payload.get("unionid") or "") or None,
    }


async def get_wechat_binding_status(session: AsyncSession, user_id: Any) -> WechatIdentity | None:
    return await session.scalar(select(WechatIdentity).where(WechatIdentity.user_id == user_id))


async def bind_mini_program_identity(
    session: AsyncSession,
    user: User,
    identity_data: dict[str, str | None],
) -> WechatIdentity:
    openid = str(identity_data["openid"])
    unionid = identity_data.get("unionid")
    current_binding = await get_wechat_binding_status(session, user.id)
    if current_binding is not None:
        if current_binding.openid != openid:
            raise APIError("WECHAT_ACCOUNT_ALREADY_BOUND", "该 KW 账号已经绑定其他微信", 409)
        return current_binding
    conditions = [WechatIdentity.openid == openid]
    if unionid:
        conditions.append(WechatIdentity.unionid == unionid)
    existing_binding = await session.scalar(
        select(WechatIdentity).where(or_(*conditions))
    )
    if existing_binding is not None:
        raise APIError("WECHAT_ALREADY_USED", "该微信已经绑定其他 KW 账号", 409)
    binding = WechatIdentity(
        user_id=user.id,
        openid=openid,
        unionid=unionid,
        nickname="已绑定微信",
        avatar_url=None,
    )
    session.add(binding)
    await session.commit()
    await session.refresh(binding)
    return binding


async def login_or_register_wechat_user(
    session: AsyncSession,
    profile: dict[str, Any],
    invite_code: str,
) -> tuple[User, str]:
    openid = str(profile["openid"])
    unionid = str(profile.get("unionid") or "") or None
    conditions = [WechatIdentity.openid == openid]
    if unionid:
        conditions.append(WechatIdentity.unionid == unionid)
    identity = await session.scalar(select(WechatIdentity).where(or_(*conditions)))
    nickname = str(profile.get("nickname") or "微信用户").strip()[:120] or "微信用户"
    avatar_url = str(profile.get("headimgurl") or "").strip()[:1000] or None

    if identity is not None:
        user = await session.get(User, identity.user_id)
        if user is None or not user.is_active:
            raise APIError("USER_DISABLED", "账户不存在或已停用", 403)
        identity.nickname = nickname
        identity.avatar_url = avatar_url
        if unionid:
            identity.unionid = unionid
        await session.commit()
        return user, create_access_token(user.id)

    validate_wechat_invite_code(invite_code)
    identity_digest = hashlib.sha256((unionid or openid).encode()).hexdigest()
    email = f"wechat-{identity_digest[:24]}@oauth.local"
    public_id = f"wechat-{identity_digest[:12]}"
    user = User(
        email=email,
        public_id=public_id,
        display_name=nickname[:80],
        password_hash=hash_password(token_urlsafe(32)),
        is_active=True,
    )
    session.add(user)
    await session.flush()
    workspace = Workspace(
        name=f"{user.display_name}的空间",
        slug=f"wechat-{identity_digest[:16]}",
        owner_id=user.id,
        settings={},
    )
    session.add(workspace)
    await session.flush()
    session.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="owner"))
    session.add(
        WechatIdentity(
            user_id=user.id,
            openid=openid,
            unionid=unionid,
            nickname=nickname,
            avatar_url=avatar_url,
        )
    )
    await session.commit()
    return user, create_access_token(user.id)
