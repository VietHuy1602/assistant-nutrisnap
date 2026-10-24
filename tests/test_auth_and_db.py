"""Week 2 QA tests for authentication guards and database foreign keys.

Run from the repository root with:
    python -m pytest tests/test_auth_and_db.py -v

These tests exercise the current guard implementation and SQLite constraints.
They do not claim that the current demo token check is full JWT verification.
"""

from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel

from src.backend.models.database import create_db_engine
from src.backend.models.schema import Goal, User
from src.backend.services.auth_guard import get_current_user, verify_csrf_protection


@pytest.fixture()
def db_session():
    """Create an isolated in-memory SQLite database for each test."""
    test_engine = create_db_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(test_engine)
    try:
        with Session(test_engine) as session:
            yield session
    finally:
        SQLModel.metadata.drop_all(test_engine)
        test_engine.dispose()


def make_request(method: str = "GET"):
    """Build the minimal Starlette Request object required by the auth guards."""
    from starlette.requests import Request

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": "/test",
        "raw_path": b"/test",
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 50000),
        "server": ("testserver", 80),
    }
    return Request(scope)


def test_auth_rejects_missing_cookie():
    """A request without access_token must return HTTP 401."""
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request=make_request(), access_token=None)

    assert exc_info.value.status_code == 401


@pytest.mark.parametrize("cookie_value", ["", "   ", "invalid"])
def test_auth_rejects_empty_or_short_invalid_cookie(cookie_value: str):
    """Empty/whitespace and short invalid token strings must return HTTP 401."""
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request=make_request(), access_token=cookie_value)

    assert exc_info.value.status_code == 401


def test_auth_guard_accepts_valid_jwt_token():
    """Kiểm tra get_current_user giải mã thành công JWT hợp lệ được ký bởi JWT_SECRET_KEY."""
    from src.backend.services.auth_service import create_access_token

    token = create_access_token({
        "sub": "1",
        "username": "thanhdat",
        "email": "dat@example.com",
    })
    user = get_current_user(request=make_request(), access_token=token)
    assert user.id == 1
    assert user.username in ("thanhdat", "student_user")


def test_auth_guard_rejects_arbitrary_string():
    """Token chuỗi ngẫu nhiên không có chữ ký JWT hợp lệ phải bị từ chối 401."""
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request=make_request(), access_token="xxxxxxxxxxxxxxxxx")
    assert exc_info.value.status_code == 401


def test_csrf_allows_configured_origin():
    """A configured local frontend origin should pass the CSRF guard."""
    request = make_request("POST")
    verify_csrf_protection(
        request=request,
        origin="http://localhost:5173",
        referer=None,
    )


def test_csrf_rejects_untrusted_origin():
    """An untrusted origin should return HTTP 403 for state-changing requests."""
    request = make_request("POST")

    with pytest.raises(HTTPException) as exc_info:
        verify_csrf_protection(
            request=request,
            origin="https://malicious.example",
            referer=None,
        )

    assert exc_info.value.status_code == 403


def test_csrf_rejects_subdomain_spoofing():
    """Tên miền giả mạo subdomain startswith (http://localhost:5173.evil.com) phải bị chặn 403."""
    request = make_request("POST")

    with pytest.raises(HTTPException) as exc_info:
        verify_csrf_protection(
            request=request,
            origin="http://localhost:5173.evil.com",
            referer=None,
        )

    assert exc_info.value.status_code == 403


def test_csrf_rejects_missing_origin_and_referer():
    """Yêu cầu POST thiếu cả Origin và Referer phải bị chặn 403."""
    request = make_request("POST")

    with pytest.raises(HTTPException) as exc_info:
        verify_csrf_protection(
            request=request,
            origin=None,
            referer=None,
        )

    assert exc_info.value.status_code == 403


def test_csrf_does_not_check_origin_for_get():
    """The current guard only validates origin on state-changing methods."""
    verify_csrf_protection(
        request=make_request("GET"),
        origin="https://malicious.example",
        referer=None,
    )


def test_foreign_key_rejects_goal_for_unknown_user(db_session: Session):
    """A Goal referencing a non-existent users.id must fail to commit."""
    goal = Goal(
        user_id=999999,
        target_weight=65.0,
        tdee_calories=2000.0,
        daily_budget_vnd=50000,
    )
    db_session.add(goal)

    with pytest.raises(IntegrityError):
        db_session.commit()

    db_session.rollback()


def test_foreign_key_accepts_goal_for_existing_user(db_session: Session):
    """A Goal referencing an existing user should be stored successfully."""
    user = User(
        username="qa_user",
        email="qa_user@example.test",
        password_hash="test-hash-only",
        created_at=datetime.now(UTC),
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    goal = Goal(
        user_id=user.id,
        target_weight=65.0,
        tdee_calories=2000.0,
        daily_budget_vnd=50000,
    )
    db_session.add(goal)
    db_session.commit()
    db_session.refresh(goal)

    assert goal.id is not None
    assert goal.user_id == user.id
