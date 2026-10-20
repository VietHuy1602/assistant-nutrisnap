"""
src/backend/main.py
Điểm khởi chạy ứng dụng Backend FastAPI cho dự án NutriSnap.
Cung cấp tài liệu tương tác Swagger UI tại /docs theo chuẩn REST API Contract.
Cấu hình CORS hỗ trợ HttpOnly Cookie an toàn (allow_credentials=True).
"""

from datetime import UTC, datetime

from fastapi import FastAPI, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware

from src.backend.schemas.api_contract import (
    RESPONSIBLE_NUTRITION_DISCLAIMER,
    ActionCard,
    ActionCardData,
    ActionCardItemData,
    AuthResponse,
    BaseResponse,
    ChatHistoryResponse,
    ChatMessageRequest,
    ChatMessageResponse,
    DailyDashboardResponse,
    DashboardMacros,
    FoodReferenceItem,
    FoodSearchResponse,
    GoalCreateRequest,
    GoalResponse,
    MacroDetail,
    MealLogRequest,
    MealLogResponse,
    MealPreviewItem,
    MealPreviewRequest,
    MealPreviewResponse,
    UserLoginRequest,
    UserPublicResponse,
    UserRegisterRequest,
)

# Khởi tạo ứng dụng FastAPI với siêu dữ liệu OpenAPI đầy đủ
app = FastAPI(
    title="🥗 NutriSnap - Virtual AI Nutrition Assistant API",
    description="""
API Backend cho hệ thống Trợ lý ảo Dinh dưỡng NutriSnap (Đồ án CSC10014 - FIT HCMUS).
- Phân định ranh giới LLM & Backend an toàn.
- Tính toán Calo tất định từ CSDL tham chiếu 500 món Việt.
- Cơ chế xác thực an toàn qua HttpOnly JWT Cookie và Two-Step Confirmation.
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Cấu hình CORS chặt chẽ: Bắt buộc allow_credentials=True để trình duyệt gửi HttpOnly Cookie
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# HEALTH CHECK
# ==============================================================================

@app.get("/api/v1/health", response_model=BaseResponse, tags=["Health"])
def health_check():
    """Kiểm tra tình trạng hoạt động của hệ thống Backend."""
    return BaseResponse(
        success=True,
        message="NutriSnap API is running healthy.",
        disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER,
    )


# ==============================================================================
# PHÂN HỆ 1: AUTHENTICATION (XÁC THỰC AN TOÀN QUA COOKIE)
# ==============================================================================

@app.post(
    "/api/v1/auth/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Authentication"],
)
def register_user(req: UserRegisterRequest):
    """Đăng ký tài khoản mới. Trả về thông tin người dùng và gợi ý thiết lập mục tiêu."""
    mock_user = UserPublicResponse(
        id=1,
        username=req.username,
        email=req.email,
        created_at=datetime.now(UTC),
    )
    return AuthResponse(
        success=True,
        message="Đăng ký tài khoản thành công! Vui lòng thiết lập mục tiêu dinh dưỡng.",
        has_goal=False,
        user=mock_user,
    )


@app.post(
    "/api/v1/auth/login",
    response_model=AuthResponse,
    tags=["Authentication"],
)
def login_user(req: UserLoginRequest, response: Response):
    """
    Đăng nhập hệ thống.
    Đính kèm JWT Token vào HttpOnly Cookie để chống XSS.
    """
    # Minh họa thiết lập HttpOnly Cookie chuẩn
    response.set_cookie(
        key="access_token",
        value="mock_jwt_token_for_thanhdat",
        httponly=True,
        max_age=60 * 60 * 24 * 7,  # 7 ngày
        samesite="lax",
        secure=False,  # Đổi thành True trên production HTTPS
    )
    mock_user = UserPublicResponse(
        id=1,
        username="thanhdat",
        email="dat@example.com",
        created_at=datetime.now(UTC),
    )
    return AuthResponse(
        success=True,
        message="Đăng nhập thành công qua HttpOnly Cookie.",
        has_goal=True,
        user=mock_user,
    )


@app.get(
    "/api/v1/auth/me",
    response_model=AuthResponse,
    tags=["Authentication"],
)
def get_current_user_profile():
    """Lấy thông tin tài khoản đang đăng nhập từ Cookie JWT."""
    mock_user = UserPublicResponse(
        id=1,
        username="thanhdat",
        email="dat@example.com",
        created_at=datetime.now(UTC),
    )
    return AuthResponse(
        success=True,
        message="Phiên đăng nhập hợp lệ.",
        has_goal=True,
        user=mock_user,
    )


@app.post(
    "/api/v1/auth/logout",
    response_model=BaseResponse,
    tags=["Authentication"],
)
def logout_user(response: Response):
    """Đăng xuất, xóa HttpOnly Cookie khỏi trình duyệt."""
    response.delete_cookie(key="access_token", path="/")
    return BaseResponse(
        success=True,
        message="Đã đăng xuất an toàn.",
        disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER,
    )


# ==============================================================================
# PHÂN HỆ 2: SMART GOAL PLANNER (MỤC TIÊU CÁ NHÂN)
# ==============================================================================

@app.get(
    "/api/v1/goals",
    response_model=GoalResponse,
    tags=["Goal Planner"],
)
def get_user_goal():
    """Lấy mục tiêu dinh dưỡng hiện tại của tài khoản."""
    return GoalResponse(
        id=1,
        user_id=1,
        target_weight=67.0,
        bmr_calories=1690.0,
        tdee_calories=2150.0,
        target_calories=1650.0,
        target_protein_g=125.0,
        target_carbs_g=185.0,
        target_fat_g=45.0,
        daily_budget_vnd=60000,
        disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER,
    )


@app.post(
    "/api/v1/goals",
    response_model=GoalResponse,
    tags=["Goal Planner"],
)
def create_or_update_goal(req: GoalCreateRequest):
    """
    Thiết lập hoặc cập nhật mục tiêu dinh dưỡng cá nhân.
    Tính toán BMR, TDEE và kiểm tra an toàn y khoa (không ép giảm cân cực đoan).
    """
    return GoalResponse(
        id=1,
        user_id=1,
        target_weight=req.target_weight_kg,
        bmr_calories=1680.0,
        tdee_calories=2100.0,
        target_calories=1600.0,
        target_protein_g=120.0,
        target_carbs_g=180.0,
        target_fat_g=44.0,
        daily_budget_vnd=req.daily_budget_vnd,
        disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER,
    )


# ==============================================================================
# PHÂN HỆ 3: THAM CHIẾU THỰC PHẨM (FOOD REFERENCES)
# ==============================================================================

@app.get(
    "/api/v1/foods/search",
    response_model=FoodSearchResponse,
    tags=["Food References"],
)
def search_foods(q: str = Query(..., min_length=1, description="Từ khóa tên món ăn")):
    """Tìm kiếm nhanh món ăn trong CSDL 500 món ăn Việt Nam."""
    mock_items = [
        FoodReferenceItem(
            id=1,
            food_name="Phở bò tái",
            calories_per_100g=135.0,
            protein_per_100g=8.2,
            carbs_per_100g=16.5,
            fat_per_100g=3.8,
            avg_price_vnd=45000,
        ),
        FoodReferenceItem(
            id=2,
            food_name="Cơm tấm sườn nướng",
            calories_per_100g=185.0,
            protein_per_100g=9.5,
            carbs_per_100g=22.0,
            fat_per_100g=6.2,
            avg_price_vnd=40000,
        ),
    ]
    return FoodSearchResponse(total=len(mock_items), items=mock_items)


# ==============================================================================
# PHÂN HỆ 4: GHI NHẬN BỮA ĂN (MEAL LOGGING - TWO-STEP CONFIRMATION)
# ==============================================================================

@app.post(
    "/api/v1/meals/preview",
    response_model=MealPreviewResponse,
    tags=["Meal Logging"],
)
def preview_meal(req: MealPreviewRequest):
    """
    Bước 1 (Two-Step Confirmation): Phân tích ảnh/giọng nói để tạo bản nháp.
    Frontend hiển thị danh sách món ăn để người dùng chỉnh sửa số gam trước khi lưu.
    """
    return MealPreviewResponse(
        status="pending_confirmation",
        meal_type=req.meal_type,
        detected_items=[
            MealPreviewItem(
                food_id=1,
                food_name="Phở bò tái",
                estimated_gram=400.0,
                estimated_calories=540.0,
                protein_g=32.8,
                carbs_g=66.0,
                fat_g=15.2,
                confidence=0.92,
            )
        ],
        total_estimated_calories=540.0,
        disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER,
    )


@app.post(
    "/api/v1/meals/log",
    response_model=MealLogResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Meal Logging"],
)
def log_meal_confirmed(req: MealLogRequest):
    """
    Bước 2 (Two-Step Confirmation): Lưu bữa ăn vào CSDL khi người dùng đã bấm Xác nhận.
    Chỉ thực thi ghi dữ liệu khi is_confirmed = True.
    """
    if not req.is_confirmed:
        return MealLogResponse(
            success=False,
            meal_id=0,
            logged_at=datetime.now(UTC),
            total_calories=0.0,
            message="Chưa có sự xác nhận từ người dùng. Bữa ăn không được ghi vào CSDL.",
            disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER,
        )

    return MealLogResponse(
        success=True,
        meal_id=101,
        logged_at=datetime.now(UTC),
        total_calories=540.0,
        message="Ghi nhận bữa ăn thành công!",
        disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER,
    )


# ==============================================================================
# PHÂN HỆ 5: DASHBOARD DINH DƯỠNG TRONG NGÀY (DAILY DASHBOARD)
# ==============================================================================

@app.get(
    "/api/v1/dashboard/daily",
    response_model=DailyDashboardResponse,
    tags=["Dashboard"],
)
def get_daily_dashboard(date_str: str | None = Query(None, alias="date")):
    """Cung cấp tổng hợp Calo, 3 thanh Macro và danh sách bữa ăn hôm nay."""
    today = date_str or datetime.now(UTC).strftime("%Y-%m-%d")
    return DailyDashboardResponse(
        date=today,
        target_calories=1800.0,
        consumed_calories=1250.0,
        remaining_calories=550.0,
        calories_progress_percent=69.4,
        macros=DashboardMacros(
            protein=MacroDetail(consumed=85.0, target=120.0, unit="g", progress_percent=70.8),
            carbs=MacroDetail(consumed=145.0, target=200.0, unit="g", progress_percent=72.5),
            fat=MacroDetail(consumed=40.0, target=55.0, unit="g", progress_percent=72.7),
        ),
        meals_summary=[],
        disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER,
    )


# ==============================================================================
# PHÂN HỆ 6: TRỢ LÝ ẢO AI (ASSISTANT CHAT & ACTION CARDS)
# ==============================================================================

@app.post(
    "/api/v1/assistant/chat",
    response_model=ChatMessageResponse,
    tags=["Assistant Chat"],
)
def chat_with_assistant(req: ChatMessageRequest):
    """
    Trò chuyện cùng Trợ lý ảo AI NutriSnap.
    Hỗ trợ sinh Thẻ Xác nhận Thao tác (Action Confirmation Cards) khi phát hiện ý định ghi bữa ăn.
    """
    card = ActionCard(
        type="confirm_log_meal",
        status="pending_user_action",
        data=ActionCardData(
            meal_type="lunch",
            items=[
                ActionCardItemData(
                    food_id=1,
                    food_name="Phở bò tái",
                    estimated_gram=400.0,
                    calories=540.0,
                    protein_g=32.8,
                    carbs_g=66.0,
                    fat_g=15.2,
                )
            ],
            total_calories=540.0,
        ),
    )
    return ChatMessageResponse(
        session_id=req.session_id or 1,
        reply_text="Mình đã ước tính xong bữa ăn của bạn! Vui lòng kiểm tra lại số liệu bên dưới và nhấn Xác nhận để lưu nhé.",
        action_card=card,
        disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER,
    )


@app.get(
    "/api/v1/assistant/history",
    response_model=ChatHistoryResponse,
    tags=["Assistant Chat"],
)
def get_chat_history(session_id: int = Query(1)):
    """Lấy danh sách tin nhắn trong phiên trò chuyện."""
    return ChatHistoryResponse(
        session_id=session_id,
        messages=[],
    )
