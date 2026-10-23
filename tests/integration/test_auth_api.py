"""
tests/integration/test_auth_api.py
Kiểm thử tích hợp (Integration Tests) cho Phân hệ API Xác thực (docs/README_02_AUTH_API.md).
Sử dụng SQLite In-memory cô lập để đảm bảo an toàn và tính độc lập của các ca kiểm thử:
- POST /api/v1/auth/register (201 Created, 409 Conflict, 422 Unprocessable)
- POST /api/v1/auth/login (200 OK, 401 Unauthorized, 403 Forbidden, 422)
- GET /api/v1/auth/me (200 OK, 401 Unauthorized, 403 Forbidden)
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from src.backend.core.config import settings
from src.backend.main import app
from src.backend.models.database import get_session
from src.backend.models.schema import User, utc_now
from src.backend.services.auth_service import create_access_token, hash_password


@pytest.fixture(name="db_session")
def db_session_fixture():
    """Tạo engine SQLite in-memory cô lập cho phiên kiểm thử."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="client")
def client_fixture(db_session: Session):
    """TestClient kết nối phiên DB in-memory."""

    def override_get_session():
        yield db_session

    from src.backend.api.deps import get_db

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_db] = override_get_session
    yield TestClient(app)
    app.dependency_overrides.clear()


# ==============================================================================
# 1. KIỂM THỬ POST /api/v1/auth/register
# ==============================================================================


def test_register_success_returns_201_and_no_password_hash(client: TestClient):
    """Kiểm tra đăng ký tài khoản thành công trả về HTTP 201 và không để lộ hash mật khẩu."""
    payload = {
        "email": "user.test@example.com",
        "password": "StrongPassword123!",
        "full_name": "Nguyen Van A",
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()

    assert data["email"] == "user.test@example.com"
    assert data["full_name"] == "Nguyen Van A"
    assert data["is_active"] is True
    assert "id" in data
    assert "created_at" in data

    # BẮT BUỘC: Không chứa hashed_password hay password_hash trong response
    assert "password" not in data
    assert "password_hash" not in data
    assert "hashed_password" not in data


def test_register_duplicate_email_case_insensitive_returns_409(client: TestClient):
    """Kiểm tra đăng ký trùng email (kể cả khác chữ hoa/thường) trả về HTTP 409 Conflict."""
    payload1 = {
        "email": "dupe@example.com",
        "password": "Password123!",
        "full_name": "User One",
    }
    res1 = client.post("/api/v1/auth/register", json=payload1)
    assert res1.status_code == 201

    # Thử đăng ký lại với email viết hoa
    payload2 = {
        "email": "DUPE@EXAMPLE.COM",
        "password": "Password456!",
        "full_name": "User Two",
    }
    res2 = client.post("/api/v1/auth/register", json=payload2)
    assert res2.status_code == 409
    data = res2.json()
    assert "Email đã tồn tại" in data["detail"]


def test_register_weak_password_or_invalid_email_returns_422(client: TestClient):
    """Kiểm tra mật khẩu yếu hoặc email không hợp lệ trả về HTTP 422."""
    # Email sai định dạng
    res_email = client.post(
        "/api/v1/auth/register",
        json={"email": "not-an-email", "password": "ValidPassword123!"},
    )
    assert res_email.status_code == 422

    # Mật khẩu ngắn hơn 8 ký tự
    res_short = client.post(
        "/api/v1/auth/register",
        json={"email": "u1@example.com", "password": "Short1!"},
    )
    assert res_short.status_code == 422

    # Mật khẩu không có chữ hoa
    res_no_upper = client.post(
        "/api/v1/auth/register",
        json={"email": "u2@example.com", "password": "password123!"},
    )
    assert res_no_upper.status_code == 422

    # Mật khẩu không có chữ thường
    res_no_lower = client.post(
        "/api/v1/auth/register",
        json={"email": "u3@example.com", "password": "PASSWORD123!"},
    )
    assert res_no_lower.status_code == 422

    # Mật khẩu không có chữ số
    res_no_digit = client.post(
        "/api/v1/auth/register",
        json={"email": "u4@example.com", "password": "PasswordWithoutDigit!"},
    )
    assert res_no_digit.status_code == 422


# ==============================================================================
# 2. KIỂM THỬ POST /api/v1/auth/login
# ==============================================================================


def test_login_success_returns_token(client: TestClient, db_session: Session):
    """Kiểm tra đăng nhập đúng thông tin trả về 200 kèm Bearer Access Token."""
    user = User(
        email="login.user@example.com",
        username="login_user",
        full_name="Login Test User",
        password_hash=hash_password("ValidPassword123!"),
        is_active=True,
        created_at=utc_now(),
    )
    db_session.add(user)
    db_session.commit()

    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "login.user@example.com", "password": "ValidPassword123!"},
    )
    assert login_res.status_code == 200
    data = login_res.json()

    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == (settings.ACCESS_TOKEN_EXPIRE_MINUTES if settings else 30) * 60


