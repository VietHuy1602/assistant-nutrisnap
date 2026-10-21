"""
src/backend/main.py
Điểm khởi chạy ứng dụng Backend FastAPI cho dự án NutriSnap.
Cung cấp tài liệu tương tác Swagger UI tại /docs theo chuẩn REST API Contract.
Cấu hình CORS hỗ trợ HttpOnly Cookie an toàn (allow_credentials=True).
Zero-Trust Authentication: Xác thực người dùng qua HttpOnly Cookie 'access_token'.
"""

from datetime import UTC, datetime

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware

from src.backend.schemas.api_contract import (
    RESPONSIBLE_NUTRITION_DISCLAIMER,
    ActionCard,
    ActionCardConfirmRequest,
    ActionCardConfirmResponse,
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
    MealDetailResponse,
    MealItemDetail,
    MealLogRequest,
    MealLogResponse,
    MealPreviewItem,
    MealPreviewRequest,
    MealPreviewResponse,
    UserLoginRequest,
    UserPublicResponse,
    UserRegisterRequest,
    WeightHistoryResponse,
    WeightLogRequest,
    WeightLogResponse,
)
from src.backend.services.auth_guard import AuthenticatedUser, get_current_user

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
        "http://127.0.0.1:3000",
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
def get_current_user_profile(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Lấy thông tin tài khoản đang đăng nhập từ Cookie JWT."""
    return AuthResponse(
        success=True,
        message="Phiên đăng nhập hợp lệ.",
        has_goal=True,
        user=UserPublicResponse.model_validate(current_user),
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

def calculate_bmr(weight_kg: float, height_cm: float, age: int, gender: str) -> float:
    """Tính toán BMR theo công thức Mifflin-St Jeor.
    Xử lý chuẩn xác cho cả male, female và other (áp dụng trung vị trung tính y khoa).
    """
    base = 10.0 * weight_kg + 6.25 * height_cm - 5.0 * age
    if gender == "male":
        return round(base + 5.0, 1)
    if gender == "female":
        return round(base - 161.0, 1)
    # gender == "other" -> trung vị y học giữa nam (+5) và nữ (-161): (5 + (-161)) / 2 = -78
    return round(base - 78.0, 1)


def calculate_tdee(bmr: float, activity_level: str) -> float:
    """Tính toán TDEE dựa trên hệ số hoạt động thể chất PAL chuẩn WHO/NHS."""
    activity_multipliers = {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
        "very_active": 1.9,
    }
    return round(bmr * activity_multipliers.get(activity_level, 1.55), 1)


@app.get(
    "/api/v1/goals",
    response_model=GoalResponse,
    tags=["Goal Planner"],
)
def get_user_goal(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Lấy mục tiêu dinh dưỡng hiện tại của tài khoản."""
    return GoalResponse(
        id=1,
        user_id=current_user.id,
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
def create_or_update_goal(
    req: GoalCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Thiết lập hoặc cập nhật mục tiêu dinh dưỡng cá nhân.
    Tính toán BMR (Mifflin-St Jeor), TDEE và kiểm tra an toàn y khoa.
    """
    bmr = calculate_bmr(req.current_weight_kg, req.height_cm, req.age, req.gender)
    tdee = calculate_tdee(bmr, req.activity_level)

    warning_note = ""
    # Tính toán Calo mục tiêu an toàn
    if req.goal_type == "lose_weight":
        calorie_deficit = (req.weekly_pace_kg * 7700.0) / 7.0
        if tdee <= 1200.0:
            # Ngưỡng lâm sàng an toàn: Không ép target_calories = 1200 khi TDEE <= 1200 (> TDEE gây tăng cân)
            target_calories = tdee
            warning_note = (
                " Cảnh báo y tế: TDEE của bạn thấp (<=1200 kcal). Để giảm cân an toàn, "
                "bạn nên tăng cường vận động thể chất thay vì cắt giảm sâu calo."
            )
        else:
            target_calories = max(1200.0, round(tdee - calorie_deficit, 1))
        protein_g = round(req.current_weight_kg * 1.6, 1)
    elif req.goal_type == "gain_muscle":
        calorie_surplus = (req.weekly_pace_kg * 7700.0) / 7.0
        target_calories = round(tdee + calorie_surplus, 1)
        protein_g = round(req.current_weight_kg * 2.0, 1)
    else:  # maintain
        target_calories = tdee
        protein_g = round(req.current_weight_kg * 1.2, 1)

    # Phân bổ Macro chuẩn y tế: 25% Fat, còn lại Carbs
    fat_calories = target_calories * 0.25
    fat_g = round(fat_calories / 9.0, 1)
    protein_calories = protein_g * 4.0
    carbs_calories = max(0.0, target_calories - protein_calories - fat_calories)
    carbs_g = round(carbs_calories / 4.0, 1)

    return GoalResponse(
        id=1,
        user_id=current_user.id,
        target_weight=req.target_weight_kg,
        bmr_calories=bmr,
        tdee_calories=tdee,
        target_calories=target_calories,
        target_protein_g=protein_g,
        target_carbs_g=carbs_g,
        target_fat_g=fat_g,
        daily_budget_vnd=req.daily_budget_vnd,
        disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER + warning_note,
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
            calories_per_100g=115.0,
            protein_per_100g=8.5,
            carbs_per_100g=14.2,
            fat_per_100g=2.8,
            avg_price_vnd=40000,
        ),
        FoodReferenceItem(
            id=2,
            food_name="Cơm tấm sườn nướng",
            calories_per_100g=245.0,
            protein_per_100g=14.5,
            carbs_per_100g=25.0,
            fat_per_100g=9.8,
            avg_price_vnd=35000,
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
    # 400g Phở bò tái: 4 * 115 = 460 kcal, 4 * 8.5 = 34g protein, 4 * 14.2 = 56.8g carbs, 4 * 2.8 = 11.2g fat
    return MealPreviewResponse(
        status="pending_confirmation",
        meal_type=req.meal_type,
        detected_items=[
            MealPreviewItem(
                food_id=1,
                food_name="Phở bò tái",
                estimated_gram=400.0,
                estimated_calories=460.0,
                protein_g=34.0,
                carbs_g=56.8,
                fat_g=11.2,
                confidence=0.92,
            )
        ],
        total_estimated_calories=460.0,
        disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER,
    )


@app.post(
    "/api/v1/meals/log",
    response_model=MealLogResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Meal Logging"],
)
def log_meal_confirmed(
    req: MealLogRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Bước 2 (Two-Step Confirmation): Lưu bữa ăn vào CSDL khi người dùng đã bấm Xác nhận.
    Chỉ thực thi ghi dữ liệu khi is_confirmed = True. Nếu False, từ chối với HTTP 400 Bad Request.
    """
    if not req.is_confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Yêu cầu bị từ chối: Bữa ăn chưa được người dùng xác nhận (is_confirmed=False).",
        )

    return MealLogResponse(
        success=True,
        meal_id=101,
        logged_at=datetime.now(UTC),
        total_calories=460.0,
        message="Ghi nhận bữa ăn thành công!",
        disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER,
    )


@app.get(
    "/api/v1/meals/today",
    response_model=list[MealDetailResponse],
    tags=["Meal Logging"],
)
def get_today_meals(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Lấy danh sách các bữa ăn đã ghi nhận trong ngày hôm nay."""
    return [
        MealDetailResponse(
            id=101,
            meal_type="breakfast",
            image_path=None,
            logged_at=datetime.now(UTC),
            total_calories=460.0,
            items=[
                MealItemDetail(
                    id=1,
                    food_id=1,
                    food_name="Phở bò tái",
                    estimated_gram=400.0,
                    estimated_calories=460.0,
                )
            ],
        )
    ]


@app.delete(
    "/api/v1/meals/{meal_id}",
    response_model=BaseResponse,
    tags=["Meal Logging"],
)
def delete_meal(
    meal_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Xóa một bữa ăn đã ghi nhận khỏi CSDL."""
    return BaseResponse(
        success=True,
        message=f"Đã xóa bữa ăn #{meal_id} thành công.",
        disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER,
    )


# ==============================================================================
# PHÂN HỆ 5: DASHBOARD DINH DƯỠNG TRONG NGÀY (DAILY DASHBOARD)
# ==============================================================================

@app.get(
    "/api/v1/meals/daily-dashboard",
    response_model=DailyDashboardResponse,
    tags=["Dashboard"],
)
@app.get(
    "/api/v1/dashboard/daily",
    response_model=DailyDashboardResponse,
    tags=["Dashboard"],
)
def get_daily_dashboard(
    date_str: str | None = Query(None, alias="date"),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
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
# PHÂN HỆ 6: THEO DÕI CÂN NẶNG (WEIGHT TRACKING)
# ==============================================================================

@app.post(
    "/api/v1/weight",
    response_model=WeightLogResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Weight Tracking"],
)
def log_weight(
    req: WeightLogRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Ghi nhận chỉ số cân nặng hàng ngày."""
    today = req.logged_date or datetime.now(UTC).strftime("%Y-%m-%d")
    return WeightLogResponse(
        id=1,
        user_id=current_user.id,
        weight_kg=req.weight_kg,
        logged_date=today,
        notes=req.notes,
        created_at=datetime.now(UTC),
    )


@app.get(
    "/api/v1/weight/history",
    response_model=WeightHistoryResponse,
    tags=["Weight Tracking"],
)
def get_weight_history(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Lấy lịch sử theo dõi cân nặng của người dùng."""
    return WeightHistoryResponse(
        items=[
            WeightLogResponse(
                id=1,
                user_id=current_user.id,
                weight_kg=68.5,
                logged_date=datetime.now(UTC).strftime("%Y-%m-%d"),
                notes="Đo vào buổi sáng",
                created_at=datetime.now(UTC),
            )
        ],
        current_weight=68.5,
        target_weight=65.0,
    )


# ==============================================================================
# PHÂN HỆ 7: TRỢ LÝ ẢO AI (ASSISTANT CHAT & ACTION CARDS)
# ==============================================================================

@app.post(
    "/api/v1/assistant/chat",
    response_model=ChatMessageResponse,
    tags=["Assistant Chat"],
)
def chat_with_assistant(
    req: ChatMessageRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
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
                    calories=460.0,
                    protein_g=34.0,
                    carbs_g=56.8,
                    fat_g=11.2,
                )
            ],
            total_calories=460.0,
        ),
    )
    return ChatMessageResponse(
        session_id=req.session_id or 1,
        reply_text="Mình đã ước tính xong bữa ăn của bạn! Vui lòng kiểm tra lại số liệu bên dưới và nhấn Xác nhận để lưu nhé.",
        action_card=card,
        disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER,
    )


@app.post(
    "/api/v1/assistant/action-card/confirm",
    response_model=ActionCardConfirmResponse,
    tags=["Assistant Chat"],
)
def confirm_action_card(
    req: ActionCardConfirmRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Xác nhận thực thi thẻ hành động (Action Confirmation Card) từ Chatbot."""
    return ActionCardConfirmResponse(
        success=True,
        message=f"Đã thực thi thẻ hành động '{req.action_type}' thành công.",
        result={"status": "confirmed", "executed_for_user": current_user.id},
    )


@app.get(
    "/api/v1/assistant/history",
    response_model=ChatHistoryResponse,
    tags=["Assistant Chat"],
)
def get_chat_history(
    session_id: int = Query(1),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Lấy danh sách tin nhắn trong phiên trò chuyện."""
    return ChatHistoryResponse(
        session_id=session_id,
        messages=[],
    )
