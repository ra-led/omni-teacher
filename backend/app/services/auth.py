"""Authentication helpers for account sign-up and sign-in."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid

from sqlalchemy.orm import Session

from ..models import Account


PBKDF2_ROUNDS = 120_000


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _hash_password(password: str, salt: str) -> str:
    payload = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PBKDF2_ROUNDS,
    )
    return payload.hex()


def create_account(db: Session, *, email: str, password: str) -> tuple[Account, str]:
    normalized_email = _normalize_email(email)
    existing = db.query(Account).filter(Account.email == normalized_email).first()
    if existing:
        raise ValueError("Account with this email already exists")

    salt = secrets.token_hex(16)
    account = Account(
        email=normalized_email,
        password_salt=salt,
        password_hash=_hash_password(password, salt),
    )
    account.session_token = str(uuid.uuid4())

    db.add(account)
    db.commit()
    db.refresh(account)
    if not account.session_token:
        raise RuntimeError("Unable to initialize session token")
    return account, account.session_token


def login_account(db: Session, *, email: str, password: str) -> tuple[Account, str]:
    normalized_email = _normalize_email(email)
    account = db.query(Account).filter(Account.email == normalized_email).first()
    if not account:
        raise ValueError("Invalid email or password")

    expected = _hash_password(password, account.password_salt)
    if not hmac.compare_digest(expected, account.password_hash):
        raise ValueError("Invalid email or password")

    account.session_token = str(uuid.uuid4())
    db.commit()
    db.refresh(account)
    if not account.session_token:
        raise RuntimeError("Unable to initialize session token")
    return account, account.session_token


def get_account_by_token(db: Session, token: str | None) -> Account | None:
    if not token:
        return None
    return db.query(Account).filter(Account.session_token == token).first()


def logout_account(db: Session, account: Account) -> None:
    account.session_token = None
    db.commit()
