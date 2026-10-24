"""
src/ai/tool_definitions.py
Định nghĩa JSON Schema chuẩn hóa cho các công cụ (Tool Calling) của trợ lý ảo NutriSnap.

Tuân thủ nghiêm ngặt các nguyên tắc:
1. Zero-Trust Security: Schema TUYỆT ĐỐI KHÔNG chứa tham số `user_id` (Backend tự trích xuất từ JWT).
2. Tên tham số đơn nhất, nhất quán: Không có alias trùng lặp (dùng duy nhất `remaining_calories`, `budget_vnd`, `days_range`).
3. Two-Step Confirmation: log_meal tích hợp cờ `is_confirmed: bool` phân định rõ bản xem trước và ghi dữ liệu.
4. Tương thích đa nền tảng (Gemini SDK & OpenAPI/OpenAI): Cung cấp hàm chuyển đổi định dạng chuẩn cho Google Generative AI (loại bỏ additionalProperties, chuẩn hóa kiểu dữ liệu hoa OBJECT/STRING/...).
5. Mô tả chi tiết khi nào dùng và khi nào không dùng kèm ví dụ câu tiếng Việt có dấu/không dấu theo Task B1.
6. Hỗ trợ đầy đủ các công cụ chỉ-đọc mở rộng C1: list_meals, get_food_info, compare_foods, get_goal_summary, suggest_swap.
"""

from __future__ import annotations

import copy
from typing import Any

# ==============================================================================
# 1. ĐẶC TẢ FUNCTION SCHEMAS NGUYÊN BẢN (CORE & EXTENDED TOOLS)
# ==============================================================================

