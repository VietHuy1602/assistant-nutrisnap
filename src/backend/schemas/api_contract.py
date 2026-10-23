"""
src/backend/schemas/api_contract.py
Hợp đồng giao tiếp API chuẩn (REST API Contract) giữa Frontend, Backend và AI Orchestrator.
Đảm bảo định kiểu chặt chẽ (Strong Typing) qua Pydantic v2, tự động sinh Swagger Documentation tại /docs.
Tuân thủ tiêu chuẩn:
- Zero-Trust: Frontend không truyền user_id đối với endpoint cá nhân; user_id trích xuất từ JWT HttpOnly Cookie.
- Two-Step Confirmation: Các thao tác ghi bữa ăn/mục tiêu hỗ trợ bản nháp (pending_confirmation).
- Responsible UX: Luôn kèm trường disclaimer ước tính dinh dưỡng.
"""

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from src.backend.services.validators import validate_goal_pace

# ==============================================================================
# 0. HẰNG SỐ & PHẢN HỒI CHUNG (COMMON & BASE SCHEMAS)
# ==============================================================================

RESPONSIBLE_NUTRITION_DISCLAIMER = (
    "Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế tư vấn y khoa."
)


class BaseResponse(BaseModel):
    """Schema phản hồi cơ bản cho các tác vụ chung."""
    success: bool = Field(default=True, description="Trạng thái thực thi")
    message: str = Field(default="", description="Thông báo phản hồi cho người dùng")
    disclaimer: str = Field(
        default=RESPONSIBLE_NUTRITION_DISCLAIMER,
        description="Khuyến cáo miễn trừ trách nhiệm y khoa"
    )


# ==============================================================================
# 1. PHÂN HỆ XÁC THỰC (AUTHENTICATION SCHEMAS)
# ==============================================================================

class UserRegisterRequest(BaseModel):
    """Dữ liệu người dùng gửi lên khi đăng ký tài khoản (hỗ trợ cả chuẩn email và username)."""
    email: EmailStr = Field(..., description="Địa chỉ email hợp lệ")
    password: str = Field(..., min_length=8, description="Mật khẩu tối thiểu 8 ký tự, có chữ và số")
    username: str | None = Field(default=None, min_length=3, max_length=50, description="Tên đăng nhập (tùy chọn)")
    full_name: str | None = Field(default=None, max_length=100, description="Họ và tên")

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        encoded = v.encode("utf-8")
        if len(encoded) < 8 or len(encoded) > 72:
            raise ValueError("Mật khẩu phải có độ dài từ 8 đến 72 bytes")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Mật khẩu phải chứa ít nhất một chữ cái in hoa")
        if not re.search(r"[a-z]", v):
            raise ValueError("Mật khẩu phải chứa ít nhất một chữ cái in thường")
        if not re.search(r"\d", v):
            raise ValueError("Mật khẩu phải chứa ít nhất một chữ số")
        return v



class UserLoginRequest(BaseModel):
    """Dữ liệu đăng nhập (hỗ trợ cả username_or_email hoặc email chuẩn)."""
    username_or_email: str | None = Field(default=None, description="Tên đăng nhập hoặc email")
    email: EmailStr | None = Field(default=None, description="Địa chỉ email")
    password: str = Field(..., description="Mật khẩu đăng nhập")

    @model_validator(mode="before")
    @classmethod
    def check_identifier(cls, data: Any) -> Any:
        if isinstance(data, dict):
            ident = data.get("username_or_email") or data.get("email") or data.get("username")
            if not ident or not str(ident).strip():
                raise ValueError("Vui lòng cung cấp tên đăng nhập hoặc email")
            if not data.get("username_or_email"):
                data["username_or_email"] = str(ident).strip()
            if "password" not in data or data.get("password") is None or not str(data.get("password", "")).strip():
                raise ValueError("Mật khẩu không được để trống")
        return data


