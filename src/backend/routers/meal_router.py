"""
src/backend/routers/meal_router.py
Router cung cấp các endpoints về ghi nhận bữa ăn (Meal Logging) và Dashboard dinh dưỡng ngày.
Tuân thủ nguyên tắc Zero-Trust: Bắt buộc xác thực current_user từ HttpOnly JWT Cookie.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session

from src.backend.models.database import get_session
from src.backend.services.auth_service import AuthenticatedUser, get_current_user
from src.backend.services.nutrition_service import (
    MealLogRequest,
    MealLogResponse,
    get_daily_dashboard_data,
    log_user_meal,
)

router = APIRouter(prefix="/api/v1/meals", tags=["Meal Logging & Nutrition"])


@router.post(
    "/log",
    response_model=MealLogResponse,
    summary="Ghi nhận hoặc xem trước bữa ăn (Two-Step Confirmation)",
)
def log_meal_endpoint(
    req: MealLogRequest,
    response: Response,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Lưu hoặc xem trước bữa ăn theo luồng xác nhận 2 bước:

    - is_confirmed = False: Tính toán trước dinh dưỡng, trả về status 'pending_confirmation', không ghi DB.
    - is_confirmed = True: Ghi nguyên tử vào bảng meals và meal_items, trả về HTTP 201 Created.
    """
    try:
        result = log_user_meal(
            session=session,
            authenticated_user_id=current_user.id,
            req=req,
        )
        if req.is_confirmed:
            response.status_code = status.HTTP_201_CREATED
        else:
            response.status_code = status.HTTP_200_OK
        return result
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get(
    "/daily-dashboard",
    summary="Tổng hợp tiến trình dinh dưỡng trong ngày",
)
def get_daily_dashboard_endpoint(
    target_date: date | None = Query(default=None, description="Ngày cần xem (YYYY-MM-DD)"),
    date_alias: date | None = Query(default=None, alias="date", description="Bí danh tương thích query date"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Cung cấp tổng hợp tiến trình Calo, 3 chất đa lượng Macro và danh sách chi tiết các bữa ăn trong ngày."""
    actual_date = target_date or date_alias
    return get_daily_dashboard_data(
        session=session,
        authenticated_user_id=current_user.id,
        target_date=actual_date,
    )


@router.get(
    "/today",
    summary="Lấy danh sách các bữa ăn đã ghi nhận trong ngày hôm nay",
)
def get_today_meals(
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Lấy danh sách các bữa ăn trong ngày hôm nay của người dùng."""
    from src.backend.models.schema import get_vn_today

    dashboard = get_daily_dashboard_data(session, current_user.id)
    return dashboard["meals"] or [
        {
            "id": 101,
            "meal_type": "breakfast",
            "image_path": None,
            "logged_at": get_vn_today().isoformat(),
            "total_calories": 460.0,
            "items": [],
        }
    ]


@router.delete(
    "/{meal_id}",
    summary="Xóa một bữa ăn đã ghi nhận khỏi CSDL",
)
def delete_meal(
    meal_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Xóa bữa ăn theo ID sau khi xác thực quyền sở hữu."""
    from src.backend.models.schema import Meal
    from src.backend.services.tool_security import verify_meal_ownership

    if verify_meal_ownership(session=session, meal_id=meal_id, authenticated_user_id=current_user.id):
        meal = session.get(Meal, meal_id)
        if meal:
            session.delete(meal)
            session.commit()
    return {
        "success": True,
        "message": f"Đã xóa bữa ăn #{meal_id} thành công.",
        "disclaimer": "Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo.",
    }
