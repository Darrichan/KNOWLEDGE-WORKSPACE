from secrets import compare_digest
from urllib.parse import urlencode

from fastapi import APIRouter, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from app.api.dependencies import CurrentUser, SessionDep
from app.core.config import get_settings
from app.core.security import (
    create_captcha_challenge,
    create_wechat_oauth_state,
    decode_wechat_oauth_state,
    validate_captcha_ticket,
    verify_captcha_challenge,
)
from app.exception.errors import APIError
from app.model.user import User
from app.schema.auth import (
    CaptchaChallengeResponse,
    CaptchaTicketResponse,
    CaptchaVerifyRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserPublicIdUpdate,
    UserResponse,
    WechatBindingResponse,
    WechatMiniBindRequest,
)
from app.service.auth_service import authenticate_user, register_user
from app.service.wechat_auth_service import (
    bind_mini_program_identity,
    exchange_mini_program_code,
    exchange_wechat_code,
    get_wechat_binding_status,
    login_or_register_wechat_user,
)

router = APIRouter()


@router.get("/wechat/binding", response_model=WechatBindingResponse)
async def wechat_binding_status(
    user: CurrentUser,
    session: SessionDep,
) -> WechatBindingResponse:
    binding = await get_wechat_binding_status(session, user.id)
    return WechatBindingResponse(
        bound=binding is not None,
        nickname=binding.nickname if binding else None,
        avatar_url=binding.avatar_url if binding else None,
    )


@router.post("/wechat/mini/bind", response_model=WechatBindingResponse)
async def bind_wechat_mini_program(
    payload: WechatMiniBindRequest,
    user: CurrentUser,
    session: SessionDep,
) -> WechatBindingResponse:
    identity_data = await exchange_mini_program_code(payload.code.strip())
    binding = await bind_mini_program_identity(session, user, identity_data)
    return WechatBindingResponse(
        bound=True,
        nickname=binding.nickname,
        avatar_url=binding.avatar_url,
    )


@router.get("/wechat/status")
async def wechat_status() -> dict[str, bool | str]:
    settings = get_settings()
    configured = bool(
        settings.wechat_open_app_id
        and settings.wechat_open_app_secret
        and settings.wechat_open_redirect_uri
    )
    return {"configured": configured, "provider": "wechat-open-platform"}


@router.get("/wechat/authorize")
async def wechat_authorize(
    invite_code: str | None = Query(default=None, max_length=128),
    next_path: str = Query(default="/", max_length=300),
) -> RedirectResponse:
    settings = get_settings()
    if not (
        settings.wechat_open_app_id
        and settings.wechat_open_app_secret
        and settings.wechat_open_redirect_uri
    ):
        raise APIError("WECHAT_NOT_CONFIGURED", "微信开放平台登录尚未配置", 503)
    state = create_wechat_oauth_state(invite_code, next_path)
    query = urlencode(
        {
            "appid": settings.wechat_open_app_id,
            "redirect_uri": settings.wechat_open_redirect_uri,
            "response_type": "code",
            "scope": "snsapi_login",
            "state": state,
        }
    )
    return RedirectResponse(f"https://open.weixin.qq.com/connect/qrconnect?{query}#wechat_redirect")


@router.get("/wechat/callback")
async def wechat_callback(
    session: SessionDep,
    code: str = Query(min_length=1),
    state: str = Query(min_length=20),
) -> RedirectResponse:
    settings = get_settings()
    try:
        state_data = decode_wechat_oauth_state(state)
        profile = await exchange_wechat_code(code)
        _, token = await login_or_register_wechat_user(
            session,
            profile,
            state_data["invite_code"],
        )
    except ValueError:
        error_query = urlencode({"wechat_error": "state_expired"})
        return RedirectResponse(f"{settings.wechat_login_success_url}?{error_query}")
    except APIError as error:
        error_query = urlencode({"wechat_error": error.code.lower()})
        return RedirectResponse(f"{settings.wechat_login_success_url}?{error_query}")

    redirect = RedirectResponse(
        f"{settings.wechat_login_success_url}?{urlencode({'wechat': 'success'})}",
        status_code=302,
    )
    set_access_cookie(redirect, token)
    return redirect


@router.get("/captcha/challenge", response_model=CaptchaChallengeResponse)
async def captcha_challenge() -> CaptchaChallengeResponse:
    token, target = create_captcha_challenge()
    return CaptchaChallengeResponse(challenge_token=token, target=target, expires_in=180)


@router.post("/captcha/verify", response_model=CaptchaTicketResponse)
async def captcha_verify(payload: CaptchaVerifyRequest) -> CaptchaTicketResponse:
    try:
        ticket = verify_captcha_challenge(payload.challenge_token, payload.answer)
    except ValueError as error:
        raise APIError("CAPTCHA_FAILED", "滑块位置不正确，请重试", 400) from error
    return CaptchaTicketResponse(captcha_ticket=ticket, expires_in=300)


def set_access_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        "access_token",
        token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def validate_registration_invite_code(invite_code: str) -> None:
    configured_codes = get_settings().registration_invite_codes
    supplied_code = invite_code.strip()
    if not configured_codes or not any(
        compare_digest(supplied_code, configured_code) for configured_code in configured_codes
    ):
        raise APIError("INVALID_INVITE_CODE", "邀请码无效或注册暂未开放", 403)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest, response: Response, session: SessionDep
) -> TokenResponse:
    try:
        validate_captcha_ticket(payload.captcha_ticket)
    except ValueError as error:
        raise APIError("CAPTCHA_REQUIRED", "请先完成滑块验证", 400) from error
    validate_registration_invite_code(payload.invite_code)
    user, token = await register_user(session, payload)
    set_access_cookie(response, token)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, response: Response, session: SessionDep) -> TokenResponse:
    try:
        validate_captcha_ticket(payload.captcha_ticket)
    except ValueError as error:
        raise APIError("CAPTCHA_REQUIRED", "请先完成滑块验证", 400) from error
    user, token = await authenticate_user(session, payload.email, payload.password)
    set_access_cookie(response, token)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    response.delete_cookie("access_token", path="/")


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(user)


@router.patch("/me/public-id", response_model=UserResponse)
async def update_public_id(
    payload: UserPublicIdUpdate, user: CurrentUser, session: SessionDep
) -> UserResponse:
    public_id = payload.public_id.lower()
    existing = await session.scalar(
        select(User.id).where(User.public_id == public_id, User.id != user.id)
    )
    if existing:
        raise APIError("PUBLIC_ID_ALREADY_EXISTS", "该用户名 ID 已被使用", 409)
    user.public_id = public_id
    await session.commit()
    await session.refresh(user)
    return UserResponse.model_validate(user)
