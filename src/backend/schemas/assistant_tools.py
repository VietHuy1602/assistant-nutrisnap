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
    food_name: str | None = None
    grams: float | None = None
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
    food_name: str | None = None
    grams: float | None = None
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
    remaining_kcal: float | None = None
    budget_vnd: int | None = None
    max_price: int | None = None
    meal_type: str | None = None
    min_protein_g: float | None = None
    min_protein: float | None = None
    dietary_preferences: list[str] | None = None
    meal_portion_gram: float = 250.0
    limit: int = Field(default=5, ge=1, le=50)

    model_config = ConfigDict(extra="forbid")


class GetProgressSummaryArgs(BaseModel):
    """Tham số công cụ get_progress_summary."""
    days_range: int = Field(default=7, ge=1, le=90)
    days: int | None = None
    start_date: str | None = None
    end_date: str | None = None

    model_config = ConfigDict(extra="forbid")


class SearchFoodsArgs(BaseModel):
    """Tham số công cụ search_foods."""
    query: str = Field(..., min_length=1, description="Từ khóa tìm kiếm món ăn")
    limit: int = Field(default=5, ge=1, le=10, description="Số lượng món tối đa trả về")

    model_config = ConfigDict(extra="forbid")


class GetUserProfileArgs(BaseModel):
    """Tham số công cụ get_user_profile (không cần tham số)."""
    model_config = ConfigDict(extra="forbid")


class GetHabitSummaryArgs(BaseModel):
    """Tham số công cụ get_habit_summary (không cần tham số)."""
    model_config = ConfigDict(extra="forbid")


class GetMonthlyReportArgs(BaseModel):
    """Tham số công cụ get_monthly_report."""
    year: int | None = Field(default=None, ge=2000, le=2100)
    month: int | None = Field(default=None, ge=1, le=12)
    days: int = Field(default=30, ge=7, le=90, description="Số ngày gần nhất khi không chọn tháng cụ thể")

    model_config = ConfigDict(extra="forbid")


class GetEatingPatternsArgs(BaseModel):
    """Tham số công cụ get_eating_patterns."""
    days_range: int = Field(default=14, ge=7, le=30)

    model_config = ConfigDict(extra="forbid")


class SuggestFoodSwapArgs(BaseModel):
    """Tham số công cụ suggest_food_swap."""
    food_name: str = Field(..., min_length=1, description="Tên món ăn muốn thay thế")
    goal: str | None = Field(default=None, description="Mục tiêu đổi món: lower_kcal, higher_protein, hoặc cheaper")

    model_config = ConfigDict(extra="forbid")
