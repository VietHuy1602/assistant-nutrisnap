"""
src/backend/services/validators.py
Các hàm kiểm định dữ liệu và ràng buộc an toàn y tế (Responsible Nutrition & Health Logic).
Tuân thủ đặc tả Tuần 1:
- Tốc độ giảm cân an toàn: 0.25kg - 0.75kg/tuần.
- Tốc độ tăng cơ/tăng cân an toàn: 0.10kg - 0.50kg/tuần.
- Duy trì cân nặng: tốc độ bằng 0.
- Loại bỏ các mục tiêu lạ không xác định.
"""

import re

VALID_GOAL_TYPES = {"lose_weight", "maintain", "gain_muscle"}


def validate_email(email: str) -> bool:
    """Kiểm tra định dạng email hợp lệ."""
    email_regex = r"^[\w\.-]+@[\w\.-]+\.\w+$"
    return bool(re.match(email_regex, email.strip()))


def validate_password(password: str) -> tuple[bool, str]:
    """Kiểm tra độ mạnh của mật khẩu:

    - Tối thiểu 8 ký tự.
    - Chứa ít nhất một chữ cái và một chữ số.
    """
    if len(password) < 8:
        return False, "Mật khẩu phải có tối thiểu 8 ký tự."
    if not re.search(r"[A-Za-z]", password):
        return False, "Mật khẩu phải chứa ít nhất một chữ cái."
    if not re.search(r"\d", password):
        return False, "Mật khẩu phải chứa ít nhất một chữ số."
    return True, "Mật khẩu hợp lệ."


# Giảm cân an toàn tối đa ~1% trọng lượng cơ thể mỗi tuần (không quá 1 kg/tuần),
# nhưng không thấp hơn mức chuẩn 0.75 kg/tuần.
LOSE_PACE_MIN = 0.25
LOSE_PACE_BASE_MAX = 0.75
LOSE_PACE_HARD_MAX = 1.0


def max_safe_lose_pace(current_weight_kg: float | None) -> float:
    """Tốc độ giảm cân tối đa an toàn theo cân nặng hiện tại (làm tròn xuống bội số 0.05 kg)."""
    if not current_weight_kg or current_weight_kg <= 0:
        return LOSE_PACE_BASE_MAX
    one_percent = int((current_weight_kg * 0.01) / 0.05 + 1e-9) * 0.05
    return round(max(LOSE_PACE_BASE_MAX, min(LOSE_PACE_HARD_MAX, one_percent)), 2)


def validate_goal_pace(
    weekly_pace_kg: float, goal_type: str, current_weight_kg: float | None = None
) -> tuple[bool, str]:
    """Ràng buộc an toàn y khoa (Responsible Health Logic theo mục 3.2 trang 5):

    - Kiểm tra loại mục tiêu hợp lệ: 'lose_weight', 'maintain', 'gain_muscle'.
    - Tốc độ giảm cân an toàn: 0.25 kg đến ~1% cân nặng/tuần (tối thiểu 0.75, tối đa 1.0 kg/tuần).
    - Tốc độ tăng cơ/tăng cân an toàn: 0.10 kg đến 0.50 kg/tuần.
    - Duy trì cân nặng: weekly_pace_kg phải bằng 0.0.
    """
    if goal_type not in VALID_GOAL_TYPES:
        return (
            False,
            f"Loại mục tiêu không hợp lệ: '{goal_type}'. Chỉ chấp nhận 'lose_weight', 'maintain', hoặc 'gain_muscle'.",
        )

    if goal_type == "lose_weight":
        max_pace = max_safe_lose_pace(current_weight_kg)
        if weekly_pace_kg < LOSE_PACE_MIN or weekly_pace_kg > max_pace + 1e-9:
            return (
                False,
                f"Tốc độ giảm cân an toàn phải từ 0.25kg đến tối đa {max_pace:g}kg/tuần theo chuẩn y khoa.",
            )

    elif goal_type == "gain_muscle":
        if weekly_pace_kg < 0.10 or weekly_pace_kg > 0.50:
            return (
                False,
                "Tốc độ tăng cân/tăng cơ an toàn phải từ 0.10kg đến tối đa 0.50kg/tuần.",
            )

    elif goal_type == "maintain" and abs(weekly_pace_kg) > 1e-4:
        return (
            False,
            "Mục tiêu duy trì cân nặng thì tốc độ thay đổi mỗi tuần phải là 0 kg.",
        )

    return True, "Mục tiêu tốc độ hợp lệ."


def validate_portion_gram(gram: float) -> tuple[bool, str]:
    """Kiểm tra khối lượng món ăn hợp lý (tránh số âm hoặc số phi lý)."""
    if gram <= 0:
        return False, "Khối lượng món ăn phải lớn hơn 0 gam."
    if gram > 3000:
        return False, "Khối lượng một khẩu phần vượt quá giới hạn 3000g."
    return True, "Khối lượng hợp lệ."
