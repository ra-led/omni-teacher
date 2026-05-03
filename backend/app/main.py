"""FastAPI application implementing the Omni Teacher backend."""

from __future__ import annotations

import uuid
from fastapi import (
    Depends,
    Header,
    FastAPI,
    HTTPException,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    File,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from sqlalchemy.orm import Session

from .core.config import settings
from .core.openai_client import OmniAPIError, get_omni_client
from .core.db import SessionLocal, engine, ensure_schema, get_db
from .core.storage import storage_client
from .models import Account, Base, ChatMessage, ChatSession
from .schemas import (
    AccountAuthRequest,
    AccountResponse,
    AuthSessionResponse,
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
    SpeechTranscript,
    StudentCreate,
    StudentResponse,
    TopicCreate,
)
from .services import auth as auth_service
from .services import chat as chat_service
from .services import programs as programs_service

app = FastAPI(title="Omni Teacher API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_cors_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    storage_client.ensure_bucket()


@app.get("/health", tags=["meta"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


def get_current_account(
    db: Session = Depends(get_db),
    x_account_token: str | None = Header(default=None),
) -> Account:
    account = auth_service.get_account_by_token(db, x_account_token)
    if not account:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return account


@app.post("/api/auth/signup", response_model=AuthSessionResponse, tags=["auth"])
def sign_up(payload: AccountAuthRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    try:
        account, token = auth_service.create_account(db, email=payload.email, password=payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return AuthSessionResponse(token=token, account=AccountResponse.model_validate(account))


@app.post("/api/auth/login", response_model=AuthSessionResponse, tags=["auth"])
def sign_in(payload: AccountAuthRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    try:
        account, token = auth_service.login_account(db, email=payload.email, password=payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    return AuthSessionResponse(token=token, account=AccountResponse.model_validate(account))


@app.get("/api/auth/me", response_model=AccountResponse, tags=["auth"])
def auth_me(account: Account = Depends(get_current_account)) -> AccountResponse:
    return AccountResponse.model_validate(account)


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT, tags=["auth"])
def auth_logout(
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
) -> Response:
    auth_service.logout_account(db, account)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/transcribe", response_model=SpeechTranscript, tags=["chat"])
async def transcribe_audio(file: UploadFile = File(...)) -> SpeechTranscript:
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio payload")
    client = get_omni_client()
    try:
        text = client.transcribe_audio(contents, filename=file.filename or "speech.webm", mime_type=file.content_type or "audio/webm")
    except OmniAPIError as exc:
        message = str(exc)
        status_code = exc.status_code or status.HTTP_502_BAD_GATEWAY
        raise HTTPException(status_code=status_code, detail=message) from exc
    return SpeechTranscript(text=text)


@app.post("/api/students", response_model=StudentResponse, tags=["students"])
def register_student(
    payload: StudentCreate,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
) -> StudentResponse:
    student = programs_service.create_student(db, payload, account_id=account.id)
    return StudentResponse.model_validate(student)


@app.get("/api/students", response_model=list[StudentResponse], tags=["students"])
def list_students(
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
) -> list[StudentResponse]:
    students = programs_service.list_students(db, account_id=account.id)
    return [StudentResponse.model_validate(student) for student in students]


@app.get(
    "/api/students/{student_id}/catalog",
    response_model=list[ProgramCatalogEntry],
    tags=["programs"],
)
def student_catalog(
    student_id: str,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
) -> list[ProgramCatalogEntry]:
    try:
        return programs_service.list_catalog(db, student_id, account_id=account.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@app.post(
    "/api/students/{student_id}/topics",
    response_model=LearningProgramResponse,
    tags=["programs"],
)
def add_topic(
    student_id: str,
    payload: TopicCreate,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
) -> LearningProgramResponse:
    try:
        program = programs_service.create_topic_program(
            db,
            student_id=student_id,
            payload=payload,
            account_id=account.id,
        )
    except ValueError as exc:  # missing student
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    refreshed = programs_service.get_program(db, program.id, account_id=account.id)
    if not refreshed:
        raise HTTPException(status_code=500, detail="Program creation failed")
    return programs_service.serialize_program(refreshed)


@app.get(
    "/api/programs/{program_id}",
    response_model=LearningProgramResponse,
    tags=["programs"],
)
def fetch_program(
    program_id: str,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
) -> LearningProgramResponse:
    program = programs_service.get_program(db, program_id, account_id=account.id)
    if not program:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Program not found")
    return programs_service.serialize_program(program)


@app.post(
    "/api/programs/{program_id}/diagnostic/submit",
    response_model=DiagnosticResultResponse,
    tags=["programs"],
)
def submit_diagnostic(
    program_id: str,
    submission: DiagnosticSubmission,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
) -> DiagnosticResultResponse:
    try:
        program, attempt = programs_service.submit_diagnostic(
            db,
            program_id=program_id,
            submission=submission,
            account_id=account.id,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_404_NOT_FOUND if "not found" in message.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=message) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    refreshed = programs_service.get_program(db, program.id, account_id=account.id)
    if not refreshed:
        raise HTTPException(status_code=500, detail="Program evaluation failed")
    return DiagnosticResultResponse(
        program=programs_service.serialize_program(refreshed),
        attempt=QuizAttemptResponse.model_validate(attempt),
    )


@app.post(
    "/api/lessons/{lesson_id}/complete",
    response_model=LessonCompletionResponse,
    tags=["progress"],
)
def complete_lesson(
    lesson_id: str,
    payload: LessonCompletionRequest,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
) -> LessonCompletionResponse:
    try:
        attempt = programs_service.complete_lesson(
            db,
            lesson_id=lesson_id,
            payload=payload,
            account_id=account.id,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = (
            status.HTTP_404_NOT_FOUND
            if "not found" in message.lower()
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=status_code, detail=message) from exc
    lesson = attempt.lesson
    lesson_payload = LessonResponse.model_validate(lesson)
    if lesson.program:
        serialized = programs_service.serialize_program(lesson.program)
        updated = next((item for item in serialized.lessons if item.id == lesson.id), None)
        if updated:
            lesson_payload = updated
    return LessonCompletionResponse(
        lesson=lesson_payload,
        attempt=LessonAttemptResponse.model_validate(attempt),
    )


@app.get(
    "/api/students/{student_id}/progress",
    response_model=ProgressSnapshot,
    tags=["progress"],
)
def student_progress(
    student_id: str,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
) -> ProgressSnapshot:
    try:
        return programs_service.capture_progress(db, student_id, account_id=account.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@app.post(
    "/api/chat/sessions",
    response_model=ChatSessionSnapshot,
    tags=["chat"],
)
def create_chat_session(
    payload: CreateChatSession,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
) -> ChatSessionSnapshot:
    session_id = str(uuid.uuid4())
    try:
        session = chat_service.get_or_create_session(
            db,
            session_id=session_id,
            student_id=payload.student_id,
            account_id=account.id,
            program_id=payload.program_id,
            lesson_id=payload.lesson_id,
            tts_enabled=payload.tts_enabled,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
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
def fetch_chat_session(
    session_id: str,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
) -> ChatTranscript:
    session = db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
    if not session.student or session.student.account_id != account.id:
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
    account_token = websocket.query_params.get("account_token")
    program_id = websocket.query_params.get("program_id")
    lesson_id = websocket.query_params.get("lesson_id")
    tts_enabled = websocket.query_params.get("tts", "false").lower() == "true"

    if not student_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="student_id required")
        return
    if not account_token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="account_token required")
        return

    await websocket.accept()
    db = SessionLocal()
    try:
        account = auth_service.get_account_by_token(db, account_token)
        if not account:
            await websocket.send_json({"type": "error", "detail": "Authentication required"})
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication required")
            return
        session = chat_service.get_or_create_session(
            db,
            session_id=session_id,
            student_id=student_id,
            account_id=account.id,
            program_id=program_id,
            lesson_id=lesson_id,
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
    except ValueError as exc:
        await websocket.send_json({"type": "error", "detail": str(exc)})
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason=str(exc))
    except WebSocketDisconnect:
        pass
    finally:
        db.close()


__all__ = ["app"]
