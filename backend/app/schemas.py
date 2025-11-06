"""Pydantic schemas used by the FastAPI application."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from .models import ProgramStatus


class StudentBase(BaseModel):
    display_name: str = Field(..., min_length=1)
    age: int | None = Field(default=None, ge=3, le=18)
    grade: str | None = None
    preferences: dict[str, Any] = Field(default_factory=dict)


class StudentCreate(StudentBase):
    pass


class StudentResponse(StudentBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TopicCreate(BaseModel):
    topic: str = Field(..., min_length=3)
    learning_goal: str | None = None
    student_traits: list[str] | None = None


class QuizQuestion(BaseModel):
    id: str
    prompt: str
    answer_type: Literal["free_form", "multiple_choice", "multi_select"]
    choices: list[str] | None = None
    hints: list[str] | None = None


class DiagnosticQuizResponse(BaseModel):
    id: str
    instructions: str | None = None
    questions: list[QuizQuestion]

    model_config = {"from_attributes": True}


class LessonResource(BaseModel):
    type: str
    label: str
    url: str | None = None


class LessonResponse(BaseModel):
    id: str
    chapter: str | None = None
    order_index: int
    title: str
    content_markdown: str
    resources: list[Any] | None = None
    attempts: list[LessonAttemptResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class LessonAttemptResponse(BaseModel):
    id: str
    status: str
    answers: dict[str, Any]
    reflection_positive: str | None = None
    reflection_negative: str | None = None
    teacher_notes: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class LearningProgramResponse(BaseModel):
    id: str
    student_id: str
    title: str
    summary: str | None = None
    topic_prompt: str
    status: ProgramStatus
    skill_profile: str | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime
    quiz: DiagnosticQuizResponse | None = None
    lessons: list[LessonResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class DiagnosticSubmission(BaseModel):
    answers: dict[str, Any]


class LessonCompletionRequest(BaseModel):
    student_id: str
    status: Literal["completed", "in_progress", "needs_help", "skipped"]
    answers: dict[str, Any]
    teacher_notes: str | None = None


class LessonCompletionResponse(BaseModel):
    lesson: LessonResponse
    attempt: LessonAttemptResponse


class ProgramCatalogEntry(BaseModel):
    id: str
    title: str
    summary: str | None = None
    status: ProgramStatus
    skill_profile: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class QuizAttemptResponse(BaseModel):
    id: str
    quiz_id: str
    student_id: str
    responses: dict[str, Any]
    score: int | None = None
    analysis: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DiagnosticResultResponse(BaseModel):
    program: LearningProgramResponse
    attempt: QuizAttemptResponse


class ProgressSnapshot(BaseModel):
    student: StudentResponse
    completed_lessons: int
    in_progress_lessons: int
    total_programs: int
    badges: list[str] = Field(default_factory=list)


class ChatMessageIn(BaseModel):
    content_type: Literal["text", "image"] = "text"
    text: str | None = None
    image_url: str | None = None
    generate_voice: bool = False

    @model_validator(mode="after")
    def validate_payload(self) -> "ChatMessageIn":
        if self.content_type == "text" and not self.text:
            raise ValueError("text is required when content_type is 'text'")
        if self.content_type == "image" and not self.image_url:
            raise ValueError("image_url is required when content_type is 'image'")
        return self


class ChatMessageOut(BaseModel):
    id: str
    sender: Literal["student", "assistant"]
    content_type: str
    text: str | None = Field(default=None, alias="text_content")
    render_formats: list[str] = Field(default_factory=list)
    audio_url: str | None = None
    image_url: str | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class ChatTranscript(BaseModel):
    session_id: str
    messages: list[ChatMessageOut]


class ChatSessionSnapshot(BaseModel):
    id: str
    student_id: str
    program_id: str | None = None
    title: str
    tts_enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CreateChatSession(BaseModel):
    student_id: str
    program_id: str | None = None
    title: str | None = None
    tts_enabled: bool = False
