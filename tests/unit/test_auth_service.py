"""
tests/unit/test_auth_service.py
Kiểm thử tự động cho Module Auth JWT bảo mật (docs/README_01_AUTH_JWT_MODULE.md).
Bao gồm:
- Băm & xác minh mật khẩu bcrypt (salt, 72 bytes limit, needs_rehash).
- Cấp phát & giải mã JWT access token (claims, expiration, invalid signature, alg=none, whitelist).
"""

from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt
from passlib.context import CryptContext

from src.backend.core.config import Settings, settings
from src.backend.exceptions.auth import InvalidTokenError, TokenExpiredError
from src.backend.services.auth_service import (
    create_access_token,
    decode_access_token,
    hash_password,
    needs_rehash,
    verify_password,
)

# ==============================================================================
# 1. KIỂM THỬ BĂM MẬT KHẨU (PASSWORD HASHING)
# ==============================================================================


def test_password_hash_different_from_plain_and_salted():
    """Kiểm tra mật khẩu băm khác mật khẩu gốc và 2 lần băm cho kết quả khác nhau (salt)."""
    raw_pwd = "MySecurePassword123!"
    h1 = hash_password(raw_pwd)
    h2 = hash_password(raw_pwd)

    assert h1 != raw_pwd
    assert h2 != raw_pwd
    assert h1 != h2, "Mỗi lần băm phải sinh ra một salt ngẫu nhiên khác nhau"


def test_verify_password_correct_incorrect_and_garbage():
    """Kiểm tra verify_password: đúng -> True, sai -> False, hash rác -> False."""
    pwd = "CorrectPassword123@"
    h = hash_password(pwd)

    # Đúng mật khẩu
    assert verify_password(pwd, h) is True
    # Sai mật khẩu
    assert verify_password("WrongPassword456!", h) is False
    # Chuỗi hash rác không gây ném exception và trả về False
    assert verify_password(pwd, "invalid_garbage_hash_not_bcrypt") is False
    assert verify_password(pwd, "") is False


def test_hash_password_exceeds_72_bytes_raises_value_error():
    """Kiểm tra mật khẩu > 72 bytes UTF-8 bị ném ValueError rõ ràng."""
    long_pwd = "A" * 73
    with pytest.raises(ValueError, match="72 bytes"):
        hash_password(long_pwd)

    # Mật khẩu chứa ký tự Unicode đa byte vượt 72 bytes
    unicode_long_pwd = "TiếngViệt" * 8  # Mỗi ký tự tiếng Việt chiếm 2-3 bytes
    assert len(unicode_long_pwd.encode("utf-8")) > 72
    with pytest.raises(ValueError, match="72 bytes"):
        hash_password(unicode_long_pwd)


def test_needs_rehash_returns_true_for_lower_cost():
    """Kiểm tra needs_rehash trả về True khi chuỗi băm có cost factor thấp hơn cấu hình."""
    # Tạo hash với cost factor 10 (thấp hơn mặc định 12)
    low_cost_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=10)
    low_cost_hash = low_cost_context.hash("Password123!")

    assert needs_rehash(low_cost_hash) is True

    # Hash tạo từ cấu hình chuẩn hiện tại (cost factor 12) không cần rehash
    standard_hash = hash_password("Password123!")
    assert needs_rehash(standard_hash) is False


# ==============================================================================
# 2. KIỂM THỬ CẤP PHÁT & GIẢI MÃ JWT TOKEN
# ==============================================================================


def test_create_access_token_claims_and_expires_in():
    """Kiểm tra token hợp lệ chứa đúng sub, iat, exp, iss, type và expires_in khớp cấu hình."""
    user_id = "user_42"
    token, expires_in = create_access_token(subject=user_id, extra_claims={"role": "member"})

    expected_expire_seconds = (settings.ACCESS_TOKEN_EXPIRE_MINUTES if settings else 30) * 60
    assert expires_in == expected_expire_seconds

    # Giải mã token để kiểm tra claims
    payload = decode_access_token(token)
    assert payload["sub"] == user_id
    assert payload["iss"] == (settings.JWT_ISSUER if settings else "nutriscan-api")
    assert payload["type"] == "access"
    assert payload["role"] == "member"
    assert "iat" in payload
    assert "exp" in payload
    assert payload["exp"] > payload["iat"]


def test_decode_access_token_expired_raises_token_expired_error(monkeypatch):
    """Kiểm tra token đã hết hạn ném ra TokenExpiredError."""
    # Tạo token với exp đã trôi qua trong quá khứ
    past_time = datetime.now(timezone.utc) - timedelta(minutes=5)
    secret_key = settings.JWT_SECRET_KEY
    algorithm = settings.JWT_ALGORITHM
    issuer = settings.JWT_ISSUER

    payload = {
        "sub": "user_expired",
        "iat": past_time - timedelta(minutes=10),
        "exp": past_time,
        "iss": issuer,
        "type": "access",
    }
    expired_token = jwt.encode(payload, secret_key, algorithm=algorithm)

    with pytest.raises(TokenExpiredError, match="Token đã hết hạn"):
        decode_access_token(expired_token)


