"""Conversational orchestration utilities."""

from __future__ import annotations

import uuid
from typing import Iterable

from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.openai_client import OmniAPIError, get_omni_client
from ..core.storage import storage_client
from ..models import ChatMessage, ChatSession, LearningProgram, Student
from ..schemas import ChatMessageIn


def get_or_create_session(
    db: Session,
    *,
    session_id: str,
    student_id: str,
    program_id: str | None,
    tts_enabled: bool,
) -> ChatSession:
    session = db.get(ChatSession, session_id)
    if session:
        if program_id and not session.program_id:
            session.program_id = program_id
        if tts_enabled and not session.tts_enabled:
            session.tts_enabled = True
        db.commit()
        db.refresh(session)
        return session

    session = ChatSession(
        id=session_id,
        student_id=student_id,
        program_id=program_id,
        tts_enabled=tts_enabled,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _system_prompt(student: Student, program: LearningProgram | None) -> str:
    prompt = [
        "You are Omni Teacher, a caring AI tutor for children.",
        "Use Markdown for structure, include LaTeX for math when appropriate, and Mermaid for diagrams.",
        "Respond in a warm, encouraging tone and keep explanations age appropriate.",
        "Always be ready for small talk but gently guide back to learning goals.",
    ]
    if student.grade:
        prompt.append(f"The learner is in grade {student.grade}.")
    if program and program.skill_profile:
        prompt.append(f"Current skill profile: {program.skill_profile}.")
    if program and program.summary:
        prompt.append(f"Program summary: {program.summary}.")
    return " \n".join(prompt)


def _message_to_openai(message: ChatMessage) -> dict:
    content = []
    if message.text_content:
        content.append({"type": "text", "text": message.text_content})
    if message.image_url:
        content.append({"type": "image_url", "image_url": {"url": message.image_url}})
    if not content:
        content.append({"type": "text", "text": ""})
    return {"role": "user" if message.sender == "student" else "assistant", "content": content}


def _build_conversation(session: ChatSession, history: Iterable[ChatMessage]) -> list[dict]:
    student = session.student
    program = session.program
    messages = [{"role": "system", "content": _system_prompt(student, program)}]
    for message in history:
        messages.append(_message_to_openai(message))
    return messages


def append_message(
    db: Session,
    *,
    session: ChatSession,
    sender: str,
    payload: ChatMessageIn,
) -> ChatMessage:
    message = ChatMessage(
        session_id=session.id,
        sender=sender,
        content_type=payload.content_type,
        text_content=payload.text if payload.content_type == "text" else None,
        image_url=payload.image_url if payload.content_type == "image" else None,
        render_formats=["markdown", "latex", "mermaid"],
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def generate_reply(db: Session, session: ChatSession, voice_requested: bool) -> ChatMessage:
    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    trimmed_history = history[-settings.max_chat_history :]
    conversation = _build_conversation(session, trimmed_history)
    client = get_omni_client()
    try:
        reply_text = client.chat_reply(conversation)
    except OmniAPIError:
        reply_text = (
            "I'm having a little trouble reaching my brainy assistant right now. "
            "Let's keep talking, and I'll fetch more help soon!"
        )

    assistant_message = ChatMessage(
        session_id=session.id,
        sender="assistant",
        content_type="text",
        text_content=reply_text,
        render_formats=["markdown", "latex", "mermaid"],
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    should_voice = session.tts_enabled or voice_requested
    if should_voice and reply_text:
        try:
            audio_bytes = client.synthesize_speech(reply_text)
        except OmniAPIError:
            audio_bytes = None
        if audio_bytes:
            object_name = f"sessions/{session.id}/{uuid.uuid4()}.mp3"
            audio_url = storage_client.store_audio(object_name=object_name, audio_bytes=audio_bytes)
            assistant_message.audio_url = audio_url
            db.commit()
            db.refresh(assistant_message)

    return assistant_message
