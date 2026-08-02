from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=80)
    public_id: str | None = Field(
        default=None, min_length=3, max_length=40, pattern="^[a-z0-9][a-z0-9-]*$"
    )
    password: str = Field(min_length=8, max_length=128)
    invite_code: str = Field(min_length=6, max_length=128)
    captcha_ticket: str = Field(min_length=20)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    captcha_ticket: str = Field(min_length=20)


class CaptchaChallengeResponse(BaseModel):
    challenge_token: str
    target: int = Field(ge=15, le=85)
    expires_in: int


class CaptchaVerifyRequest(BaseModel):
    challenge_token: str
    answer: int = Field(ge=0, le=100)


class CaptchaTicketResponse(BaseModel):
    captcha_ticket: str
    expires_in: int


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    public_id: str
    email: EmailStr
    display_name: str
    is_active: bool


class UserPublicIdUpdate(BaseModel):
    public_id: str = Field(
        min_length=3, max_length=40, pattern="^[a-z0-9][a-z0-9-]*$"
    )


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
