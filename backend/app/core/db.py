"""Database session management for the Omni Teacher backend."""

from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from .config import settings


engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session."""

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    """Provide a transactional scope for worker-side operations."""

    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def ensure_schema() -> None:
    """Ensure database schema contains the latest adaptive learning columns."""

    inspector = inspect(engine)

    def existing_columns(table: str) -> set[str] | None:
        try:
            return {column["name"] for column in inspector.get_columns(table)}
        except Exception:
            # Table might not exist yet (fresh database); create_all will handle it.
            return None

    dialect = engine.dialect.name
    json_type = "JSONB" if dialect == "postgresql" else "JSON"

    def add_column(
        table: str,
        columns: set[str],
        name: str,
        *,
        column_type: str,
        default: str | None = None,
    ) -> None:
        if name in columns:
            return

        default_clause = ""
        if default is not None:
            if dialect == "postgresql" and column_type.upper().startswith("JSON"):
                default_clause = f" DEFAULT '{default}'::jsonb"
            elif dialect == "postgresql":
                default_clause = f" DEFAULT {default}"
            else:
                default_clause = f" DEFAULT '{default}'"

        statement = text(
            f"ALTER TABLE {table} ADD COLUMN {name} {column_type}{default_clause}"
        )
        with engine.begin() as connection:
            connection.execute(statement)
        columns.add(name)

    lesson_columns = existing_columns("lessons")
    if lesson_columns is not None:
        add_column(
            "lessons",
            lesson_columns,
            "objectives",
            column_type=json_type,
            default="[]",
        )
        add_column(
            "lessons",
            lesson_columns,
            "method_plan",
            column_type=json_type,
            default="[]",
        )
        add_column(
            "lessons",
            lesson_columns,
            "practice_prompts",
            column_type=json_type,
            default="[]",
        )
        add_column(
            "lessons",
            lesson_columns,
            "assessment",
            column_type=json_type,
            default="{}",
        )
        add_column(
            "lessons",
            lesson_columns,
            "estimated_minutes",
            column_type="INTEGER",
        )

    attempt_columns = existing_columns("lesson_attempts")
    if attempt_columns is not None:
        add_column(
            "lesson_attempts",
            attempt_columns,
            "score",
            column_type="INTEGER",
        )
        add_column(
            "lesson_attempts",
            attempt_columns,
            "stars",
            column_type="INTEGER",
        )
        add_column(
            "lesson_attempts",
            attempt_columns,
            "mastery_summary",
            column_type="TEXT",
        )

