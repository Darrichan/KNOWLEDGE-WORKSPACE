from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: str = "development"
    app_name: str = "Knowledge Workspace API"
    api_v1_prefix: str = "/api/v1"
    secret_key: str = Field(default="development-secret-key-change-me-please", min_length=32)
    access_token_expire_minutes: int = 30
    database_url: str = "postgresql+psycopg://zhiliu:zhiliu@localhost:5432/zhiliu"
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:4173",
        "http://localhost:5173",
        "http://localhost:5174",
    ]
    cookie_secure: bool = False
    upload_dir: str = "uploads"
    upload_max_bytes: int = 20 * 1024 * 1024
    write_rate_limit_per_minute: int = 120
    trash_retention_days: int = Field(default=7, ge=1, le=365)
    trash_cleanup_interval_seconds: int = Field(default=3600, ge=60)
    registration_invite_codes: Annotated[list[str], NoDecode] = []

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("registration_invite_codes", mode="before")
    @classmethod
    def parse_registration_invite_codes(cls, value: object) -> object:
        if isinstance(value, str):
            return [code.strip() for code in value.split(",") if code.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
