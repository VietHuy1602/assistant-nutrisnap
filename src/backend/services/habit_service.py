"""
src/backend/services/habit_service.py
Dịch vụ Quản lý Thói quen (Habit Tracker Service) và Báo cáo Tháng (Monthly Report).
Tuân thủ đặc tả Tuần 6 & Zero-Trust Data Isolation:
1. Tính chuỗi ngày duy trì thói quen: current_streak, longest_streak, logged_dates_last_7_days.
2. Tiến độ thử thách 7 ngày: completed_days, progress_pct, is_completed, badge_name.
3. Chế độ "Quay lại đường đua" không phạt lỗi (Non-punitive Back-on-Track Mode):
   - calorie_penalty_applied = False (tuyệt đối không phạt cắt calo)
   - next_day_target_calories = tdee_calories
   - Lời nhắn khích lệ ấm áp, không phán xét và gợi ý micro-action.
4. Tổng hợp Báo cáo Tháng (generate_monthly_report):
   - logging_summary (số ngày ghi, tổng bữa ăn, tỷ lệ kiên trì %)
   - weight_summary (cân nặng đầu/cuối kỳ, biến động thực tế & EMA)
   - nutrition_summary (calo, đạm, carbs, fat trung bình/ngày so với TDEE)
   - strengths (trích xuất điểm mạnh tất định hoặc fallback khích lệ)
   - habit_summary & disclaimer.
"""

import calendar
from datetime import date, timedelta
from typing import Any

from sqlmodel import Session, select

from src.backend.models.schema import (
    FoodReference,
    Goal,
    Meal,
    MealItem,
    WeightLog,
    get_vn_today,
)
from src.backend.services.weight_trend import calculate_ema_series

REPORT_DISCLAIMER_TEXT = (
    "Số liệu báo cáo tháng được tổng hợp tất định phục vụ theo dõi thói quen dinh dưỡng, "
    "không thay thế chẩn đoán y khoa chuyên nghiệp."
)
HABIT_STATUS_DISCLAIMER = (
    "Số liệu thói quen và chuỗi ngày duy trì mang tính chất khích lệ, "
    "đồng hành cùng bạn trên hành trình chăm sóc sức khỏe."
)


def _extract_meal_date(meal_or_dt: Any) -> date:
    """Helper trích xuất kiểu date an toàn từ datetime, Meal hoặc chuỗi ISO."""
    if hasattr(meal_or_dt, "logged_at"):
        val = meal_or_dt.logged_at
    else:
        val = meal_or_dt

    if hasattr(val, "date") and callable(val.date):
        return val.date()
    if isinstance(val, date):
        return val
    return date.fromisoformat(str(val)[:10])


# ==============================================================================
# 1. TÍNH CHUỖI NGÀY DUY TRÌ THÓI QUEN (STREAK CALCULATION)
# ==============================================================================


def calculate_user_streak(
    session: Session,
    authenticated_user_id: int,
    reference_date: date | None = None,
) -> dict[str, Any]:
    """Truy vấn danh sách các ngày duy nhất mà user_id có ít nhất 1 bữa ăn trong bảng meals:

    - current_streak: Số ngày liên tiếp tính đến reference_date (hoặc reference_date - 1 ngày
      nếu hôm nay chưa kịp ghi bữa ăn nhưng hôm qua đã ghi).
    - longest_streak: Chuỗi ngày ghi nhật ký liên tiếp dài nhất từ trước đến nay.
    - total_logged_days: Tổng số ngày có ghi nhật ký ẩm thực.
    - logged_dates_last_7_days: Danh sách các ngày (YYYY-MM-DD) đã ghi trong 7 ngày gần nhất.
    """
    ref_date = reference_date or get_vn_today()

    meals = session.exec(
        select(Meal)
        .where(Meal.user_id == authenticated_user_id)
        .order_by(Meal.logged_at.asc())
    ).all()

    distinct_dates: set[date] = {_extract_meal_date(m) for m in meals}
    sorted_dates = sorted(distinct_dates)
    total_logged_days = len(sorted_dates)

    # 1. Tính current_streak
    if not sorted_dates:
        current_streak = 0
    else:
        if ref_date in distinct_dates:
            check_date: date | None = ref_date
        elif (ref_date - timedelta(days=1)) in distinct_dates:
            check_date = ref_date - timedelta(days=1)
        else:
            check_date = None

        if check_date is None:
            current_streak = 0
        else:
            current_streak = 0
            cur = check_date
            while cur in distinct_dates:
                current_streak += 1
                cur -= timedelta(days=1)

    # 2. Tính longest_streak
    if not sorted_dates:
        longest_streak = 0
    else:
        longest_streak = 1
        current_run = 1
        for i in range(1, len(sorted_dates)):
            if sorted_dates[i] == sorted_dates[i - 1] + timedelta(days=1):
                current_run += 1
            elif sorted_dates[i] > sorted_dates[i - 1] + timedelta(days=1):
                current_run = 1
            if current_run > longest_streak:
                longest_streak = current_run

    # 3. Danh sách ngày ghi trong cửa sổ 7 ngày gần nhất [ref_date - 6 ngày, ref_date]
    seven_days_start = ref_date - timedelta(days=6)
    logged_dates_last_7_days = [
        d.isoformat()
        for d in sorted_dates
        if seven_days_start <= d <= ref_date
    ]

    return {
        "user_id": authenticated_user_id,
        "reference_date": ref_date.isoformat(),
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "total_logged_days": total_logged_days,
        "logged_dates_last_7_days": logged_dates_last_7_days,
    }


