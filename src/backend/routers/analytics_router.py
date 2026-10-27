"""
src/backend/routers/analytics_router.py
Router cung cấp các API endpoint cho phân hệ Phân tích Dinh dưỡng & Đổi món (Tuần 5):
1. GET /api/v1/analytics/patterns: Phân tích mẫu thói quen ăn uống 7-14 ngày.
2. POST /api/v1/analytics/food-swap: Mô phỏng đổi món Food Swap Simulator.
3. GET /api/v1/analytics/weight-trend: Lấy chuỗi xu hướng cân nặng làm mịn EMA.
4. POST /api/v1/analytics/calorie-stability: Kiểm tra khóa an toàn hạn mức calo.
Tất cả endpoints đều được bảo vệ bởi get_current_user (Zero-Trust HttpOnly Cookie JWT).
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.backend.core.config import settings
from src.backend.models.database import get_session
from src.backend.services.analytics_service import (
    analyze_user_patterns,
    simulate_food_swap,
)
from src.backend.services.api_security import rate_limit_dependency
from src.backend.services.auth_guard import (
    AuthenticatedUser,
    get_current_user,
)
from src.backend.services.weight_trend import (
    calculate_ema_weight_trend,
    verify_safe_calorie_target_stability,
)

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics & Food Swap"])


# ==============================================================================
# PYDANTIC SCHEMAS
# ==============================================================================


class FoodSwapRequest(BaseModel):
    current_food_id: int | None = Field(default=None, description="ID món ăn hiện tại trong CSDL tham chiếu")
    current_food_name: str | None = Field(default=None, description="Tên món ăn hiện tại")
    portion_gram: float = Field(default=250.0, description="Khối lượng khẩu phần (gam)")
    swap_goal: str = Field(
        default="reduce_calories",
        description="Mục tiêu đổi món ('reduce_calories', 'high_protein', 'balanced_saver')",
    )
    max_budget_vnd: int | None = Field(default=None, description="Ngân sách tối đa cho món thay thế (VNĐ)")
    same_category_only: bool = Field(default=True, description="Chỉ ưu tiên món ăn trong cùng nhóm ẩm thực")
    limit: int = Field(default=5, ge=1, le=20, description="Số lượng gợi ý thay thế tối đa")


class CalorieStabilityRequest(BaseModel):
    yesterday_consumed_calories: float = Field(..., ge=0, description="Lượng calo thực tế đã nạp ngày hôm qua")


# ==============================================================================
# ROUTER ENDPOINTS
# ==============================================================================


@router.get(
    "/patterns",
    summary="Phân tích mẫu thói quen ăn uống 7-14 ngày",
)
def get_user_patterns_endpoint(
    days_range: int = Query(default=14, ge=7, le=30, description="Số ngày cần phân tích (7 - 30 ngày)"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Phân tích hành vi dinh dưỡng của người dùng đã xác thực:

    - Kiểm tra điều kiện tối thiểu 5 ngày có nhật ký (logged_days_count >= 5).
    - Phát hiện các mẫu: bỏ bữa sáng (skipping_breakfast), thiếu đạm (low_protein), ăn khuya sau 21:00 (late_night_eating).
    - Đưa ra lời khuyên hỗ trợ nhẹ nhàng, không phán xét, bảo mật dữ liệu tuyệt đối (Zero-Trust).
    """
    try:
        return analyze_user_patterns(
            session=session,
            authenticated_user_id=current_user.id,
            days_range=days_range,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/food-swap",
    summary="Mô phỏng đổi món ăn (Food Swap Simulator)",
    dependencies=[Depends(rate_limit_dependency("analytics_food_swap", settings.DATA_MUTATION_RATE_LIMIT))],
)
def food_swap_endpoint(
    req: FoodSwapRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Mô phỏng đổi món ăn bằng công thức đại số tất định từ CSDL tham chiếu:

    - So khớp món gốc và lọc ứng viên theo swap_goal ('reduce_calories', 'high_protein', 'balanced_saver').
    - Tính toán chính xác độ chênh lệch delta_calories, delta_protein_g và delta_price_vnd.
    """
    try:
        return simulate_food_swap(
            session=session,
            current_food_id=req.current_food_id,
            current_food_name=req.current_food_name,
            portion_gram=req.portion_gram,
            swap_goal=req.swap_goal,
            max_budget_vnd=req.max_budget_vnd,
            same_category_only=req.same_category_only,
            limit=req.limit,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get(
    "/weight-trend",
    summary="Tính toán xu hướng cân nặng làm mịn EMA",
)
def get_weight_trend_endpoint(
    days_range: int = Query(default=14, ge=1, le=90, description="Khoảng thời gian theo dõi (ngày)"),
    alpha: float = Query(default=0.1, gt=0.0, le=1.0, description="Hệ số làm mịn EMA (0 < alpha <= 1.0)"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Truy xuất lịch sử cân nặng và tính toán chuỗi điểm làm mịn EMA:

    - Công thức: EMA_t = round(alpha * W_t + (1 - alpha) * EMA_{t-1}, 2).
    - Bảo mật Zero-Trust: Chỉ truy vấn dữ liệu của người dùng đăng nhập.
    """
    try:
        return calculate_ema_weight_trend(
            session=session,
            authenticated_user_id=current_user.id,
            days_range=days_range,
            alpha=alpha,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/calorie-stability",
    summary="Kiểm tra khóa an toàn hạn mức calo",
    dependencies=[Depends(rate_limit_dependency("analytics_calorie_stability", settings.DATA_MUTATION_RATE_LIMIT))],
)
def verify_calorie_stability_endpoint(
    req: CalorieStabilityRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Khóa an toàn hạn mức calo hàng ngày không tự động cắt giảm calo tiêu chuẩn."""
    return verify_safe_calorie_target_stability(
        session=session,
        authenticated_user_id=current_user.id,
        yesterday_consumed_calories=req.yesterday_consumed_calories,
    )
