"""Celery worker for Omni Teacher background processing."""

from __future__ import annotations

from typing import Any

from celery import Celery

from .core.config import settings
from .core.db import session_scope
from .core.openai_client import omni_client
from .core.storage import storage_client
from .models import ChatMessage
from .schemas import DiagnosticSubmission
from .services import programs as programs_service

celery_app = Celery(
    "omni_teacher",
    broker=settings.redis_url,
    backend=settings.redis_url,
)


@celery_app.task(name="omni_teacher.evaluate_diagnostic")
def evaluate_diagnostic(program_id: str, answers: dict[str, Any]) -> dict[str, Any]:
    """Evaluate a diagnostic quiz asynchronously and build the program."""

    with session_scope() as session:
        submission = DiagnosticSubmission(answers=answers)
        try:
            program, attempt = programs_service.submit_diagnostic(
                session, program_id=program_id, submission=submission
            )
        except ValueError as exc:
            return {"status": "error", "detail": str(exc)}
        session.refresh(program)
        result = {
            "program_id": program.id,
            "attempt_id": attempt.id,
            "status": program.status.value,
            "skill_profile": program.skill_profile,
        }
    return result


@celery_app.task(name="omni_teacher.generate_voice")
def generate_voice_for_message(message_id: str) -> dict[str, str]:
    """Generate TTS audio for an assistant message."""

    with session_scope() as session:
        message = session.get(ChatMessage, message_id)
        if not message:
            return {"status": "missing"}
        if not message.text_content:
            return {"status": "no_text"}
        audio_bytes = omni_client.synthesize_speech(message.text_content)
        object_name = f"sessions/{message.session_id}/{message.id}.mp3"
        audio_url = storage_client.store_audio(object_name=object_name, audio_bytes=audio_bytes)
        message.audio_url = audio_url
        session.add(message)
        result = {"status": "ok", "audio_url": audio_url}
    return result