def test_decode_access_token_invalid_signature():
    """Kiểm tra token sai chữ ký (ký bằng secret_key khác) bị ném InvalidTokenError."""
    token, _ = create_access_token(subject="user_1")

    # Giả mạo ký bằng secret khác
    fake_secret = "different_secret_key_at_least_32_characters_long_12345"
    payload = {
        "sub": "user_1",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        "iss": settings.JWT_ISSUER,
        "type": "access",
    }
    tampered_token = jwt.encode(payload, fake_secret, algorithm="HS256")

    with pytest.raises(InvalidTokenError):
        decode_access_token(tampered_token)


def test_decode_access_token_alg_none_rejected():
    """Kiểm tra token có alg=none hoặc thuật toán không nằm trong whitelist bị từ chối."""
    import base64
    import json

    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = (
        base64.urlsafe_b64encode(
            json.dumps(
                {
                    "sub": "user_hacker",
                    "iat": int(datetime.now(timezone.utc).timestamp()),
                    "exp": int((datetime.now(timezone.utc) + timedelta(minutes=15)).timestamp()),
                    "iss": settings.JWT_ISSUER,
                    "type": "access",
                }
            ).encode()
        )
        .decode()
        .rstrip("=")
    )
    unsecured_token = f"{header}.{payload}."

    with pytest.raises(InvalidTokenError):
        decode_access_token(unsecured_token)


def test_decode_access_token_wrong_issuer_rejected():
    """Kiểm tra token có iss sai bị từ chối với InvalidTokenError."""
    secret_key = settings.JWT_SECRET_KEY
    algorithm = settings.JWT_ALGORITHM
    payload = {
        "sub": "user_1",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        "iss": "malicious-issuer",
        "type": "access",
    }
    wrong_iss_token = jwt.encode(payload, secret_key, algorithm=algorithm)

    with pytest.raises(InvalidTokenError):
        decode_access_token(wrong_iss_token)


def test_decode_access_token_wrong_type_rejected():
    """Kiểm tra token có type không phải 'access' (ví dụ refresh) bị từ chối."""
    secret_key = settings.JWT_SECRET_KEY
    algorithm = settings.JWT_ALGORITHM
    issuer = settings.JWT_ISSUER
    payload = {
        "sub": "user_1",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        "iss": issuer,
        "type": "refresh",  # Không phải type access
    }
    refresh_token = jwt.encode(payload, secret_key, algorithm=algorithm)

    with pytest.raises(InvalidTokenError, match="type không phải access"):
        decode_access_token(refresh_token)


def test_decode_access_token_missing_sub_rejected():
    """Kiểm tra token thiếu trường 'sub' bị từ chối với InvalidTokenError."""
    secret_key = settings.JWT_SECRET_KEY
    algorithm = settings.JWT_ALGORITHM
    issuer = settings.JWT_ISSUER
    payload = {
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        "iss": issuer,
        "type": "access",
    }
    missing_sub_token = jwt.encode(payload, secret_key, algorithm=algorithm)

    with pytest.raises(InvalidTokenError, match="thiếu sub"):
        decode_access_token(missing_sub_token)


def test_decode_access_token_garbage_or_empty_rejected():
    """Kiểm tra chuỗi rác, rỗng, không phải JWT bị từ chối với InvalidTokenError."""
    with pytest.raises(InvalidTokenError):
        decode_access_token("")

    with pytest.raises(InvalidTokenError):
        decode_access_token("this.is.garbage")

    with pytest.raises(InvalidTokenError):
        decode_access_token("not-even-a-jwt")


def test_settings_fail_fast_on_short_or_empty_secret_key():
    """Kiểm tra cấu hình Settings fail-fast khi thiếu JWT_SECRET_KEY hoặc < 32 ký tự, hỗ trợ AliasChoices."""
    from pydantic import ValidationError

    # Hợp lệ khi truyền JWT_SECRET_KEY >= 32 ký tự
    s1 = Settings(JWT_SECRET_KEY="a" * 32)
    assert s1.JWT_SECRET_KEY == "a" * 32
    assert s1.SECRET_KEY == "a" * 32

    # Hợp lệ khi truyền qua bí danh SECRET_KEY (AliasChoices)
    s2 = Settings(SECRET_KEY="b" * 32)
    assert s2.JWT_SECRET_KEY == "b" * 32
    assert s2.SECRET_KEY == "b" * 32

    # Ném pydantic ValidationError khi quá ngắn (< 32 ký tự)
    with pytest.raises(ValidationError):
        Settings(JWT_SECRET_KEY="too-short")

    with pytest.raises(ValidationError):
        Settings(SECRET_KEY="too-short")

    # Ném pydantic ValidationError khi rỗng
    with pytest.raises(ValidationError):
        Settings(JWT_SECRET_KEY="")

    with pytest.raises(ValidationError):
        Settings(SECRET_KEY="")



