"""SQLAlchemy models for Omni Teacher."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class TimestampMixin:
    """Provide created/updated timestamps."""

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class ProgramStatus(str, enum.Enum):
    GENERATING_QUIZ = "generating_quiz"
    AWAITING_DIAGNOSTIC = "awaiting_diagnostic"
    GENERATING_PROGRAM = "generating_program"
    READY = "ready"


class Student(TimestampMixin, Base):
    __tablename__ = "students"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    display_name = Column(String, nullable=False)
    age = Column(Integer, nullable=True)
    grade = Column(String, nullable=True)
    preferences = Column(JSON, default=dict)

    programs = relationship("LearningProgram", back_populates="student", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="student", cascade="all, delete-orphan")
    lesson_attempts = relationship("LessonAttempt", back_populates="student", cascade="all, delete-orphan")


class LearningProgram(TimestampMixin, Base):
    __tablename__ = "learning_programs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id = Column(String, ForeignKey("students.id"), nullable=False)
    topic_prompt = Column(Text, nullable=False)
    title = Column(String, nullable=False)
    summary = Column(Text, nullable=True)
    status = Column(Enum(ProgramStatus), default=ProgramStatus.GENERATING_QUIZ, nullable=False)
    skill_profile = Column(Text, nullable=True)
    context = Column(JSON, default=dict)

    student = relationship("Student", back_populates="programs")
    quiz = relationship("DiagnosticQuiz", back_populates="program", uselist=False, cascade="all, delete-orphan")
    lessons = relationship(
        "Lesson",
        back_populates="program",
        cascade="all, delete-orphan",
        order_by="Lesson.order_index",
    )


class DiagnosticQuiz(TimestampMixin, Base):
    __tablename__ = "diagnostic_quizzes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    program_id = Column(String, ForeignKey("learning_programs.id"), nullable=False, unique=True)
    instructions = Column(Text, nullable=True)
    questions = Column(JSON, nullable=False)

    program = relationship("LearningProgram", back_populates="quiz")
    attempts = relationship("QuizAttempt", back_populates="quiz", cascade="all, delete-orphan")


class QuizAttempt(TimestampMixin, Base):
    __tablename__ = "quiz_attempts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    quiz_id = Column(String, ForeignKey("diagnostic_quizzes.id"), nullable=False)
    student_id = Column(String, ForeignKey("students.id"), nullable=False)
    responses = Column(JSON, nullable=False)
    score = Column(Integer, nullable=True)
    analysis = Column(JSON, nullable=True)

    quiz = relationship("DiagnosticQuiz", back_populates="attempts")
    student = relationship("Student")


class Lesson(TimestampMixin, Base):
    __tablename__ = "lessons"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    program_id = Column(String, ForeignKey("learning_programs.id"), nullable=False)
    chapter = Column(String, nullable=True)
    order_index = Column(Integer, nullable=False)
    title = Column(String, nullable=False)
    content_markdown = Column(Text, nullable=False)
    resources = Column(JSON, default=list)
    objectives = Column(JSON, default=list)
    method_plan = Column(JSON, default=list)
    practice_prompts = Column(JSON, default=list)
    assessment = Column(JSON, default=dict)
    estimated_minutes = Column(Integer, nullable=True)

    program = relationship("LearningProgram", back_populates="lessons")
    attempts = relationship("LessonAttempt", back_populates="lesson", cascade="all, delete-orphan")


class LessonAttempt(TimestampMixin, Base):
    __tablename__ = "lesson_attempts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    lesson_id = Column(String, ForeignKey("lessons.id"), nullable=False)
    student_id = Column(String, ForeignKey("students.id"), nullable=False)
    status = Column(String, nullable=False)
    answers = Column(JSON, nullable=False)
    reflection_positive = Column(Text, nullable=True)
    reflection_negative = Column(Text, nullable=True)
    teacher_notes = Column(Text, nullable=True)
    score = Column(Integer, nullable=True)
    stars = Column(Integer, nullable=True)
    mastery_summary = Column(Text, nullable=True)

    lesson = relationship("Lesson", back_populates="attempts")
    student = relationship("Student", back_populates="lesson_attempts")


class ChatSession(TimestampMixin, Base):
    __tablename__ = "chat_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id = Column(String, ForeignKey("students.id"), nullable=False)
    program_id = Column(String, ForeignKey("learning_programs.id"), nullable=True)
    title = Column(String, nullable=False, default="Study chat")
    tts_enabled = Column(Boolean, default=False, nullable=False)
    persona_state = Column(JSON, default=dict)

    student = relationship("Student", back_populates="chat_sessions")
    program = relationship("LearningProgram")
    messages = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )


class ChatMessage(TimestampMixin, Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("chat_sessions.id"), nullable=False)
    sender = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    text_content = Column(Text, nullable=True)
    render_formats = Column(JSON, default=list)
    audio_url = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    annotations = Column(JSON, default=dict)

    session = relationship("ChatSession", back_populates="messages")