class UserPublicResponse(BaseModel):
    """Thông tin công khai của người dùng trả về cho Frontend (không chứa password_hash)."""
    id: int = Field(..., description="Mã định danh người dùng")
    username: str = Field(..., description="Tên đăng nhập")
    email: str = Field(..., description="Địa chỉ email")
    full_name: str | None = Field(default=None, description="Họ và tên")
    is_active: bool = Field(default=True, description="Trạng thái kích hoạt")
    created_at: datetime = Field(..., description="Thời điểm tạo tài khoản")

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    """Phản hồi sau khi đăng nhập/đăng ký thành công (tuân thủ bảo mật: KHÔNG trả token trong body)."""
    success: bool = True
    message: str = ""
    has_goal: bool = Field(default=False, description="Người dùng đã thiết lập mục tiêu hay chưa")
    user: UserPublicResponse
    token_type: str = Field(default="bearer", description="Loại token")
    expires_in: int | None = Field(default=None, description="Thời gian sống token tính bằng giây")

    # Trường phẳng tương thích ngược UserPublic theo README_02
    id: int | None = None
    email: str | None = None
    username: str | None = None
    full_name: str | None = None
    is_active: bool = True
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def sync_user_fields(self) -> "AuthResponse":
        if self.user:
            self.id = self.user.id
            self.email = self.user.email
            self.username = self.user.username
            self.full_name = self.user.full_name
            self.is_active = self.user.is_active
            self.created_at = self.user.created_at
        return self


# ==============================================================================
# 2. PHÂN HỆ MỤC TIÊU CÁ NHÂN (SMART GOAL PLANNER SCHEMAS)
# ==============================================================================

class GoalCreateRequest(BaseModel):
    """Dữ liệu thiết lập mục tiêu dinh dưỡng thông minh (Goal Planner Wizard)."""
    gender: Literal["male", "female", "other"] = Field(
        ...,
        description="Giới tính: 'male', 'female', hoặc 'other' (áp dụng trung vị trung tính y khoa)",
    )
    age: int = Field(..., ge=10, le=120, description="Tuổi")
    height_cm: float = Field(..., ge=80.0, le=250.0, description="Chiều cao (cm)")
    current_weight_kg: float = Field(..., ge=25.0, le=300.0, description="Cân nặng hiện tại (kg)")
    target_weight_kg: float = Field(..., ge=25.0, le=300.0, description="Cân nặng mục tiêu (kg)")
    activity_level: Literal["sedentary", "light", "moderate", "active", "very_active"] = Field(
        default="moderate",
        description="Mức độ vận động hàng ngày"
    )
    goal_type: Literal["lose_weight", "maintain", "gain_muscle"] = Field(
        ...,
        description="Mục tiêu: Giảm cân (lose_weight), Giữ cân (maintain), hay Tăng cơ (gain_muscle)"
    )
    weekly_pace_kg: float = Field(
        default=0.5,
        ge=0.0,
        le=0.75,
        description="Tốc độ thay đổi cân nặng an toàn (0.25 - 0.75 kg/tuần cho giảm cân, 0.1 - 0.5 kg/tuần cho tăng cơ, 0 cho giữ cân)"
    )
    daily_budget_vnd: int = Field(
        default=60000,
        ge=10000,
        description="Ngân sách chi tiêu ăn uống dự kiến mỗi ngày (VNĐ)"
    )

    @model_validator(mode="before")
    @classmethod
    def auto_adjust_maintain_pace(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if data.get("goal_type") == "maintain":
                data["weekly_pace_kg"] = 0.0
                if "target_weight_kg" not in data and "current_weight_kg" in data:
                    data["target_weight_kg"] = data["current_weight_kg"]
        elif hasattr(data, "goal_type") and data.goal_type == "maintain":
            data.weekly_pace_kg = 0.0
        return data

    @model_validator(mode="after")
    def verify_goal_pace_integrity(self):
        if self.goal_type == "maintain":
            self.weekly_pace_kg = 0.0
        ok, msg = validate_goal_pace(self.weekly_pace_kg, self.goal_type)
        if not ok:
            raise ValueError(msg)
        return self


class GoalResponse(BaseModel):
    """Thông tin mục tiêu năng lượng và Macro đã tính toán từ Backend."""
    id: int
    user_id: int
    target_weight: float
    bmr_calories: float = Field(..., description="Năng lượng tiêu hao cơ bản (BMR)")
    tdee_calories: float = Field(..., description="Tổng năng lượng tiêu hao hàng ngày (TDEE)")
    target_calories: float = Field(..., description="Hạn mức Calo khuyến nghị mỗi ngày")
    target_protein_g: float = Field(..., description="Lượng đạm mục tiêu (g)")
    target_carbs_g: float = Field(..., description="Lượng tinh bột mục tiêu (g)")
    target_fat_g: float = Field(..., description="Lượng chất béo mục tiêu (g)")
    daily_budget_vnd: int
    disclaimer: str = Field(default=RESPONSIBLE_NUTRITION_DISCLAIMER)

    model_config = ConfigDict(from_attributes=True)


# ==============================================================================
# 3. PHÂN HỆ THAM CHIẾU THỰC PHẨM (FOOD REFERENCES SCHEMAS)
# ==============================================================================

class FoodReferenceItem(BaseModel):
    """Món ăn tham chiếu từ CSDL chuẩn (500 món Việt)."""
    id: int
    food_name: str
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    avg_price_vnd: int

    model_config = ConfigDict(from_attributes=True)


class FoodSearchResponse(BaseModel):
    """Kết quả tìm kiếm món ăn autocomplete."""
    total: int
    items: list[FoodReferenceItem]


# ==============================================================================
# 4. PHÂN HỆ GHI NHẬN BỮA ĂN (MEAL INGESTION & TWO-STEP CONFIRMATION)
# ==============================================================================

class MealItemPreview(BaseModel):
    """Chi tiết từng món ăn thành phần trong bản xem trước nhận diện."""
    food_id: int | None = Field(default=None, description="ID món ăn trong CSDL tham chiếu nếu khớp được")
    food_name: str = Field(..., description="Tên món ăn")
    estimated_gram: float = Field(..., ge=1.0, le=3000.0, description="Khối lượng ước tính (gam)")
    estimated_calories: float = Field(..., description="Calo ước tính cho số gam này")
    protein_g: float = Field(default=0.0, description="Đạm ước tính (g)")
    carbs_g: float = Field(default=0.0, description="Tinh bột ước tính (g)")
    fat_g: float = Field(default=0.0, description="Chất béo ước tính (g)")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Độ tin cậy của AI (0.0 - 1.0)")


# Bí danh tương thích
MealPreviewItem = MealItemPreview


class MealPreviewRequest(BaseModel):
    """Request phân tích ảnh hoặc văn bản để tạo bản nháp bữa ăn."""
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] = Field(..., description="Loại bữa ăn")
    image_base64: str | None = Field(default=None, description="Chuỗi base64 của ảnh chụp đĩa ăn")
    voice_modifier_text: str | None = Field(default=None, description="Ghi chú giọng nói bổ sung gia vị hoặc lượng ăn")