# ==============================================================================
# 2. TIẾN ĐỘ THỬ THÁCH 7 NGÀY (SEVEN DAY CHALLENGE)
# ==============================================================================


def get_seven_day_challenge_status(
    session: Session,
    authenticated_user_id: int,
    reference_date: date | None = None,
) -> dict[str, Any]:
    """Kiểm tra cửa sổ 7 ngày gần nhất [reference_date - 6 days, reference_date]:

    - window_start: Ngày bắt đầu cửa sổ (YYYY-MM-DD)
    - window_end: Ngày kết thúc cửa sổ (YYYY-MM-DD)
    - completed_days: Số ngày có ghi nhật ký bữa ăn trong 7 ngày qua (0 - 7)
    - target_days: Mặc định là 7
    - progress_pct: round((completed_days / 7) * 100, 1)
    - is_completed: True nếu completed_days == 7
    - badge_name:
      * 7/7: 'Chiến binh 7 Ngày Bền Bỉ'
      * >= 5: 'Người Đồng Hành Đều Đặn'
      * >= 3: 'Khởi Đầu Vững Chắc'
      * còn lại: 'Hành Trình Mới'
    """
    ref_date = reference_date or get_vn_today()
    window_start = ref_date - timedelta(days=6)
    window_end = ref_date

    meals = session.exec(
        select(Meal)
        .where(Meal.user_id == authenticated_user_id)
        .order_by(Meal.logged_at.asc())
    ).all()

    distinct_dates: set[date] = {_extract_meal_date(m) for m in meals}
    completed_days = sum(1 for d in distinct_dates if window_start <= d <= window_end)

    target_days = 7
    progress_pct = round((completed_days / float(target_days)) * 100.0, 1)
    is_completed = (completed_days == target_days)

    if completed_days == 7:
        badge_name = "Chiến binh 7 Ngày Bền Bỉ"
    elif completed_days >= 5:
        badge_name = "Người Đồng Hành Đều Đặn"
    elif completed_days >= 3:
        badge_name = "Khởi Đầu Vững Chắc"
    else:
        badge_name = "Hành Trình Mới"

    return {
        "user_id": authenticated_user_id,
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "completed_days": completed_days,
        "target_days": target_days,
        "progress_pct": progress_pct,
        "is_completed": is_completed,
        "badge_name": badge_name,
    }


# ==============================================================================
# 3. CHẾ ĐỘ QUAY LẠI ĐƯỜNG ĐUA KHÔNG PHẠT LỖI (BACK-ON-TRACK MODE)
# ==============================================================================


