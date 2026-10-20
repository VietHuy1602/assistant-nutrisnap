"""
src/ai/tool_definitions.py
Định nghĩa JSON Schema cho 4 công cụ (Tool Calling) của trợ lý ảo NutriSnap.
Lưu ý bảo mật (theo data_privacy_policy.md): 
- KHÔNG đưa `user_id` vào parameters của LLM Tool Calling. 
- Backend sẽ tự động trích xuất `user_id` từ JWT Token của phiên đăng nhập.
"""

from typing import List, Dict, Any

# 1. Schema cho công cụ: get_daily_nutrition
GET_DAILY_NUTRITION_SCHEMA: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "get_daily_nutrition",
        "description": (
            "Lấy tổng hợp dinh dưỡng (Calories, Protein, Carbs, Fat) đã tiêu thụ trong một ngày cụ thể "
            "và so sánh với mục tiêu hàng ngày (daily target) của người dùng. "
            "Sử dụng khi người dùng hỏi hôm nay đã ăn bao nhiêu calo, còn lại bao nhiêu, hoặc kiểm tra nhật ký ăn uống trong ngày."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "description": (
                        "Ngày cần tra cứu dinh dưỡng theo định dạng 'YYYY-MM-DD' (ví dụ: '2026-10-16'). "
                        "Nếu người dùng nói 'hôm nay' và không rõ ngày, có thể để trống để Backend tự lấy ngày hiện tại."
                    ),
                }
            },
            "required": [],
            "additionalProperties": False,
        },
    },
}

# 2. Schema cho công cụ: log_meal
LOG_MEAL_SCHEMA: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "log_meal",
        "description": (
            "Ghi nhận (lưu) một bữa ăn mới vào nhật ký dinh dưỡng của người dùng. "
            "Sử dụng khi người dùng thông báo họ vừa ăn món gì đó, hoặc sau khi hệ thống nhận diện xong món ăn từ ảnh chụp."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "meal_type": {
                    "type": "string",
                    "enum": ["breakfast", "lunch", "dinner", "snack"],
                    "description": "Loại bữa ăn: bữa sáng (breakfast), bữa trưa (lunch), bữa tối (dinner), hoặc bữa phụ/ăn vặt (snack).",
                },
                "items": {
                    "type": "array",
                    "description": "Danh sách các món ăn/thực phẩm có trong bữa ăn kèm khối lượng hoặc khẩu phần.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "food_name": {
                                "type": "string",
                                "description": "Tên món ăn hoặc thực phẩm đã chuẩn hóa (ví dụ: 'Phở bò', 'Cơm trắng', 'Ức gà luộc').",
                            },
                            "portion_size": {
                                "type": "number",
                                "description": "Số lượng/khẩu phần người dùng đã ăn (ví dụ: 1, 0.5 nếu ăn nửa bát, 1.5). Mặc định là 1.0.",
                            },
                            "unit": {
                                "type": "string",
                                "description": "Đơn vị tính khẩu phần (ví dụ: 'bát', 'tô', 'đĩa', 'gram', 'ml', 'phần').",
                            },
                            "estimated_grams": {
                                "type": "number",
                                "description": "Khối lượng ước tính quy đổi ra gram (nếu có thể suy luận được, ví dụ: 1 bát cơm ~ 150g).",
                            },
                            "notes": {
                                "type": "string",
                                "description": "Ghi chú thêm của người dùng cho món ăn này (ví dụ: 'không lấy nước béo', 'ít đường').",
                            },
                        },
                        "required": ["food_name", "portion_size", "unit"],
                        "additionalProperties": False,
                    },
                },
                "logged_at": {
                    "type": "string",
                    "description": "Thời gian ăn theo chuẩn ISO 8601 (YYYY-MM-DDTHH:MM:SS) hoặc 'YYYY-MM-DD'. Không bắt buộc, mặc định là thời điểm hiện tại.",
                },
                "note": {
                    "type": "string",
                    "description": "Ghi chú chung cho cả bữa ăn (nếu có).",
                },
            },
            "required": ["meal_type", "items"],
            "additionalProperties": False,
        },
    },
}

# 3. Schema cho công cụ: recommend_meals
RECOMMEND_MEALS_SCHEMA: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "recommend_meals",
        "description": (
            "Đề xuất các món ăn phù hợp từ cơ sở dữ liệu món ăn Việt Nam (food_references) "
            "dựa trên lượng calo còn lại trong ngày, mục tiêu macro (Protein, Carbs, Fat) hoặc ngân sách chi tiêu."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "meal_type": {
                    "type": "string",
                    "enum": ["breakfast", "lunch", "dinner", "snack"],
                    "description": "Bữa ăn mà người dùng đang cần gợi ý.",
                },
                "max_calories": {
                    "type": "number",
                    "description": "Mức năng lượng (Calories/kcal) tối đa cho bữa ăn này (dựa trên hạn mức calo còn lại trong ngày).",
                },
                "min_protein_g": {
                    "type": "number",
                    "description": "Lượng chất đạm (Protein) tối thiểu cần đạt (tính bằng gram), hữu ích cho người cần tăng cơ.",
                },
                "max_budget_vnd": {
                    "type": "number",
                    "description": "Ngân sách tối đa cho bữa ăn tính bằng VNĐ (ví dụ: 50000 cho 50.000đ).",
                },
                "dietary_preferences": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Các yêu cầu hoặc sở thích ăn uống (ví dụ: ['ít béo', 'không cay', 'chay', 'low-carb']).",
                },
            },
            "required": ["meal_type"],
            "additionalProperties": False,
        },
    },
}

# 4. Schema cho công cụ: get_progress_summary
GET_PROGRESS_SUMMARY_SCHEMA: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "get_progress_summary",
        "description": (
            "Lấy báo cáo thống kê tiến độ dinh dưỡng, lượng calo trung bình mỗi ngày và mức độ bám sát mục tiêu (Goal) "
            "của người dùng trong một khoảng thời gian (7 ngày qua, 30 ngày qua, hoặc tùy chọn)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "period": {
                    "type": "string",
                    "enum": ["7_days", "14_days", "30_days", "custom"],
                    "description": "Khoảng thời gian cần thống kê tiến độ. Mặc định là '7_days' (1 tuần).",
                },
                "start_date": {
                    "type": "string",
                    "description": "Ngày bắt đầu (YYYY-MM-DD), chỉ bắt buộc khi period là 'custom'.",
                },
                "end_date": {
                    "type": "string",
                    "description": "Ngày kết thúc (YYYY-MM-DD), chỉ bắt buộc khi period là 'custom'.",
                },
            },
            "required": ["period"],
            "additionalProperties": False,
        },
    },
}

# Danh sách tổng hợp tất cả 4 tools để truyền trực tiếp vào LLM API
NUTRISNAP_TOOLS: List[Dict[str, Any]] = [
    GET_DAILY_NUTRITION_SCHEMA,
    LOG_MEAL_SCHEMA,
    RECOMMEND_MEALS_SCHEMA,
    GET_PROGRESS_SUMMARY_SCHEMA,
]


def get_tool_definitions() -> List[Dict[str, Any]]:
    """Hàm helper trả về danh sách toàn bộ cấu hình Tool Calling cho AI Agent."""
    return NUTRISNAP_TOOLS


def get_tool_by_name(tool_name: str) -> Dict[str, Any] | None:
    """Hàm helper tìm kiếm nhanh schema của một tool theo tên (phục vụ kiểm thử Pytest của Quốc Tuấn)."""
    for tool in NUTRISNAP_TOOLS:
        if tool.get("function", {}).get("name") == tool_name:
            return tool
    return None