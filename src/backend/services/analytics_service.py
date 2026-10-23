"""
src/backend/services/analytics_service.py
Dịch vụ Phân tích Hành vi Ăn uống (7-14 ngày) và Mô phỏng Đổi Món (Food Swap Simulator).
Tuân thủ chuẩn y khoa và nguyên tắc Zero-Hallucination:
1. Rào chắn dữ liệu tối thiểu 5 ngày (Minimum 5-day data rule): chỉ đưa ra nhận xét mẫu khi logged_days_count >= 5.
2. Phát hiện 3 mẫu hành vi: Bỏ bữa sáng (skipping_breakfast), Thiếu đạm (low_protein), Ăn khuya sau 21:00 (late_night_eating).
3. Đưa ra lời khuyên hỗ trợ nhẹ nhàng, không phán xét, không cắt giảm calo cực đoan.
4. Food Swap Simulator: Tính toán đại số tất định chênh lệch Calo, Macro và Chi phí VNĐ từ bảng food_references.
5. Bảo mật Zero-Trust: Chỉ truy vấn dữ liệu của authenticated_user_id.
"""

from datetime import date, timedelta
from typing import Any

from sqlmodel import Session, select

from src.backend.models.schema import (
    FoodReference,
    Goal,
    Meal,
    MealItem,
    get_vn_today,
)
from src.backend.services.nutrition_service import (
    DISCLAIMER_TEXT,
    resolve_food_reference,
)
from src.backend.services.validators import validate_portion_gram

MIN_REQUIRED_DAYS = 5
VALID_SWAP_GOALS = {"reduce_calories", "high_protein", "balanced_saver"}
INSUFFICIENT_DATA_MSG = "Cần tối thiểu 5 ngày ghi nhận nhật ký ăn uống để hệ thống phân tích mẫu thói quen chính xác."
HABIT_DISCLAIMER_TEXT = "Số liệu phân tích thói quen dinh dưỡng mang tính chất tham khảo, không thay thế chẩn đoán y khoa chuyên nghiệp."


# ==============================================================================
# 1. HÀM PHÂN LOẠI NHÓM THỰC PHẨM (CLASSIFY FOOD CATEGORY)
# ==============================================================================


def classify_food_category(food_name: str) -> str:
    """Phân nhóm thực phẩm theo đặc tả Tuần 5:

    - beverage: đồ uống
    - noodle_soup: món nước, bún/phở/mì/cháo
    - rice_dish: cơm, xôi
    - snack_bakery: bánh mì, bánh cuốn, xèo, ngọt, ăn vặt
    - vegetable_side: rau, canh, củ quả
    - protein_dish: món mặn giàu đạm còn lại (thịt, cá, tôm, trứng, đậu hũ...)
    """
    name_lower = food_name.lower()

    # Xử lý trường hợp món mặn kho nước dừa tránh nhầm lẫn sang đồ uống
    if "kho nước dừa" in name_lower or "thịt kho" in name_lower:
        return "protein_dish"

    # 1. beverage
    beverage_keywords = [
        "nước ngọt",
        "coca",
        "pepsi",
        "trà",
        "cà phê",
        "sinh tố",
        "nước ép",
        "sữa",
        "bia",
        "nước mía",
        "nước dừa",
        "matcha",
        "ca cao",
    ]
    if any(k in name_lower for k in beverage_keywords):
        return "beverage"

    # 2. noodle_soup
    noodle_keywords = [
        "phở",
        "bún",
        "hủ tiếu",
        "miến",
        "bánh canh",
        "mì",
        "nui",
        "hoành thánh",
        "cháo",
        "súp",
    ]
    if any(k in name_lower for k in noodle_keywords):
        return "noodle_soup"

    # 3. rice_dish
    rice_keywords = ["cơm", "xôi"]
    if any(k in name_lower for k in rice_keywords):
        return "rice_dish"

    # 4. snack_bakery
    snack_keywords = [
        "bánh mì",
        "bánh bao",
        "bánh cuốn",
        "bánh xèo",
        "bánh tráng",
        "gỏi cuốn",
        "khoai",
        "bắp",
        "chè",
        "bánh ngọt",
        "bánh flan",
        "kem",
    ]
    if any(k in name_lower for k in snack_keywords):
        return "snack_bakery"

    # 5. vegetable_side
    veg_keywords = [
        "rau",
        "salad",
        "canh",
        "bông cải",
        "dưa",
        "cà chua",
        "đậu bắp",
        "mướp",
        "bầu",
        "bí",
    ]
    if any(k in name_lower for k in veg_keywords):
        return "vegetable_side"

    # 6. protein_dish (mặc định cho các món đạm/thịt/cá/mặn còn lại)
    return "protein_dish"


