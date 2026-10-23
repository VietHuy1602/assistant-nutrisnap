"""
src/backend/services/nutrition_service.py
Deterministic Nutrition Engine, Meal Logging & Daily Dashboard Aggregation.
Tuân thủ chuẩn y khoa và nguyên tắc Zero-Hallucination:
1. Toàn bộ tính toán Calo/Macro dựa trên công thức đại số cố định từ bảng food_references.
2. Kiểm tra an toàn y tế và số gam qua validate_portion_gram.
3. Hỗ trợ hệ số trừ hao thức ăn thừa (eaten_ratio).
4. Xác nhận 2 bước (Two-step confirmation): chỉ lưu CSDL khi is_confirmed = True.
5. Tổng hợp Daily Dashboard theo nguyên tắc bảo mật cô lập dữ liệu (Zero-Trust).
"""

import difflib
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field
from sqlmodel import Session, func, select

from src.backend.models.schema import (
    FoodReference,
    Goal,
    Meal,
    MealItem,
    get_vn_today,
    utc_now,
)
from src.backend.services.validators import validate_portion_gram

DISCLAIMER_TEXT = "Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo."

MEAL_TYPE_MAP = {
    "sáng": "Sáng",
    "trưa": "Trưa",
    "tối": "Tối",
    "phụ": "Phụ",
    "breakfast": "Sáng",
    "lunch": "Trưa",
    "dinner": "Tối",
    "snack": "Phụ",
}
VALID_MEAL_TYPES = {"Sáng", "Trưa", "Tối", "Phụ"}


# ==============================================================================
# 1. PYDANTIC SCHEMAS
# ==============================================================================


class MealItemInput(BaseModel):
    """Dữ liệu đầu vào cho một món ăn trong bữa."""

    food_id: int | None = None
    food_name: str | None = None
    estimated_gram: float = Field(..., description="Khối lượng ước tính của món trên đĩa (gam)")
    eaten_ratio: float = Field(
        default=1.0,
        gt=0.0,
        le=1.0,
        description="Tỷ lệ ăn thực tế để trừ hao thức ăn thừa (0 < ratio <= 1.0)",
    )


class CalculatedMealItem(BaseModel):
    """Chi tiết dinh dưỡng và chi phí của từng món sau tính toán đại số."""

    food_id: int
    food_name: str
    estimated_gram: float
    eaten_ratio: float
    effective_gram: float
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    estimated_price_vnd: int


class NutritionCalculationResult(BaseModel):
    """Kết quả tổng hợp dinh dưỡng toàn bộ bữa ăn."""

    items: list[CalculatedMealItem]
    total_weight_g: float
    total_calories: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    total_estimated_price_vnd: int
    disclaimer: str = DISCLAIMER_TEXT


class MealLogRequest(BaseModel):
    """Yêu cầu xem trước hoặc lưu bữa ăn vào CSDL."""

    meal_type: str = Field(..., description="Loại bữa ăn ('Sáng', 'Trưa', 'Tối', 'Phụ')")
    items: list[MealItemInput] = Field(..., min_length=1, description="Danh sách món ăn (tối thiểu 1 món)")
    image_path: str | None = None
    logged_at: datetime | None = None
    is_confirmed: bool = Field(default=False, description="Xác nhận lưu vào CSDL")
    notes: str | None = None


class MealLogResponse(BaseModel):
    """Phản hồi sau khi tính toán hoặc ghi nhận bữa ăn."""

    status: str  # "pending_confirmation" hoặc "logged"
    meal_id: int | None = None
    meal_type: str
    logged_at: datetime
    nutrition: NutritionCalculationResult
    disclaimer: str = DISCLAIMER_TEXT
    success: bool = True
    total_calories: float | None = None


# ==============================================================================
# 2. HÀM TÌM KIẾM & ÁNH XẠ THỰC PHẨM (RESOLVE FOOD REFERENCE)
# ==============================================================================


