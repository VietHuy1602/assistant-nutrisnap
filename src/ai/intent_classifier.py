"""
src/ai/intent_classifier.py
Bộ nhận diện ý định (Intent Classifier) tất định chuẩn xác cho NutriSnap AI Assistant.
Hỗ trợ cả văn bản tiếng Việt có dấu và không dấu (ASCII).
"""

import re
import unicodedata


def normalize_text_intent(text: str) -> tuple[str, str]:
    """Chuẩn hóa chuỗi văn bản để so khớp ý định (hỗ trợ cả có dấu và không dấu)."""
    s = text.strip().lower()
    s_clean = " ".join(s.split())
    s_no_d = s_clean.replace("đ", "d").replace("Đ", "D")
    normalized = unicodedata.normalize("NFD", s_no_d)
    no_marks = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    s_ascii = " ".join(re.sub(r"[^\w\s]", " ", no_marks).split())
    return s_clean, s_ascii


def classify_user_intent(message: str) -> str | None:
    """Nhận diện ý định gọi Tool từ câu hỏi người dùng dựa trên ngữ nghĩa và mẫu từ khóa chính xác.

    Phân loại chính xác 4 nhóm nghiệp vụ:
    - get_daily_nutrition: Tra cứu dinh dưỡng, calo còn lại, hạn mức calo, mục tiêu macro trong ngày.
    - recommend_meals: Gợi ý, tư vấn món ăn phù hợp với calo/ngân sách.
    - get_progress_summary: Xem tiến độ, xu hướng cân nặng EMA, báo cáo, chuỗi ngày liên tục.
    - log_meal: Ghi nhận, lưu bữa ăn khi có ý định ghi chép hoặc định lượng món ăn.
    - None: Chào hỏi (chitchat), hỏi kiến thức dinh dưỡng chung, thời tiết, hoặc ngoài phạm vi Tool.
    """
    s_clean, s_ascii = normalize_text_intent(message)

    # 1. Chitchat / Kiến thức chung / Ngoài phạm vi -> Không gọi Tool
    chitchat_patterns = (
        r"\b(xin chao|chao ban|hello|hi|cam on|thank)\b",
        r"\b(thoi tiet|weather)\b",
        r"\b(bmr|tdee)\b",
        r"chat beo (tot|xau)",
        r"phan biet chat beo",
        r"uong bao nhieu lit nuoc",
        r"bao nhieu lit nuoc",
    )
    for pat in chitchat_patterns:
        if re.search(pat, s_ascii):
            return None

    # 2. Nhóm B: Gợi ý bữa ăn (recommend_meals) - Ưu tiên khi có từ khóa gợi ý/tư vấn/hỏi món ăn
    recommend_patterns = (
        r"\b(goi y|recommend|tu van|de xuat|thuc don)\b",
        r"\b(nen an|an gi)\b",
        r"mon gi duoi",
        r"co mon nao",
        r"mon an nao",
        r"mon an phu hop",
        r"mon an it calo",
    )
    for pat in recommend_patterns:
        if re.search(pat, s_ascii):
            return "recommend_meals"

    # 3. Nhóm D: Theo dõi tiến độ (get_progress_summary)
    progress_patterns = (
        r"\b(tien do|progress|ema)\b",
        r"can nang",
        r"xu huong",
        r"tong hop calo",
        r"trung binh moi ngay",
        r"bao cao",
        r"giam can",
        r"bao nhieu ngay roi",
        r"duy tri",
    )
    for pat in progress_patterns:
        if re.search(pat, s_ascii):
            return "get_progress_summary"

    # 4. Nhóm A: Tra cứu dinh dưỡng ngày (get_daily_nutrition)
    nutrition_patterns = (
        r"nap bao nhieu calo",
        r"bao nhieu calo roi",
        r"calo con lai",
        r"con lai trong ngay",
        r"han muc calo",
        r"an them bao nhieu",
        r"du chat dam",
        r"du protein",
        r"muc tieu chua",
        r"dat muc tieu",
        r"hom qua.*da an",
        r"tong bao nhieu calo",
        r"da an nhung gi",
        r"nhat ky dinh duong",
        r"dinh duong ngay",
        r"dinh duong hom nay",
        r"calo hom nay",
        r"hom nay an",
    )
    for pat in nutrition_patterns:
        if re.search(pat, s_ascii):
            return "get_daily_nutrition"

    # 5. Nhóm C: Ghi nhận bữa ăn (log_meal)
    log_meal_patterns = (
        r"ghi nhan",
        r"ghi nhat ky bua",
        r"ghi bua",
        r"luu bua",
        r"vua an",
        r"toi vua an",
        r"toi nay toi an",
        r"trua nay toi an",
        r"sang nay toi an",
        r"bua sang toi an",
        r"bua trua toi an",
        r"bua toi toi an",
        r"toi an \d+",
        r"vua uong",
        r"toi uong",
        r"uong 1 ly",
        r"bua phu chieu toi uong",
    )
    for pat in log_meal_patterns:
        if re.search(pat, s_ascii):
            return "log_meal"

    # Kiểm tra bổ trợ cho log_meal: có định lượng (gam / ml / bát / tô / đĩa / ổ) kèm tên món hoặc động từ ăn/uống
    if re.search(r"\b(an|uong|bat|to|dia|o|ly)\b", s_ascii) and re.search(
        r"\b(\d+\s*(g|gam|ml)|pho|bun|com|banh mi|uc ga|sua)\b", s_ascii
    ):
        return "log_meal"

    return None