def evaluate_back_on_track_mode(
    session: Session,
    authenticated_user_id: int,
    reference_date: date | None = None,
) -> dict[str, Any]:
    """Đánh giá trạng thái quay lại đường đua:

    - Tuyệt đối không phạt cắt giảm calo (calorie_penalty_applied = False).
    - Giữ nguyên hạn mức ngày tiếp theo bằng tdee_calories (next_day_target_calories = tdee_calories).
    - Phát hiện ngày gián đoạn (quên ghi hôm qua sau chuỗi ngày có ghi) hoặc ngày ăn vượt hạn mức calo.
    - Trả về lời nhắn khích lệ ấm áp và hành động nhỏ (micro-action).
    """
    ref_date = reference_date or get_vn_today()

    goal = session.exec(
        select(Goal).where(Goal.user_id == authenticated_user_id)
    ).first()
    if goal and goal.tdee_calories:
        tdee_calories = float(goal.tdee_calories)
    elif goal and goal.target_calories:
        tdee_calories = float(goal.target_calories)
    else:
        tdee_calories = 2000.0

    all_meals = session.exec(
        select(Meal)
        .where(Meal.user_id == authenticated_user_id)
        .order_by(Meal.logged_at.asc())
    ).all()

    distinct_dates = {_extract_meal_date(m) for m in all_meals}

    # Nếu người dùng hoàn toàn chưa từng ghi bữa ăn nào trong lịch sử
    if not distinct_dates:
        return {
            "back_on_track_active": False,
            "trigger_reason": "on_track",
            "calorie_penalty_applied": False,
            "next_day_target_calories": tdee_calories,
            "encouragement_message": (
                "Chào mừng bạn đến với NutriSnap! Hãy bắt đầu ghi nhận bữa ăn đầu tiên hôm nay nhé."
            ),
            "suggested_micro_action": "Chụp ảnh hoặc ghi nhận 1 bữa ăn đơn giản hôm nay.",
        }

    yesterday = ref_date - timedelta(days=1)
    yesterday_meals = [m for m in all_meals if _extract_meal_date(m) == yesterday]

    back_on_track_active = False
    trigger_reason = "on_track"

    if yesterday_meals:
        # Hôm qua có ghi bữa ăn -> Kiểm tra tổng calo ngày hôm qua
        y_meal_ids = [m.id for m in yesterday_meals if m.id is not None]
        if y_meal_ids:
            items = session.exec(
                select(MealItem, FoodReference)
                .join(FoodReference, MealItem.food_id == FoodReference.id)
                .where(MealItem.meal_id.in_(y_meal_ids))
            ).all()
            yesterday_calories = sum(
                mi.estimated_calories or ((mi.estimated_gram / 100.0) * ref.calories_per_100g)
                for mi, ref in items
            )
        else:
            yesterday_calories = 0.0

        # Kiểm tra nếu ngày hôm qua nạp vượt 115% mục tiêu calo (TDEE)
        if yesterday_calories > (tdee_calories * 1.15):
            back_on_track_active = True
            trigger_reason = "over_target_calories"
        else:
            back_on_track_active = False
            trigger_reason = "on_track"
    else:
        # Hôm qua không ghi nhật ký -> Kiểm tra xem trước đó người dùng đã từng ghi nhật ký hay chưa
        prior_dates = [d for d in distinct_dates if d < yesterday]
        if prior_dates:
            back_on_track_active = True
            trigger_reason = "missed_day"
        else:
            back_on_track_active = False
            trigger_reason = "on_track"

    if trigger_reason == "over_target_calories":
        encouragement_message = (
            "Một ngày ăn vượt mục tiêu không định nghĩa cả hành trình của bạn. "
            "Cơ thể luôn có khả năng cân bằng tự nhiên, hãy tiếp tục lắng nghe và nuôi dưỡng cơ thể hôm nay!"
        )
        suggested_micro_action = (
            "Uống một ly nước ấm và bắt đầu ngày mới với một bữa ăn thanh nhẹ giàu chất xơ và đạm."
        )
    elif trigger_reason == "missed_day":
        encouragement_message = (
            "Bỏ lỡ một ngày ghi nhật ký là điều hoàn toàn bình thường trong cuộc sống bận rộn. "
            "Bạn luôn có thể quay lại đường đua bất cứ lúc nào!"
        )
        suggested_micro_action = (
            "Ghi nhận 1 bữa ăn lành mạnh hôm nay để tiếp tục nhịp điệu thói quen nhé."
        )
    else:
        encouragement_message = (
            "Bạn đang duy trì nhịp điệu rất tuyệt vời! "
            "Tiếp tục lắng nghe cơ thể và duy trì thói quen tích cực này nhé."
        )
        suggested_micro_action = "Tiếp tục duy trì bữa ăn đủ chất và uống đủ nước trong ngày."

    return {
        "back_on_track_active": back_on_track_active,
        "trigger_reason": trigger_reason,
        "calorie_penalty_applied": False,
        "next_day_target_calories": tdee_calories,
        "encouragement_message": encouragement_message,
        "suggested_micro_action": suggested_micro_action,
    }


