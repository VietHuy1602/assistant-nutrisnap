"""
src/backend/schemas/api_contract.py
Hợp đồng giao tiếp API chuẩn (REST API Contract) giữa Frontend, Backend và AI Orchestrator.
Đảm bảo định kiểu chặt chẽ (Strong Typing) qua Pydantic v2, tự động sinh Swagger Documentation tại /docs.
Tuân thủ tiêu chuẩn:
- Zero-Trust: Frontend không truyền user_id đối với endpoint cá nhân; user_id trích xuất từ JWT HttpOnly Cookie.
- Two-Step Confirmation: Các thao tác ghi bữa ăn/mục tiêu hỗ trợ bản nháp (pending_confirmation).
- Responsible UX: Luôn kèm trường disclaimer ước tính dinh dưỡng.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

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
    """Dữ liệu người dùng gửi lên khi đăng ký tài khoản."""
    username: str = Field(..., min_length=3, max_length=50, description="Tên đăng nhập")
    email: EmailStr = Field(..., description="Địa chỉ email hợp lệ")
    password: str = Field(..., min_length=8, description="Mật khẩu tối thiểu 8 ký tự, có chữ và số")


class UserLoginRequest(BaseModel):
    """Dữ liệu đăng nhập (hỗ trợ cả username hoặc email)."""
    username_or_email: str = Field(..., description="Tên đăng nhập hoặc email")
    password: str = Field(..., description="Mật khẩu đăng nhập")


class UserPublicResponse(BaseModel):
    """Thông tin công khai của người dùng trả về cho Frontend (không chứa password_hash)."""
    id: int = Field(..., description="Mã định danh người dùng")
    username: str = Field(..., description="Tên đăng nhập")
    email: str = Field(..., description="Địa chỉ email")
    created_at: datetime = Field(..., description="Thời điểm tạo tài khoản")

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    """Phản hồi sau khi đăng nhập/đăng ký thành công."""
    success: bool = True
    message: str
    has_goal: bool = Field(default=False, description="Người dùng đã thiết lập mục tiêu hay chưa")
    user: UserPublicResponse


# ==============================================================================
# 2. PHÂN HỆ MỤC TIÊU CÁ NHÂN (SMART GOAL PLANNER SCHEMAS)
# ==============================================================================

class GoalCreateRequest(BaseModel):
    """Dữ liệu thiết lập mục tiêu dinh dưỡng thông minh (Goal Planner Wizard)."""
    gender: Literal["male", "female", "other"] = Field(..., description="Giới tính sinh học")
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
        description="Mục tiêu: Giảm cân, Giữ cân, hay Tăng cơ"
    )
    weekly_pace_kg: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Tốc độ thay đổi cân nặng an toàn (0.25 - 1.0 kg/tuần)"
    )
    daily_budget_vnd: int = Field(
        default=60000,
        ge=10000,
        description="Ngân sách chi tiêu ăn uống dự kiến mỗi ngày (VNĐ)"
    )


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


class MealItemConfirmInput(BaseModel):
    """Thông tin món ăn khi người dùng đã xác nhận / sửa đổi khối lượng."""
    food_id: int = Field(..., description="ID món ăn trong bảng food_references")
    food_name: str = Field(..., description="Tên món ăn")
    estimated_gram: float = Field(..., ge=1.0, le=3000.0, description="Khối lượng thực tế (gam) người dùng đã xác nhận")


class MealLogRequest(BaseModel):
    """Request xác nhận lưu bữa ăn vào CSDL (Two-Step Confirmation - Step 2)."""
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    items: list[MealItemConfirmInput]
    is_confirmed: bool = Field(True, description="Cờ xác nhận của người dùng. Chỉ commit khi True.")
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


class ActionCardData(BaseModel):
    """Dữ liệu nghiệp vụ đính kèm trong Action Card."""
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    items: list[ActionCardItemData]
    total_calories: float


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
