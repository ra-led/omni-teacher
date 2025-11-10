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
    try:
        lesson_columns = {column["name"] for column in inspector.get_columns("lessons")}
    except Exception:
        # Lessons table might not exist yet (fresh database); create_all will handle it.
        return

    dialect = engine.dialect.name

    json_type = "JSONB" if dialect == "postgresql" else "JSON"

    def add_column(name: str, default: str | None = None, column_type: str | None = None) -> None:
        if name in lesson_columns:
            return

        col_type = column_type or json_type
        default_clause = ""
        if default is not None:
            if dialect == "postgresql" and col_type.upper().startswith("JSON"):
                default_clause = f" DEFAULT '{default}'::jsonb"
            elif dialect == "postgresql":
                default_clause = f" DEFAULT {default}"
            else:
                default_clause = f" DEFAULT '{default}'"

        statement = text(
            f"ALTER TABLE lessons ADD COLUMN {name} {col_type}{default_clause}"
        )
        with engine.begin() as connection:
            connection.execute(statement)
        lesson_columns.add(name)

    add_column("objectives", default="[]")
    add_column("method_plan", default="[]")
    add_column("practice_prompts", default="[]")
    add_column("assessment", default="{}")
    add_column("estimated_minutes", column_type="INTEGER")

