"""Application configuration utilities for the Omni Teacher backend."""

from functools import lru_cache
from typing import Literal

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
    tts_voice: str = "alloy"
    tts_bucket_name: str = "omni-teacher-tts"
    max_chat_history: int = 12
    environment: Literal["development", "production", "test"] = "development"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="allow",
    )


@lru_cache
def get_settings() -> Settings:
    """Return a cached instance of :class:`Settings`."""

    return Settings()  # type: ignore[arg-type]


settings = get_settings()