def test_login_invalid_credentials_unified_error_message(client: TestClient, db_session: Session):
    """Kiểm tra sai email hoặc sai mật khẩu trả về cùng một mã 401 và cùng thông báo lỗi."""
    user = User(
        email="existing@example.com",
        username="existing_user",
        password_hash=hash_password("CorrectPass123!"),
        is_active=True,
        created_at=utc_now(),
    )
    db_session.add(user)
    db_session.commit()

    # Trường hợp 1: Email không tồn tại
    res_wrong_email = client.post(
        "/api/v1/auth/login",
        json={"email": "nonexistent@example.com", "password": "AnyPassword123!"},
    )
    assert res_wrong_email.status_code == 401
    msg1 = res_wrong_email.json()["detail"]

    # Trường hợp 2: Đúng email nhưng sai mật khẩu
    res_wrong_pass = client.post(
        "/api/v1/auth/login",
        json={"email": "existing@example.com", "password": "WrongPassword123!"},
    )
    assert res_wrong_pass.status_code == 401
    msg2 = res_wrong_pass.json()["detail"]

    # BẮT BUỘC: Thông báo lỗi phải đồng nhất chống account enumeration / timing attack
    assert msg1 == msg2 == "Email hoặc mật khẩu không chính xác"


def test_login_inactive_user_returns_403(client: TestClient, db_session: Session):
    """Kiểm tra người dùng bị vô hiệu hóa (is_active=False) bị từ chối với HTTP 403."""
    user = User(
        email="blocked@example.com",
        username="blocked_user",
        password_hash=hash_password("Pass1234!"),
        is_active=False,  # Bị khóa tài khoản
        created_at=utc_now(),
    )
    db_session.add(user)
    db_session.commit()

    res = client.post(
        "/api/v1/auth/login",
        json={"email": "blocked@example.com", "password": "Pass1234!"},
    )
    assert res.status_code == 403
    assert "vô hiệu hóa" in res.json()["detail"]


# ==============================================================================
# 3. KIỂM THỬ GET /api/v1/auth/me (PROTECTED ROUTE MẪU)
# ==============================================================================


def test_get_me_success_with_valid_token(client: TestClient, db_session: Session):
    """Kiểm tra route /auth/me hoạt động thành công với Header Authorization: Bearer <token>."""
    user = User(
        email="me.user@example.com",
        username="me_user",
        full_name="Me Full Name",
        password_hash=hash_password("SecurePass123!"),
        is_active=True,
        created_at=utc_now(),
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    token, _ = create_access_token(subject=str(user.id))

    res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()

    assert data["id"] == user.id
    assert data["email"] == "me.user@example.com"
    assert data["full_name"] == "Me Full Name"
    assert data["is_active"] is True
    assert "password_hash" not in data
    assert "hashed_password" not in data


def test_get_me_without_token_returns_401(client: TestClient):
    """Kiểm tra gọi /auth/me không có header xác thực trả về 401 kèm header WWW-Authenticate."""
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401
    assert "WWW-Authenticate" in res.headers
    assert "Bearer" in res.headers["WWW-Authenticate"]


def test_get_me_with_invalid_or_expired_token_returns_401(client: TestClient):
    """Kiểm tra token rác hoặc token hết hạn bị từ chối 401."""
    # Token rác
    res_garbage = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid.garbage.token"},
    )
    assert res_garbage.status_code == 401

    # Token hết hạn
    secret_key = settings.SECRET_KEY if settings else "nutrisnap_super_secret_jwt_key_w2_secure_32bytes!"
    algorithm = settings.JWT_ALGORITHM if settings else "HS256"
    issuer = settings.JWT_ISSUER if settings else "nutriscan-api"
    past = datetime.now(timezone.utc) - timedelta(minutes=10)

    expired_payload = {
        "sub": "1",
        "iat": past - timedelta(minutes=20),
        "exp": past,
        "iss": issuer,
        "type": "access",
    }
    expired_token = jwt.encode(expired_payload, secret_key, algorithm=algorithm)

    res_expired = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert res_expired.status_code == 401


def test_get_me_inactive_user_returns_403(client: TestClient, db_session: Session):
    """Kiểm tra token hợp lệ của user đã bị vô hiệu hóa trả về HTTP 403."""
    user = User(
        email="inactive.me@example.com",
        username="inactive_me",
        password_hash=hash_password("Password123!"),
        is_active=False,
        created_at=utc_now(),
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    token, _ = create_access_token(subject=str(user.id))

    res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    assert "vô hiệu hóa" in res.json()["detail"]


def test_get_me_deleted_user_returns_401(client: TestClient, db_session: Session):
    """Kiểm tra token mang user_id không còn tồn tại trong CSDL trả về 401."""
    # Giả lập token với ID không tồn tại
    non_existent_id = 999999
    token, _ = create_access_token(subject=str(non_existent_id))

    res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 401
