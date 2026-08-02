from datetime import UTC, datetime, timedelta
from secrets import randbelow
from typing import Any
from uuid import UUID, uuid4

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

ALGORITHM = "HS256"
password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, encoded_password: str) -> bool:
    return password_hash.verify(password, encoded_password)


def create_access_token(subject: UUID, expires_delta: timedelta | None = None) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    expires_at = now + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": "access",
        "iat": now,
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> UUID:
    settings = get_settings()
    payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    if payload.get("type") != "access" or not payload.get("sub"):
        raise jwt.InvalidTokenError("invalid token type")
    return UUID(str(payload["sub"]))


def create_captcha_challenge() -> tuple[str, int]:
    settings = get_settings()
    now = datetime.now(UTC)
    target = 20 + randbelow(61)
    payload: dict[str, Any] = {
        "sub": str(uuid4()),
        "type": "captcha_challenge",
        "target": target,
        "iat": now,
        "exp": now + timedelta(minutes=3),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM), target


def verify_captcha_challenge(token: str, answer: int) -> str:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError as error:
        raise ValueError("invalid captcha challenge") from error
    if payload.get("type") != "captcha_challenge":
        raise ValueError("invalid captcha challenge")
    target = payload.get("target")
    if not isinstance(target, int) or abs(target - answer) > 3:
        raise ValueError("captcha answer mismatch")
    now = datetime.now(UTC)
    ticket_payload: dict[str, Any] = {
        "sub": str(payload["sub"]),
        "type": "captcha_ticket",
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
    return jwt.encode(ticket_payload, settings.secret_key, algorithm=ALGORITHM)


def validate_captcha_ticket(token: str) -> None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError as error:
        raise ValueError("invalid captcha ticket") from error
    if payload.get("type") != "captcha_ticket":
        raise ValueError("invalid captcha ticket")
