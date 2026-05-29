"""Application configuration utilities for the Omni Teacher backend."""

from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_CORS_ORIGINS: list[str] = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


class Settings(BaseSettings):
    """Centralised runtime configuration loaded from environment variables."""

    database_url: str
    redis_url: str
    minio_endpoint: str
    minio_public_endpoint: str | None = None
    minio_access_key: str
    minio_secret_key: str
    omni_model: str = "gpt-4o"
    openai_api_key: str
    openai_api_base: str = "https://api.openai.com/v1"
    openai_base_url: str | None = None
    tts_voice: str = "alloy"
    tts_bucket_name: str = "omni-teacher-tts"
    stt_model: str = "gpt-4o-transcribe"
    openai_transcribe_model: str | None = None
    max_chat_history: int = 12
    environment: Literal["development", "production", "test"] = "development"
    cors_origins: list[str] | str | None = Field(default=None)
    cors_allow_credentials: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="allow",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> list[str] | None:
        """Allow comma-separated configuration of allowed origins."""

        if value in (None, "", []):
            return None
        if isinstance(value, str):
            parts = [part.strip() for part in value.split(",") if part.strip()]
            return parts or None
        if isinstance(value, list):
            return value
        return None

    @property
    def allowed_cors_origins(self) -> list[str]:
        """Return the resolved list of CORS origins."""

        origins = self.cors_origins
        if isinstance(origins, list) and origins:
            return list(origins)
        return list(DEFAULT_CORS_ORIGINS)

    @property
    def public_minio_endpoint(self) -> str:
        """Return the base URL for client-facing MinIO object links."""

        base = self.minio_public_endpoint or self.minio_endpoint
        parsed = urlparse(base)
        if not parsed.scheme:
            raise ValueError("MINIO_PUBLIC_ENDPOINT/MINIO_ENDPOINT must include scheme, e.g. http://localhost:9000")
        return base.rstrip("/")

    @property
    def resolved_openai_api_base(self) -> str:
        """Return the OpenAI-compatible endpoint."""

        return self.openai_api_base.rstrip("/")

    @property
    def resolved_stt_api_base(self) -> str:
        """Return the speech-recognition endpoint, accepting OpenRouter-style env names."""

        return (self.openai_base_url or self.openai_api_base).rstrip("/")

    @property
    def resolved_stt_model(self) -> str:
        """Return the transcription model, accepting OpenRouter-style env names."""

        return self.openai_transcribe_model or self.stt_model


@lru_cache
def get_settings() -> Settings:
    """Return a cached instance of :class:`Settings`."""

    return Settings()  # type: ignore[arg-type]


settings = get_settings()