class MealPreviewResponse(BaseModel):
    """Phản hồi bản nháp xem trước (Two-Step Confirmation - Step 1)."""
    status: Literal["pending_confirmation", "unrecognized"] = Field(
        default="pending_confirmation",
        description="Trạng thái: chờ xác nhận hoặc không nhận diện được cần chụp lại"
    )
    meal_type: str
    detected_items: list[MealItemPreview]
    total_estimated_calories: float
    disclaimer: str = Field(default=RESPONSIBLE_NUTRITION_DISCLAIMER)


# ==============================================================================
# 4b. PHÂN HỆ NHẬN DIỆN MÓN ĂN AI & FUZZY MATCHING (W3 ENDPOINT CONTRACT)
# ==============================================================================

class RecognizedFoodItem(BaseModel):
    """Món ăn được nhận diện qua AI Vision và ánh xạ bằng Fuzzy Matching."""
    food_id: int | None = Field(default=None, description="ID trong bảng food_references nếu khớp")
    food_name: str = Field(..., description="Tên món ăn (tiếng Việt chuẩn hóa hoặc tên gốc AI)")
    matched_name: str | None = Field(default=None, description="Tên món khớp trong CSDL tham chiếu nếu khác")
    match_score: float = Field(default=1.0, ge=0.0, le=1.0, description="Độ tương đồng Fuzzy Matching")
    is_matched: bool = Field(default=True, description="Đã ánh xạ vào CSDL chuẩn hay chưa")
    estimated_gram: float = Field(..., ge=1.0, le=3000.0, description="Khối lượng ước tính (gam)")
    estimated_calories: float = Field(default=0.0, description="Calo ước tính tính theo công thức tất định")
    protein_g: float = Field(default=0.0, description="Protein ước tính (g)")
    carbs_g: float = Field(default=0.0, description="Tinh bột ước tính (g)")
    fat_g: float = Field(default=0.0, description="Chất béo ước tính (g)")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Độ tự tin của AI Vision")


class RecognizeFoodRequest(BaseModel):
    """Dữ liệu gửi lên khi nhận diện món ăn bằng chuỗi Base64."""
    image_base64: str | None = Field(default=None, description="Chuỗi Base64 của ảnh chụp đĩa thức ăn")
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] = Field(
        default="lunch", description="Loại bữa ăn gợi ý"
    )


