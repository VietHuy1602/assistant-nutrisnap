"""
src/backend/services/recipe_service.py
Nguyên liệu và cách nấu cho một món (1 khẩu phần). Tạo bằng Gemini một lần, lưu vào bảng food_recipes
để lần sau trả ngay, không tốn lượt gọi AI.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from sqlmodel import Session, select

from src.backend.models.schema import FoodRecipe, FoodReference

logger = logging.getLogger(__name__)

# flash-lite-latest hay lỗi dấu tiếng Việt trong văn bản dài nên không dùng cho công thức
RECIPE_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-flash-latest"]
RECIPE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "servings": {"type": "INTEGER"},
        "time_minutes": {"type": "INTEGER"},
        "difficulty": {"type": "STRING"},
        "ingredients": {
            "type": "ARRAY",
            "items": {"type": "OBJECT", "properties": {"name": {"type": "STRING"}, "amount": {"type": "STRING"}}, "required": ["name", "amount"]},
        },
        "steps": {"type": "ARRAY", "items": {"type": "STRING"}},
        "tip": {"type": "STRING"},
    },
    "required": ["servings", "time_minutes", "difficulty", "ingredients", "steps"],
}
PROMPT = (
    "Bạn là đầu bếp món Việt. Viết công thức nấu món \"{name}\" cho 1 người ăn, đúng cách nấu phổ biến tại Việt Nam, "
    "nguyên liệu dễ mua ở chợ/siêu thị. Khẩu phần thành phẩm khoảng {grams} g.\n"
    "- ingredients: từng nguyên liệu kèm định lượng cụ thể (g, ml, muỗng, quả...), kể cả gia vị.\n"
    "- steps: 4–8 bước ngắn gọn, rõ ràng, theo thứ tự (sơ chế → nấu → nêm → trình bày).\n"
    "- difficulty: 'Dễ', 'Trung bình' hoặc 'Khó'. time_minutes: tổng thời gian.\n"
    "- tip: một mẹo giúp món lành mạnh hơn (ít dầu, ít muối...).\n"
    "Nếu là món mua sẵn/đồ uống đơn giản, ghi cách chọn mua hoặc pha chế. Chỉ trả JSON."
)


class RecipeUnavailable(Exception):
    pass


def _generate(name: str, grams: float) -> dict[str, Any]:
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key or key.startswith("YOUR_"):
        raise RecipeUnavailable("Chưa cấu hình AI.")
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=25_000, retry_options=types.HttpRetryOptions(attempts=1)))
    config = types.GenerateContentConfig(response_mime_type="application/json", response_schema=RECIPE_SCHEMA, temperature=0.3)
    last: Exception | None = None
    for model in RECIPE_MODELS:
        try:
            res = client.models.generate_content(model=model, contents=PROMPT.format(name=name, grams=int(grams)), config=config)
            data = json.loads(res.text or "{}")
            if data.get("ingredients") and data.get("steps"):
                return data
        except Exception as exc:  # model bận / hết hạn mức: thử model khác
            last = exc
            logger.info("Tạo công thức bằng %s lỗi: %s", model, exc)
    raise RecipeUnavailable(f"Chưa tạo được công thức: {last}")


def get_recipe(session: Session, food_id: int) -> dict[str, Any]:
    food = session.get(FoodReference, food_id)
    if not food:
        raise LookupError("Không tìm thấy món.")
    row = session.exec(select(FoodRecipe).where(FoodRecipe.food_id == food_id)).first()
    if row:
        return {"food_id": food_id, "food_name": food.food_name, **json.loads(row.recipe_json)}
    data = _generate(food.food_name, food.default_serving_g or 300)
    session.add(FoodRecipe(food_id=food_id, recipe_json=json.dumps(data, ensure_ascii=False)))
    session.commit()
    return {"food_id": food_id, "food_name": food.food_name, **data}
