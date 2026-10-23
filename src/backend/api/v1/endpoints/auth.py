"""
src/backend/api/v1/endpoints/auth.py
Điểm truy cập xác thực tập trung, thống nhất với src/backend/routers/auth_goal_router.py.
Loại bỏ hoàn toàn xung đột handler trùng path.
"""

from src.backend.routers.auth_goal_router import router

__all__ = ["router"]
