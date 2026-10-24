"""
tests/unit/test_intent_classifier.py
Bộ kiểm thử tham số hóa toàn diện (>= 40 câu) cho intent_classifier.
Đáp ứng AC của mục A1 trong docs/AI_IMPROVEMENT_PLAN.md:
- Bảng test >= 40 câu có dấu, không dấu, viết tắt.
- Kiểm tra chính xác "hôm nay tôi đã ăn gì", "hom nay toi da an gi", "tôi đã ăn gì hôm qua" -> list_meals.
- "tổng kết bữa ăn hôm nay", "hôm nay mình ăn bao nhiêu đạm rồi", "hôm qua tôi ăn bao nhiêu" -> get_daily_nutrition.
- Phân biệt rõ ràng giữa gợi ý (recommend_meals) và tra cứu quá khứ.
- Hỗ trợ các công cụ mở rộng C1.
"""

import pytest

from src.ai.intent_classifier import classify_user_intent

INTENT_TEST_CASES = [
    # 1. Nhóm tra cứu món đã ăn (list_meals) - có dấu, không dấu, biến thể
    ("hôm nay tôi đã ăn gì", "list_meals"),
    ("hom nay toi da an gi", "list_meals"),
    ("tôi đã ăn gì hôm qua", "list_meals"),
    ("hom qua toi da an gi", "list_meals"),
    ("hôm nay mình đã ăn những gì rồi", "list_meals"),
    ("liệt kê bữa ăn hôm nay giúp mình", "list_meals"),
    ("liệt kê bữa ăn", "list_meals"),
    ("bữa sáng hôm qua ăn gì", "list_meals"),
    ("sáng nay tôi ăn gì", "list_meals"),
    ("trưa nay mình đã ăn gì", "list_meals"),
    ("hôm nay ăn gì rồi", "list_meals"),
    ("nhật ký bữa ăn hôm nay", "list_meals"),

    # 2. Nhóm tổng hợp dinh dưỡng ngày (get_daily_nutrition)
    ("Hôm nay tôi còn bao nhiêu calo?", "get_daily_nutrition"),
    ("hom nay an gi roi, tong may kcal", "get_daily_nutrition"),
    ("tổng kết bữa ăn hôm nay", "get_daily_nutrition"),
    ("hôm nay mình ăn bao nhiêu đạm rồi", "get_daily_nutrition"),
    ("hôm qua tôi ăn bao nhiêu", "get_daily_nutrition"),
    ("Cho mình xem dinh dưỡng ngày hôm nay", "get_daily_nutrition"),
    ("Đã nạp bao nhiêu carbs hôm nay rồi nhỉ?", "get_daily_nutrition"),
    ("Kiểm tra lượng calo ngày 2026-10-20", "get_daily_nutrition"),
    ("Còn bao nhiêu calo cho bữa tối vậy bạn?", "get_daily_nutrition"),
    ("Xem macros ngày hom qua giup minh", "get_daily_nutrition"),
    ("Hôm nay đã ghi được mấy bữa ăn rồi?", "get_daily_nutrition"),
    ("hôm nay tôi đã ăn bao nhiêu phần trăm calo mục tiêu?", "get_daily_nutrition"),

    # 3. Nhóm gợi ý món ăn (recommend_meals)
    ("Gợi ý bữa tối 40k đủ đạm", "recommend_meals"),
    ("Còn 500 kcal thì ăn gì no mà rẻ?", "recommend_meals"),
    ("Gợi ý món ăn trưa dưới 50.000 VNĐ", "recommend_meals"),
    ("goi y bua sang 30k nhanh gon", "recommend_meals"),
    ("Tôi còn 400 calo, nên ăn gì cho bữa tối?", "recommend_meals"),
    ("Tìm giúp món ăn nhiều protein ngân sách 60k", "recommend_meals"),
    ("Gợi ý món ăn ít calo cho người giảm cân 45k", "recommend_meals"),
    ("Tối nay ăn gì khoảng 350 kcal và dưới 40000đ?", "recommend_meals"),
    ("Gợi ý thực đơn sinh viên 30k", "recommend_meals"),
    ("Có món gì thanh đạm cho bữa xế tầm 20k không?", "recommend_meals"),
    ("trưa nay nên ăn gì", "recommend_meals"),
    ("ăn gì bây giờ bạn ơi", "recommend_meals"),

    # 4. Nhóm ghi nhận bữa ăn (log_meal)
    ("Trưa nay mình ăn một tô phở bò tái", "log_meal"),
    ("Ghi giúp mình bữa sáng 2 ổ bánh mì trứng", "log_meal"),
    ("Vừa ăn tối cơm tấm sườn nướng 300g", "log_meal"),
    ("Ghi nhận bữa phụ 1 hộp sữa chua không đường", "log_meal"),
    ("minh moi an com trua voi uc ga ap chao 200g", "log_meal"),
    ("Bữa sáng ăn một tô bún bò Huế", "log_meal"),
    ("Ghi log bữa tối ăn canh chua cá lóc và cơm trắng", "log_meal"),
    ("An nhe buoi chieu 1 qua chuoi va sua tuoi", "log_meal"),
    ("Ghi nhận giúp mình vừa ăn tô phở gà xé 350g", "log_meal"),
    ("Mình vừa ăn bún chả 400g cho bữa trưa", "log_meal"),

    # 5. Nhóm theo dõi tiến độ (get_progress_summary)
    ("Xem tiến độ tuần này", "get_progress_summary"),
    ("Tháng này mình ghi nhật ký được mấy ngày?", "get_progress_summary"),
    ("Xem biểu đồ xu hướng cân nặng 14 ngày qua", "get_progress_summary"),
    ("tiến độ cân nặng gần đây của tôi thế nào", "get_progress_summary"),
    ("Tôi đã duy trì streak được bao nhiêu ngày rồi?", "get_progress_summary"),
    ("Xem tổng kết dinh dưỡng 7 ngày gần nhất", "get_progress_summary"),
    ("Cân nặng EMA của mình thay đổi ra sao trong 30 ngày?", "get_progress_summary"),
    ("xem bao cao tien do 2 tuan vua roi", "get_progress_summary"),

    # 6. Nhóm công cụ mở rộng C1
    ("bún bò Huế bao nhiêu calo", "get_food_info"),
    ("100g ức gà bao nhiêu đạm", "get_food_info"),
    ("1 tô phở bao nhiêu kcal", "get_food_info"),
    ("so sánh cơm và bún", "compare_foods"),
    ("cơm tấm hay bánh mì ít calo hơn", "compare_foods"),
    ("mục tiêu của tôi là gì", "get_goal_summary"),
    ("TDEE của tôi bao nhiêu", "get_goal_summary"),
    ("thay trà sữa bằng gì cho đỡ calo", "suggest_swap"),

    # 7. Nhóm Chitchat & Ngoài phạm vi & An toàn (None)
    ("Xin chào bạn!", None),
    ("Hello NutriSnap", None),
    ("Cảm ơn bạn nhiều nhé, tư vấn rất nhiệt tình!", None),
    ("Ứng dụng này giúp mình làm được những gì?", None),
    ("Thời tiết hôm nay thế nào?", None),
    ("Viết giúp tôi một đoạn code Python", None),
    ("Tôi bị tiểu đường uống thuốc gì?", None),
    ("Mai nhịn ăn cả ngày để bù được không?", None),
    ("chat beo tot la gi", None),
    ("uong bao nhieu lit nuoc moi ngay", None),
]


@pytest.mark.parametrize("message,expected_intent", INTENT_TEST_CASES)
def test_intent_classifier_parameterized(message: str, expected_intent: str | None):
    actual_intent = classify_user_intent(message)
    assert actual_intent == expected_intent, f"Failed for '{message}': expected {expected_intent}, got {actual_intent}"
