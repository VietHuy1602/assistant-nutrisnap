"""
src/backend/services/weight_trend.py
Dịch vụ Phân tích Xu hướng Cân nặng làm mịn bằng Thuật toán EMA (Exponential Moving Average)
và Khóa An Toàn Hạn Mức Calo Hàng Ngày (Non-punitive Calorie Stability).
Tuân thủ đặc tả Tuần 5 & Pair Session 5 Cặp 1:
1. Thuật toán làm mịn cân nặng: EMA_t = round(alpha * W_t + (1 - alpha) * EMA_{t-1}, 2), mặc định alpha = 0.1.
2. Khóa an toàn calo: Không tự động cắt giảm hạn mức calo ngày tiếp theo dù hôm qua ăn vượt mức (penalty_applied = 0.0).
3. Bảo mật Zero-Trust: Chỉ truy vấn dữ liệu của authenticated_user_id.
"""

import math
from datetime import date, datetime, timedelta
from typing import Any

from sqlmodel import Session, select

from src.backend.models.schema import Goal, WeightLog, get_vn_today
from src.backend.services.nutrition_service import DISCLAIMER_TEXT

DEFAULT_EMA_ALPHA = 0.1
WEIGHT_TREND_DISCLAIMER = "Số liệu cân nặng và xu hướng EMA chỉ mang tính chất theo dõi tham khảo."

# Ngưỡng cân nặng hợp lệ dùng chung toàn hệ thống (khớp với WeightLogRequest & GoalPlanInput trong api_contract.py: 25.0 - 300.0 kg)
MIN_VALID_WEIGHT_KG: float = 25.0
MAX_VALID_WEIGHT_KG: float = 300.0


# ==============================================================================
# 1. THUẬT TOÁN LÀM MỊN XU HƯỚNG CÂN NẶNG EMA (CALCULATE EMA WEIGHT TREND)
# ==============================================================================


def calculate_ema_points(
    data_points: list[Any],
    alpha: float = DEFAULT_EMA_ALPHA,
) -> list[dict[str, Any]]:
    """Tính toán chuỗi điểm xu hướng cân nặng làm mịn bằng thuật toán EMA thuần túy (Pure Function).

    Quy tắc chuẩn hóa và tính toán:
    1. Kiểm tra tham số: 0 < alpha <= 1.0 (ngoài khoảng ném ValueError).
    2. Không có tác dụng phụ (Side-effect free): không đọc/ghi CSDL hay thời gian hệ thống,
       không sửa đổi danh sách đầu vào data_points.
    3. Lọc giá trị không hợp lệ: loại bỏ các điểm có cân nặng NaN, vô cực, <= 0,
       hoặc nằm ngoài ngưỡng an toàn [MIN_VALID_WEIGHT_KG, MAX_VALID_WEIGHT_KG] (25.0 - 300.0 kg).
    4. Gộp nhiều lần cân trong cùng một ngày: Nếu một ngày có nhiều lần đo, hệ thống giữ lại
       bản ghi có id lớn nhất (lần ghi nhận muộn nhất trong ngày) để đại diện cho ngày đó.
    5. Sắp xếp thứ tự thời gian: tự động sắp xếp các điểm theo ngày tăng dần.
    6. Độ chính xác float: Trong suốt vòng lặp tính toán EMA, giá trị được giữ nguyên độ chính xác
       dấu phẩy động (float), chỉ làm tròn 2 chữ số thập phân khi đóng gói kết quả đầu ra.
    7. Khoảng trống ngày: Áp dụng phương thức EMA theo lần đo thực tế (Cách A).
    8. Trường hợp biên:
       - Danh sách rỗng: trả về danh sách rỗng [].
       - Một điểm: trend_kg == weight_kg.

    Đầu vào hỗ trợ linh hoạt:
    - Danh sách tuple: (date, weight) hoặc (date, weight, id)
    - Danh sách dict: {"date": date, "weight_kg": weight, "id": id}
    - Danh sách SQLModel/object có thuộc tính: logged_date, weight_kg, id
    """
    if not isinstance(alpha, (int, float)) or alpha <= 0.0 or alpha > 1.0:
        raise ValueError("alpha phải nằm trong khoảng (0, 1.0]")

    if not data_points:
        return []

    # Nhóm và chuẩn hóa theo ngày: {date_obj: (weight_float, record_id)}
    grouped_by_date: dict[date, tuple[float, int]] = {}

    for idx, item in enumerate(data_points):
        raw_date = None
        raw_weight = None
        raw_id = idx

        if isinstance(item, (tuple, list)):
            if len(item) >= 2:
                raw_date = item[0]
                raw_weight = item[1]
            if len(item) >= 3:
                raw_id = item[2]
        elif isinstance(item, dict):
            raw_date = item.get("date") or item.get("logged_date") or item.get("day")
            raw_weight = (
                item.get("weight_kg")
                if "weight_kg" in item
                else item.get("raw_weight_kg")
                if "raw_weight_kg" in item
                else item.get("weight")
            )
            raw_id = item.get("id", idx)
        else:
            raw_date = getattr(item, "logged_date", None) or getattr(item, "date", None)
            raw_weight = getattr(item, "weight_kg", None)
            raw_id = getattr(item, "id", idx)

        if raw_date is None or raw_weight is None:
            continue

        # Chuẩn hóa date
        d_obj: date | None = None
        if isinstance(raw_date, datetime):
            d_obj = raw_date.date()
        elif isinstance(raw_date, date):
            d_obj = raw_date
        elif isinstance(raw_date, str):
            try:
                d_obj = date.fromisoformat(raw_date.strip()[:10])
            except ValueError:
                continue
        else:
            continue

        # Chuẩn hóa weight
        try:
            w_float = float(raw_weight)
        except (TypeError, ValueError):
            continue

        if math.isnan(w_float) or math.isinf(w_float) or w_float <= 0.0:
            continue

        if w_float < MIN_VALID_WEIGHT_KG or w_float > MAX_VALID_WEIGHT_KG:
            continue

        try:
            id_val = int(raw_id)
        except (TypeError, ValueError):
            id_val = idx

        # Gộp cùng ngày: giữ bản ghi có id lớn nhất (lần ghi nhận muộn nhất)
        if d_obj not in grouped_by_date:
            grouped_by_date[d_obj] = (w_float, id_val)
        else:
            _, prev_id = grouped_by_date[d_obj]
            if id_val >= prev_id:
                grouped_by_date[d_obj] = (w_float, id_val)

    sorted_dates = sorted(grouped_by_date.keys())
    if not sorted_dates:
        return []

    results: list[dict[str, Any]] = []
    ema_float = grouped_by_date[sorted_dates[0]][0]

    for i, d_obj in enumerate(sorted_dates):
        w_val = grouped_by_date[d_obj][0]
        if i == 0:
            ema_float = w_val
        else:
            ema_float = alpha * w_val + (1.0 - alpha) * ema_float

        d_str = d_obj.isoformat()
        w_rounded = round(w_val, 2)
        trend_rounded = round(ema_float, 2)

        results.append(
            {
                "date": d_str,
                "weight_kg": w_rounded,
                "trend_kg": trend_rounded,
                "raw_weight_kg": w_rounded,
                "ema_weight_kg": trend_rounded,
            }
        )

    return results