# ==============================================================================
# 3. KIỂM THỬ HÀM NGHIỆP VỤ SERVICES (REGISTER_USER & AUTHENTICATE_USER)
# ==============================================================================


@pytest.fixture(name="unit_db")
def unit_db_fixture():
    """Tạo DB in-memory riêng biệt cho kiểm thử tầng service."""
    from sqlalchemy.pool import StaticPool
    from sqlmodel import Session, SQLModel, create_engine

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)


def test_register_user_service_success_and_duplicates(unit_db):
    """Kiểm tra hàm register_user băm mật khẩu, lưu DB và chặn trùng lặp email."""
    from src.backend.exceptions.auth import EmailAlreadyExistsError
    from src.backend.schemas.auth import RegisterRequest
    from src.backend.services.auth_service import register_user

    data = RegisterRequest(
        email="service.user@example.com",
        password="ValidPassword123!",
        full_name="Service Test User",
    )
    user = register_user(db=unit_db, data=data)

    assert user.id is not None
    assert user.email == "service.user@example.com"
    assert user.full_name == "Service Test User"
    assert user.is_active is True
    assert user.password_hash != "ValidPassword123!"

    # Thử đăng ký lại trùng email (viết hoa)
    dupe_data = RegisterRequest(
        email="SERVICE.USER@EXAMPLE.COM",
        password="AnotherPassword123!",
    )
    with pytest.raises(EmailAlreadyExistsError, match="đã tồn tại"):
        register_user(db=unit_db, data=dupe_data)


def test_authenticate_user_service_flow(unit_db):
    """Kiểm tra authenticate_user: thành công, sai mật khẩu, sai email, user bị khóa và auto-rehash."""
    from passlib.context import CryptContext

    from src.backend.exceptions.auth import InactiveUserError, InvalidCredentialsError
    from src.backend.models.schema import User, utc_now
    from src.backend.services.auth_service import authenticate_user, hash_password

    # Tạo user chuẩn
    u = User(
        email="auth.flow@example.com",
        username="auth_flow",
        password_hash=hash_password("CorrectPass123!"),
        is_active=True,
        created_at=utc_now(),
    )
    unit_db.add(u)
    unit_db.commit()

    # 1. Đăng nhập đúng
    authed = authenticate_user(db=unit_db, email="auth.flow@example.com", password="CorrectPass123!")
    assert authed.id == u.id

    # 2. Sai mật khẩu
    with pytest.raises(InvalidCredentialsError, match="không chính xác"):
        authenticate_user(db=unit_db, email="auth.flow@example.com", password="WrongPassword!")

    # 3. Không tồn tại email (timing attack check)
    with pytest.raises(InvalidCredentialsError, match="không chính xác"):
        authenticate_user(db=unit_db, email="ghost@example.com", password="AnyPassword123!")

    # 4. User bị khóa
    u.is_active = False
    unit_db.add(u)
    unit_db.commit()
    with pytest.raises(InactiveUserError, match="vô hiệu hóa"):
        authenticate_user(db=unit_db, email="auth.flow@example.com", password="CorrectPass123!")

    # 5. Tự động rehash khi cost factor thấp
    low_cost = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=10).hash("RehashPass123!")
    rehash_user = User(
        email="rehash@example.com",
        username="rehash_user",
        password_hash=low_cost,
        is_active=True,
        created_at=utc_now(),
    )
    unit_db.add(rehash_user)
    unit_db.commit()

    old_hash = rehash_user.password_hash
    authed_rehash = authenticate_user(db=unit_db, email="rehash@example.com", password="RehashPass123!")
    unit_db.refresh(authed_rehash)
    assert authed_rehash.password_hash != old_hash, "Mật khẩu phải được tự động băm lại với cost mới"


def test_auth_cookies_helpers():
    """Kiểm tra hàm set_auth_cookie và delete_auth_cookie."""
    from fastapi import Response

    from src.backend.services.auth_service import delete_auth_cookie, set_auth_cookie

    res = Response()
    set_auth_cookie(res, "sample_token_xyz")
    # Kiểm tra cookie trong header Set-Cookie
    set_cookie = res.headers.get("set-cookie")
    assert set_cookie is not None
    assert "access_token=sample_token_xyz" in set_cookie
    assert "HttpOnly" in set_cookie or "httponly" in set_cookie.lower()

    res_del = Response()
    delete_auth_cookie(res_del)
    del_cookie = res_del.headers.get("set-cookie")
    assert del_cookie is not None
    assert "access_token=" in del_cookie


