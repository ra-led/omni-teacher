"""Application configuration utilities for the Omni Teacher backend."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralised runtime configuration loaded from environment variables."""

    database_url: str
    redis_url: str
    minio_endpoint: str
    minio_access_key: str
    minio_secret_key: str
    omni_model: str = "gpt-4o"
    openai_api_key: str
    openai_api_base: str = "https://api.openai.com/v1"
    tts_voice: str = "alloy"
    tts_bucket_name: str = "omni-teacher-tts"
    max_chat_history: int = 12
    environment: Literal["development", "production", "test"] = "development"
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )
    cors_allow_credentials: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="allow",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> list[str]:
        """Allow comma-separated configuration of allowed origins."""

        if isinstance(value, str):
            parts = [part.strip() for part in value.split(",") if part.strip()]
            return parts or cls.model_fields["cors_origins"].default_factory()  # type: ignore[call-arg]
        if isinstance(value, list):
            return value
        return cls.model_fields["cors_origins"].default_factory()  # type: ignore[call-arg]


@lru_cache
def get_settings() -> Settings:
    """Return a cached instance of :class:`Settings`."""

    return Settings()  # type: ignore[arg-type]


settings = get_settings()