# ==============================================================================
# 2. HÀM PHÂN TÍCH MẪU HÀNH VI 7-14 NGÀY (ANALYZE USER PATTERNS)
# ==============================================================================


def analyze_user_patterns(
    session: Session,
    authenticated_user_id: int,
    days_range: int = 14,
    days: int | None = None,
    reference_date: date | None = None,
) -> dict[str, Any]:
    """Phân tích nhật ký ăn uống 7–14 ngày của người dùng để nhận diện mẫu thói quen:

    - Kiểm tra ràng buộc days_range: 7 <= days_range <= 30.
    - Đếm số ngày có ghi nhận nhật ký (logged_days_count = D).
    - Rào chắn: Nếu D < 5, trả về status='insufficient_data' và patterns=[].
    - Khi D >= 5, phân tích 3 mẫu:
      1. skipping_breakfast: Bỏ bữa sáng >= 40% số ngày hoặc tỷ lệ ăn sáng < 50%.
      2. low_protein: Lượng đạm trung bình < 80% mục tiêu target_protein_g.
      3. late_night_eating: Có >= 2 ngày hoặc >= 25% số ngày ăn sau 21:00.
    - Tuyệt đối không phán xét, locked_daily_target_calories giữ nguyên theo Goal.
    """
    effective_days = days if days is not None else days_range
    if effective_days < 7 or effective_days > 30:
        raise ValueError("days_range phải nằm trong khoảng từ 7 đến 30 ngày")

    end_date = reference_date or get_vn_today()
    start_date = end_date - timedelta(days=effective_days - 1)

    # 1. Truy vấn mục tiêu cá nhân từ Goal
    goal = session.exec(select(Goal).where(Goal.user_id == authenticated_user_id)).first()
    if goal:
        target_calories = float(goal.target_calories if goal.target_calories else goal.tdee_calories)
        if getattr(goal, "target_protein_g", None):
            target_protein_g = float(goal.target_protein_g)
        else:
            target_protein_g = round((target_calories * 0.30) / 4.0, 1)
    else:
        target_calories = 2000.0
        target_protein_g = 150.0

    # 2. Truy vấn tất cả các bữa ăn của user trong khoảng thời gian
    all_meals = session.exec(
        select(Meal)
        .where(Meal.user_id == authenticated_user_id)
        .order_by(Meal.logged_at.asc())
    ).all()

    # Nhóm bữa ăn theo ngày (chỉ lấy bữa ăn thuộc khoảng [start_date, end_date])
    meals_by_date: dict[date, list[Meal]] = {}
    for m in all_meals:
        m_date = (
            m.logged_at.date()
            if hasattr(m.logged_at, "date")
            else date.fromisoformat(str(m.logged_at)[:10])
        )
        if start_date <= m_date <= end_date:
            meals_by_date.setdefault(m_date, []).append(m)

    logged_days_count = len(meals_by_date)

    # 3. Rào chắn dữ liệu tối thiểu 5 ngày
    if logged_days_count < MIN_REQUIRED_DAYS:
        return {
            "status": "insufficient_data",
            "is_sufficient_data": False,
            "user_id": authenticated_user_id,
            "days_range": days_range,
            "logged_days_count": logged_days_count,
            "minimum_required_days": MIN_REQUIRED_DAYS,
            "patterns": [],
            "locked_daily_target_calories": target_calories,
            "message": INSUFFICIENT_DATA_MSG,
            "disclaimer": INSUFFICIENT_DATA_MSG,
        }

    # 4. Khi logged_days_count >= 5: Tiến hành phân tích 3 mẫu thói quen
    d_total = logged_days_count
    d_breakfast = 0
    d_late_night = 0

    daily_protein_totals: list[float] = []
    total_period_calories = 0.0

    for _day_dt, day_meals in meals_by_date.items():
        has_breakfast = False
        has_late_night = False
        day_protein = 0.0
        day_calories = 0.0

        for m in day_meals:
            # Kiểm tra bữa sáng
            m_type_clean = m.meal_type.strip().lower()
            if m_type_clean in {"sáng", "breakfast"}:
                has_breakfast = True

            # Kiểm tra ăn khuya (sau 21:00)
            m_hour = m.logged_at.hour if hasattr(m.logged_at, "hour") else 12
            if m_hour >= 21:
                has_late_night = True

            # Tính dinh dưỡng chi tiết từ meal_items
            items = session.exec(
                select(MealItem, FoodReference)
                .join(FoodReference, MealItem.food_id == FoodReference.id)
                .where(MealItem.meal_id == m.id)
            ).all()

            for mi, ref in items:
                gram = mi.estimated_gram
                item_cal = (gram / 100.0) * ref.calories_per_100g
                item_prot = (gram / 100.0) * ref.protein_per_100g
                day_calories += item_cal
                day_protein += item_prot

        if has_breakfast:
            d_breakfast += 1
        if has_late_night:
            d_late_night += 1

        daily_protein_totals.append(day_protein)
        total_period_calories += day_calories

    # Tính toán các chỉ số thống kê
    breakfast_rate = round(d_breakfast / d_total, 2)
    late_night_rate = round(d_late_night / d_total, 2)
    avg_daily_protein = round(sum(daily_protein_totals) / d_total, 1) if d_total > 0 else 0.0
    avg_daily_calories = round(total_period_calories / d_total, 1) if d_total > 0 else 0.0

    detected_patterns: list[dict[str, Any]] = []

    # Mẫu 1: Hay bỏ bữa sáng (skipping_breakfast)
    skipping_breakfast_rate = round((d_total - d_breakfast) / d_total, 2)
    if breakfast_rate < 0.50 or skipping_breakfast_rate >= 0.40:
        detected_patterns.append(
            {
                "pattern_code": "skipping_breakfast",
                "title": "Thói quen bỏ bữa sáng",
                "severity": "gentle_reminder",
                "metrics": {
                    "breakfast_days": d_breakfast,
                    "logged_days": d_total,
                    "breakfast_rate": breakfast_rate,
                },
                "recommendation": (
                    f"Bạn mới ghi nhận bữa sáng trong {d_breakfast}/{d_total} ngày gần đây. "
                    "Một bữa sáng gọn nhẹ giàu đạm (như trứng ốp la, phở gà hoặc sữa chua Hy Lạp) "
                    "sẽ giúp duy trì năng lượng ổn định suốt buổi sáng."
                ),
            }
        )

    # Mẫu 2: Thiếu hụt chất đạm (low_protein)
    if avg_daily_protein < 0.80 * target_protein_g:
        detected_patterns.append(
            {
                "pattern_code": "low_protein",
                "title": "Lượng đạm (Protein) trung bình chưa đạt mục tiêu",
                "severity": "nutrition_balance",
                "metrics": {
                    "avg_daily_protein_g": avg_daily_protein,
                    "target_protein_g": target_protein_g,
                },
                "recommendation": (
                    f"Lượng đạm ước tính trung bình của bạn đạt khoảng {avg_daily_protein}g/ngày "
                    f"(mục tiêu tham khảo {target_protein_g}g). Bạn có thể bổ sung thêm ức gà, "
                    "cá, đậu hũ hoặc trứng vào bữa chính để bảo vệ cơ bắp tốt hơn."
                ),
            }
        )

    # Mẫu 3: Thói quen ăn khuya sau 21:00 (late_night_eating)
    if d_late_night >= 2 or late_night_rate >= 0.25:
        detected_patterns.append(
            {
                "pattern_code": "late_night_eating",
                "title": "Thói quen ăn muộn sau 21:00",
                "severity": "habit_observation",
                "metrics": {
                    "late_night_days": d_late_night,
                    "logged_days": d_total,
                    "late_night_rate": late_night_rate,
                },
                "recommendation": (
                    f"Hệ thống ghi nhận bạn có {d_late_night} ngày dùng bữa sau 21:00. "
                    "Nếu đói vào buổi tối, bạn có thể ưu tiên các món nhẹ dễ tiêu hóa "
                    "như sữa hạt không đường, súp rau củ hoặc trái cây ít ngọt."
                ),
            }
        )

    return {
        "status": "analyzed",
        "is_sufficient_data": True,
        "user_id": authenticated_user_id,
        "days_range": days_range,
        "logged_days_count": d_total,
        "summary_metrics": {
            "avg_daily_calories": avg_daily_calories,
            "avg_daily_protein_g": avg_daily_protein,
            "breakfast_days_count": d_breakfast,
            "late_night_days_count": d_late_night,
            "breakfast_rate": breakfast_rate,
            "late_night_rate": late_night_rate,
        },
        "patterns": detected_patterns,
        "locked_daily_target_calories": target_calories,
        "disclaimer": HABIT_DISCLAIMER_TEXT,
    }