# ==============================================================================
# 4. TỔNG HỢP TRẠNG THÁI THÓI QUEN (GET HABIT TRACKER SUMMARY)
# ==============================================================================


def get_habit_tracker_summary(
    session: Session,
    authenticated_user_id: int,
    reference_date: date | None = None,
) -> dict[str, Any]:
    """Tổng hợp trạng thái Habit Tracker phục vụ component HabitCalendar.tsx trên Frontend:

    - streak: Thông tin chuỗi ngày liên tiếp
    - seven_day_challenge: Tiến độ thử thách 7 ngày
    - back_on_track: Trạng thái quay lại đường đua không phạt lỗi
    """
    ref_date = reference_date or get_vn_today()
    streak_info = calculate_user_streak(session, authenticated_user_id, ref_date)
    challenge_info = get_seven_day_challenge_status(session, authenticated_user_id, ref_date)
    back_on_track_info = evaluate_back_on_track_mode(session, authenticated_user_id, ref_date)

    return {
        "user_id": authenticated_user_id,
        "reference_date": ref_date.isoformat(),
        "current_streak": streak_info["current_streak"],
        "longest_streak": streak_info["longest_streak"],
        "total_logged_days": streak_info["total_logged_days"],
        "logged_dates_last_7_days": streak_info["logged_dates_last_7_days"],
        "streak": streak_info,
        "seven_day_challenge": challenge_info,
        "back_on_track": back_on_track_info,
        "disclaimer": HABIT_STATUS_DISCLAIMER,
    }


# ==============================================================================
# 5. TẠO BÁO CÁO THÁNG (GENERATE MONTHLY REPORT)
# ==============================================================================


