"""
src/backend/services/weight_trend.py
Dịch vụ Phân tích Xu hướng Cân nặng làm mịn bằng Thuật toán EMA (Exponential Moving Average)
và Khóa An Toàn Hạn Mức Calo Hàng Ngày (Non-punitive Calorie Stability).
Tuân thủ đặc tả Tuần 5 & Pair Session 5 Cặp 1:
1. Thuật toán làm mịn cân nặng: EMA_t = round(alpha * W_t + (1 - alpha) * EMA_{t-1}, 2), mặc định alpha = 0.1.
2. Khóa an toàn calo: Không tự động cắt giảm hạn mức calo ngày tiếp theo dù hôm qua ăn vượt mức (penalty_applied = 0.0).
3. Bảo mật Zero-Trust: Chỉ truy vấn dữ liệu của authenticated_user_id.
"""

from datetime import timedelta
from typing import Any

from sqlmodel import Session, select

from src.backend.models.schema import Goal, WeightLog, get_vn_today
from src.backend.services.nutrition_service import DISCLAIMER_TEXT

DEFAULT_EMA_ALPHA = 0.1
WEIGHT_TREND_DISCLAIMER = "Số liệu cân nặng và xu hướng EMA chỉ mang tính chất theo dõi tham khảo."


# ==============================================================================
# 1. THUẬT TOÁN LÀM MỊN XU HƯỚNG CÂN NẶNG EMA (CALCULATE EMA WEIGHT TREND)
# ==============================================================================


def calculate_ema_weight_trend(
    session: Session,
    authenticated_user_id: int,
    days_range: int = 14,
    alpha: float = DEFAULT_EMA_ALPHA,
) -> dict[str, Any]:
    """Tính toán chuỗi xu hướng cân nặng làm mịn bằng Exponential Moving Average (EMA):

    - Kiểm tra tham số: 0 < alpha <= 1.0 và days_range > 0.
    - Truy vấn lịch sử WeightLog của authenticated_user_id trong days_range ngày gần nhất.
    - Điểm khởi đầu t = 0: EMA_0 = round(W_0, 2).
    - Các điểm tiếp theo t >= 1: EMA_t = round(alpha * W_t + (1 - alpha) * EMA_{t-1}, 2).
    - Trả về danh sách chuỗi thời gian, độ biến thiên thô và độ biến thiên làm mịn.
    """
    if alpha <= 0.0 or alpha > 1.0:
        raise ValueError("alpha phải nằm trong khoảng (0, 1.0]")

    if days_range <= 0:
        raise ValueError("days_range phải lớn hơn 0")

    today = get_vn_today()
    start_date = today - timedelta(days=days_range - 1)

    stmt = (
        select(WeightLog)
        .where(
            WeightLog.user_id == authenticated_user_id,
            WeightLog.logged_date >= start_date,
            WeightLog.logged_date <= today,
        )
        .order_by(WeightLog.logged_date.asc(), WeightLog.id.asc())
    )
    records = session.exec(stmt).all()

    if not records:
        return {
            "user_id": authenticated_user_id,
            "days_range": days_range,
            "alpha": alpha,
            "points_count": 0,
            "series": [],
            "start_weight_kg": None,
            "latest_weight_kg": None,
            "latest_ema_kg": None,
            "raw_change_kg": 0.0,
            "ema_change_kg": 0.0,
            "disclaimer": WEIGHT_TREND_DISCLAIMER,
        }

    series: list[dict[str, Any]] = []
    ema_current = round(records[0].weight_kg, 2)

    for i, rec in enumerate(records):
        w = round(rec.weight_kg, 2)
        if i == 0:
            ema_current = w
        else:
            ema_current = round(alpha * w + (1.0 - alpha) * ema_current, 2)

        d_str = rec.logged_date.isoformat() if hasattr(rec.logged_date, "isoformat") else str(rec.logged_date)
        series.append(
            {
                "date": d_str,
                "raw_weight_kg": w,
                "ema_weight_kg": ema_current,
                "weight_kg": w,
            }
        )

    start_weight = records[0].weight_kg
    latest_weight = records[-1].weight_kg
    start_ema = series[0]["ema_weight_kg"]
    latest_ema = series[-1]["ema_weight_kg"]

    raw_change = round(latest_weight - start_weight, 2)
    ema_change = round(latest_ema - start_ema, 2)

    return {
        "user_id": authenticated_user_id,
        "days_range": days_range,
        "alpha": alpha,
        "points_count": len(series),
        "series": series,
        "start_weight_kg": start_weight,
        "latest_weight_kg": latest_weight,
        "latest_ema_kg": latest_ema,
        "raw_change_kg": raw_change,
        "ema_change_kg": ema_change,
        "disclaimer": WEIGHT_TREND_DISCLAIMER,
    }


# ==============================================================================
# 2. KHÓA AN TOÀN HẠN MỨC CALO HÀNG NGÀY (VERIFY SAFE CALORIE TARGET STABILITY)
# ==============================================================================


def verify_safe_calorie_target_stability(
    session: Session,
    authenticated_user_id: int,
    yesterday_consumed_calories: float,
) -> dict[str, Any]:
    """Khóa an toàn hạn mức calo hàng ngày:

    - Kiểm tra mục tiêu calo tiêu chuẩn từ bảng goals của người dùng.
    - Dù hôm qua người dùng nạp vượt quá TDEE (ví dụ vượt 500 hay 1000 kcal),
      hệ thống cam kết KHÔNG cắt giảm calo ngày tiếp theo (penalty_applied = 0.0).
    - Ngăn chặn triệt để vòng xoáy ăn uống thiếu kiểm soát - nhịn đói cực đoan (Binge-Restrict Cycle).
    """
    goal = session.exec(select(Goal).where(Goal.user_id == authenticated_user_id)).first()

    if goal:
        target_calories = float(goal.target_calories if goal.target_calories else goal.tdee_calories)
    else:
        target_calories = 2000.0

    return {
        "user_id": authenticated_user_id,
        "yesterday_consumed_calories": yesterday_consumed_calories,
        "baseline_target_calories": target_calories,
        "today_target_calories": target_calories,
        "target_calories": target_calories,
        "penalty_applied": 0.0,
        "is_target_locked": True,
        "safety_message": (
            "NutriSnap áp dụng nguyên tắc dinh dưỡng an toàn: "
            "không tự động cắt giảm calo cực đoan sau ngày ăn vượt mức. "
            "Mục tiêu của bạn hôm nay được giữ vững ổn định."
        ),
        "disclaimer": DISCLAIMER_TEXT,
    }
