"""Celery worker placeholder for long-running Omni Teacher tasks."""

from celery import Celery

celery_app = Celery(
    "omni_teacher",
    broker="redis://redis:6379/0",
    backend="redis://redis:6379/0",
)


@celery_app.task(name="omni_teacher.generate_quiz")
def generate_quiz(program_id: str, student_id: str) -> dict[str, str]:
    """Example task that would orchestrate quiz generation via Omni."""

    return {
        "program_id": program_id,
        "student_id": student_id,
        "status": "generated",
    }
