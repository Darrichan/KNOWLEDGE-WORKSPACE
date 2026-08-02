from uuid import uuid4

from app.core.config import Settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_comma_separated_cors_origins() -> None:
    settings = Settings(
        cors_origins="http://localhost:4173,http://localhost:8080",
        registration_invite_codes="alpha-private,beta-private",
    )

    assert settings.cors_origins == ["http://localhost:4173", "http://localhost:8080"]
    assert settings.registration_invite_codes == ["alpha-private", "beta-private"]


def test_password_hash_round_trip() -> None:
    encoded = hash_password("a-secure-password")

    assert encoded != "a-secure-password"
    assert verify_password("a-secure-password", encoded)
    assert not verify_password("wrong-password", encoded)


def test_access_token_round_trip() -> None:
    user_id = uuid4()

    token = create_access_token(user_id)

    assert decode_access_token(token) == user_id
