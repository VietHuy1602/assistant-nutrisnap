import re


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


def validate_goal_pace(weekly_pace_kg: float, goal_type: str) -> tuple[bool, str]:
    """Ràng buộc an toàn y khoa (Responsible Health Logic):

    - Tốc độ giảm cân an toàn: tối đa 1.0 kg/tuần (chuẩn NHS khuyến nghị 0.5 - 1kg).
    - Tốc độ tăng cân an toàn: tối đa 0.5 kg/tuần.
    """
    if goal_type == "lose_weight" and (weekly_pace_kg <= 0 or weekly_pace_kg > 1.0):
        return False, "Tốc độ giảm cân an toàn phải từ 0.25kg đến tối đa 1.0kg/tuần."
    if goal_type == "gain_muscle" and (weekly_pace_kg <= 0 or weekly_pace_kg > 0.5):
        return False, "Tốc độ tăng cân/tăng cơ an toàn tối đa 0.5kg/tuần."
    return True, "Mục tiêu tốc độ hợp lệ."


def validate_portion_gram(gram: float) -> tuple[bool, str]:
    """Kiểm tra khối lượng món ăn hợp lý (tránh số âm hoặc số phi lý)."""
    if gram <= 0:
        return False, "Khối lượng món ăn phải lớn hơn 0 gam."
    if gram > 3000:
        return False, "Khối lượng một khẩu phần vượt quá giới hạn 3000g."
    return True, "Khối lượng hợp lệ."
