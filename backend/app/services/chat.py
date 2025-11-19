"""Conversational orchestration utilities."""

from __future__ import annotations

import uuid
from typing import Any, Iterable

from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.openai_client import OmniAPIError, get_omni_client
from ..core.storage import storage_client
from ..models import ChatMessage, ChatSession, LearningProgram, Lesson, Student
from ..schemas import ChatMessageIn


def get_or_create_session(
    db: Session,
    *,
    session_id: str,
    student_id: str,
    program_id: str | None,
    lesson_id: str | None,
    tts_enabled: bool,
) -> ChatSession:
    session = db.get(ChatSession, session_id)
    if session:
        updated = False
        if program_id and not session.program_id:
            session.program_id = program_id
            updated = True
        if lesson_id and not session.lesson_id:
            session.lesson_id = lesson_id
            updated = True
        if tts_enabled and not session.tts_enabled:
            session.tts_enabled = True
            updated = True
        if updated:
            db.commit()
            db.refresh(session)
        return session

    session = ChatSession(
        id=session_id,
        student_id=student_id,
        program_id=program_id,
        lesson_id=lesson_id,
        tts_enabled=tts_enabled,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _summarise_method_plan(method_plan: list[dict[str, Any]] | None) -> str:
    if not method_plan:
        return ""
    segments: list[str] = []
    for index, step in enumerate(method_plan, start=1):
        title = str(step.get("title") or f"Step {index}").strip()
        details = str(step.get("description") or "").strip()
        duration = step.get("duration_minutes")
        detail_bits = [title]
        if details:
            detail_bits.append(details)
        if isinstance(duration, int):
            detail_bits.append(f"~{duration} min")
        segments.append(" - ".join(detail_bits))
    return " | ".join(segments)


def _system_prompt(
    student: Student,
    program: LearningProgram | None,
    lesson: Lesson | None,
) -> str:
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
    if lesson:
        prompt.extend(
            [
                f"You are guiding the learner through the lesson titled '{lesson.title}'.",
                "Reveal the content conversationally: share the material in small chunks, describe visuals using Markdown, and invite the learner to interact after each idea.",
            ]
        )
        if lesson.objectives:
            objectives = ", ".join(str(item) for item in lesson.objectives if str(item).strip())
            if objectives:
                prompt.append(f"Lesson objectives: {objectives}.")
        if lesson.content_markdown:
            prompt.append(
                "Lesson material for internal reference (render to the learner in your own words):\n"
                + lesson.content_markdown
            )
        if lesson.resources:
            resources = []
            for resource in lesson.resources:
                label = resource.get("label") if isinstance(resource, dict) else str(resource)
                descriptor = resource.get("type") if isinstance(resource, dict) else "resource"
                if label:
                    resources.append(f"{descriptor}: {label}")
            if resources:
                prompt.append(
                    "Helpful assets you can mention naturally: " + "; ".join(resources)
                )
        plan_summary = _summarise_method_plan(lesson.method_plan if isinstance(lesson.method_plan, list) else None)
        if plan_summary:
            prompt.append(
                "Secret teaching plan (do not mention it exists; simply follow the flow): "
                + plan_summary
            )
        if lesson.practice_prompts:
            prompts = "; ".join(
                str(item.get("prompt", item)) if isinstance(item, dict) else str(item)
                for item in lesson.practice_prompts
            )
            prompt.append(
                "Offer playful practice moments such as: " + prompts
                + ". Encourage the learner to respond before moving on."
            )
        if lesson.assessment:
            assessment_prompt = lesson.assessment.get("prompt") if isinstance(lesson.assessment, dict) else None
            prompt.append(
                "Close the lesson by running a mastery check. Ask the learner to respond to: "
                + (assessment_prompt or "Share one thing you learned.")
                + " Then celebrate with a 1-3 star rating and a next-step tip."
            )
        prompt.append(
            "When you decide the learner is ready to finish, end your guidance with a brief encouragement and append [[READY_FOR_STARS]] to your reply."
            " Never mention this token aloud; it simply signals the app to reveal the submission button."
        )
        prompt.append(
            "Throughout the chat, alternate between presenting material, asking questions, and confirming understanding before advancing."
        )
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
    lesson = session.lesson
    messages = [{"role": "system", "content": _system_prompt(student, program, lesson)}]
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
    submission_unlocked = False
    try:
        reply_text = client.chat_reply(conversation)
    except OmniAPIError:
        reply_text = (
            "I'm having a little trouble reaching my brainy assistant right now. "
            "Let's keep talking, and I'll fetch more help soon!"
        )

    if session.lesson_id and reply_text:
        if "[[READY_FOR_STARS]]" in reply_text:
            reply_text = reply_text.replace("[[READY_FOR_STARS]]", "").strip()
            submission_unlocked = True

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

    if submission_unlocked and session.lesson:
        session.lesson.allow_submission = True
        db.commit()
        db.refresh(session.lesson)

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