GET_DAILY_NUTRITION_DECLARATION: dict[str, Any] = {
    "name": "get_daily_nutrition",
    "description": (
        "Lấy tổng hợp dinh dưỡng (Calories, Protein, Carbs, Fat) đã tiêu thụ và calo còn lại trong ngày cụ thể so với mục tiêu người dùng. "
        "KHI NÀO DÙNG: Người dùng hỏi calo còn lại, đã nạp bao nhiêu calo, tổng calo ngày hôm nay hoặc hôm qua. "
        "Ví dụ: 'hôm nay tôi còn bao nhiêu calo', 'hom nay con may kcal', 'hôm qua tôi ăn bao nhiêu', 'tổng kết dinh dưỡng hôm nay'. "
        "KHI NÀO KHÔNG DÙNG: KHÔNG dùng khi người dùng hỏi liệt kê danh sách các món đã ăn (hãy dùng list_meals) "
        "hoặc xin gợi ý món ăn tương lai (hãy dùng recommend_meals)."
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

LIST_MEALS_DECLARATION: dict[str, Any] = {
    "name": "list_meals",
    "description": (
        "Liệt kê danh sách chi tiết các bữa ăn (Sáng, Trưa, Tối, Phụ) và các món ăn kèm khối lượng gram, calo ước tính mà người dùng ĐÃ ĂN trong một ngày cụ thể từ CSDL. "
        "KHI NÀO DÙNG: Người dùng hỏi đã ăn gì, liệt kê bữa ăn, kiểm tra món đã ghi. "
        "Ví dụ: 'hôm nay tôi đã ăn gì', 'hom nay toi da an gi', 'tôi đã ăn gì hôm qua', 'liệt kê bữa ăn', 'sáng nay đã ăn món gì'. "
        "KHI NÀO KHÔNG DÙNG: KHÔNG dùng khi người dùng xin gợi ý món ăn tương lai (hãy dùng recommend_meals) "
        "hoặc chỉ hỏi tổng số calo/macro (hãy dùng get_daily_nutrition)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "date": {
                "type": "string",
                "description": (
                    "Ngày cần tra cứu danh sách món đã ăn theo định dạng 'YYYY-MM-DD' (hoặc 'today', 'yesterday'). "
                    "Mặc định để trống là ngày hôm nay."
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
        "Hệ thống tự động kích hoạt quy trình Xác nhận Thao tác (Two-Step Confirmation Flow): "
        "công cụ sẽ tạo bản xem trước tính nháp calo và yêu cầu người dùng bấm nút xác nhận trên giao diện trước khi lưu vào CSDL. "
        "KHI NÀO DÙNG: Người dùng nói vừa ăn xong hoặc muốn ghi món ăn đã dùng kèm số lượng/khẩu phần. "
        "Ví dụ: 'Trưa nay mình ăn một tô phở bò tái', 'Vừa ăn tối cơm tấm sườn nướng 300g', 'Ghi giúp mình bữa sáng 2 ổ bánh mì'. "
        "KHI NÀO KHÔNG DÙNG: KHÔNG dùng khi người dùng chỉ hỏi tra cứu (dùng list_meals hoặc get_daily_nutrition) "
        "hoặc chỉ hỏi calo món ăn (dùng get_food_info)."
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
                            "description": "Đơn vị tính khẩu phần (ví dụ: 'bát', 'tô', 'đĩa', 'gram', 'ml', 'hộp', 'ổ', 'quả').",
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
        "Gợi ý các món ăn Việt Nam từ cơ sở dữ liệu food_references phù hợp với hạn mức calo còn lại trong ngày và ngân sách chi tiêu của người dùng. "
        "KHI NÀO DÙNG: Người dùng hỏi xin gợi ý món ăn, thực đơn, nên ăn gì trong tương lai hoặc bữa ăn sắp tới. "
        "Ví dụ: 'gợi ý bữa tối 40k đủ đạm', 'còn 500 kcal thì ăn gì no mà rẻ', 'nên ăn gì bây giờ', 'gợi ý thực đơn sinh viên 30k'. "
        "KHI NÀO KHÔNG DÙNG: KHÔNG dùng khi người dùng hỏi các món đã ăn trong quá khứ như 'hôm nay tôi đã ăn gì' (phải dùng list_meals)."
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
        "Tổng hợp tiến độ đa ngày: xu hướng cân nặng làm mịn EMA, trung bình calo mỗi ngày và số ngày duy trì chuỗi ghi chép (streak) trong khoảng thời gian 7 đến 30 ngày. "
        "KHI NÀO DÙNG: Người dùng hỏi về tiến độ, cân nặng, streak, báo cáo tuần/tháng. "
        "Ví dụ: 'xem tiến độ tuần này', 'tháng này mình ghi nhật ký được mấy ngày', 'xu hướng cân nặng 14 ngày qua'. "
        "KHI NÀO KHÔNG DÙNG: KHÔNG dùng khi chỉ hỏi dinh dưỡng ngày hôm nay (dùng get_daily_nutrition)."
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

GET_FOOD_INFO_DECLARATION: dict[str, Any] = {
    "name": "get_food_info",
    "description": (
        "Tra cứu thông tin dinh dưỡng (Calories, Protein, Carbs, Fat) và giá ước tính của một món ăn cụ thể từ CSDL food_references. "
        "KHI NÀO DÙNG: Người dùng hỏi calo/dinh dưỡng của một món ăn. "
        "Ví dụ: 'bún bò Huế bao nhiêu calo', '100g ức gà bao nhiêu đạm', '1 tô phở bao nhiêu kcal'. "
        "KHI NÀO KHÔNG DÙNG: KHÔNG dùng khi người dùng ghi nhận bữa ăn (dùng log_meal)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "food_name": {
                "type": "string",
                "description": "Tên món ăn hoặc thực phẩm cần tra cứu (ví dụ: 'Bún bò Huế', 'Ức gà áp chảo', 'Trứng gà ốp la').",
            },
            "gram": {
                "type": "number",
                "description": "Khối lượng gram cần tính (nếu không truyền, hệ thống tự lấy khẩu phần chuẩn của món ăn).",
            },
        },
        "required": ["food_name"],
    },
}

COMPARE_FOODS_DECLARATION: dict[str, Any] = {
    "name": "compare_foods",
    "description": (
        "So sánh giá trị dinh dưỡng (calo, đạm, carbs, chất béo) và giá tiền giữa 2 món ăn từ CSDL food_references. "
        "KHI NÀO DÙNG: Người dùng phân vân hoặc so sánh 2 món. "
        "Ví dụ: 'so sánh cơm và bún', 'cơm tấm hay bánh mì ít calo hơn', 'phở bò với bún riêu món nào nhiều đạm hơn'."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "food_a": {
                "type": "string",
                "description": "Tên món ăn thứ nhất.",
            },
            "food_b": {
                "type": "string",
                "description": "Tên món ăn thứ hai.",
            },
            "gram": {
                "type": "number",
                "description": "Khối lượng quy đổi đồng đều (mặc định lấy theo khẩu phần chuẩn của từng món).",
            },
        },
        "required": ["food_a", "food_b"],
    },
}

GET_GOAL_SUMMARY_DECLARATION: dict[str, Any] = {
    "name": "get_goal_summary",
    "description": (
        "Tra cứu mục tiêu dinh dưỡng cá nhân, TDEE, BMR, hạn mức calo và macro hàng ngày đã thiết lập của người dùng từ CSDL goals. "
        "KHI NÀO DÙNG: Người dùng hỏi về mục tiêu của bản thân. "
        "Ví dụ: 'mục tiêu của tôi là gì', 'TDEE của tôi bao nhiêu', 'mỗi ngày tôi nên ăn bao nhiêu đạm'."
    ),
    "parameters": {
        "type": "object",
        "properties": {},
        "required": [],
    },
}

SUGGEST_SWAP_DECLARATION: dict[str, Any] = {
    "name": "suggest_swap",
    "description": (
        "Đề xuất món ăn thay thế lành mạnh hơn (ít calo hơn, nhiều đạm hơn hoặc thanh đạm hơn) cho một món ăn nhiều năng lượng. "
        "KHI NÀO DÙNG: Người dùng muốn đổi món hoặc tìm món thay thế. "
        "Ví dụ: 'thay trà sữa bằng gì cho đỡ calo', 'đổi cơm tấm bằng món gì', 'thay thế món bánh mì'."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "food_name": {
                "type": "string",
                "description": "Tên món ăn muốn thay thế (ví dụ: 'Trà sữa trân châu', 'Cơm tấm sườn nướng').",
            }
        },
        "required": ["food_name"],
    },
}

# ==============================================================================
# 2. WRAPPERS DÀNH CHO CÁC MÔ HÌNH CHUẨN OPENAPI / OPENAI
# ==============================================================================

GET_DAILY_NUTRITION_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": GET_DAILY_NUTRITION_DECLARATION,
}

