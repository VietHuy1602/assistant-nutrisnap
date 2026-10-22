"""src/backend/services/goal_service.py
Dịch vụ tính toán mục tiêu dinh dưỡng thông minh (Smart Goal Planner).
Nhiệm vụ:
- Tính BMR tất định theo công thức Mifflin-St Jeor chuẩn y khoa.
- Tính TDEE theo hệ số hoạt động thể chất (Physical Activity Level - PAL).
- Rào chắn an toàn y khoa: Kiểm tra tốc độ điều chỉnh cân nặng và ngưỡng sàn năng lượng (1200/1500 kcal).
- Phân bổ vi chất/đa lượng Macro (Protein, Carbs, Fat) thích ứng theo từng mục tiêu.
- Lưu trữ và cập nhật vào bảng goals, weight_logs tuân thủ nguyên tắc Zero-Trust Access Control.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field
from sqlmodel import Session, select

from src.backend.models.schema import Goal, WeightLog, get_vn_today, utc_now
from src.backend.services.validators import validate_goal_pace

# Hệ số hoạt động thể chất (Physical Activity Level - PAL)
ACTIVITY_MULTIPLIERS: dict[str, float] = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}

# Tỷ lệ phân bổ Macro theo từng mục tiêu thể trạng
MACRO_RATIOS: dict[str, dict[str, float]] = {
    "lose_weight": {"protein": 0.30, "carbs": 0.40, "fat": 0.30},
    "maintain": {"protein": 0.25, "carbs": 0.45, "fat": 0.30},
    "gain_muscle": {"protein": 0.30, "carbs": 0.45, "fat": 0.25},
}

DISCLAIMER_TEXT = (
    "Số liệu BMR, TDEE và phân bổ dinh dưỡng chỉ mang tính chất ước tính tham khảo, "
    "không thay thế chỉ định y khoa."
)


class GoalPlanInput(BaseModel):
    """Mô hình dữ liệu đầu vào cho kế hoạch mục tiêu cá nhân."""

    gender: Literal["male", "female", "other"] = Field(
        default="male",
        description="Giới tính người dùng",
    )
    age: int = Field(..., ge=10, le=100, description="Độ tuổi (10 - 100 tuổi)")
    height_cm: float = Field(..., ge=100.0, le=250.0, description="Chiều cao (100 - 250 cm)")
    current_weight_kg: float = Field(..., ge=30.0, le=250.0, description="Cân nặng hiện tại (30 - 250 kg)")
    target_weight_kg: float | None = Field(
        default=None,
        description="Cân nặng mục tiêu (mặc định lấy current_weight_kg nếu giữ cân)",
    )
    target_weight: float | None = Field(default=None, description="Bí danh tương thích cho target_weight_kg")
    activity_level: str = Field(
        default="moderate",
        description="Mức độ vận động (sedentary, light, moderate, active, very_active)",
    )
    goal_type: str = Field(
        default="maintain",
        description="Loại mục tiêu (lose_weight, maintain, gain_muscle)",
    )
    weekly_pace_kg: float = Field(
        default=0.0,
        description="Tốc độ thay đổi cân nặng hàng tuần (kg/tuần)",
    )
    daily_budget_vnd: int = Field(
        default=60000,
        ge=10000,
        description="Ngân sách ăn uống dự kiến mỗi ngày (VNĐ)",
    )


class GoalPlanResponse(BaseModel):
    """Mô hình dữ liệu kết quả kế hoạch mục tiêu trả về."""

    id: int | None = None
    user_id: int
    target_weight: float
    bmr_calories: float
    tdee_calories: float
    target_calories: float
    target_protein_g: float
    target_carbs_g: float
    target_fat_g: float
    daily_budget_vnd: int
    is_adjusted_to_safety_floor: bool = False
    disclaimer: str = DISCLAIMER_TEXT


def calculate_bmr(weight_kg: float, height_cm: float, age: int, gender: str) -> float:
    """Tính BMR theo công thức Mifflin-St Jeor chuẩn y khoa:

    - Nam (male): BMR = 10 * W + 6.25 * H - 5 * A + 5
    - Nữ (female): BMR = 10 * W + 6.25 * H - 5 * A - 161
    - Khác (other): Áp dụng trung vị trung tính y tế: -78

    Ràng buộc kiểm tra:
    - 30 <= weight_kg <= 250
    - 100 <= height_cm <= 250
    - 10 <= age <= 100
    """
    if not (30.0 <= weight_kg <= 250.0):
        raise ValueError(f"Cân nặng ({weight_kg} kg) phải nằm trong khoảng từ 30 đến 250 kg.")
    if not (100.0 <= height_cm <= 250.0):
        raise ValueError(f"Chiều cao ({height_cm} cm) phải nằm trong khoảng từ 100 đến 250 cm.")
    if not (10 <= age <= 100):
        raise ValueError(f"Độ tuổi ({age}) phải nằm trong khoảng từ 10 đến 100 tuổi.")

    gender_norm = gender.strip().lower()
    base = 10.0 * weight_kg + 6.25 * height_cm - 5.0 * age

    if gender_norm == "male":
        bmr = base + 5.0
    elif gender_norm == "female":
        bmr = base - 161.0
    elif gender_norm == "other":
        bmr = base - 78.0
    else:
        raise ValueError(f"Giới tính không hợp lệ: '{gender}'. Chỉ chấp nhận 'male', 'female', hoặc 'other'.")

    return round(bmr, 2)


def calculate_tdee(bmr: float, activity_level: str) -> float:
    """Tính TDEE dựa trên BMR và hệ số hoạt động thể chất (PAL):

    TDEE = round(BMR * Multiplier, 2)
    """
    level_norm = activity_level.strip().lower()
    if level_norm not in ACTIVITY_MULTIPLIERS:
        valid_options = ", ".join(ACTIVITY_MULTIPLIERS.keys())
        raise ValueError(f"Mức độ vận động không hợp lệ: '{activity_level}'. Chỉ chấp nhận một trong: {valid_options}.")

    multiplier = ACTIVITY_MULTIPLIERS[level_norm]
    return round(bmr * multiplier, 2)


def calculate_target_calories(
    tdee: float,
    goal_type: str,
    weekly_pace_kg: float = 0.0,
    gender: str = "male",
) -> tuple[float, bool]:
    """Tính hạn mức calo mục tiêu hàng ngày kèm rào chắn an toàn y tế (Safety Floor Guardrail).

    Quy đổi tốc độ thay đổi mô mỡ (1kg mỡ ~ 7700 kcal):
    Delta_Calo = (weekly_pace_kg * 7700) / 7 = weekly_pace_kg * 1100

    - lose_weight: Target_Calo = TDEE - Delta_Calo
    - gain_muscle: Target_Calo = TDEE + Delta_Calo
    - maintain: Target_Calo = TDEE (weekly_pace_kg tự động đưa về 0.0)

    Rào chắn an toàn tối thiểu:
    - Nữ (female): Tối thiểu 1200 kcal/ngày.
    - Nam (male / other): Tối thiểu 1500 kcal/ngày.
    - Nếu phép tính thấp hơn ngưỡng sàn, tự động nâng lên ngưỡng sàn và trả về is_adjusted_to_safety_floor = True.
    """
    goal_type_norm = goal_type.strip().lower()
    gender_norm = gender.strip().lower()

    is_valid, msg = validate_goal_pace(weekly_pace_kg, goal_type_norm)
    if not is_valid:
        raise ValueError(msg)

    if goal_type_norm == "maintain":
        weekly_pace_kg = 0.0

    delta_calo = (weekly_pace_kg * 7700.0) / 7.0

    if goal_type_norm == "lose_weight":
        target_calo = tdee - delta_calo
    elif goal_type_norm == "gain_muscle":
        target_calo = tdee + delta_calo
    elif goal_type_norm == "maintain":
        target_calo = tdee
    else:
        raise ValueError(f"Loại mục tiêu không hợp lệ: '{goal_type}'.")

    safety_floor = 1200.0 if gender_norm == "female" else 1500.0
    if target_calo < safety_floor:
        target_calo = safety_floor
        is_adjusted_to_safety_floor = True
    else:
        is_adjusted_to_safety_floor = False

    return round(target_calo, 2), is_adjusted_to_safety_floor


def calculate_macro_split(target_calories: float, goal_type: str) -> dict[str, float]:
    """Phân bổ dưỡng chất đa lượng Macro (Protein, Carbs, Fat) từ năng lượng mục tiêu:

    - 1g Protein = 4 kcal
    - 1g Carbs = 4 kcal
    - 1g Fat = 9 kcal

    Tỷ lệ theo mục tiêu:
    - lose_weight: 30% Protein, 40% Carbs, 30% Fat
    - maintain: 25% Protein, 45% Carbs, 30% Fat
    - gain_muscle: 30% Protein, 45% Carbs, 25% Fat
    """
    goal_type_norm = goal_type.strip().lower()
    if goal_type_norm not in MACRO_RATIOS:
        raise ValueError(f"Loại mục tiêu không hợp lệ: '{goal_type}'.")

    ratios = MACRO_RATIOS[goal_type_norm]
    protein_g = round((target_calories * ratios["protein"]) / 4.0, 1)
    carbs_g = round((target_calories * ratios["carbs"]) / 4.0, 1)
    fat_g = round((target_calories * ratios["fat"]) / 9.0, 1)

    return {
        "protein_g": protein_g,
        "carbs_g": carbs_g,
        "fat_g": fat_g,
    }


def log_user_weight(
    session: Session,
    authenticated_user_id: int,
    weight_kg: float,
    logged_date: date | None = None,
) -> WeightLog:
    """Lưu hoặc cập nhật nhật ký cân nặng hàng ngày của người dùng đã xác thực (Zero-Trust).

    - Kiểm tra: 30 <= weight_kg <= 250
    - Không cho phép ghi đè dữ liệu của tài khoản khác.
    """
    if not (30.0 <= weight_kg <= 250.0):
        raise ValueError(f"Cân nặng ({weight_kg} kg) phải nằm trong khoảng từ 30 đến 250 kg.")

    target_date = logged_date or get_vn_today()
    statement = select(WeightLog).where(
        WeightLog.user_id == authenticated_user_id,
        WeightLog.logged_date == target_date,
    )
    existing_log = session.exec(statement).first()

    if existing_log:
        existing_log.weight_kg = weight_kg
        session.add(existing_log)
        session.commit()
        session.refresh(existing_log)
        return existing_log

    new_log = WeightLog(
        user_id=authenticated_user_id,
        weight_kg=weight_kg,
        logged_date=target_date,
    )
    session.add(new_log)
    session.commit()
    session.refresh(new_log)
    return new_log


def save_or_update_user_goal(
    session: Session,
    authenticated_user_id: int,
    plan_input: GoalPlanInput,
) -> GoalPlanResponse:
    """Tính toán toàn diện và lưu trữ/cập nhật hồ sơ mục tiêu dinh dưỡng vào CSDL.

    Nguyên tắc Zero-Trust:
    - Bắt buộc lọc theo authenticated_user_id.
    - Tự động ghi lại cân nặng khởi điểm vào bảng weight_logs của đúng tài khoản.
    """
    bmr = calculate_bmr(
        weight_kg=plan_input.current_weight_kg,
        height_cm=plan_input.height_cm,
        age=plan_input.age,
        gender=plan_input.gender,
    )
    tdee = calculate_tdee(bmr=bmr, activity_level=plan_input.activity_level)
    target_calo, is_floor = calculate_target_calories(
        tdee=tdee,
        goal_type=plan_input.goal_type,
        weekly_pace_kg=plan_input.weekly_pace_kg,
        gender=plan_input.gender,
    )
    macros = calculate_macro_split(target_calories=target_calo, goal_type=plan_input.goal_type)

    target_weight = (
        plan_input.target_weight_kg
        if plan_input.target_weight_kg is not None
        else (plan_input.target_weight if plan_input.target_weight is not None else plan_input.current_weight_kg)
    )

    statement = select(Goal).where(Goal.user_id == authenticated_user_id)
    goal = session.exec(statement).first()

    normalized_pace = plan_input.weekly_pace_kg if plan_input.goal_type != "maintain" else 0.0

    if goal:
        goal.gender = plan_input.gender
        goal.age = plan_input.age
        goal.height_cm = plan_input.height_cm
        goal.current_weight_kg = plan_input.current_weight_kg
        goal.target_weight = target_weight
        goal.activity_level = plan_input.activity_level
        goal.goal_type = plan_input.goal_type
        goal.weekly_pace_kg = normalized_pace
        goal.bmr_calories = bmr
        goal.tdee_calories = tdee
        goal.target_calories = target_calo
        goal.target_protein_g = macros["protein_g"]
        goal.target_carbs_g = macros["carbs_g"]
        goal.target_fat_g = macros["fat_g"]
        goal.daily_budget_vnd = plan_input.daily_budget_vnd
        goal.updated_at = utc_now()
        session.add(goal)
    else:
        goal = Goal(
            user_id=authenticated_user_id,
            gender=plan_input.gender,
            age=plan_input.age,
            height_cm=plan_input.height_cm,
            current_weight_kg=plan_input.current_weight_kg,
            target_weight=target_weight,
            activity_level=plan_input.activity_level,
            goal_type=plan_input.goal_type,
            weekly_pace_kg=normalized_pace,
            bmr_calories=bmr,
            tdee_calories=tdee,
            target_calories=target_calo,
            target_protein_g=macros["protein_g"],
            target_carbs_g=macros["carbs_g"],
            target_fat_g=macros["fat_g"],
            daily_budget_vnd=plan_input.daily_budget_vnd,
            updated_at=utc_now(),
        )
        session.add(goal)

    # Tự động ghi nhận cân nặng hiện tại vào nhật ký cân nặng (weight_logs)
    log_user_weight(
        session=session,
        authenticated_user_id=authenticated_user_id,
        weight_kg=plan_input.current_weight_kg,
    )

    session.commit()
    session.refresh(goal)

    return GoalPlanResponse(
        id=goal.id,
        user_id=authenticated_user_id,
        target_weight=goal.target_weight,
        bmr_calories=goal.bmr_calories,
        tdee_calories=goal.tdee_calories,
        target_calories=goal.target_calories,
        target_protein_g=goal.target_protein_g,
        target_carbs_g=goal.target_carbs_g,
        target_fat_g=goal.target_fat_g,
        daily_budget_vnd=goal.daily_budget_vnd,
        is_adjusted_to_safety_floor=is_floor,
        disclaimer=DISCLAIMER_TEXT,
    )
