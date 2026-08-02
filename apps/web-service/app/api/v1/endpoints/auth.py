from secrets import compare_digest

from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.api.dependencies import CurrentUser, SessionDep
from app.core.config import get_settings
from app.core.security import (
    create_captcha_challenge,
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
)
from app.service.auth_service import authenticate_user, register_user

router = APIRouter()


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
