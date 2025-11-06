"""Business logic for managing learning programs and progress."""

from __future__ import annotations

from typing import Any

from slugify import slugify
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.openai_client import OmniAPIError, get_omni_client
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


_ALLOWED_QUIZ_TYPES = {"free_form", "multiple_choice", "multi_select"}
_QUIZ_TYPE_ALIASES = {
    "short_answer": "free_form",
    "text": "free_form",
    "open_ended": "free_form",
    "single_choice": "multiple_choice",
    "single-select": "multiple_choice",
    "multi_select": "multi_select",
    "multiple_choice": "multiple_choice",
}


def _normalise_quiz_question(question_data: dict[str, Any], index: int) -> dict[str, Any]:
    """Ensure quiz questions adhere to the response schema expectations."""

    question: dict[str, Any] = dict(question_data)

    # Provide deterministic identifiers for questions and cast to string.
    question_id = question.get("id") or f"q{index}"
    question["id"] = str(question_id)

    # Normalise prompts that may arrive under different keys.
    prompt = (
        question.get("prompt")
        or question.get("question")
        or question.get("text")
        or ""
    )
    question["prompt"] = str(prompt)

    raw_answer_type = str(question.get("answer_type") or "").lower().strip()
    answer_type = _QUIZ_TYPE_ALIASES.get(raw_answer_type, raw_answer_type)
    if answer_type not in _ALLOWED_QUIZ_TYPES:
        answer_type = "free_form"
    question["answer_type"] = answer_type

    # Some Omni payloads return options as objects with labels. Flatten to strings.
    raw_choices = question.get("choices") or question.get("options")
    if raw_choices is None:
        question.pop("choices", None)
    else:
        normalised_choices: list[str] = []
        if isinstance(raw_choices, list):
            for choice in raw_choices:
                if isinstance(choice, dict):
                    label = (
                        choice.get("label")
                        or choice.get("text")
                        or choice.get("value")
                        or choice.get("option")
                    )
                    normalised_choices.append(str(label) if label is not None else str(choice))
                else:
                    normalised_choices.append(str(choice))
        else:
            normalised_choices.append(str(raw_choices))

        if normalised_choices:
            question["choices"] = normalised_choices
        else:
            question.pop("choices", None)

    # Coerce hints to a list of strings when provided.
    raw_hints = question.get("hints")
    if raw_hints is None:
        question.pop("hints", None)
    else:
        hints: list[str] = []
        if isinstance(raw_hints, list):
            hints = [str(item) for item in raw_hints]
        else:
            hints = [str(raw_hints)]
        question["hints"] = hints

    return question


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
        context={
            "learning_goal": payload.learning_goal,
            "student_traits": payload.student_traits or [],
        },
    )
    db.add(program)
    db.commit()
    db.refresh(program)

    client = get_omni_client()
    try:
        quiz_payload = client.generate_diagnostic_quiz(
            topic=payload.topic,
            student_profile=_student_profile(student, payload),
        )
    except OmniAPIError as exc:
        context = program.context or {}
        context["generation_error"] = {
            "message": str(exc),
            "status_code": exc.status_code,
            "stage": "diagnostic_quiz",
        }
        program.context = context
        db.commit()
        db.refresh(program)
        raise RuntimeError("Failed to generate diagnostic quiz from Omni API") from exc

    program.title = quiz_payload.get("program_title", program.title)
    program.summary = quiz_payload.get("overview")
    program.status = ProgramStatus.AWAITING_DIAGNOSTIC
    context = program.context or {}
    context["diagnostic_notes"] = quiz_payload.get("instructions")
    program.context = context

    raw_questions = quiz_payload.get("questions") or []
    questions = [_normalise_quiz_question(question, index) for index, question in enumerate(raw_questions, start=1)]
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

    client = get_omni_client()
    try:
        evaluation = client.evaluate_quiz_answers(
            topic=program.topic_prompt,
            quiz={"questions": program.quiz.questions},
            answers=submission.answers,
            student_profile=_student_profile(program.student),
        )
    except OmniAPIError as exc:
        program.status = ProgramStatus.AWAITING_DIAGNOSTIC
        context = program.context or {}
        context["generation_error"] = {
            "message": str(exc),
            "status_code": exc.status_code,
            "stage": "program_evaluation",
        }
        program.context = context
        db.commit()
        db.refresh(program)
        raise RuntimeError("Failed to evaluate diagnostic attempt with Omni API") from exc

    attempt.score = evaluation.get("score")
    attempt.analysis = evaluation.get("analysis")
    program.skill_profile = evaluation.get("skill_profile")
    program.summary = evaluation.get("program_overview", program.summary)
    program.status = ProgramStatus.READY
    context = program.context or {}
    context["analysis"] = evaluation.get("analysis")
    context["chapters"] = evaluation.get("chapters", [])
    program.context = context

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

    client = get_omni_client()
    try:
        reflection = client.summarise_lesson_attempt(
            lesson_title=lesson.title,
            lesson_content=lesson.content_markdown,
            answers=payload.answers,
        )
    except OmniAPIError as exc:
        reflection = {
            "positive_feedback": "Great effort on the activity!",
            "next_focus": "Let's review the key ideas together next time.",
            "error": str(exc),
        }
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