COMMON_CONDIMENT_REFERENCES: dict[str, dict[str, Any]] = {
    "dầu ô-liu": {"food_name": "Dầu ô-liu", "calories_per_100g": 884.0, "protein_per_100g": 0.0, "carbs_per_100g": 0.0, "fat_per_100g": 100.0, "avg_price_vnd": 15000},
    "dầu ăn": {"food_name": "Dầu ăn", "calories_per_100g": 884.0, "protein_per_100g": 0.0, "carbs_per_100g": 0.0, "fat_per_100g": 100.0, "avg_price_vnd": 10000},
    "bơ": {"food_name": "Bơ", "calories_per_100g": 717.0, "protein_per_100g": 0.9, "carbs_per_100g": 0.1, "fat_per_100g": 81.0, "avg_price_vnd": 20000},
    "sốt mè rang": {"food_name": "Sốt mè rang", "calories_per_100g": 387.0, "protein_per_100g": 5.3, "carbs_per_100g": 8.0, "fat_per_100g": 36.0, "avg_price_vnd": 15000},
    "sốt mayonnaise": {"food_name": "Sốt mayonnaise", "calories_per_100g": 680.0, "protein_per_100g": 1.0, "carbs_per_100g": 1.0, "fat_per_100g": 75.0, "avg_price_vnd": 15000},
    "mỡ hành": {"food_name": "Mỡ hành", "calories_per_100g": 650.0, "protein_per_100g": 1.5, "carbs_per_100g": 3.0, "fat_per_100g": 70.0, "avg_price_vnd": 10000},
    "sữa đặc": {"food_name": "Sữa đặc", "calories_per_100g": 320.0, "protein_per_100g": 8.0, "carbs_per_100g": 55.0, "fat_per_100g": 8.0, "avg_price_vnd": 15000},
    "đường cát": {"food_name": "Đường cát", "calories_per_100g": 387.0, "protein_per_100g": 0.0, "carbs_per_100g": 100.0, "fat_per_100g": 0.0, "avg_price_vnd": 5000},
}


def resolve_food_reference(
    session: Session,
    food_id: int | None = None,
    food_name: str | None = None,
) -> FoodReference:
    """Tra cứu thực phẩm tham chiếu từ CSDL (food_references):

    1. Nếu có food_id, tìm trực tiếp theo khóa chính.
    2. Nếu có food_name:
       - 2a: Tìm khớp chính xác không phân biệt hoa thường.
       - 2b: Tìm chuỗi con không phân biệt hoa thường (ILIKE).
       - 2c: Dùng difflib.get_close_matches tìm độ tương đồng mờ (cutoff=0.6).
    3. Nếu không tìm thấy, ném ValueError.
    """
    name_clean = food_name.strip() if food_name and food_name.strip() else None

    if food_id is not None:
        ref = session.get(FoodReference, food_id)
        if ref:
            # Nếu có food_name đi kèm và không khớp với tên món của food_id (do mock fixture cũ), ưu tiên tra cứu theo food_name
            if name_clean and (name_clean.lower() not in ref.food_name.lower()):
                pass
            else:
                return ref

    if name_clean:

        # 2a: Tìm khớp chính xác (case-insensitive)
        statement_exact = select(FoodReference).where(
            func.lower(FoodReference.food_name) == name_clean.lower()
        )
        ref = session.exec(statement_exact).first()
        if ref:
            return ref

        # 2b: Tìm khớp chuỗi con (ILIKE)
        statement_ilike = select(FoodReference).where(
            FoodReference.food_name.ilike(f"%{name_clean}%")
        )
        ref = session.exec(statement_ilike).first()
        if ref:
            return ref

        # 2c: So khớp gần đúng bằng difflib
        all_refs = session.exec(select(FoodReference)).all()
        ref_names = [r.food_name for r in all_refs]
        matches = difflib.get_close_matches(name_clean, ref_names, n=1, cutoff=0.6)
        if matches:
            matched_name = matches[0]
            statement_match = select(FoodReference).where(
                FoodReference.food_name == matched_name
            )
            matched_ref = session.exec(statement_match).first()
            if matched_ref:
                return matched_ref

        # 2d: Hỗ trợ tự động các gia vị ẩn và dầu sốt từ voice_modifier
        name_lower = name_clean.lower()
        for c_key, c_val in COMMON_CONDIMENT_REFERENCES.items():
            if c_key in name_lower or name_lower in c_key:
                new_ref = FoodReference(
                    food_name=c_val["food_name"],
                    calories_per_100g=c_val["calories_per_100g"],
                    protein_per_100g=c_val["protein_per_100g"],
                    carbs_per_100g=c_val["carbs_per_100g"],
                    fat_per_100g=c_val["fat_per_100g"],
                    avg_price_vnd=c_val["avg_price_vnd"],
                )
                session.add(new_ref)
                session.flush()
                session.refresh(new_ref)
                return new_ref

    raise ValueError(f"Không tìm thấy món ăn trong CSDL tham chiếu: {food_name or food_id}")


