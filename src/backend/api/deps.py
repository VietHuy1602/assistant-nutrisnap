"""
src/backend/api/deps.py
Các FastAPI Dependencies cho phân hệ Xác thực & Bảo mật (Phần 2 / Phase 3).
- HTTPBearer(auto_error=False) hỗ trợ nút Authorize trên Swagger UI.
- get_current_user: Trích xuất và giải mã Bearer Token, kiểm tra sự tồn tại của User.
- get_current_active_user: Xác thực người dùng đang ở trạng thái hoạt động (is_active=True).
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from src.backend.exceptions.auth import InvalidTokenError, TokenExpiredError
from src.backend.models.database import get_session
from src.backend.models.schema import User
from src.backend.services.auth_service import decode_access_token

# Khởi tạo HTTPBearer không tự động ném lỗi để kiểm soát lỗi tùy chỉnh chuẩn RFC 6750
security = HTTPBearer(auto_error=False)

# get_db là alias của get_session để tương thích với quy ước FastAPI
get_db = get_session


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_session),
) -> User:
    """Dependency trích xuất và giải mã JWT Access Token từ Header Authorization: Bearer <token>.

    - Thiếu header / token -> 401 Unauthorized + WWW-Authenticate: Bearer
    - Token sai / hết hạn / không hợp lệ -> 401 Unauthorized
    - User không tồn tại trong CSDL -> 401 Unauthorized
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Không tìm thấy thông tin xác thực Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials.strip()

    try:
        payload = decode_access_token(token)
    except (InvalidTokenError, TokenExpiredError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Không thể xác thực thông tin đăng nhập",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user_id_raw = payload.get("sub")
    if not user_id_raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Không thể xác thực thông tin đăng nhập",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(user_id_raw)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Không thể xác thực thông tin đăng nhập",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Không thể xác thực thông tin đăng nhập",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency bảo vệ route, kiểm tra trạng thái kích hoạt của người dùng.

    Nếu tài khoản bị vô hiệu hóa (is_active = False), từ chối truy cập với HTTP 403 Forbidden.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị vô hiệu hóa",
        )
    return current_user