def generate_monthly_report(
    session: Session,
    authenticated_user_id: int,
    year: int | None = None,
    month: int | None = None,
    days: int = 30,
    reference_date: date | None = None,
) -> dict[str, Any]:
    """Tạo báo cáo tổng hợp tháng hoặc khoảng ngày theo đặc tả Tuần 6:

    1. logging_summary: tổng ngày ghi, tổng bữa ăn, tỷ lệ kiên trì (%)
    2. weight_summary: cân nặng đầu/cuối kỳ, biến động thực tế & chuỗi EMA
    3. nutrition_summary: năng lượng & macro trung bình/ngày so với TDEE
    4. habit_summary: chuỗi streak, thử thách 7 ngày, back-on-track
    5. strengths: trích xuất điểm mạnh tích cực tất định hoặc fallback khích lệ
    6. disclaimer: văn bản miễn trừ trách nhiệm y khoa chuẩn mực
    """
    ref_date = reference_date or get_vn_today()

    # 1. Xác định kỳ báo cáo
    if year is not None and month is not None:
        if month < 1 or month > 12:
            raise ValueError("month phải nằm trong khoảng từ 1 đến 12")
        _, last_day = calendar.monthrange(year, month)
        start_date = date(year, month, 1)
        end_date = date(year, month, last_day)
        period_days = (end_date - start_date).days + 1
    else:
        end_date = ref_date
        start_date = end_date - timedelta(days=days - 1)
        period_days = days

    # 2. Truy vấn dữ liệu bữa ăn trong kỳ của authenticated_user_id
    all_meals = session.exec(
        select(Meal)
        .where(Meal.user_id == authenticated_user_id)
        .order_by(Meal.logged_at.asc())
    ).all()

    period_meals = [
        m for m in all_meals
        if start_date <= _extract_meal_date(m) <= end_date
    ]
    logged_dates = {_extract_meal_date(m) for m in period_meals}
    total_logged_days = len(logged_dates)
    total_meals_logged = len(period_meals)
    consistency_rate_pct = (
        round((total_logged_days / float(period_days)) * 100.0, 1)
        if period_days > 0
        else 0.0
    )

    logging_summary = {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "period_days": period_days,
        "total_logged_days": total_logged_days,
        "total_meals_logged": total_meals_logged,
        "consistency_rate_pct": consistency_rate_pct,
    }

    # 3. Biến động cân nặng (weight_summary)
    all_weights = session.exec(
        select(WeightLog)
        .where(WeightLog.user_id == authenticated_user_id)
        .order_by(WeightLog.logged_date.asc())
    ).all()

    period_weights = [
        w for w in all_weights
        if start_date <= w.logged_date <= end_date
    ]

    if period_weights:
        start_weight_kg = period_weights[0].weight_kg
        end_weight_kg = period_weights[-1].weight_kg
        raw_weight_change_kg = round(end_weight_kg - start_weight_kg, 2)
        weights_series = [w.weight_kg for w in period_weights]
        ema_series = calculate_ema_series(weights_series, alpha=0.1)
        ema_start_kg = ema_series[0]
        ema_end_kg = ema_series[-1]
        ema_weight_change_kg = round(ema_end_kg - ema_start_kg, 2)

        if len(period_weights) < 2:
            trend_direction = "stable"
        else:
            if ema_weight_change_kg <= -0.15:
                trend_direction = "decreasing"
            elif ema_weight_change_kg >= 0.15:
                trend_direction = "increasing"
            else:
                trend_direction = "stable"

        weight_summary = {
            "start_weight_kg": start_weight_kg,
            "end_weight_kg": end_weight_kg,
            "raw_weight_change_kg": raw_weight_change_kg,
            "ema_start_kg": ema_start_kg,
            "ema_end_kg": ema_end_kg,
            "ema_weight_change_kg": ema_weight_change_kg,
            "trend_direction": trend_direction,
            "records_count": len(period_weights),
        }
    else:
        weight_summary = {
            "start_weight_kg": None,
            "end_weight_kg": None,
            "raw_weight_change_kg": None,
            "ema_start_kg": None,
            "ema_end_kg": None,
            "ema_weight_change_kg": None,
            "trend_direction": "insufficient_data",
            "records_count": 0,
        }

    # 4. Dinh dưỡng trung bình ngày (nutrition_summary)
    daily_calories: dict[date, float] = {d: 0.0 for d in logged_dates}
    daily_protein: dict[date, float] = {d: 0.0 for d in logged_dates}
    daily_carbs: dict[date, float] = {d: 0.0 for d in logged_dates}
    daily_fat: dict[date, float] = {d: 0.0 for d in logged_dates}
    breakfast_dates: set[date] = set()

    for m in period_meals:
        m_type = m.meal_type.strip().lower()
        if m_type in {"sáng", "breakfast"}:
            breakfast_dates.add(_extract_meal_date(m))

    meal_ids = [m.id for m in period_meals if m.id is not None]
    meal_date_map = {m.id: _extract_meal_date(m) for m in period_meals}

    if meal_ids:
        items = session.exec(
            select(MealItem, FoodReference)
            .join(FoodReference, MealItem.food_id == FoodReference.id)
            .where(MealItem.meal_id.in_(meal_ids))
        ).all()
        for mi, ref in items:
            d = meal_date_map.get(mi.meal_id)
            if d:
                gram = mi.estimated_gram
                cal = mi.estimated_calories or ((gram / 100.0) * ref.calories_per_100g)
                prot = (gram / 100.0) * ref.protein_per_100g
                carb = (gram / 100.0) * ref.carbs_per_100g
                fat = (gram / 100.0) * ref.fat_per_100g
                daily_calories[d] += cal
                daily_protein[d] += prot
                daily_carbs[d] += carb
                daily_fat[d] += fat

    if total_logged_days > 0:
        avg_daily_calories = round(sum(daily_calories.values()) / float(total_logged_days), 1)
        avg_protein_g = round(sum(daily_protein.values()) / float(total_logged_days), 1)
        avg_carbs_g = round(sum(daily_carbs.values()) / float(total_logged_days), 1)
        avg_fat_g = round(sum(daily_fat.values()) / float(total_logged_days), 1)
    else:
        avg_daily_calories = 0.0
        avg_protein_g = 0.0
        avg_carbs_g = 0.0
        avg_fat_g = 0.0

    goal = session.exec(
        select(Goal).where(Goal.user_id == authenticated_user_id)
    ).first()
    if goal and goal.tdee_calories:
        target_tdee = float(goal.tdee_calories)
    elif goal and goal.target_calories:
        target_tdee = float(goal.target_calories)
    else:
        target_tdee = 2000.0

    target_protein = float(goal.target_protein_g) if (goal and goal.target_protein_g) else 120.0
    target_carbs = float(goal.target_carbs_g) if (goal and goal.target_carbs_g) else 200.0
    target_fat = float(goal.target_fat_g) if (goal and goal.target_fat_g) else 50.0

    nutrition_summary = {
        "avg_daily_calories": avg_daily_calories,
        "avg_protein_g": avg_protein_g,
        "avg_carbs_g": avg_carbs_g,
        "avg_fat_g": avg_fat_g,
        "target_tdee_calories": target_tdee,
        "target_protein_g": target_protein,
        "target_carbs_g": target_carbs,
        "target_fat_g": target_fat,
    }

    # 5. habit_summary
    habit_summary = get_habit_tracker_summary(
        session=session,
        authenticated_user_id=authenticated_user_id,
        reference_date=end_date,
    )

    # 6. Trích xuất Điểm mạnh trong tháng (strengths)
    strengths: list[str] = []
    longest_streak = habit_summary["longest_streak"]

    # Điểm mạnh 1: total_logged_days >= 5 hoặc consistency_rate_pct >= 50
    if total_logged_days >= 5 or consistency_rate_pct >= 50.0:
        strengths.append(
            f"Duy trì thói quen ghi nhật ký ẩm thực đáng khen ngợi ({total_logged_days} ngày)."
        )

    # Điểm mạnh 2: longest_streak >= 3
    if longest_streak >= 3:
        strengths.append(
            f"Thiết lập chuỗi {longest_streak} ngày liên tiếp đồng hành cùng NutriSnap."
        )

    # Điểm mạnh 3: Bữa sáng >= 60% số ngày ghi
    breakfast_ratio = (len(breakfast_dates) / float(total_logged_days)) if total_logged_days > 0 else 0.0
    if total_logged_days > 0 and breakfast_ratio >= 0.60:
        strengths.append("Giữ vững thói quen ăn sáng đều đặn giúp ổn định năng lượng.")

    # Điểm mạnh 4: avg_protein_g đạt >= 80% mục tiêu đạm
    if total_logged_days > 0 and target_protein > 0 and avg_protein_g >= (0.80 * target_protein):
        strengths.append("Cung cấp nguồn Protein tốt hỗ trợ duy trì cơ bắp.")

    # Điểm mạnh 5: avg_daily_calories nằm trong khoảng +/- 15% so với target_tdee_calories
    if total_logged_days > 0 and (target_tdee * 0.85 <= avg_daily_calories <= target_tdee * 1.15):
        strengths.append("Kiểm soát tổng năng lượng nạp vào sát với mục tiêu cá nhân.")

    # Fallback khích lệ: nếu chưa đạt bất kỳ tiêu chí nào (hoặc người dùng mới bắt đầu)
    if not strengths:
        strengths.append(
            "Đã chủ động bắt đầu hành trình theo dõi dinh dưỡng và lắng nghe cơ thể cùng NutriSnap."
        )

    month_str = f"{start_date.year:04d}-{start_date.month:02d}"
    daily_rows = [
        {
            "date": d.isoformat(),
            "state": "available",
            "calories": round(daily_calories[d], 1),
            "proteinG": round(daily_protein[d], 1),
            "carbsG": round(daily_carbs[d], 1),
            "fatG": round(daily_fat[d], 1),
        }
        for d in sorted(logged_dates)
    ]

    return {
        "user_id": authenticated_user_id,
        "period": {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "period_days": period_days,
        },
        "logging_summary": logging_summary,
        "weight_summary": weight_summary,
        "nutrition_summary": nutrition_summary,
        "habit_summary": habit_summary,
        "strengths": strengths,
        "disclaimer": REPORT_DISCLAIMER_TEXT,
        # Bí danh tiện lợi tương thích ngược
        "total_logged_days": total_logged_days,
        "total_meals_logged": total_meals_logged,
        "consistency_rate_pct": consistency_rate_pct,
        # Tương thích Frontend MonthlyReportView
        "month": month_str,
        "source": "verified",
        "days": daily_rows,
        "summary": {
            "totalCalories": round(sum(daily_calories.values()), 1),
            "averageDailyCalories": avg_daily_calories,
        },
    }