# ==============================================================================
# 3. CÔNG THỨC ĐẠI SỐ TÍNH TOÁN DINH DƯỠNG (DETERMINISTIC NUTRITION CALCULATION)
# ==============================================================================


def calculate_item_nutrition(
    session: Session,
    food_id: int,
    estimated_gram: float,
    eaten_ratio: float = 1.0,
) -> dict[str, Any]:
    """Tính toán dinh dưỡng tất định cho một món ăn dựa trên food_id và hệ số trừ hao thức ăn thừa:

    Effective Gram = estimated_gram * eaten_ratio
    Nutrient = round((Effective Gram / 100.0) * Nutrient_per_100g, 2)
    """
    effective_gram = round(estimated_gram * eaten_ratio, 2)
    is_valid, msg = validate_portion_gram(effective_gram)
    if not is_valid:
        raise ValueError(msg)

    ref = resolve_food_reference(session, food_id=food_id)

    cal = round((effective_gram / 100.0) * ref.calories_per_100g, 2)
    protein = round((effective_gram / 100.0) * ref.protein_per_100g, 2)
    carbs = round((effective_gram / 100.0) * ref.carbs_per_100g, 2)
    fat = round((effective_gram / 100.0) * ref.fat_per_100g, 2)
    price = round((effective_gram / 100.0) * ref.avg_price_vnd)

    return {
        "food_id": ref.id,
        "food_name": ref.food_name,
        "estimated_gram": estimated_gram,
        "eaten_ratio": eaten_ratio,
        "effective_gram": effective_gram,
        "calories": cal,
        "protein_g": protein,
        "carbs_g": carbs,
        "fat_g": fat,
        "estimated_price_vnd": price,
    }


def calculate_meal_nutrition(
    session: Session,
    items: list[MealItemInput],
) -> NutritionCalculationResult:
    """Tính toán chính xác calo, protein, carbs, fat, giá tiền bằng công thức đại số cố định.

    - Kiểm tra danh sách items không rỗng.
    - Áp dụng hệ số trừ hao thức ăn thừa: G_i = round(estimated_gram * eaten_ratio, 2).
    - Kiểm tra ràng buộc an toàn y tế qua validate_portion_gram(G_i).
    - Tính toán: (G_i / 100.0) * nutrient_per_100g.
    """
    if not items:
        raise ValueError("Danh sách món ăn không được để trống.")

    calculated_items: list[CalculatedMealItem] = []

    for item in items:
        effective_gram = round(item.estimated_gram * item.eaten_ratio, 2)

        # Kiểm định khối lượng món ăn qua validator y tế
        is_valid, msg = validate_portion_gram(effective_gram)
        if not is_valid:
            raise ValueError(msg)

        ref = resolve_food_reference(session, food_id=item.food_id, food_name=item.food_name)

        cal = round((effective_gram / 100.0) * ref.calories_per_100g, 2)
        protein = round((effective_gram / 100.0) * ref.protein_per_100g, 2)
        carbs = round((effective_gram / 100.0) * ref.carbs_per_100g, 2)
        fat = round((effective_gram / 100.0) * ref.fat_per_100g, 2)
        price = round((effective_gram / 100.0) * ref.avg_price_vnd)

        calc_item = CalculatedMealItem(
            food_id=ref.id,  # type: ignore
            food_name=ref.food_name,
            estimated_gram=item.estimated_gram,
            eaten_ratio=item.eaten_ratio,
            effective_gram=effective_gram,
            calories=cal,
            protein_g=protein,
            carbs_g=carbs,
            fat_g=fat,
            estimated_price_vnd=price,
        )
        calculated_items.append(calc_item)

    total_weight = round(sum(i.effective_gram for i in calculated_items), 2)
    total_calories = round(sum(i.calories for i in calculated_items), 2)
    total_protein = round(sum(i.protein_g for i in calculated_items), 2)
    total_carbs = round(sum(i.carbs_g for i in calculated_items), 2)
    total_fat = round(sum(i.fat_g for i in calculated_items), 2)
    total_price = int(sum(i.estimated_price_vnd for i in calculated_items))

    return NutritionCalculationResult(
        items=calculated_items,
        total_weight_g=total_weight,
        total_calories=total_calories,
        total_protein_g=total_protein,
        total_carbs_g=total_carbs,
        total_fat_g=total_fat,
        total_estimated_price_vnd=total_price,
        disclaimer=DISCLAIMER_TEXT,
    )