# ==============================================================================
# 3. BACKEND SERVICE FOOD SWAP SIMULATOR (SIMULATE FOOD SWAP)
# ==============================================================================


def simulate_food_swap(
    session: Session,
    current_food_id: int | None = None,
    current_food_name: str | None = None,
    portion_gram: float | None = None,
    current_gram: float | None = None,
    target_food_id: int | None = None,
    target_gram: float | None = None,
    swap_goal: str = "reduce_calories",
    max_budget_vnd: int | None = None,
    same_category_only: bool = True,
    limit: int = 5,
) -> dict[str, Any]:
    """Mô phỏng đổi món ăn theo chuẩn đại số tất định:

    - Hỗ trợ cả portion_gram và current_gram, target_food_id và target_gram.
    - Kiểm tra an toàn y tế qua validate_portion_gram.
    - swap_goal: 'reduce_calories', 'high_protein', 'balanced_saver'.
    - Tính dinh dưỡng và chi phí món gốc.
    - Tính toán chính xác độ chênh lệch calories_diff, protein_diff_g, carbs_diff_g, fat_diff_g, price_diff_vnd.
    """
    actual_gram = current_gram if current_gram is not None else (portion_gram if portion_gram is not None else 250.0)

    # 1. Xác thực đầu vào
    is_valid, msg = validate_portion_gram(actual_gram)
    if not is_valid:
        raise ValueError(msg)

    if swap_goal not in VALID_SWAP_GOALS:
        raise ValueError(
            f"swap_goal không hợp lệ: '{swap_goal}'. "
            "Chỉ chấp nhận 'reduce_calories', 'high_protein', 'balanced_saver'."
        )

    if limit < 1 or limit > 20:
        limit = 5

    source_ref = resolve_food_reference(session, food_id=current_food_id, food_name=current_food_name)

    # 2. Tính dinh dưỡng món gốc
    factor = actual_gram / 100.0
    calo_src = round(factor * source_ref.calories_per_100g, 2)
    protein_src = round(factor * source_ref.protein_per_100g, 2)
    carbs_src = round(factor * source_ref.carbs_per_100g, 2)
    fat_src = round(factor * source_ref.fat_per_100g, 2)
    price_src = round(factor * source_ref.avg_price_vnd)

    source_category = classify_food_category(source_ref.food_name)

    # Nếu có target_food_id cụ thể được chỉ định trực tiếp:
    target_calc = None
    if target_food_id is not None:
        target_ref = resolve_food_reference(session, food_id=target_food_id)
        t_gram = target_gram if target_gram is not None else actual_gram
        t_cal = round((t_gram / 100.0) * target_ref.calories_per_100g, 2)
        t_prot = round((t_gram / 100.0) * target_ref.protein_per_100g, 2)
        t_carb = round((t_gram / 100.0) * target_ref.carbs_per_100g, 2)
        t_fat = round((t_gram / 100.0) * target_ref.fat_per_100g, 2)
        t_price = round((t_gram / 100.0) * target_ref.avg_price_vnd)
        target_calc = {
            "target_food": {
                "food_id": target_ref.id,
                "food_name": target_ref.food_name,
                "category": classify_food_category(target_ref.food_name),
                "portion_gram": t_gram,
                "calories": t_cal,
                "protein_g": t_prot,
                "carbs_g": t_carb,
                "fat_g": t_fat,
                "estimated_price_vnd": t_price,
            },
            "calories_diff": round(t_cal - calo_src, 2),
            "protein_diff_g": round(t_prot - protein_src, 2),
            "carbs_diff_g": round(t_carb - carbs_src, 2),
            "fat_diff_g": round(t_fat - fat_src, 2),
            "price_diff_vnd": int(t_price - price_src),
        }

    # 3. Lấy và lọc danh sách ứng viên từ food_references
    all_refs = session.exec(select(FoodReference)).all()
    source_is_usda = "(usda)" in source_ref.food_name.lower()

    candidates: list[FoodReference] = []
    for cand in all_refs:
        if cand.id == source_ref.id:
            continue

        cand_name_lower = cand.food_name.lower()
        # Bỏ qua nguyên liệu USDA trừ khi món gốc cũng là USDA
        if not source_is_usda and "(usda)" in cand_name_lower:
            continue
        # Bỏ qua dầu ăn nguyên chất
        if "dầu ăn" in cand_name_lower:
            continue

        cand_price = round(factor * cand.avg_price_vnd)
        if max_budget_vnd is not None and cand_price > max_budget_vnd:
            continue

        # Lọc theo swap_goal
        if swap_goal == "reduce_calories":
            if cand.calories_per_100g >= source_ref.calories_per_100g:
                continue
        elif swap_goal == "high_protein":
            if cand.protein_per_100g <= source_ref.protein_per_100g:
                continue
        elif swap_goal == "balanced_saver":
            if cand.avg_price_vnd > source_ref.avg_price_vnd or cand.calories_per_100g > source_ref.calories_per_100g:
                continue

        candidates.append(cand)

    # Hàm sắp xếp ứng viên theo mục tiêu
    def sort_key(c: FoodReference) -> tuple[float, float]:
        if swap_goal == "reduce_calories":
            # Tiết kiệm nhiều calo nhất và giàu đạm
            return (source_ref.calories_per_100g - c.calories_per_100g, c.protein_per_100g)
        elif swap_goal == "high_protein":
            # Giàu đạm nhất và calo vừa phải
            return (c.protein_per_100g, -c.calories_per_100g)
        else:
            # Tiết kiệm giá nhất và calo giảm nhiều nhất
            return (
                float(source_ref.avg_price_vnd - c.avg_price_vnd),
                source_ref.calories_per_100g - c.calories_per_100g,
            )

    candidates.sort(key=sort_key, reverse=True)

    # Ưu tiên cùng nhóm thực phẩm
    if same_category_only:
        same_cat = [c for c in candidates if classify_food_category(c.food_name) == source_category]
        if same_cat:
            selected_cands = same_cat[:limit]
        else:
            selected_cands = candidates[:limit]
    else:
        selected_cands = candidates[:limit]

    # 4. Tính toán đại số delta cho từng phương án thay thế
    alternatives: list[dict[str, Any]] = []
    for cand in selected_cands:
        calo_alt = round(factor * cand.calories_per_100g, 2)
        prot_alt = round(factor * cand.protein_per_100g, 2)
        carbs_alt = round(factor * cand.carbs_per_100g, 2)
        fat_alt = round(factor * cand.fat_per_100g, 2)
        price_alt = round(factor * cand.avg_price_vnd)

        delta_cal = round(calo_alt - calo_src, 2)
        calories_saved = round(calo_src - calo_alt, 2)
        delta_prot = round(prot_alt - protein_src, 2)
        delta_carbs = round(carbs_alt - carbs_src, 2)
        delta_fat = round(fat_alt - fat_src, 2)
        delta_price = int(price_alt - price_src)

        alternatives.append(
            {
                "food_id": cand.id,
                "food_name": cand.food_name,
                "category": classify_food_category(cand.food_name),
                "portion_gram": actual_gram,
                "calories": calo_alt,
                "protein_g": prot_alt,
                "carbs_g": carbs_alt,
                "fat_g": fat_alt,
                "estimated_price_vnd": price_alt,
                "delta_calories": delta_cal,
                "calories_saved": calories_saved,
                "delta_protein_g": delta_prot,
                "delta_carbs_g": delta_carbs,
                "delta_fat_g": delta_fat,
                "delta_price_vnd": delta_price,
                "calories_diff": delta_cal,
                "protein_diff_g": delta_prot,
                "carbs_diff_g": delta_carbs,
                "fat_diff_g": delta_fat,
                "price_diff_vnd": delta_price,
                "comparison_delta": {
                    "delta_calories": delta_cal,
                    "calories_saved": calories_saved,
                    "delta_protein_g": delta_prot,
                    "delta_carbs_g": delta_carbs,
                    "delta_fat_g": delta_fat,
                    "delta_price_vnd": delta_price,
                },
            }
        )

    out_res: dict[str, Any] = {
        "status": "success",
        "source_food": {
            "food_id": source_ref.id,
            "food_name": source_ref.food_name,
            "category": source_category,
            "portion_gram": actual_gram,
            "calories": calo_src,
            "protein_g": protein_src,
            "carbs_g": carbs_src,
            "fat_g": fat_src,
            "estimated_price_vnd": price_src,
        },
        "swap_goal": swap_goal,
        "portion_gram": actual_gram,
        "max_budget_vnd": max_budget_vnd,
        "same_category_only": same_category_only,
        "alternatives_count": len(alternatives),
        "alternatives": alternatives,
        "calories_diff": alternatives[0]["delta_calories"] if alternatives else 0.0,
        "protein_diff_g": alternatives[0]["delta_protein_g"] if alternatives else 0.0,
        "carbs_diff_g": alternatives[0]["delta_carbs_g"] if alternatives else 0.0,
        "fat_diff_g": alternatives[0]["delta_fat_g"] if alternatives else 0.0,
        "price_diff_vnd": alternatives[0]["delta_price_vnd"] if alternatives else 0,
        "non_restrictive_note": (
            "Gợi ý thay thế mang tính tham khảo linh hoạt, "
            "bạn vẫn có thể thưởng thức món ăn yêu thích với khẩu phần hợp lý."
        ),
        "disclaimer": DISCLAIMER_TEXT,
    }

    if target_calc is not None:
        out_res.update(target_calc)

    return out_res