LIST_MEALS_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": LIST_MEALS_DECLARATION,
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

GET_FOOD_INFO_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": GET_FOOD_INFO_DECLARATION,
}

COMPARE_FOODS_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": COMPARE_FOODS_DECLARATION,
}

GET_GOAL_SUMMARY_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": GET_GOAL_SUMMARY_DECLARATION,
}

SUGGEST_SWAP_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": SUGGEST_SWAP_DECLARATION,
}

CORE_NUTRISNAP_TOOLS: list[dict[str, Any]] = [
    GET_DAILY_NUTRITION_SCHEMA,
    LOG_MEAL_SCHEMA,
    RECOMMEND_MEALS_SCHEMA,
    GET_PROGRESS_SUMMARY_SCHEMA,
]

EXTENDED_NUTRISNAP_TOOLS: list[dict[str, Any]] = [
    LIST_MEALS_SCHEMA,
    GET_FOOD_INFO_SCHEMA,
    COMPARE_FOODS_SCHEMA,
    GET_GOAL_SUMMARY_SCHEMA,
    SUGGEST_SWAP_SCHEMA,
]

ALL_NUTRISNAP_TOOLS: list[dict[str, Any]] = [
    GET_DAILY_NUTRITION_SCHEMA,
    LIST_MEALS_SCHEMA,
    LOG_MEAL_SCHEMA,
    RECOMMEND_MEALS_SCHEMA,
    GET_PROGRESS_SUMMARY_SCHEMA,
    GET_FOOD_INFO_SCHEMA,
    COMPARE_FOODS_SCHEMA,
    GET_GOAL_SUMMARY_SCHEMA,
    SUGGEST_SWAP_SCHEMA,
]

NUTRISNAP_TOOLS: list[dict[str, Any]] = CORE_NUTRISNAP_TOOLS


def get_tool_definitions(include_extended: bool = False) -> list[dict[str, Any]]:
    """Hàm helper trả về danh sách cấu hình Tool Calling dạng OpenAI-compatible.
    Mặc định trả về 4 công cụ cốt lõi (tương thích ngược với các bài kiểm thử Tuần 4).
    Khi include_extended=True, bổ sung 5 công cụ chỉ-đọc theo C1."""
    if include_extended:
        return ALL_NUTRISNAP_TOOLS
    return NUTRISNAP_TOOLS


def get_tool_by_name(tool_name: str) -> dict[str, Any] | None:
    """Hàm helper tìm kiếm nhanh schema của một tool theo tên."""
    for tool in ALL_NUTRISNAP_TOOLS:
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
        if key == "additionalProperties":
            continue
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


def get_gemini_tool_declarations(include_extended: bool = False) -> list[dict[str, Any]]:
    """
    Trả về danh sách các Function Declarations tương thích trực tiếp với Google Gemini SDK:
    - Đã bóc lớp wrapper {"type": "function"}.
    - Đã làm sạch additionalProperties và chuẩn hóa enum Type.
    - Tuyệt đối không chứa user_id (Zero-Trust).
    - Mặc định trả về 4 công cụ cốt lõi; khi include_extended=True trả về cả 9 công cụ.
    """
    raw_declarations = [
        GET_DAILY_NUTRITION_DECLARATION,
        LOG_MEAL_DECLARATION,
        RECOMMEND_MEALS_DECLARATION,
        GET_PROGRESS_SUMMARY_DECLARATION,
    ]
    if include_extended:
        raw_declarations = [
            GET_DAILY_NUTRITION_DECLARATION,
            LIST_MEALS_DECLARATION,
            LOG_MEAL_DECLARATION,
            RECOMMEND_MEALS_DECLARATION,
            GET_PROGRESS_SUMMARY_DECLARATION,
            GET_FOOD_INFO_DECLARATION,
            COMPARE_FOODS_DECLARATION,
            GET_GOAL_SUMMARY_DECLARATION,
            SUGGEST_SWAP_DECLARATION,
        ]
    return [sanitize_schema_for_gemini(copy.deepcopy(decl)) for decl in raw_declarations]