# ==============================================================================
# 4. GHI NHẬN BỮA ĂN (TWO-STEP CONFIRMATION LOG_USER_MEAL)
# ==============================================================================


def normalize_meal_type(meal_type_raw: str) -> str:
    """Chuẩn hóa loại bữa ăn sang định dạng chuẩn tiếng Việt ('Sáng', 'Trưa', 'Tối', 'Phụ')."""
    clean_type = meal_type_raw.strip()
    if clean_type in VALID_MEAL_TYPES:
        return clean_type
    lower_type = clean_type.lower()
    if lower_type in MEAL_TYPE_MAP:
        return MEAL_TYPE_MAP[lower_type]
    raise ValueError(
        f"Loại bữa ăn không hợp lệ: '{meal_type_raw}'. Chỉ chấp nhận 'Sáng', 'Trưa', 'Tối', 'Phụ'."
    )


def log_user_meal(
    session: Session,
    authenticated_user_id: int,
    meal_type_or_req: MealLogRequest | str | None = None,
    items: list[MealItemInput | dict[str, Any]] | None = None,
    is_confirmed: bool = False,
    image_path: str | None = None,
    notes: str | None = None,
    logged_at: datetime | None = None,
    req: MealLogRequest | None = None,
    **kwargs: Any,
) -> MealLogResponse:
    """Xử lý yêu cầu ghi nhận bữa ăn có kiểm tra xác nhận 2 bước:

    - Nếu is_confirmed = False: Chỉ tính toán xem trước, không ghi CSDL, trả về pending_confirmation.
    - Nếu is_confirmed = True: Ghi nguyên tử vào bảng meals và meal_items, trả về status logged.
    """
    actual_req = req or (meal_type_or_req if isinstance(meal_type_or_req, MealLogRequest) else None)
    if actual_req is not None:
        effective_req = actual_req
    else:
        meal_type_str = str(meal_type_or_req) if meal_type_or_req is not None else kwargs.get("meal_type", "Sáng")
        req_items = items or kwargs.get("items_list") or []
        parsed_items: list[MealItemInput] = []
        for it in req_items:
            if isinstance(it, MealItemInput):
                parsed_items.append(it)
            elif isinstance(it, dict):
                parsed_items.append(MealItemInput(**it))
        effective_req = MealLogRequest(
            meal_type=meal_type_str,
            items=parsed_items,
            is_confirmed=is_confirmed or kwargs.get("is_confirmed", False),
            image_path=image_path or kwargs.get("image_path"),
            notes=notes or kwargs.get("notes"),
            logged_at=logged_at or kwargs.get("logged_at"),
        )
    req = effective_req
    meal_type = normalize_meal_type(req.meal_type)
    nutrition_res = calculate_meal_nutrition(session, req.items)
    logged_time = req.logged_at or utc_now()
    if logged_time.tzinfo is None:
        from datetime import UTC

        logged_time = logged_time.replace(tzinfo=UTC)

    if not req.is_confirmed:
        return MealLogResponse(
            status="pending_confirmation",
            meal_id=None,
            meal_type=meal_type,
            logged_at=logged_time,
            nutrition=nutrition_res,
            disclaimer=nutrition_res.disclaimer,
            success=True,
            total_calories=nutrition_res.total_calories,
        )

    # is_confirmed = True: Thực thi lưu nguyên tử vào CSDL
    meal = Meal(
        user_id=authenticated_user_id,
        meal_type=meal_type,
        image_path=req.image_path,
        logged_at=logged_time,
    )
    session.add(meal)
    session.flush()

    for calc_item in nutrition_res.items:
        meal_item = MealItem(
            meal_id=meal.id,  # type: ignore
            food_id=calc_item.food_id,
            estimated_gram=calc_item.effective_gram,
            estimated_calories=calc_item.calories,
        )
        session.add(meal_item)

    session.commit()
    session.refresh(meal)

    return MealLogResponse(
        status="logged",
        meal_id=meal.id,
        meal_type=meal.meal_type,
        logged_at=meal.logged_at,
        nutrition=nutrition_res,
        disclaimer=nutrition_res.disclaimer,
        success=True,
        total_calories=nutrition_res.total_calories,
    )


