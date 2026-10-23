"""
src/backend/services/auth_service.py
Dịch vụ xác thực và quản lý tài khoản người dùng an toàn cho NutriSnap / NutriScan.

Được xây dựng theo đặc tả kỹ thuật:
- docs/README_01_AUTH_JWT_MODULE.md (Băm mật khẩu bcrypt, JWT access token, exceptions)
- docs/README_02_AUTH_API.md (Nghiệp vụ register_user, authenticate_user, timing attack mitigation)
"""

from datetime import UTC, datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, Response, status
from jose import ExpiredSignatureError, JWTError, jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, func, select

from src.backend.core.config import settings
from src.backend.exceptions.auth import (
    EmailAlreadyExistsError,
    InactiveUserError,
    InvalidCredentialsError,
    InvalidTokenError,
    TokenExpiredError,
)
from src.backend.models.schema import User, utc_now
from src.backend.schemas.auth import RegisterRequest
from src.backend.services.goal_service import (
    GoalPlanInput,
    GoalPlanResponse,
    save_or_update_user_goal,
)
from src.backend.services.validators import validate_email, validate_password

# ==============================================================================
# CẤU HÌNH PASSLIB CRYPTCONTEXT & HASHING (PHASE 3)
# ==============================================================================


pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=settings.BCRYPT_ROUNDS,
)