def test_register_user_username_collision_and_integrity_error(unit_db, monkeypatch):
    """Kiểm tra xử lý trùng username và bắt lỗi IntegrityError khi commit."""
    from sqlalchemy.exc import IntegrityError

    from src.backend.exceptions.auth import EmailAlreadyExistsError
    from src.backend.models.schema import User, utc_now
    from src.backend.schemas.auth import RegisterRequest
    from src.backend.services.auth_service import hash_password, register_user

    # Tạo user có sẵn username 'collision'
    u = User(
        email="collision1@example.com",
        username="collision",
        password_hash=hash_password("Pass123!"),
        is_active=True,
        created_at=utc_now(),
    )
    unit_db.add(u)
    unit_db.commit()

    # Đăng ký email khác nhưng username prefix cũng là 'collision'
    data = RegisterRequest(email="collision@example.com", password="Password123!", full_name="Col User")
    new_u = register_user(db=unit_db, data=data)
    assert new_u.username.startswith("collision_")

    # Giả lập IntegrityError khi commit
    def mock_commit():
        raise IntegrityError("mock error", params=None, orig=Exception("unique constraint"))

    monkeypatch.setattr(unit_db, "commit", mock_commit)
    with pytest.raises(EmailAlreadyExistsError):
        register_user(db=unit_db, data=RegisterRequest(email="integrity@example.com", password="Pass123!"))


def test_get_current_user_cookie_helper_branches(unit_db):
    """Kiểm tra dependency get_current_user: chỉ đọc cookie, từ chối mock token và header."""
    from unittest.mock import MagicMock

    from fastapi import HTTPException

    from src.backend.models.schema import User, utc_now
    from src.backend.services.auth_guard import get_current_user
    from src.backend.services.auth_service import create_access_token, hash_password

    # Tạo user mẫu trong unit_db
    test_user = User(
        id=999,
        username="cookie_authed_user",
        email="cookie@test.com",
        password_hash=hash_password("Pass123!"),
        is_active=True,
        created_at=utc_now(),
    )
    unit_db.add(test_user)
    unit_db.commit()

    req = MagicMock()
    req.headers = {}

    # 1. Thiếu token -> 401
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request=req, access_token=None, session=unit_db)
    assert exc_info.value.status_code == 401

    # 2. Token thật qua cookie -> 200 OK
    t, _ = create_access_token(subject="999", extra_claims={"username": "cookie_authed_user"})
    user_ok = get_current_user(request=req, access_token=t, session=unit_db)
    assert user_ok.id == 999
    assert user_ok.username == "cookie_authed_user"

    # 3. Không chấp nhận Header Authorization: Bearer (Zero-Trust chỉ nhận cookie)
    req.headers = {"Authorization": f"Bearer {t}"}
    with pytest.raises(HTTPException) as exc_header:
        get_current_user(request=req, access_token=None, session=unit_db)
    assert exc_header.value.status_code == 401

    # 4. Token không chứa ID hợp lệ (non-integer) -> 401
    bad_id_token, _ = create_access_token(subject="not_an_int")
    with pytest.raises(HTTPException) as exc_int:
        get_current_user(request=req, access_token=bad_id_token, session=unit_db)
    assert exc_int.value.status_code == 401



def test_register_with_initial_goal_validations(unit_db):
    """Kiểm tra các ngoại lệ validation khi gọi register_with_initial_goal."""
    from fastapi import HTTPException

    from src.backend.models.schema import User, utc_now
    from src.backend.services.auth_service import hash_password, register_with_initial_goal

    # 1. Username rỗng
    with pytest.raises(HTTPException) as e1:
        register_with_initial_goal(session=unit_db, username="", email="u@test.com", password="Pass123!")
    assert e1.value.status_code == 400

    # 2. Email sai định dạng
    with pytest.raises(HTTPException) as e2:
        register_with_initial_goal(session=unit_db, username="user1", email="bad-email", password="Pass123!")
    assert e2.value.status_code == 400

    # 3. Mật khẩu yếu
    with pytest.raises(HTTPException) as e3:
        register_with_initial_goal(session=unit_db, username="user1", email="u@test.com", password="123")
    assert e3.value.status_code == 422

    # 4. Trùng username
    u = User(
        username="taken_user", email="taken@test.com", password_hash=hash_password("Pass123!"), created_at=utc_now()
    )
    unit_db.add(u)
    unit_db.commit()

    with pytest.raises(HTTPException) as e4:
        register_with_initial_goal(
            session=unit_db, username="taken_user", email="other@test.com", password="Password123!"
        )
    assert e4.value.status_code == 400
