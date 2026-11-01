"""
tests/integration/test_admin_api.py
Kiểm thử API quản trị: phân quyền admin, thống kê, danh sách, khoá/mở khoá, xoá tài khoản.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from src.backend.core.config import settings
from src.backend.main import app
from src.backend.models.database import get_session
from src.backend.models.schema import Meal, User, utc_now
from src.backend.services.auth_service import create_access_token, hash_password

ORIGIN = {"Origin": "http://localhost:5173"}


@pytest.fixture(name="db_session")
def db_session_fixture():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_connection, _record):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="client")
def client_fixture(db_session: Session):
    def override_get_session():
        yield db_session

    from src.backend.api.deps import get_db

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_db] = override_get_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def _user(session: Session, username: str, *, is_admin: bool = False, is_active: bool = True) -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        password_hash=hash_password("ValidPassword123!"),
        is_admin=is_admin,
        is_active=is_active,
        created_at=utc_now(),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _login_as(client: TestClient, user: User) -> None:
    token, _ = create_access_token(subject=str(user.id), extra_claims={"username": user.username})
    client.cookies.set(settings.AUTH_COOKIE_NAME, token)


def test_non_admin_is_forbidden(client: TestClient, db_session: Session):
    normal = _user(db_session, "normal_user")
    _login_as(client, normal)
    assert client.get("/api/v1/admin/stats").status_code == 403
    assert client.get("/api/v1/admin/users").status_code == 403


def test_anonymous_is_unauthorized(client: TestClient):
    assert client.get("/api/v1/admin/users").status_code == 401


def test_stats_and_list(client: TestClient, db_session: Session):
    admin = _user(db_session, "boss", is_admin=True)
    member = _user(db_session, "member_one")
    _user(db_session, "locked_one", is_active=False)
    db_session.add(Meal(user_id=member.id, meal_type="lunch"))
    db_session.commit()
    _login_as(client, admin)

    stats = client.get("/api/v1/admin/stats").json()
    assert stats["total_users"] == 3
    assert stats["locked_users"] == 1
    assert stats["admin_users"] == 1
    assert stats["total_meals"] == 1
    assert stats["active_loggers_7d"] == 1
    assert len(stats["signups_by_day"]) == 14

    res = client.get("/api/v1/admin/users", params={"q": "member"}).json()
    assert res["total"] == 1
    item = res["items"][0]
    assert item["username"] == "member_one"
    assert item["meal_count"] == 1
    assert "password_hash" not in item

    locked = client.get("/api/v1/admin/users", params={"status": "locked"}).json()
    assert [u["username"] for u in locked["items"]] == ["locked_one"]


def test_lock_blocks_existing_session(client: TestClient, db_session: Session):
    admin = _user(db_session, "boss", is_admin=True)
    member = _user(db_session, "member_one")
    _login_as(client, admin)

    res = client.patch(f"/api/v1/admin/users/{member.id}", json={"is_active": False}, headers=ORIGIN)
    assert res.status_code == 200
    assert res.json()["is_active"] is False

    # Cookie của người bị khoá không còn dùng được
    _login_as(client, member)
    assert client.get("/api/v1/auth/me").status_code == 403


def test_admin_cannot_lock_or_delete_self(client: TestClient, db_session: Session):
    admin = _user(db_session, "boss", is_admin=True)
    _login_as(client, admin)
    assert client.patch(f"/api/v1/admin/users/{admin.id}", json={"is_active": False}, headers=ORIGIN).status_code == 400
    assert client.delete(f"/api/v1/admin/users/{admin.id}", headers=ORIGIN).status_code == 400


def test_delete_user_removes_data(client: TestClient, db_session: Session):
    admin = _user(db_session, "boss", is_admin=True)
    member = _user(db_session, "member_one")
    db_session.add(Meal(user_id=member.id, meal_type="lunch"))
    db_session.commit()
    member_id = member.id
    _login_as(client, admin)

    assert client.delete(f"/api/v1/admin/users/{member_id}", headers=ORIGIN).status_code == 204
    db_session.expire_all()
    assert db_session.get(User, member_id) is None
    assert db_session.exec(select(Meal).where(Meal.user_id == member_id)).first() is None


def test_write_requires_trusted_origin(client: TestClient, db_session: Session):
    admin = _user(db_session, "boss", is_admin=True)
    member = _user(db_session, "member_one")
    _login_as(client, admin)
    res = client.patch(
        f"/api/v1/admin/users/{member.id}", json={"is_active": False}, headers={"Origin": "https://evil.example"}
    )
    assert res.status_code == 403