def calculate_ema_series(
    weights: list[float],
    alpha: float = DEFAULT_EMA_ALPHA,
) -> list[float]:
    """Tính toán chuỗi EMA thuần túy từ danh sách trọng số weights:

    - EMA_0 = round(W_0, 2)
    - EMA_t = round(alpha * W_t + (1 - alpha) * EMA_{t-1}, 2)
    """
    if not weights:
        return []
    if alpha <= 0.0 or alpha > 1.0:
        raise ValueError("alpha phải nằm trong khoảng (0, 1.0]")

    series: list[float] = [round(weights[0], 2)]
    for w in weights[1:]:
        val = round(alpha * float(w) + (1.0 - alpha) * series[-1], 2)
        series.append(val)
    return series


def get_user_weight_trend(
    session: Session,
    authenticated_user_id: int,
    days: int = 14,
    alpha: float = DEFAULT_EMA_ALPHA,
) -> dict[str, Any]:
    """Truy vấn bảng weight_logs của authenticated_user_id, tính chuỗi EMA,

    đánh giá xu hướng ('decreasing', 'increasing', 'stable', hoặc 'insufficient_data')
    và giữ nguyên hạn mức calo mục tiêu (calorie_penalty_applied: False).
    """
    result = calculate_ema_weight_trend(
        session=session,
        authenticated_user_id=authenticated_user_id,
        days_range=days,
        alpha=alpha,
    )
    points_count = result.get("points_count", 0)
    if points_count < 2:
        trend = "insufficient_data"
    else:
        ema_change = result.get("ema_change_kg", 0.0)
        if ema_change <= -0.15:
            trend = "decreasing"
        elif ema_change >= 0.15:
            trend = "increasing"
        else:
            trend = "stable"

    result["trend"] = trend
    result["calorie_penalty_applied"] = False
    return result


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
            "current_trend_kg": None,
            "raw_change_kg": 0.0,
            "ema_change_kg": 0.0,
            "weekly_change_kg": None,
            "weekly_change_status": "no_data",
            "disclaimer": WEIGHT_TREND_DISCLAIMER,
        }

    series = calculate_ema_points(records, alpha=alpha)
    if not series:
        return {
            "user_id": authenticated_user_id,
            "days_range": days_range,
            "alpha": alpha,
            "points_count": 0,
            "series": [],
            "start_weight_kg": None,
            "latest_weight_kg": None,
            "latest_ema_kg": None,
            "current_trend_kg": None,
            "raw_change_kg": 0.0,
            "ema_change_kg": 0.0,
            "weekly_change_kg": None,
            "weekly_change_status": "no_data",
            "disclaimer": WEIGHT_TREND_DISCLAIMER,
        }

    start_weight = series[0]["weight_kg"]
    latest_weight = series[-1]["weight_kg"]
    start_ema = series[0]["ema_weight_kg"]
    latest_ema = series[-1]["ema_weight_kg"]

    raw_change = round(latest_weight - start_weight, 2)
    ema_change = round(latest_ema - start_ema, 2)

    # Tính toán thay đổi theo tuần (weekly_change_kg) khi khoảng cách giữa 2 điểm >= 7 ngày
    d_start = date.fromisoformat(series[0]["date"])
    d_end = date.fromisoformat(series[-1]["date"])
    span_days = (d_end - d_start).days

    if span_days >= 7:
        weekly_change_kg = round(((latest_ema - start_ema) / span_days) * 7.0, 2)
        weekly_change_status = "ok"
    else:
        weekly_change_kg = None
        weekly_change_status = "insufficient_span"

    return {
        "user_id": authenticated_user_id,
        "days_range": days_range,
        "alpha": alpha,
        "points_count": len(series),
        "series": series,
        "start_weight_kg": start_weight,
        "latest_weight_kg": latest_weight,
        "latest_ema_kg": latest_ema,
        "current_trend_kg": latest_ema,
        "raw_change_kg": raw_change,
        "ema_change_kg": ema_change,
        "weekly_change_kg": weekly_change_kg,
        "weekly_change_status": weekly_change_status,
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