class RecognizeFoodResponse(BaseModel):
    """Phản hồi kết quả nhận diện món ăn từ endpoint POST /api/v1/ai/recognize-food."""
    success: bool = Field(default=True, description="Trạng thái thực thi")
    status: Literal["pending_confirmation", "unrecognized"] = Field(
        default="pending_confirmation",
        description="Trạng thái: chờ xác nhận hoặc không nhận diện được"
    )
    meal_type: str = Field(default="lunch", description="Loại bữa ăn gợi ý")
    detected_items: list[RecognizedFoodItem] = Field(
        default_factory=list,
        description="Danh sách món ăn nhận diện kèm thông tin dinh dưỡng"
    )
    total_estimated_calories: float = Field(default=0.0, description="Tổng calo ước tính tất định")
    is_fallback: bool = Field(
        default=False,
        description="Cờ báo hiệu kết quả từ cơ chế Fallback khi gặp sự cố API/mạng"
    )
    message: str = Field(default="Nhận diện món ăn thành công.", description="Thông báo phản hồi")
    disclaimer: str = Field(
        default=RESPONSIBLE_NUTRITION_DISCLAIMER,
        description="Khuyến cáo miễn trừ trách nhiệm y khoa"
    )


class MealItemConfirmInput(BaseModel):
    """Thông tin món ăn khi người dùng đã xác nhận / sửa đổi khối lượng."""
    food_id: int = Field(..., description="ID món ăn trong bảng food_references")
    food_name: str = Field(..., description="Tên món ăn")
    estimated_gram: float = Field(..., ge=1.0, le=3000.0, description="Khối lượng thực tế (gam) người dùng đã xác nhận")


class MealLogRequest(BaseModel):
    """Request xác nhận lưu bữa ăn vào CSDL (Two-Step Confirmation - Step 2)."""
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    items: list[MealItemConfirmInput] = Field(..., min_length=1, description="Danh sách món ăn xác nhận (tối thiểu 1 món)")
    is_confirmed: bool = Field(default=False, description="Cờ xác nhận của người dùng. Mặc định là False; chỉ commit khi True.")
    image_path: str | None = Field(default=None, description="Đường dẫn ảnh lưu trữ nếu có")
    notes: str | None = Field(default=None, description="Ghi chú thêm của bữa ăn")


class MealLogResponse(BaseModel):
    """Phản hồi sau khi lưu bữa ăn thành công."""
    success: bool = True
    meal_id: int
    logged_at: datetime
    total_calories: float
    message: str = "Đã lưu bữa ăn vào nhật ký thành công."
    disclaimer: str = Field(default=RESPONSIBLE_NUTRITION_DISCLAIMER)


class MealItemDetail(BaseModel):
    """Chi tiết món ăn trong lịch sử."""
    id: int
    food_id: int
    food_name: str
    estimated_gram: float
    estimated_calories: float


class MealDetailResponse(BaseModel):
    """Thông tin chi tiết một bữa ăn trong ngày."""
    id: int
    meal_type: str
    image_path: str | None = None
    logged_at: datetime
    total_calories: float
    items: list[MealItemDetail]


# ==============================================================================
# 5. PHÂN HỆ DASHBOARD DINH DƯỠNG TRONG NGÀY (DAILY DASHBOARD SCHEMAS)
# ==============================================================================

class MacroDetail(BaseModel):
    """Tiến độ nạp từng nhóm chất đa lượng (Macro)."""
    consumed: float = Field(..., description="Đã nạp (gam)")
    target: float = Field(..., description="Mục tiêu (gam)")
    unit: str = "g"
    progress_percent: float = Field(default=0.0, description="Tỷ lệ phần trăm đạt mục tiêu")


class DashboardMacros(BaseModel):
    """Bộ 3 chất đa lượng Protein, Carbs, Fat."""
    protein: MacroDetail
    carbs: MacroDetail
    fat: MacroDetail


class DailyDashboardResponse(BaseModel):
    """Dữ liệu hiển thị trọn vẹn màn hình Dashboard trong ngày."""
    date: str = Field(..., description="Ngày hiển thị định dạng YYYY-MM-DD")
    target_calories: float = Field(..., description="Hạn mức Calo mục tiêu")
    consumed_calories: float = Field(..., description="Tổng Calo đã tiêu thụ")
    remaining_calories: float = Field(..., description="Calo còn lại có thể ăn")
    calories_progress_percent: float = Field(..., description="Phần trăm calo đã nạp")
    macros: DashboardMacros
    meals_summary: list[MealDetailResponse]
    disclaimer: str = Field(default=RESPONSIBLE_NUTRITION_DISCLAIMER)


# ==============================================================================
# 6. PHÂN HỆ TRỢ LÝ ẢO AI (ASSISTANT CHAT & ACTION CONFIRMATION CARDS)
# ==============================================================================