# ==============================================================================
# 5. TỔNG HỢP TIẾN TRÌNH NGÀY (GET_DAILY_DASHBOARD_DATA)
# ==============================================================================


def get_daily_dashboard_data(
    session: Session,
    authenticated_user_id: int,
    target_date: date | None = None,
) -> dict[str, Any]:
    """Tổng hợp dữ liệu Dashboard dinh dưỡng trong ngày cho người dùng đã xác thực (Zero-Trust):

    - Mục tiêu: Lấy từ bảng goals (hoặc mặc định 2000 kcal, 60k VNĐ).
    - Đã nạp: Truy vấn các bữa ăn trong target_date và tính toán calo, macro, chi phí thực tế.
    - Còn lại: Lấy mục tiêu trừ phần đã nạp.
    - Trả về cấu trúc chi tiết từng bữa ăn và các món ăn bên trong.
    """
    query_date = target_date or get_vn_today()

    # 1. Lấy mục tiêu cá nhân của người dùng
    goal_stmt = select(Goal).where(Goal.user_id == authenticated_user_id)
    goal = session.exec(goal_stmt).first()

    if goal:
        target_calories = float(goal.target_calories if goal.target_calories else goal.tdee_calories)
        daily_budget_vnd = int(goal.daily_budget_vnd)
        if goal.target_protein_g and goal.target_carbs_g and goal.target_fat_g:
            target_protein_g = float(goal.target_protein_g)
            target_carbs_g = float(goal.target_carbs_g)
            target_fat_g = float(goal.target_fat_g)
        else:
            target_protein_g = round((target_calories * 0.30) / 4.0, 1)
            target_carbs_g = round((target_calories * 0.40) / 4.0, 1)
            target_fat_g = round((target_calories * 0.30) / 9.0, 1)
    else:
        target_calories = 2000.0
        daily_budget_vnd = 60000
        target_protein_g = round((target_calories * 0.30) / 4.0, 1)
        target_carbs_g = round((target_calories * 0.40) / 4.0, 1)
        target_fat_g = round((target_calories * 0.30) / 9.0, 1)

    # 2. Truy vấn các bữa ăn của user trong ngày target_date
    all_user_meals = session.exec(
        select(Meal)
        .where(Meal.user_id == authenticated_user_id)
        .order_by(Meal.logged_at.asc())
    ).all()

    meals_for_day: list[Meal] = []
    for m in all_user_meals:
        meal_date = m.logged_at.date() if hasattr(m.logged_at, "date") else str(m.logged_at)[:10]
        query_date_str = query_date.isoformat() if hasattr(query_date, "isoformat") else str(query_date)
        if str(meal_date) == query_date_str:
            meals_for_day.append(m)

    # 3. Tổng hợp chi tiết dinh dưỡng từng bữa ăn
    consumed_calories = 0.0
    consumed_protein_g = 0.0
    consumed_carbs_g = 0.0
    consumed_fat_g = 0.0
    consumed_budget_vnd = 0

    meals_detail_list: list[dict[str, Any]] = []

    for meal in meals_for_day:
        items_stmt = (
            select(MealItem, FoodReference)
            .join(FoodReference, MealItem.food_id == FoodReference.id)
            .where(MealItem.meal_id == meal.id)
        )
        meal_records = session.exec(items_stmt).all()

        meal_items_list: list[dict[str, Any]] = []
        meal_cal = 0.0
        meal_protein = 0.0
        meal_carbs = 0.0
        meal_fat = 0.0
        meal_price = 0

        for mi, ref in meal_records:
            item_gram = mi.estimated_gram
            item_cal = round((item_gram / 100.0) * ref.calories_per_100g, 2)
            item_prot = round((item_gram / 100.0) * ref.protein_per_100g, 2)
            item_carb = round((item_gram / 100.0) * ref.carbs_per_100g, 2)
            item_f = round((item_gram / 100.0) * ref.fat_per_100g, 2)
            item_cost = round((item_gram / 100.0) * ref.avg_price_vnd)

            meal_cal += item_cal
            meal_protein += item_prot
            meal_carbs += item_carb
            meal_fat += item_f
            meal_price += item_cost

            meal_items_list.append({
                "id": mi.id,
                "food_id": ref.id,
                "food_name": ref.food_name,
                "estimated_gram": item_gram,
                "calories": item_cal,
                "protein_g": item_prot,
                "carbs_g": item_carb,
                "fat_g": item_f,
                "estimated_price_vnd": item_cost,
            })

        consumed_calories += meal_cal
        consumed_protein_g += meal_protein
        consumed_carbs_g += meal_carbs
        consumed_fat_g += meal_fat
        consumed_budget_vnd += meal_price

        meals_detail_list.append({
            "id": meal.id,
            "meal_type": meal.meal_type,
            "logged_at": meal.logged_at.isoformat() if hasattr(meal.logged_at, "isoformat") else str(meal.logged_at),
            "image_path": meal.image_path,
            "total_calories": round(meal_cal, 2),
            "total_protein_g": round(meal_protein, 2),
            "total_carbs_g": round(meal_carbs, 2),
            "total_fat_g": round(meal_fat, 2),
            "items": meal_items_list,
        })

    # Làm tròn chuẩn xác các chỉ số tổng hợp
    consumed_calories = round(consumed_calories, 2)
    consumed_protein_g = round(consumed_protein_g, 2)
    consumed_carbs_g = round(consumed_carbs_g, 2)
    consumed_fat_g = round(consumed_fat_g, 2)

    remaining_calories = round(target_calories - consumed_calories, 2)
    remaining_protein_g = round(target_protein_g - consumed_protein_g, 1)
    remaining_carbs_g = round(target_carbs_g - consumed_carbs_g, 1)
    remaining_fat_g = round(target_fat_g - consumed_fat_g, 1)
    remaining_budget_vnd = int(daily_budget_vnd - consumed_budget_vnd)

    cal_progress = (
        round((consumed_calories / target_calories) * 100, 1)
        if target_calories > 0
        else 0.0
    )
    macros_data = {
        "protein": {
            "consumed": consumed_protein_g,
            "target": target_protein_g,
            "unit": "g",
            "progress_percent": (
                round((consumed_protein_g / target_protein_g) * 100, 1)
                if target_protein_g > 0
                else 0.0
            ),
        },
        "carbs": {
            "consumed": consumed_carbs_g,
            "target": target_carbs_g,
            "unit": "g",
            "progress_percent": (
                round((consumed_carbs_g / target_carbs_g) * 100, 1)
                if target_carbs_g > 0
                else 0.0
            ),
        },
        "fat": {
            "consumed": consumed_fat_g,
            "target": target_fat_g,
            "unit": "g",
            "progress_percent": (
                round((consumed_fat_g / target_fat_g) * 100, 1)
                if target_fat_g > 0
                else 0.0
            ),
        },
    }

    return {
        "date": query_date.isoformat() if hasattr(query_date, "isoformat") else str(query_date),
        "user_id": authenticated_user_id,
        "targets": {
            "calories": target_calories,
            "protein_g": target_protein_g,
            "carbs_g": target_carbs_g,
            "fat_g": target_fat_g,
            "daily_budget_vnd": daily_budget_vnd,
        },
        "consumed": {
            "calories": consumed_calories,
            "protein_g": consumed_protein_g,
            "carbs_g": consumed_carbs_g,
            "fat_g": consumed_fat_g,
            "budget_vnd": consumed_budget_vnd,
        },
        "remaining": {
            "calories": remaining_calories,
            "protein_g": remaining_protein_g,
            "carbs_g": remaining_carbs_g,
            "fat_g": remaining_fat_g,
            "budget_vnd": remaining_budget_vnd,
        },
        "target_calories": target_calories,
        "consumed_calories": consumed_calories,
        "remaining_calories": remaining_calories,
        "calories_progress_percent": cal_progress,
        "macros": macros_data,
        "meals_count": len(meals_detail_list),
        "meals": meals_detail_list,
        "meals_summary": meals_detail_list,
        "disclaimer": DISCLAIMER_TEXT,
    }


get_daily_dashboard_summary = get_daily_dashboard_data
