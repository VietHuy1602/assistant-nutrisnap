"""
src/ai/tool_definitions.py
Định nghĩa JSON Schema chuẩn hóa cho 4 công cụ cốt lõi (Tool Calling) của trợ lý ảo NutriSnap.

Tuân thủ nghiêm ngặt các nguyên tắc:
1. Zero-Trust Security: Schema TUYỆT ĐỐI KHÔNG chứa tham số `user_id` (Backend tự trích xuất từ JWT).
2. Tên tham số đơn nhất, nhất quán: Không có alias trùng lặp (dùng duy nhất `remaining_calories`, `budget_vnd`, `days_range`).
3. Two-Step Confirmation: log_meal tích hợp cờ `is_confirmed: bool` phân định rõ bản xem trước và ghi dữ liệu.
4. Tương thích đa nền tảng (Gemini SDK & OpenAPI/OpenAI): Cung cấp hàm chuyển đổi định dạng chuẩn cho Google Generative AI (loại bỏ additionalProperties, chuẩn hóa kiểu dữ liệu hoa OBJECT/STRING/...).
"""

import copy
from typing import Any

# ==============================================================================
# 1. ĐẶC TẢ FUNCTION SCHEMAS NGUYÊN BẢN (OPENAPI / REST CONTRACT COMPLIANT)
# ==============================================================================

GET_DAILY_NUTRITION_DECLARATION: dict[str, Any] = {
    "name": "get_daily_nutrition",
    "description": (
        "Lấy tổng hợp dinh dưỡng (Calories, Protein, Carbs, Fat) đã tiêu thụ trong một ngày cụ thể "
        "và so sánh với hạn mức calo / mục tiêu hàng ngày (daily target) của người dùng. "
        "Sử dụng khi người dùng hỏi hôm nay đã ăn bao nhiêu calo, còn lại bao nhiêu, hoặc kiểm tra nhật ký ăn uống trong ngày."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "date": {
                "type": "string",
                "description": (
                    "Ngày cần tra cứu dinh dưỡng theo định dạng 'YYYY-MM-DD' (ví dụ: '2026-10-16'). "
                    "Nếu người dùng nói 'hôm nay' hoặc không chỉ định ngày, để trống để Backend tự lấy ngày hiện tại."
                ),
            }
        },
        "required": [],
    },
}

LOG_MEAL_DECLARATION: dict[str, Any] = {
    "name": "log_meal",
    "description": (
        "Ghi nhận (lưu) một bữa ăn vào nhật ký dinh dưỡng của người dùng. "
        "Tuân thủ cơ chế Two-Step Confirmation: Khi AI nhận diện hoặc người dùng nêu món ăn lần đầu, "
        "gọi với is_confirmed=False để tính nháp calo và trả về bản xem trước (pending_confirmation). "
        "Chỉ khi người dùng đã bấm nút xác nhận lưu thì mới gọi với is_confirmed=True để ghi vào CSDL."
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
                "description": "Danh sách các món ăn/thực phẩm trong bữa ăn kèm khối lượng ước tính hoặc khẩu phần.",
                "items": {
                    "type": "object",
                    "properties": {
                        "food_name": {
                            "type": "string",
                            "description": "Tên món ăn hoặc thực phẩm (ví dụ: 'Phở bò tái', 'Cơm tấm sườn nướng', 'Ức gà luộc').",
                        },
                        "portion_size": {
                            "type": "number",
                            "description": "Số lượng/khẩu phần (ví dụ: 1.0 bát, 0.5 tô, 2 quả). Mặc định là 1.0.",
                        },
                        "unit": {
                            "type": "string",
                            "description": "Đơn vị tính khẩu phần (ví dụ: 'bát', 'tô', 'đĩa', 'gram', 'ml', 'hộp').",
                        },
                        "estimated_grams": {
                            "type": "number",
                            "description": "Khối lượng ước tính quy đổi ra gram (ví dụ: 1 bát cơm ~ 150g, 1 bát phở ~ 400g).",
                        },
                        "notes": {
                            "type": "string",
                            "description": "Ghi chú gia vị ẩn hoặc yêu cầu thêm (ví dụ: 'không mỡ hành', 'ít ngọt').",
                        },
                    },
                    "required": ["food_name", "portion_size", "unit"],
                },
            },
            "is_confirmed": {
                "type": "boolean",
                "description": (
                    "Cờ xác nhận ghi nhận bữa ăn (Two-Step Confirmation Flow). "
                    "False: Trả về bản xem trước tính nháp calo/macro (pending_confirmation). "
                    "True: Người dùng đã bấm nút xác nhận lưu trên giao diện, Backend mới chính thức ghi vào CSDL."
                ),
            },
            "logged_at": {
                "type": "string",
                "description": "Thời gian ăn theo chuẩn ISO 8601 (YYYY-MM-DDTHH:MM:SS) hoặc 'YYYY-MM-DD'. Mặc định thời điểm hiện tại.",
            },
            "note": {
                "type": "string",
                "description": "Ghi chú chung cho toàn bộ bữa ăn.",
            },
        },
        "required": ["meal_type", "items"],
    },
}

