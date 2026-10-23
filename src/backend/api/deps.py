"""
src/backend/api/deps.py
Các FastAPI Dependencies cho phân hệ Xác thực & Bảo mật.
Re-export từ src/backend/services/auth_guard để đảm bảo một điểm định nghĩa duy nhất.
"""

from fastapi.security import HTTPBearer

from src.backend.models.database import get_session
from src.backend.services.auth_guard import (
    AuthenticatedUser,
    get_current_active_user,
    get_current_user,
)

# get_db là alias của get_session
get_db = get_session
security = HTTPBearer(auto_error=False)

__all__ = [
    "AuthenticatedUser",
    "get_current_active_user",
    "get_current_user",
    "get_db",
    "get_session",
    "security",
]
