"""MinIO helpers for storing generated media assets."""

from __future__ import annotations

import io
from urllib.parse import urlparse

import json

from minio import Minio
from minio.error import S3Error

from .config import settings


class StorageClient:
    """Wrap the MinIO SDK with bucket management conveniences."""

    def __init__(self) -> None:
        parsed = urlparse(settings.minio_endpoint)
        if not parsed.scheme:
            raise ValueError("MINIO_ENDPOINT must include scheme, e.g. http://minio:9000")
        self._client = Minio(
            parsed.netloc,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=parsed.scheme == "https",
        )
        self._bucket = settings.tts_bucket_name
        self._public_base = settings.public_minio_endpoint

    def ensure_bucket(self) -> None:
        """Create the audio bucket and make objects world-readable."""

        try:
            bucket_exists = self._client.bucket_exists(self._bucket)
            if not bucket_exists:
                self._client.make_bucket(self._bucket)

            # Ensure the bucket exposes read-only access for generated audio.
            policy = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"AWS": ["*"]},
                        "Action": ["s3:GetObject"],
                        "Resource": [f"arn:aws:s3:::{self._bucket}/*"],
                    }
                ],
            }
            self._client.set_bucket_policy(self._bucket, json.dumps(policy))
        except S3Error as exc:  # pragma: no cover - defensive logging
            raise RuntimeError(f"Unable to ensure MinIO bucket: {exc}") from exc

    def store_audio(self, *, object_name: str, audio_bytes: bytes, content_type: str = "audio/mpeg") -> str:
        """Persist audio data and return a public-style object URL."""

        self.ensure_bucket()
        data_stream = io.BytesIO(audio_bytes)
        data_stream.seek(0)
        self._client.put_object(
            bucket_name=self._bucket,
            object_name=object_name,
            data=data_stream,
            length=len(audio_bytes),
            content_type=content_type,
        )
        return f"{self._public_base}/{self._bucket}/{object_name}"


storage_client = StorageClient()