RECOMMEND_MEALS_DECLARATION: dict[str, Any] = {
    "name": "recommend_meals",
    "description": (
        "Đề xuất các món ăn Việt Nam từ cơ sở dữ liệu food_references phù hợp với hạn mức calo còn lại trong ngày "
        "và ngân sách chi tiêu của người dùng."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "remaining_calories": {
                "type": "number",
                "description": "Hạn mức năng lượng (Calories/kcal) tối đa còn lại cho bữa ăn.",
            },
            "budget_vnd": {
                "type": "integer",
                "description": "Ngân sách chi tiêu tối đa cho bữa ăn tính bằng VNĐ (ví dụ: 40000 cho 40.000 VNĐ).",
            },
            "meal_type": {
                "type": "string",
                "enum": ["breakfast", "lunch", "dinner", "snack"],
                "description": "Loại bữa ăn cần gợi ý (sáng, trưa, tối, phụ).",
            },
            "min_protein_g": {
                "type": "number",
                "description": "Lượng chất đạm (Protein) tối thiểu mong muốn tính bằng gram.",
            },
            "dietary_preferences": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Sở thích ăn uống (ví dụ: ['ít dầu mỡ', 'thanh đạm', 'giàu đạm']).",
            },
        },
        "required": ["remaining_calories"],
    },
}

GET_PROGRESS_SUMMARY_DECLARATION: dict[str, Any] = {
    "name": "get_progress_summary",
    "description": (
        "Truy xuất lịch sử cân nặng (đã làm mịn EMA/lọc nhiễu), tổng hợp calo trung bình và số ngày duy trì ghi chép nhật ký "
        "trong khoảng thời gian chỉ định."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "days_range": {
                "type": "integer",
                "description": "Số ngày gần nhất cần tổng hợp tiến độ (ví dụ: 7, 14, 30 ngày). Mặc định là 7.",
            },
            "start_date": {
                "type": "string",
                "description": "Ngày bắt đầu (YYYY-MM-DD) nếu chọn khoảng tùy chỉnh.",
            },
            "end_date": {
                "type": "string",
                "description": "Ngày kết thúc (YYYY-MM-DD) nếu chọn khoảng tùy chỉnh.",
            },
        },
        "required": ["days_range"],
    },
}

# ==============================================================================
# 2. WRAPPERS DÀNH CHO CÁC MÔ HÌNH CHUẨN OPENAPI / OPENAI
# ==============================================================================

GET_DAILY_NUTRITION_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": GET_DAILY_NUTRITION_DECLARATION,
}

LOG_MEAL_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": LOG_MEAL_DECLARATION,
}

RECOMMEND_MEALS_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": RECOMMEND_MEALS_DECLARATION,
}

GET_PROGRESS_SUMMARY_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": GET_PROGRESS_SUMMARY_DECLARATION,
}

NUTRISNAP_TOOLS: list[dict[str, Any]] = [
    GET_DAILY_NUTRITION_SCHEMA,
    LOG_MEAL_SCHEMA,
    RECOMMEND_MEALS_SCHEMA,
    GET_PROGRESS_SUMMARY_SCHEMA,
]


def get_tool_definitions() -> list[dict[str, Any]]:
    """Hàm helper trả về danh sách toàn bộ cấu hình Tool Calling dạng OpenAI-compatible."""
    return NUTRISNAP_TOOLS


def get_tool_by_name(tool_name: str) -> dict[str, Any] | None:
    """Hàm helper tìm kiếm nhanh schema của một tool theo tên."""
    for tool in NUTRISNAP_TOOLS:
        if tool.get("function", {}).get("name") == tool_name:
            return tool
    return None


# ==============================================================================
# 3. CHUYỂN ĐỔI CHUYÊN DỤNG CHO GOOGLE GEMINI SDK
# ==============================================================================

def sanitize_schema_for_gemini(schema: Any) -> Any:
    """
    Chuyển đổi JSON Schema sang định dạng tương thích 100% với Google Generative AI / Gemini SDK:
    - Loại bỏ trường 'additionalProperties' (gây ValueError: Unknown field for Schema).
    - Chuẩn hóa kiểu dữ liệu sang chữ hoa: OBJECT, STRING, NUMBER, INTEGER, BOOLEAN, ARRAY.
    - Đảm bảo loại bỏ hoàn toàn tham số 'user_id' (Zero-Trust).
    """
    if not isinstance(schema, dict):
        return schema

    type_mapping = {
        "object": "OBJECT",
        "string": "STRING",
        "number": "NUMBER",
        "integer": "INTEGER",
        "boolean": "BOOLEAN",
        "array": "ARRAY",
    }

    sanitized: dict[str, Any] = {}
    for key, value in schema.items():
        # Google Generative AI protobuf Schema không có additionalProperties
        if key == "additionalProperties":
            continue
        # Bảo mật Zero-Trust
        if key == "user_id":
            continue

        if key == "type" and isinstance(value, str) and value.lower() in type_mapping:
            sanitized[key] = type_mapping[value.lower()]
        elif isinstance(value, dict):
            sanitized[key] = sanitize_schema_for_gemini(value)
        elif isinstance(value, list):
            sanitized[key] = [
                sanitize_schema_for_gemini(item) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            sanitized[key] = value

    return sanitized


def get_gemini_tool_declarations() -> list[dict[str, Any]]:
    """
    Trả về danh sách 4 Function Declarations tương thích trực tiếp với Google Gemini SDK:
    - Đã bóc lớp wrapper {"type": "function"}.
    - Đã làm sạch additionalProperties và chuẩn hóa enum Type.
    """
    raw_declarations = [
        GET_DAILY_NUTRITION_DECLARATION,
        LOG_MEAL_DECLARATION,
        RECOMMEND_MEALS_DECLARATION,
        GET_PROGRESS_SUMMARY_DECLARATION,
    ]
    return [sanitize_schema_for_gemini(copy.deepcopy(decl)) for decl in raw_declarations]