class ActionCardItemData(BaseModel):
    """Món ăn trong thẻ xác nhận thao tác."""
    food_id: int
    food_name: str
    estimated_gram: float
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float


class GoalUpdateCardData(BaseModel):
    """Dữ liệu cập nhật mục tiêu trong thẻ hành động."""
    goal_type: str | None = None
    target_weight_kg: float | None = None
    target_calories: float | None = None
    weekly_pace_kg: float | None = None


class ActionCardData(BaseModel):
    """Dữ liệu nghiệp vụ đính kèm trong Action Card (hỗ trợ đa hình: meal, goal, recommendation)."""
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] | None = None
    items: list[ActionCardItemData] | None = None
    total_calories: float | None = None
    goal_update: GoalUpdateCardData | None = None
    recommendation_text: str | None = None
    extra_payload: dict[str, Any] | None = None


class ActionCard(BaseModel):
    """
    Thẻ xác nhận thao tác (Action Confirmation Card) hiển thị trực tiếp trong Khung Chat.
    Cho phép người dùng bấm [Xác nhận lưu] hoặc [Chỉnh sửa] trước khi ghi CSDL.
    """
    type: Literal["confirm_log_meal", "confirm_update_goal", "recommendation_preview"] = Field(
        ...,
        description="Loại thẻ hành động"
    )
    status: Literal["pending_user_action", "confirmed", "cancelled"] = Field(
        default="pending_user_action",
        description="Trạng thái thẻ"
    )
    data: ActionCardData


class ChatMessageRequest(BaseModel):
    """Tin nhắn người dùng gửi tới Trợ lý ảo."""
    session_id: int | None = Field(default=None, description="ID phiên chat hiện tại, nếu None hệ thống tự tạo")
    message: str = Field(..., min_length=1, max_length=2000, description="Nội dung câu hỏi/yêu cầu của người dùng")


class ChatMessageResponse(BaseModel):
    """Phản hồi từ Trợ lý ảo AI kèm thẻ hành động (nếu có)."""
    session_id: int
    reply_text: str = Field(..., description="Câu trả lời ngôn ngữ tự nhiên từ Trợ lý")
    action_card: ActionCard | None = Field(default=None, description="Thẻ xác nhận thao tác đính kèm")
    disclaimer: str = Field(default=RESPONSIBLE_NUTRITION_DISCLAIMER)


class ChatHistoryItem(BaseModel):
    """Lịch sử từng tin nhắn trong phiên trò chuyện."""
    id: int
    session_id: int
    sender_role: Literal["user", "assistant"]
    content: str
    tool_name: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatHistoryResponse(BaseModel):
    """Danh sách tin nhắn trong phiên chat."""
    session_id: int
    messages: list[ChatHistoryItem]


# ==============================================================================
# 7. PHÂN HỆ THEO DÕI CÂN NẶNG (WEIGHT TRACKING SCHEMAS)
# ==============================================================================

class WeightLogRequest(BaseModel):
    """Request ghi nhận cân nặng hàng ngày."""
    weight_kg: float = Field(..., ge=25.0, le=300.0, description="Cân nặng ghi nhận (kg)")
    logged_date: str | None = Field(default=None, description="Ngày ghi nhận định dạng YYYY-MM-DD (mặc định hôm nay)")
    notes: str | None = Field(default=None, description="Ghi chú thêm (ví dụ: sau khi tập sáng)")


class WeightLogResponse(BaseModel):
    """Thông tin bản ghi cân nặng."""
    id: int
    user_id: int
    weight_kg: float
    logged_date: str
    notes: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WeightHistoryResponse(BaseModel):
    """Lịch sử cân nặng của người dùng."""
    items: list[WeightLogResponse]
    current_weight: float | None = None
    target_weight: float | None = None


# ==============================================================================
# 8. PHÂN HỆ XÁC NHẬN THẺ HÀNH ĐỘNG (ACTION CARD CONFIRMATION SCHEMAS)
# ==============================================================================

class ActionCardConfirmRequest(BaseModel):
    """Request xác nhận thực thi thẻ hành động từ Chatbot."""
    action_type: Literal["confirm_log_meal", "confirm_update_goal", "recommendation_preview"]
    session_id: int | None = None
    action_data: dict[str, Any] = Field(default_factory=dict, description="Dữ liệu payload của action card")


class ActionCardConfirmResponse(BaseModel):
    """Phản hồi sau khi thực thi hành động từ thẻ Action Card."""
    success: bool = True
    message: str = "Đã thực thi hành động thành công."
    result: dict[str, Any] = Field(default_factory=dict)

