"""Business logic for managing learning programs and progress."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from slugify import slugify
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
    LearningProgramResponse,
    LessonAttemptResponse,
    LessonCompletionRequest,
    LessonResponse,
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


def _ensure_string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        items = [str(item).strip() for item in value if str(item).strip()]
        return items
    text = str(value).strip()
    return [text] if text else []


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalise_resources(raw_resources: Any) -> list[dict[str, Any]]:
    if raw_resources is None:
        return []
    resources: list[dict[str, Any]] = []
    values = raw_resources if isinstance(raw_resources, list) else [raw_resources]
    for item in values:
        if isinstance(item, dict):
            resource_type = str(item.get("type") or item.get("kind") or "link").strip() or "link"
            label = str(
                item.get("label")
                or item.get("title")
                or item.get("name")
                or item.get("description")
                or "Resource"
            ).strip() or "Resource"
            url_value = item.get("url") or item.get("href")
            url = str(url_value).strip() if url_value else None
        else:
            resource_type = "note"
            label = str(item).strip() or "Resource"
            url = None
        resources.append({"type": resource_type, "label": label, "url": url})
    return resources


def _normalise_method_steps(raw_steps: Any) -> list[dict[str, Any]]:
    if raw_steps is None:
        return []
    steps_input = raw_steps if isinstance(raw_steps, list) else [raw_steps]
    steps: list[dict[str, Any]] = []
    for index, item in enumerate(steps_input, start=1):
        if isinstance(item, dict):
            title = (
                item.get("title")
                or item.get("name")
                or item.get("step")
                or f"Activity {index}"
            )
            description = (
                item.get("description")
                or item.get("details")
                or item.get("prompt")
                or item.get("summary")
                or ""
            )
            duration = item.get("duration_minutes") or item.get("minutes") or item.get("duration")
        else:
            title = f"Activity {index}"
            description = str(item)
            duration = None
        step = {
            "title": str(title).strip() or f"Activity {index}",
            "description": str(description).strip(),
            "duration_minutes": _to_int(duration),
        }
        steps.append(step)
    return steps


def _normalise_practice_prompts(raw_prompts: Any) -> list[dict[str, Any]]:
    if raw_prompts is None:
        return []
    prompts_input = raw_prompts if isinstance(raw_prompts, list) else [raw_prompts]
    prompts: list[dict[str, Any]] = []
    for item in prompts_input:
        if isinstance(item, dict):
            prompt_text = (
                item.get("prompt")
                or item.get("activity")
                or item.get("description")
                or item.get("task")
                or ""
            )
            modality = item.get("modality") or item.get("type")
        else:
            prompt_text = item
            modality = None
        text = str(prompt_text).strip()
        if not text:
            continue
        prompt_payload = {"prompt": text, "modality": str(modality).strip() or None if modality else None}
        prompts.append(prompt_payload)
    return prompts


def _normalise_assessment(raw_assessment: Any) -> dict[str, Any] | None:
    if raw_assessment is None:
        return None
    if isinstance(raw_assessment, dict):
        prompt = (
            raw_assessment.get("prompt")
            or raw_assessment.get("question")
            or raw_assessment.get("task")
            or raw_assessment.get("challenge")
            or ""
        )
        success = _ensure_string_list(
            raw_assessment.get("success_criteria")
            or raw_assessment.get("criteria")
            or raw_assessment.get("checklist")
        )
        exemplar = raw_assessment.get("exemplar_answer") or raw_assessment.get("answer_key")
        extension = raw_assessment.get("extension") or raw_assessment.get("extension_idea") or raw_assessment.get("challenge")
        follow_up = _ensure_string_list(
            raw_assessment.get("follow_up_questions")
            or raw_assessment.get("followups")
            or raw_assessment.get("additional_questions")
        )
    else:
        prompt = raw_assessment
        success = []
        exemplar = None
        extension = None
        follow_up = []
    prompt_text = str(prompt).strip() or "Show what you learned!"
    assessment_payload = {
        "prompt": prompt_text,
        "success_criteria": success or None,
        "exemplar_answer": str(exemplar).strip() if exemplar else None,
        "extension_idea": str(extension).strip() if extension else None,
        "follow_up_questions": follow_up or None,
    }
    return assessment_payload


def _normalise_lesson_payload(
    lesson_data: dict[str, Any],
    *,
    index: int,
    chapter: str | None,
) -> dict[str, Any]:
    lesson_dict: dict[str, Any] = dict(lesson_data)
    title = str(lesson_dict.get("title") or f"Lesson {index}").strip()
    if not title:
        title = f"Lesson {index}"
    content = (
        lesson_dict.get("content_markdown")
        or lesson_dict.get("lesson_markdown")
        or lesson_dict.get("content")
        or lesson_dict.get("summary")
        or ""
    )
    content_markdown = str(content).strip() or f"Let's explore {title} together!"
    objectives = _ensure_string_list(lesson_dict.get("objectives"))
    if not objectives:
        objectives = [f"Understand the key ideas in {title}."]
    method_plan = _normalise_method_steps(
        lesson_dict.get("method_plan")
        or lesson_dict.get("teaching_plan")
        or lesson_dict.get("activities")
        or lesson_dict.get("steps")
    )
    if not method_plan:
        method_plan = [
            {
                "title": "Explore together",
                "description": "Discuss the main idea with the learner and walk through a playful example.",
                "duration_minutes": None,
            }
        ]
    practice_prompts = _normalise_practice_prompts(
        lesson_dict.get("practice_prompts")
        or lesson_dict.get("practice_ideas")
        or lesson_dict.get("games")
        or lesson_dict.get("assignments")
    )
    if not practice_prompts:
        practice_prompts = [
            {
                "prompt": "Share one thing you learned and draw or explain an example in your own words.",
                "modality": "reflection",
            }
        ]
    assessment = _normalise_assessment(
        lesson_dict.get("mastery_check")
        or lesson_dict.get("assessment")
        or lesson_dict.get("exit_ticket")
    )
    if assessment is None:
        assessment = {
            "prompt": "Tell Omni Teacher what you now understand and show an example!",
            "success_criteria": ["Explains the concept clearly", "Provides a matching example"],
            "exemplar_answer": None,
            "extension_idea": None,
            "follow_up_questions": None,
        }
    estimated_minutes = _to_int(
        lesson_dict.get("estimated_minutes")
        or lesson_dict.get("duration_minutes")
        or lesson_dict.get("duration")
    )
    lesson_payload = {
        "title": title,
        "chapter": chapter,
        "content_markdown": content_markdown,
        "objectives": objectives,
        "method_plan": method_plan,
        "practice_prompts": practice_prompts,
        "assessment": assessment,
        "estimated_minutes": estimated_minutes,
        "resources": _normalise_resources(lesson_dict.get("resources")),
    }
    return lesson_payload


def _sorted_lesson_attempts(lesson: Lesson) -> list[LessonAttempt]:
    attempts = lesson.attempts or []
    return sorted(attempts, key=lambda attempt: attempt.created_at or datetime.min)


def _lesson_mastery_stats(lesson: Lesson) -> tuple[int, bool, LessonAttempt | None]:
    attempts = _sorted_lesson_attempts(lesson)
    best_stars = max((attempt.stars or 0 for attempt in attempts), default=0)
    completed = any(
        attempt.status == "completed" and (attempt.stars or 0) > 0 for attempt in attempts
    )
    latest_attempt = attempts[-1] if attempts else None
    return best_stars, completed, latest_attempt


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


def serialize_program(program: LearningProgram) -> LearningProgramResponse:
    lessons_sorted = sorted(program.lessons or [], key=lambda lesson: lesson.order_index)
    previous_mastered = True
    serialised_lessons: list[LessonResponse] = []
    total_stars = 0

    for index, lesson in enumerate(lessons_sorted):
        best_stars, completed, latest_attempt = _lesson_mastery_stats(lesson)
        unlocked = index == 0 or previous_mastered
        progress_state = "completed" if completed else ("available" if unlocked else "locked")
        attempts_models = [
            LessonAttemptResponse.model_validate(attempt)
            for attempt in _sorted_lesson_attempts(lesson)
        ]
        lesson_model = LessonResponse.model_validate(lesson).model_copy(
            update={
                "attempts": attempts_models,
                "unlocked": unlocked,
                "progress_state": progress_state,
                "mastery_stars": best_stars,
                "latest_attempt": LessonAttemptResponse.model_validate(latest_attempt)
                if latest_attempt
                else None,
            }
        )
        serialised_lessons.append(lesson_model)
        if completed:
            total_stars += best_stars
        previous_mastered = completed

    program_model = LearningProgramResponse.model_validate(program)
    return program_model.model_copy(
        update={
            "lessons": serialised_lessons,
            "total_mastery_stars": total_stars,
        }
    )


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
            lesson_payload = _normalise_lesson_payload(
                lesson_data,
                index=order_index,
                chapter=chapter_title,
            )
            lesson = Lesson(
                program_id=program.id,
                chapter=lesson_payload["chapter"],
                order_index=order_index,
                title=lesson_payload["title"],
                content_markdown=lesson_payload["content_markdown"],
                resources=lesson_payload["resources"],
                objectives=lesson_payload["objectives"],
                method_plan=lesson_payload["method_plan"],
                practice_prompts=lesson_payload["practice_prompts"],
                assessment=lesson_payload["assessment"],
                estimated_minutes=lesson_payload["estimated_minutes"],
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

    program = lesson.program
    if not program:
        raise ValueError("Lesson is not attached to a program")

    lessons_sorted = sorted(program.lessons or [], key=lambda item: item.order_index)
    previous_mastered = True
    for current in lessons_sorted:
        if current.id == lesson.id:
            if current is not lessons_sorted[0] and not previous_mastered:
                raise ValueError("Previous lessons must be mastered before unlocking this one")
            break
        _, completed, _ = _lesson_mastery_stats(current)
        previous_mastered = completed

    client = get_omni_client()
    try:
        mastery = client.evaluate_lesson_mastery(
            lesson_title=lesson.title,
            lesson_content=lesson.content_markdown,
            objectives=lesson.objectives or [],
            method_plan=lesson.method_plan or [],
            assessment=lesson.assessment or {},
            student_answers=payload.answers,
        )
    except OmniAPIError as exc:
        mastery = {
            "positive_feedback": "Great effort on the activity!",
            "next_focus": "Let's review the key ideas together next time.",
            "score": None,
            "stars": 0,
            "summary": "Unable to evaluate automatically.",
            "error": str(exc),
        }

    stars = mastery.get("stars")
    score = mastery.get("score")
    mastery_summary = mastery.get("summary")
    status = payload.status
    if isinstance(stars, int) and stars > 0:
        status = "completed"
    elif status == "completed" and (not isinstance(stars, int) or stars <= 0):
        status = "needs_help"

    attempt = LessonAttempt(
        lesson_id=lesson.id,
        student_id=payload.student_id,
        status=status,
        answers=payload.answers,
        teacher_notes=payload.teacher_notes,
        score=score if isinstance(score, int) else None,
        stars=stars if isinstance(stars, int) else None,
        mastery_summary=str(mastery_summary).strip() if mastery_summary else None,
        reflection_positive=mastery.get("positive_feedback"),
        reflection_negative=mastery.get("next_focus"),
    )

    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    db.refresh(attempt, attribute_names=["lesson"])
    lesson = attempt.lesson
    if lesson is not None:
        db.refresh(lesson, attribute_names=["attempts", "program"])
        if lesson.program is not None:
            db.refresh(lesson.program, attribute_names=["lessons"])
    return attempt


def capture_progress(db: Session, student_id: str) -> ProgressSnapshot:
    student = db.get(Student, student_id)
    if not student:
        raise ValueError("Student not found")

    completed_lessons = 0
    in_progress_lessons = 0
    badges: list[str] = []

    for program in student.programs:
        for lesson in sorted(program.lessons, key=lambda item: item.order_index):
            best_stars, completed, latest_attempt = _lesson_mastery_stats(lesson)
            attempts = _sorted_lesson_attempts(lesson)
            if completed:
                completed_lessons += 1
                if best_stars:
                    badges.append(f"{lesson.title}: {'⭐' * min(best_stars, 3)}")
            elif attempts:
                in_progress_lessons += 1
                if latest_attempt and latest_attempt.status == "needs_help":
                    badges.append(f"Support next: {lesson.title}")

    snapshot = ProgressSnapshot(
        student=StudentResponse.model_validate(student),
        completed_lessons=completed_lessons,
        in_progress_lessons=in_progress_lessons,
        total_programs=len(student.programs),
        badges=badges[:6],
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
