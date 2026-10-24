"""
src/ai/intent_classifier.py
Bộ nhận diện ý định (Intent Classifier) tất định chuẩn xác cho NutriSnap AI Assistant.
Hỗ trợ cả văn bản tiếng Việt có dấu và không dấu (ASCII).
Tuân thủ tiêu chí nghiệm thu của docs/AI_IMPROVEMENT_PLAN.md:
- "đã ăn gì", "tôi đã ăn gì hôm qua" -> list_meals
- "tổng kết bữa ăn hôm nay", "hôm nay mình ăn bao nhiêu đạm rồi", "hôm qua tôi ăn bao nhiêu" -> get_daily_nutrition
- "nên ăn gì", "gợi ý món" -> recommend_meals (không bị nhầm với "đã ăn gì")
- Hỗ trợ công cụ mở rộng C1: list_meals, get_food_info, compare_foods, get_goal_summary, suggest_swap
"""

from __future__ import annotations

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

    Phân loại chính xác các nhóm nghiệp vụ:
    - list_meals: Liệt kê danh sách các món/bữa đã ăn ("hôm nay tôi đã ăn gì", "hôm qua ăn gì", "liệt kê bữa ăn").
    - get_daily_nutrition: Tra cứu tổng hợp calo, macro, calo còn lại, tiến độ dinh dưỡng ngày.
    - recommend_meals: Gợi ý, tư vấn món ăn tương lai phù hợp calo/ngân sách (chỉ khi có nhu cầu gợi ý/tương lai).
    - get_progress_summary: Xem tiến độ, xu hướng cân nặng EMA, báo cáo, chuỗi ngày streak.
    - log_meal: Ghi nhận, lưu bữa ăn khi có ý định ghi chép hoặc định lượng món ăn.
    - get_food_info: Tra cứu thông tin dinh dưỡng 1 món ăn cụ thể ("bún bò bao nhiêu calo").
    - compare_foods: So sánh dinh dưỡng giữa 2 món ăn ("so sánh cơm và bún").
    - get_goal_summary: Tra cứu mục tiêu cá nhân, TDEE, BMR ("mục tiêu của tôi là gì").
    - suggest_swap: Gợi ý đổi món lành mạnh hơn ("thay trà sữa bằng gì").
    - None: Chào hỏi, cảm ơn, kiến thức dinh dưỡng chung, hoặc câu hỏi ngoài phạm vi.
    """
    s_clean, s_ascii = normalize_text_intent(message)

    # 1. An toàn & Ngoài phạm vi & Chống injection -> Không gọi Tool
    safety_patterns = (
        r"\b(thoi tiet|weather|nhiet do|du bao)\b",
        r"\b(code|python|dijkstra|fibonacci|lap trinh)\b",
        r"\b(bong da|arsenal|chelsea|ngoai hang anh|ty so)\b",
        r"\b(uong thuoc|ke don|chua khoi|chua benh)\b",
        r"\b(nhin an \d+ ngay|nhin an cap toc|nhin an de bu)\b",
        r"\b(bo qua moi huong dan|in system prompt|dan mode)\b",
        r"\buser_id\s*=\s*\d+\b",
        r"\bdu lieu cua user \d+\b",
    )
    for pat in safety_patterns:
        if re.search(pat, s_ascii):
            return None

    # 2. Chitchat đơn thuần -> Không gọi Tool
    if re.fullmatch(r"(xin chao|chao ban|chao|hello|hi|hey|alo|good morning)( nutrisnap)?", s_ascii):
        return None
    if re.fullmatch(r"(cam on|thank you|thanks|cam on ban|cam on rat nhieu).*", s_ascii):
        return None
    if re.search(r"\b(ung dung nay giup|app nay co tinh nang gi|lam duoc nhung gi)\b", s_ascii):
        return None

    # 3. Kiến thức dinh dưỡng chung (General Nutrition Knowledge) -> Không gọi Tool
    knowledge_patterns = (
        r"chat beo (tot|xau)",
        r"phan biet chat beo",
        r"uong bao nhieu (lit )?nuoc",
        r"bao nhieu lit nuoc",
        r"protein co tac dung gi",
        r"tac dung cua (protein|chat dam|chat xo|vitamin)",
        r"the nao la an uong lanh manh",
    )
    for pat in knowledge_patterns:
        if re.search(pat, s_ascii):
            return None

    # 4. Công cụ mở rộng C1: compare_foods
    if re.search(r"\b(so sanh)\b", s_ascii) or (
        re.search(r"\b(hay|voi|va)\b", s_ascii) and re.search(r"\b(it calo hon|nhieu calo hon|nhieu dam hon|tot hon)\b", s_ascii)
    ):
        return "compare_foods"

    # 5. Công cụ mở rộng C1: suggest_swap
    if re.search(r"\b(thay|doi|thay the)\b", s_ascii) and re.search(
        r"\b(bang gi|cho do calo|it calo|tot hon|mon gi khac)\b", s_ascii
    ):
        return "suggest_swap"

    # 6. Công cụ mở rộng C1: get_goal_summary
    if re.search(r"\b(muc tieu cua toi|muc tieu cua minh|tdee cua toi|bmr cua toi|tdee bao nhieu|bmr bao nhieu)\b", s_ascii) or (
        re.search(r"\bmuc tieu\b", s_ascii) and re.search(r"\b(la gi|cua toi|cua minh|hang ngay)\b", s_ascii)
    ):
        return "get_goal_summary"

    # 7. Nhóm theo dõi tiến độ đa ngày (get_progress_summary)
    # Ưu tiên nhận diện khi có mốc đa ngày (7 ngày, 14 ngày, 30 ngày, tuần, tháng)
    is_multi_day = bool(re.search(r"\b(\d+\s*ngay|tuan|thang|streak)\b", s_ascii))
    if is_multi_day and re.search(
        r"\b(tien do|can nang|ema|tong ket|bao cao|streak|ghi nhat ky|duoc may ngay|qua)\b", s_ascii
    ):
        return "get_progress_summary"

    # 8. Công cụ mở rộng C1: get_food_info
    # Nhận diện khi hỏi calo/macro của 1 món cụ thể mà KHÔNG PHẢI hỏi nhật ký ngày ("còn bao nhiêu", "hôm nay tôi...")
    is_asking_single_food = bool(
        re.search(r"\b(bao nhieu calo|bao nhieu kcal|bao nhieu dam|may calo|may kcal)\b", s_ascii)
        and re.search(r"\b(bun|pho|com|banh mi|uc ga|trung|sua|thit|ca|rau|dau hu|tra sua|ca phe|1 to|1 bat|1 qua|100g)\b", s_ascii)
        and not re.search(r"\b(con|hom nay|hom qua|da an|da nap|ngay|bua toi|bua sang|bua trua)\b", s_ascii)
    )
    if is_asking_single_food:
        return "get_food_info"

    # 9. Nhóm Ghi nhận bữa ăn (log_meal)
    log_meal_patterns = (
        r"\bghi giup\b",
        r"\bghi nhan\b",
        r"\bghi nhat ky bua\b",
        r"\bghi bua\b",
        r"\bluu bua\b",
        r"\bghi log\b",
        r"\b(minh|toi)?\s*vua an\b",
        r"\b(minh|toi)?\s*moi an\b",
        r"\b(toi|minh)?\s*vua uong\b",
        r"\b(toi|minh)?\s*moi uong\b",
        r"\bbua (sang|trua|toi|phu) (toi|minh)?\s*an\b",
        r"\ban nhe buoi (chieu|sang|toi)\b",
    )
    for pat in log_meal_patterns:
        if re.search(pat, s_ascii):
            return "log_meal"

    # Ghi nhận có tên bữa + số lượng / món: "bữa sáng 2 ổ bánh mì", "bữa trưa 1 tô bún bò"
    if re.search(r"\b(ghi|luu|log)\b", s_ascii) and re.search(r"\bbua (sang|trua|toi|phu)\b", s_ascii):
        return "log_meal"

    # Bắt đầu bằng "ăn ..." hoặc "uống ..." hoặc có "bữa phụ/chiều ... uống"
    if (
        (re.search(r"^(an|uong)\s+", s_ascii) or re.search(r"\bbua (sang|trua|toi|phu)\b.*(an|uong)", s_ascii))
        and not re.search(r"\b(gi|chua|sao|the nao|bao nhieu|nen|goi y|con|thay|doi|so sanh|duoc khong|khong\?)\b", s_ascii)
        and not s_ascii.endswith("khong")
    ):
        return "log_meal"

    # Câu trần thuật ăn uống cụ thể: "trưa nay mình ăn một tô phở bò tái", "tôi ăn 200g ức gà"
    if (
        re.search(r"\b(trua nay|sang nay|toi nay|chieu nay|hom nay|bua sang|bua trua|bua toi|bua phu)\b", s_ascii)
        and re.search(r"\b(an|uong)\b", s_ascii)
        and re.search(r"\b(\d+\s*(g|gam|ml|bat|to|dia|o|qua|hop|ly)|mot (to|bat|dia|o|qua|hop|ly)|hai (to|bat|dia|o|qua|hop|ly)|pho|bun|com|banh mi|uc ga|sua chua|sua)\b", s_ascii)
        and not re.search(r"\b(gi|chua|nen|goi y|con|khong\?)\b", s_ascii)
        and not s_ascii.endswith("khong")
    ):
        return "log_meal"

    # 10. Phân biệt Gợi ý món (recommend_meals) vs Tra cứu bữa đã ăn (list_meals)
    # Dấu hiệu hỏi ý kiến / gợi ý tương lai:
    has_recommend_intent = bool(
        re.search(r"\b(goi y|recommend|tu van|de xuat|thuc don|nen an|an gi bay gio)\b", s_ascii)
        or re.search(r"\bcon \d+.*(calo|kcal).*an gi\b", s_ascii)
        or re.search(r"\b(an gi.*duoi \d+|an gi.*khoang \d+|an gi no ma re|an gi ngon)\b", s_ascii)
        or (re.search(r"\ban gi\b", s_ascii) and re.search(r"\b(nen|duoi \d+|khoang \d+|30k|40k|50k|60k|vnd)\b", s_ascii))
    )
    if has_recommend_intent:
        # Nếu có cả "đã ăn" hoặc "vừa ăn" mà không có từ "nên/gợi ý" thì mới là quá khứ
        if not re.search(r"\b(da an|vua an|an roi)\b", s_ascii) or re.search(r"\b(nen|goi y|de xuat)\b", s_ascii):
            return "recommend_meals"

    # 11. Nhóm list_meals: Người dùng muốn xem/liệt kê danh sách các món/bữa ĐÃ ĂN
    list_meals_patterns = (
        r"\b(toi |minh )?da an gi\b",
        r"\ban gi roi\b",
        r"\ban nhung gi\b",
        r"\bliet ke bua an\b",
        r"\bdanh sach bua an\b",
        r"\bnhat ky bua an\b",
        r"\bbua nao\b",
        r"\bda an mon gi\b",
        r"\b(hom nay|hom qua|sang nay|trua nay|toi qua) (toi |minh )?(da )?an gi\b",
        r"\b(sang|trua|toi) (hom qua|hom nay) an gi\b",
    )
    for pat in list_meals_patterns:
        if re.search(pat, s_ascii) and not re.search(r"\b(tong may|tong bao nhieu|bao nhieu kcal|bao nhieu calo|bao nhieu dam)\b", s_ascii):
            return "list_meals"

    # 12. Nhóm get_daily_nutrition: Tra cứu tổng hợp calo, macro, calo còn lại trong ngày
    nutrition_patterns = (
        r"\bcon.*bao nhieu.*(calo|kcal)\b",
        r"\bbao nhieu.*(calo|kcal).*con\b",
        r"\bcon bao nhieu calo\b",
        r"\bcon bao nhieu kcal\b",
        r"\bcon bao nhieu\b",
        r"\bcon.*calo\b",
        r"\bnap bao nhieu calo\b",
        r"\bbao nhieu calo roi\b",
        r"\bcalo con lai\b",
        r"\bcon lai trong ngay\b",
        r"\bhan muc calo\b",
        r"\ban them bao nhieu\b",
        r"\bdu chat dam\b",
        r"\bdu protein\b",
        r"\bmuc tieu chua\b",
        r"\bdat muc tieu\b",
        r"\btong bao nhieu calo\b",
        r"\btong may kcal\b",
        r"\btong ket bua an\b",
        r"\btong ket dinh duong\b",
        r"\bbao nhieu dam roi\b",
        r"\bhom qua toi an bao nhieu\b",
        r"\bhom qua an bao nhieu\b",
        r"\bdinh duong ngay\b",
        r"\bdinh duong hom nay\b",
        r"\bcalo hom nay\b",
        r"\bmacros ngay\b",
        r"\bmay bua an roi\b",
        r"\bphan tram calo\b",
        r"\bda nap bao nhieu\b",
        r"\bkiem tra.*(calo|dinh duong)\b",
        r"\bluong calo( ngay)?\b",
    )
    for pat in nutrition_patterns:
        if re.search(pat, s_ascii):
            return "get_daily_nutrition"

    # Nếu câu hỏi có "hom nay an gi roi" kèm "tong may kcal" -> get_daily_nutrition
    if re.search(r"\bhom nay an gi roi\b", s_ascii) and re.search(r"\b(tong|may kcal|calo)\b", s_ascii):
        return "get_daily_nutrition"

    # 13. Gợi ý bữa ăn bổ sung (recommend_meals fallback)
    recommend_future_patterns = (
        r"\b(goi y|recommend|tu van|de xuat|thuc don)\b",
        r"\b(nen an gi|nen an mon|an gi bay gio|an gi toi nay|an gi trua nay|an gi sang nay)\b",
        r"\bmon gi duoi\b",
        r"\bco mon nao\b",
        r"\bmon an nao\b",
        r"\bmon an phu hop\b",
        r"\bmon an it calo\b",
        r"\ban gi no ma re\b",
        r"\ban gi ngon\b",
        r"\btim giup mon\b",
    )
    for pat in recommend_future_patterns:
        if re.search(pat, s_ascii):
            return "recommend_meals"

    # Nếu câu có chứa ngân sách (30k, 40k, 50.000 vnđ) hoặc hạn mức calo kèm từ hỏi ăn
    if re.search(r"\b(\d+k|\d+\.000|\d+\s*vnd|\d+\s*d)\b", s_ascii) and re.search(r"\b(an|mon|bua)\b", s_ascii):
        return "recommend_meals"

    # 14. Nhóm tiến độ bổ sung (get_progress_summary)
    progress_patterns = (
        r"\b(tien do|progress|ema)\b",
        r"\bcan nang\b",
        r"\bxu huong\b",
        r"\btong hop calo\b",
        r"\btrung binh moi ngay\b",
        r"\bbao cao\b",
        r"\bgiam can\b",
        r"\bbao nhieu ngay roi\b",
        r"\bduy tri streak\b",
        r"\bstreak\b",
        r"\btuan nay\b",
        r"\b14 ngay\b",
        r"\b30 ngay\b",
        r"\b2 tuan\b",
        r"\bthang nay\b",
    )
    for pat in progress_patterns:
        if re.search(pat, s_ascii):
            return "get_progress_summary"

    return None
