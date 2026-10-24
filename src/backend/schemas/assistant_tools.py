"""
src/backend/schemas/assistant_tools.py
Pydantic Argument Models nghiêm ngặt (model_config = ConfigDict(extra="forbid"))
dành cho 4 công cụ của Trợ lý ảo AI NutriSnap theo chuẩn Zero-Trust (README_03).
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class GetDailyNutritionArgs(BaseModel):
    """Tham số công cụ get_daily_nutrition."""
    date_str: str | None = None
    date: str | None = None

    model_config = ConfigDict(extra="forbid")


class LogMealLLMArgs(BaseModel):
    """
    Tham số công cụ log_meal dành riêng cho kênh LLM (caller='llm').
    Tuyệt đối không có trường is_confirmed trong schema.
    Nếu LLM cố tình gửi is_confirmed (True hoặc False) hoặc bất kỳ trường lạ nào,
    Pydantic sẽ từ chối ngay lập tức (extra='forbid') để ngăn chặn bypass Two-Step Confirmation.
    """
    meal_type: str = Field(..., min_length=1, description="Loại bữa ăn: Sáng, Trưa, Tối, Phụ hoặc breakfast, lunch, dinner, snack")
    items: list[dict[str, Any]] | None = None
    items_list: list[dict[str, Any]] | None = None
    image_path: str | None = None
    logged_at: datetime | str | None = None
    note: str | None = None
    notes: str | None = None

    model_config = ConfigDict(extra="forbid")


class LogMealUserActionArgs(BaseModel):
    """
    Tham số công cụ log_meal dành cho kênh người dùng nhấn nút xác nhận (caller='user_action').
    Cho phép nhận is_confirmed=True để chính thức ghi vào CSDL.
    """
    meal_type: str = Field(..., min_length=1, description="Loại bữa ăn")
    items: list[dict[str, Any]] | None = None
    items_list: list[dict[str, Any]] | None = None
    is_confirmed: bool = False
    image_path: str | None = None
    logged_at: datetime | str | None = None
    note: str | None = None
    notes: str | None = None

    model_config = ConfigDict(extra="forbid")


class RecommendMealsArgs(BaseModel):
    """Tham số công cụ recommend_meals."""
    remaining_calories: float | None = None
    budget_vnd: int | None = None
    meal_type: str | None = None
    min_protein_g: float | None = None
    dietary_preferences: list[str] | None = None
    meal_portion_gram: float = 250.0
    limit: int = Field(default=5, ge=1, le=50)

    model_config = ConfigDict(extra="forbid")


class GetProgressSummaryArgs(BaseModel):
    """Tham số công cụ get_progress_summary."""
    days_range: int = Field(default=7, ge=1, le=90)
    start_date: str | None = None
    end_date: str | None = None

    model_config = ConfigDict(extra="forbid")