def hash_password(plain_password: str) -> str:
    """Băm mật khẩu bằng thuật toán bcrypt an toàn.

    Kiểm tra giới hạn 72 bytes UTF-8 của bcrypt; ném ValueError nếu vượt quá.
    """
    if len(plain_password.encode("utf-8")) > 72:
        raise ValueError("Mật khẩu không được vượt quá 72 bytes theo giới hạn chuẩn bcrypt")
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Kiểm tra mật khẩu văn bản thô so với chuỗi băm bcrypt.

    Không ném lỗi khi chuỗi băm sai định dạng – bắt ngoại lệ và trả về False.
    """
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except (ValueError, UnknownHashError, Exception):
        return False


def needs_rehash(hashed_password: str) -> bool:
    """Kiểm tra xem chuỗi băm mật khẩu có cần cập nhật lại cost factor không."""
    try:
        return pwd_context.needs_update(hashed_password)
    except Exception:
        return False


# Chuỗi hash giả lập chuẩn bị sẵn để chống timing attack / enumeration khi user không tồn tại
DUMMY_HASH: str = hash_password("nutriscan-dummy-password-for-timing-attack-protection")


# ==============================================================================
# CẤP PHÁT & GIẢI MÃ JWT TOKEN (PHASE 4)
# ==============================================================================


class TokenResult(str):
    """Chuỗi Token JWT tương thích cả hai giao diện:
    1. Chuỗi str thông thường (khi dùng trực tiếp: token = create_access_token(...)).
    2. Tuple unpack 2 phần tử (khi unpack: token, expires_in = create_access_token(...)).
    """

    expires_in: int = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

    def __new__(cls, token: str, expires_in: int | None = None):
        obj = super().__new__(cls, token)
        obj.expires_in = (
            expires_in
            if expires_in is not None
            else settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )
        return obj

    def __iter__(self):
        yield str(self)
        yield self.expires_in


TokenString = TokenResult


def create_access_token(
    subject: str | int | dict[str, Any] | None = None,
    extra_claims: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    **kwargs: Any,
) -> TokenResult:
    """Cấp phát JWT access token có thời hạn theo cấu hình hệ thống.

    Hỗ trợ linh hoạt:
    - subject: int, str hoặc dict payload.
    - data: alias tương thích với các test w3, w4, w5.
    - Trả về TokenResult hỗ trợ cả unpacking tuple (token, expires_in) lẫn dùng trực tiếp như str.
    """
    if subject is None and data is not None:
        subject = data

    now = datetime.now(timezone.utc)
    expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    issuer = settings.JWT_ISSUER
    secret_key = settings.JWT_SECRET_KEY
    algorithm = settings.JWT_ALGORITHM

    claims = dict(extra_claims or {})

    actual_subject = data if subject is None and data is not None else subject
    if actual_subject is None:
        actual_subject = "1"

    if isinstance(actual_subject, dict):
        sub_val = str(actual_subject.get("sub") or actual_subject.get("id") or actual_subject.get("user_id") or "1")
        for k, v in actual_subject.items():
            if k not in ("sub", "exp", "iat", "iss", "type") and k not in claims:
                claims[k] = v
    else:
        sub_val = str(actual_subject)

    payload = {
        "sub": sub_val,
        "iat": now,
        "exp": now + expires_delta,
        "iss": issuer,
        "type": "access",
        **claims,
    }

    token = jwt.encode(payload, secret_key, algorithm=algorithm)
    return TokenResult(token, int(expires_delta.total_seconds()))


def decode_access_token(token: str) -> dict[str, Any]:
    """Giải mã và xác thực chữ ký JWT access token.

    Ném ra TokenExpiredError khi token hết hạn.
    Ném ra InvalidTokenError khi token không hợp lệ, sai chữ ký, sai thuật toán hoặc thiếu claim bắt buộc.
    """
    if not token or not isinstance(token, str) or not token.strip():
        raise InvalidTokenError("Token rỗng hoặc không đúng định dạng")

    secret_key = settings.JWT_SECRET_KEY
    algorithm = settings.JWT_ALGORITHM
    issuer = settings.JWT_ISSUER

    try:
        payload = jwt.decode(
            token,
            secret_key,
            algorithms=[algorithm],  # BẮT BUỘC whitelist thuật toán
            issuer=issuer,
        )
    except ExpiredSignatureError as exc:
        raise TokenExpiredError("Token đã hết hạn") from exc
    except JWTError as exc:
        raise InvalidTokenError("Token không hợp lệ hoặc sai chữ ký") from exc
    except Exception as exc:
        raise InvalidTokenError(f"Lỗi giải mã token: {exc}") from exc

    if payload.get("type") != "access" or not payload.get("sub"):
        raise InvalidTokenError("Token không hợp lệ: thiếu sub hoặc type không phải access")

    return payload


# ==============================================================================
# HÀM NGHIỆP VỤ ĐĂNG KÝ & ĐĂNG NHẬP (PHẦN 2 / PHASE 2)
# ==============================================================================


def register_user(db: Session, data: RegisterRequest) -> User:
    """Đăng ký tài khoản người dùng mới (Phase 2):

    - Chuẩn hóa email lowercase
    - Kiểm tra trùng lặp email -> EmailAlreadyExistsError
    - Băm mật khẩu an toàn với bcrypt
    - Lưu vào CSDL; xử lý IntegrityError race condition -> EmailAlreadyExistsError
    """
    clean_email = data.email.strip().lower()

    existing_user = db.exec(select(User).where(func.lower(User.email) == clean_email)).first()
    if existing_user:
        raise EmailAlreadyExistsError(f"Email '{clean_email}' đã tồn tại trong hệ thống")

    hashed = hash_password(data.password)
    username_val = clean_email.split("@")[0]

    # Kiểm tra tránh trùng username nếu có
    existing_username = db.exec(select(User).where(User.username == username_val)).first()
    if existing_username:
        username_val = f"{username_val}_{int(datetime.now(UTC).timestamp())}"

    new_user = User(
        email=clean_email,
        username=username_val,
        full_name=data.full_name,
        password_hash=hashed,
        is_active=True,
        created_at=utc_now(),
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user
    except IntegrityError as exc:
        db.rollback()
        raise EmailAlreadyExistsError(f"Email '{clean_email}' đã tồn tại trong hệ thống") from exc


def authenticate_user(
    db: Session,
    email: str,
    password: str,
) -> User:
    """Xác thực người dùng khi đăng nhập (Phase 2):

    - Luôn gọi verify_password kể cả khi user không tồn tại (sử dụng DUMMY_HASH) chống timing attack.
    - Sai thông tin -> ném InvalidCredentialsError
    - Tài khoản bị khóa -> ném InactiveUserError
    - Tự động băm lại mật khẩu nếu needs_rehash trả về True
    """
    clean_email = email.strip().lower()
    user = db.exec(select(User).where((func.lower(User.email) == clean_email) | (User.username == clean_email))).first()

    if not user:
        # Chống timing attack / account enumeration
        verify_password(password, DUMMY_HASH)
        raise InvalidCredentialsError("Email hoặc mật khẩu không chính xác")

    if not verify_password(password, user.password_hash):
        raise InvalidCredentialsError("Email hoặc mật khẩu không chính xác")

    if not user.is_active:
        raise InactiveUserError("Tài khoản đã bị vô hiệu hóa")

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


# ==============================================================================
# QUẢN LÝ HTTPONLY COOKIE & TƯƠNG THÍCH NGƯỢC (NUTRISNAP)
# ==============================================================================

JWT_SECRET_KEY: str = settings.JWT_SECRET_KEY
JWT_ALGORITHM: str = settings.JWT_ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES: int = settings.ACCESS_TOKEN_EXPIRE_MINUTES
COOKIE_SECURE: bool = settings.AUTH_COOKIE_SECURE

AuthenticatedUser = User


def set_auth_cookie(
    response: Response,
    token: str | tuple[str, int],
    max_age: int | None = None,
) -> None:
    """Gắn JWT Token vào HttpOnly Cookie với cấu hình SameSite an toàn."""
    actual_token = token[0] if isinstance(token, tuple) else token
    effective_max_age = max_age if max_age is not None else settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=actual_token,
        httponly=True,
        max_age=effective_max_age,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        secure=settings.AUTH_COOKIE_SECURE,
        path="/",
    )


def delete_auth_cookie(response: Response) -> None:
    """Xóa HttpOnly Cookie khỏi trình duyệt khi người dùng đăng xuất."""
    response.delete_cookie(
        key=settings.AUTH_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )


def register_with_initial_goal(
    session: Session,
    username: str,
    email: str,
    password: str,
    initial_goal: GoalPlanInput | None = None,
) -> tuple[User, GoalPlanResponse | None]:
    """Đăng ký tài khoản người dùng kết hợp khởi tạo mục tiêu trong cùng một Transaction duy nhất."""
    clean_username = username.strip()
    clean_email = email.strip().lower()

    if not clean_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên đăng nhập không được để trống.",
        )

    if not validate_email(clean_email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Định dạng email không hợp lệ.",
        )

    is_valid_pwd, pwd_msg = validate_password(password)
    if not is_valid_pwd:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=pwd_msg,
        )

    existing_username = session.exec(select(User).where(User.username == clean_username)).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên đăng nhập đã tồn tại trong hệ thống.",
        )

    existing_email = session.exec(select(User).where(User.email == clean_email)).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email đã được đăng ký trong hệ thống.",
        )

    try:
        hashed = hash_password(password)
        new_user = User(
            username=clean_username,
            email=clean_email,
            password_hash=hashed,
            is_active=True,
            created_at=utc_now(),
        )
        session.add(new_user)
        session.flush()

        goal_response: GoalPlanResponse | None = None
        if initial_goal is not None:
            goal_response = save_or_update_user_goal(
                session=session,
                authenticated_user_id=new_user.id,  # type: ignore
                plan_input=initial_goal,
            )

        session.commit()
        session.refresh(new_user)
        return new_user, goal_response

    except Exception as exc:
        session.rollback()
        raise exc
