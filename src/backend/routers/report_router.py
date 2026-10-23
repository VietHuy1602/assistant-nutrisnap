"""
src/backend/routers/report_router.py
Router cung cấp các API endpoint cho Báo cáo Dinh dưỡng Tháng & Quản lý Thói quen (Tuần 6):
1. GET /api/v1/reports/monthly: Báo cáo tháng (logging, cân nặng, dinh dưỡng, strengths, habit).
2. GET /api/v1/habits/status: Tổng hợp trạng thái Habit Tracker (streak, 7-day challenge, back-on-track).
Tất cả endpoints đều được bảo vệ an toàn theo nguyên tắc Zero-Trust bằng get_current_user (HttpOnly JWT Cookie).
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from src.backend.models.database import get_session
from src.backend.services.auth_guard import (
    AuthenticatedUser,
    get_current_user,
)
from src.backend.services.habit_service import (
    generate_monthly_report,
    get_habit_tracker_summary,
)

router = APIRouter(prefix="/api/v1", tags=["Reports & Habits"])


@router.get(
    "/reports/monthly",
    summary="Báo cáo Dinh dưỡng và Thói quen Tháng (Monthly Report)",
)
def get_monthly_report_endpoint(
    year: int | None = Query(default=None, description="Năm báo cáo"),
    month: int | None = Query(default=None, ge=1, le=12, description="Tháng báo cáo (1-12)"),
    days: int = Query(default=30, ge=7, le=90, description="Khoảng thời gian tính bằng số ngày (7-90 ngày)"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Tổng hợp báo cáo tháng tất định bảo mật Zero-Trust:

    - logging_summary: Số ngày ghi nhật ký, tổng số bữa ăn, tỷ lệ kiên trì (%).
    - weight_summary: Cân nặng đầu/cuối kỳ, biến động thực tế và biến động làm mịn EMA.
    - nutrition_summary: Calo, đạm, carbs, fat trung bình/ngày so với TDEE mục tiêu.
    - habit_summary: Chuỗi streak hiện tại, kỷ lục streak, tiến độ thử thách 7 ngày.
    - strengths: Trích xuất danh sách điểm mạnh tích cực của người dùng.
    - disclaimer: Văn bản khuyến cáo dinh dưỡng y khoa chuẩn mực.
    """
    try:
        return generate_monthly_report(
            session=session,
            authenticated_user_id=current_user.id,
            year=year,
            month=month,
            days=days,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get(
    "/habits/status",
    summary="Trạng thái Chuỗi thói quen và Thử thách 7 ngày",
)
def get_habits_status_endpoint(
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Truy vấn trạng thái Habit Tracker phục vụ component HabitCalendar.tsx trên Frontend:

    - streak: current_streak, longest_streak, logged_dates_last_7_days.
    - seven_day_challenge: completed_days, progress_pct, badge_name.
    - back_on_track: Trạng thái quay lại đường đua không phạt lỗi (calorie_penalty_applied = False).
    """
    return get_habit_tracker_summary(
        session=session,
        authenticated_user_id=current_user.id,
    )
