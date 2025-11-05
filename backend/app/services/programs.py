"""Business logic for managing learning programs and progress."""

from __future__ import annotations

from typing import Any

from slugify import slugify
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.openai_client import omni_client
from ..models import (
    ChatSession,
    DiagnosticQuiz,
    LearningProgram,
    Lesson,
    LessonAttempt,
    ProgramStatus,
    QuizAttempt,
    Student,
)
from ..schemas import (
    DiagnosticSubmission,
    LessonCompletionRequest,
    ProgramCatalogEntry,
    ProgressSnapshot,
    StudentCreate,
    StudentResponse,
    TopicCreate,
)


def _student_profile(student: Student, topic: TopicCreate | None = None) -> dict[str, Any]:
    profile = {
        "name": student.display_name,
        "age": student.age,
        "grade": student.grade,
        "preferences": student.preferences or {},
    }
    if topic:
        profile["learning_goal"] = topic.learning_goal
        profile["student_traits"] = topic.student_traits or []
    return profile


def create_student(db: Session, payload: StudentCreate) -> Student:
    student = Student(
        display_name=payload.display_name,
        age=payload.age,
        grade=payload.grade,
        preferences=payload.preferences,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def list_catalog(db: Session, student_id: str) -> list[ProgramCatalogEntry]:
    programs = (
        db.query(LearningProgram)
        .filter(LearningProgram.student_id == student_id)
        .order_by(LearningProgram.created_at.desc())
        .all()
    )
    return [ProgramCatalogEntry.model_validate(program) for program in programs]


def create_topic_program(db: Session, *, student_id: str, payload: TopicCreate) -> LearningProgram:
    student = db.get(Student, student_id)
    if not student:
        raise ValueError("Student not found")

    title_seed = slugify(payload.topic, separator=" ").title()
    program = LearningProgram(
        student_id=student_id,
        topic_prompt=payload.topic,
        title=f"{title_seed or 'New'} Learning Adventure",
        summary=None,
        status=ProgramStatus.GENERATING_QUIZ,
        metadata={
            "learning_goal": payload.learning_goal,
            "student_traits": payload.student_traits or [],
        },
    )
    db.add(program)
    db.commit()
    db.refresh(program)

    quiz_payload = omni_client.generate_diagnostic_quiz(
        topic=payload.topic,
        student_profile=_student_profile(student, payload),
    )

    program.title = quiz_payload.get("program_title", program.title)
    program.summary = quiz_payload.get("overview")
    program.status = ProgramStatus.AWAITING_DIAGNOSTIC
    metadata = program.metadata or {}
    metadata["diagnostic_notes"] = quiz_payload.get("instructions")
    program.metadata = metadata

    questions = quiz_payload.get("questions") or []
    for index, question in enumerate(questions, start=1):
        question.setdefault("id", f"q{index}")
        question.setdefault("answer_type", "free_form")
    quiz = DiagnosticQuiz(
        program_id=program.id,
        instructions=quiz_payload.get("instructions"),
        questions=questions,
    )
    db.add(quiz)
    db.commit()
    db.refresh(program)
    return program


def get_program(db: Session, program_id: str) -> LearningProgram | None:
    return db.query(LearningProgram).filter(LearningProgram.id == program_id).first()


def submit_diagnostic(
    db: Session, *, program_id: str, submission: DiagnosticSubmission
) -> tuple[LearningProgram, QuizAttempt]:
    program = get_program(db, program_id)
    if not program:
        raise ValueError("Program not found")
    if not program.quiz:
        raise ValueError("Diagnostic quiz has not been generated yet")

    program.status = ProgramStatus.GENERATING_PROGRAM
    attempt = QuizAttempt(
        quiz_id=program.quiz.id,
        student_id=program.student_id,
        responses=submission.answers,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    evaluation = omni_client.evaluate_quiz_answers(
        topic=program.topic_prompt,
        quiz={"questions": program.quiz.questions},
        answers=submission.answers,
        student_profile=_student_profile(program.student),
    )

    attempt.score = evaluation.get("score")
    attempt.analysis = evaluation.get("analysis")
    program.skill_profile = evaluation.get("skill_profile")
    program.summary = evaluation.get("program_overview", program.summary)
    program.status = ProgramStatus.READY
    metadata = program.metadata or {}
    metadata["analysis"] = evaluation.get("analysis")
    metadata["chapters"] = evaluation.get("chapters", [])
    program.metadata = metadata

    db.query(Lesson).filter(Lesson.program_id == program.id).delete(synchronize_session=False)
    order_index = 1
    for chapter in evaluation.get("chapters", []):
        chapter_title = chapter.get("title") or "Learning Chapter"
        for lesson_data in chapter.get("lessons", []):
            lesson = Lesson(
                program_id=program.id,
                chapter=chapter_title,
                order_index=order_index,
                title=lesson_data.get("title", f"Lesson {order_index}"),
                content_markdown=lesson_data.get("content_markdown", ""),
                resources=lesson_data.get("resources") or [],
            )
            db.add(lesson)
            order_index += 1
    db.commit()
    db.refresh(program)
    db.refresh(attempt)
    return program, attempt


def complete_lesson(
    db: Session,
    *,
    lesson_id: str,
    payload: LessonCompletionRequest,
) -> LessonAttempt:
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise ValueError("Lesson not found")
    student = db.get(Student, payload.student_id)
    if not student:
        raise ValueError("Student not found")

    attempt = LessonAttempt(
        lesson_id=lesson.id,
        student_id=payload.student_id,
        status=payload.status,
        answers=payload.answers,
        teacher_notes=payload.teacher_notes,
    )

    reflection = omni_client.summarise_lesson_attempt(
        lesson_title=lesson.title,
        lesson_content=lesson.content_markdown,
        answers=payload.answers,
    )
    attempt.reflection_positive = reflection.get("positive_feedback")
    attempt.reflection_negative = reflection.get("next_focus")

    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    db.refresh(attempt, attribute_names=["lesson"])
    return attempt


def capture_progress(db: Session, student_id: str) -> ProgressSnapshot:
    student = db.get(Student, student_id)
    if not student:
        raise ValueError("Student not found")

    completed_lessons = (
        db.query(func.count(LessonAttempt.id))
        .filter(LessonAttempt.student_id == student_id, LessonAttempt.status == "completed")
        .scalar()
        or 0
    )
    in_progress_lessons = (
        db.query(func.count(LessonAttempt.id))
        .filter(
            LessonAttempt.student_id == student_id,
            LessonAttempt.status.in_(["in_progress", "needs_help"]),
        )
        .scalar()
        or 0
    )
    total_programs = (
        db.query(func.count(LearningProgram.id))
        .filter(LearningProgram.student_id == student_id)
        .scalar()
        or 0
    )

    snapshot = ProgressSnapshot(
        student=StudentResponse.model_validate(student),
        completed_lessons=completed_lessons,
        in_progress_lessons=in_progress_lessons,
        total_programs=total_programs,
        badges=[],
    )
    return snapshot


def ensure_default_chat_session(db: Session, student_id: str) -> ChatSession:
    session = (
        db.query(ChatSession)
        .filter(ChatSession.student_id == student_id)
        .order_by(ChatSession.created_at.asc())
        .first()
    )
    if session:
        return session
    session = ChatSession(student_id=student_id, title="Welcome Chat", tts_enabled=False)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session
