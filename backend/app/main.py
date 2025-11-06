"""FastAPI application implementing the Omni Teacher backend."""

from __future__ import annotations

import uuid
from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from sqlalchemy.orm import Session

from .core.config import settings
from .core.db import SessionLocal, engine, get_db
from .core.storage import storage_client
from .models import Base, ChatMessage, ChatSession
from .schemas import (
    ChatMessageIn,
    ChatMessageOut,
    ChatSessionSnapshot,
    ChatTranscript,
    CreateChatSession,
    DiagnosticResultResponse,
    DiagnosticSubmission,
    LearningProgramResponse,
    LessonAttemptResponse,
    LessonCompletionRequest,
    LessonCompletionResponse,
    LessonResponse,
    ProgramCatalogEntry,
    ProgressSnapshot,
    QuizAttemptResponse,
    StudentCreate,
    StudentResponse,
    TopicCreate,
)
from .services import chat as chat_service
from .services import programs as programs_service

app = FastAPI(title="Omni Teacher API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    storage_client.ensure_bucket()


@app.get("/health", tags=["meta"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/students", response_model=StudentResponse, tags=["students"])
def register_student(payload: StudentCreate, db: Session = Depends(get_db)) -> StudentResponse:
    student = programs_service.create_student(db, payload)
    return StudentResponse.model_validate(student)


@app.get(
    "/api/students/{student_id}/catalog",
    response_model=list[ProgramCatalogEntry],
    tags=["programs"],
)
def student_catalog(student_id: str, db: Session = Depends(get_db)) -> list[ProgramCatalogEntry]:
    return programs_service.list_catalog(db, student_id)


@app.post(
    "/api/students/{student_id}/topics",
    response_model=LearningProgramResponse,
    tags=["programs"],
)
def add_topic(student_id: str, payload: TopicCreate, db: Session = Depends(get_db)) -> LearningProgramResponse:
    try:
        program = programs_service.create_topic_program(db, student_id=student_id, payload=payload)
    except ValueError as exc:  # missing student
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    refreshed = programs_service.get_program(db, program.id)
    if not refreshed:
        raise HTTPException(status_code=500, detail="Program creation failed")
    return LearningProgramResponse.model_validate(refreshed)


@app.get(
    "/api/programs/{program_id}",
    response_model=LearningProgramResponse,
    tags=["programs"],
)
def fetch_program(program_id: str, db: Session = Depends(get_db)) -> LearningProgramResponse:
    program = programs_service.get_program(db, program_id)
    if not program:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Program not found")
    return LearningProgramResponse.model_validate(program)


@app.post(
    "/api/programs/{program_id}/diagnostic/submit",
    response_model=DiagnosticResultResponse,
    tags=["programs"],
)
def submit_diagnostic(program_id: str, submission: DiagnosticSubmission, db: Session = Depends(get_db)) -> DiagnosticResultResponse:
    try:
        program, attempt = programs_service.submit_diagnostic(db, program_id=program_id, submission=submission)
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_404_NOT_FOUND if "not found" in message.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=message) from exc
    refreshed = programs_service.get_program(db, program.id)
    if not refreshed:
        raise HTTPException(status_code=500, detail="Program evaluation failed")
    return DiagnosticResultResponse(
        program=LearningProgramResponse.model_validate(refreshed),
        attempt=QuizAttemptResponse.model_validate(attempt),
    )


@app.post(
    "/api/lessons/{lesson_id}/complete",
    response_model=LessonCompletionResponse,
    tags=["progress"],
)
def complete_lesson(lesson_id: str, payload: LessonCompletionRequest, db: Session = Depends(get_db)) -> LessonCompletionResponse:
    try:
        attempt = programs_service.complete_lesson(db, lesson_id=lesson_id, payload=payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    lesson = attempt.lesson
    return LessonCompletionResponse(
        lesson=LessonResponse.model_validate(lesson),
        attempt=LessonAttemptResponse.model_validate(attempt),
    )


@app.get(
    "/api/students/{student_id}/progress",
    response_model=ProgressSnapshot,
    tags=["progress"],
)
def student_progress(student_id: str, db: Session = Depends(get_db)) -> ProgressSnapshot:
    try:
        return programs_service.capture_progress(db, student_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@app.post(
    "/api/chat/sessions",
    response_model=ChatSessionSnapshot,
    tags=["chat"],
)
def create_chat_session(payload: CreateChatSession, db: Session = Depends(get_db)) -> ChatSessionSnapshot:
    session_id = str(uuid.uuid4())
    session = chat_service.get_or_create_session(
        db,
        session_id=session_id,
        student_id=payload.student_id,
        program_id=payload.program_id,
        tts_enabled=payload.tts_enabled,
    )
    if payload.title:
        session.title = payload.title
        db.commit()
        db.refresh(session)
    return ChatSessionSnapshot.model_validate(session)


@app.get(
    "/api/chat/sessions/{session_id}",
    response_model=ChatTranscript,
    tags=["chat"],
)
def fetch_chat_session(session_id: str, db: Session = Depends(get_db)) -> ChatTranscript:
    session = db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    return ChatTranscript(
        session_id=session_id,
        messages=[ChatMessageOut.model_validate(message) for message in messages],
    )


@app.websocket("/ws/chat/{session_id}")
async def chat_socket(websocket: WebSocket, session_id: str) -> None:
    student_id = websocket.query_params.get("student_id")
    program_id = websocket.query_params.get("program_id")
    tts_enabled = websocket.query_params.get("tts", "false").lower() == "true"

    if not student_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="student_id required")
        return

    await websocket.accept()
    db = SessionLocal()
    try:
        session = chat_service.get_or_create_session(
            db,
            session_id=session_id,
            student_id=student_id,
            program_id=program_id,
            tts_enabled=tts_enabled,
        )
        history = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at.asc())
            .all()
        )
        await websocket.send_json(
            {
                "type": "history",
                "messages": [
                    ChatMessageOut.model_validate(message).model_dump(mode="json")
                    for message in history[-settings.max_chat_history :]
                ],
            }
        )

        while True:
            payload = await websocket.receive_json()
            try:
                inbound = ChatMessageIn.model_validate(payload)
            except ValidationError as exc:
                await websocket.send_json({"type": "error", "detail": exc.errors()})
                continue

            student_message = chat_service.append_message(
                db,
                session=session,
                sender="student",
                payload=inbound,
            )
            await websocket.send_json(
                {
                    "type": "student_message",
                    "message": ChatMessageOut.model_validate(student_message).model_dump(mode="json"),
                }
            )

            assistant_message = chat_service.generate_reply(
                db,
                session=session,
                voice_requested=inbound.generate_voice,
            )
            await websocket.send_json(
                {
                    "type": "assistant_message",
                    "message": ChatMessageOut.model_validate(assistant_message).model_dump(mode="json"),
                }
            )
    except WebSocketDisconnect:
        pass
    finally:
        db.close()


__all__ = ["app"]
