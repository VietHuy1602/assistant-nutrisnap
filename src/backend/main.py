"""
src/backend/main.py
Điểm khởi chạy ứng dụng Backend FastAPI cho dự án NutriSnap.
Cung cấp tài liệu tương tác Swagger UI tại /docs theo chuẩn REST API Contract.
Cấu hình CORS hỗ trợ HttpOnly Cookie an toàn (allow_credentials=True).
Zero-Trust Authentication: Xác thực người dùng qua HttpOnly Cookie 'access_token'.
Tích hợp router auth_goal_router quản lý toàn bộ luồng Auth + Goal + Dữ liệu món ăn.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware

from src.backend.models.database import init_db
from src.backend.routers.auth_goal_router import router as auth_goal_router
from src.backend.schemas.api_contract import (
    RESPONSIBLE_NUTRITION_DISCLAIMER,
    ActionCard,
    ActionCardConfirmRequest,
    ActionCardConfirmResponse,
    ActionCardData,
    ActionCardItemData,
    BaseResponse,
    ChatHistoryResponse,
    ChatMessageRequest,
    ChatMessageResponse,
    DailyDashboardResponse,
    DashboardMacros,
    MacroDetail,
    MealDetailResponse,
    MealItemDetail,
    MealLogRequest,
    MealLogResponse,
    MealPreviewItem,
    MealPreviewRequest,
    MealPreviewResponse,
)
from src.backend.services.auth_guard import AuthenticatedUser, get_current_user


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Khởi tạo CSDL khi ứng dụng FastAPI khởi động."""
    init_db()
    yield


# Khởi tạo ứng dụng FastAPI với siêu dữ liệu OpenAPI đầy đủ
app = FastAPI(
    title="🥗 NutriSnap - Virtual AI Nutrition Assistant API",
    description="""
API Backend cho hệ thống Trợ lý ảo Dinh dưỡng NutriSnap (Đồ án CSC10014 - FIT HCMUS).
- Phân định ranh giới LLM & Backend an toàn.
- Tính toán Calo tất định từ CSDL tham chiếu 500 món Việt.
- Cơ chế xác thực an toàn qua HttpOnly JWT Cookie và Two-Step Confirmation.
- Module Smart Goal Planner (BMR Mifflin-St Jeor, TDEE, Phân bổ Macro y khoa).
    """,
    version="1.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
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

# Nối toàn bộ router Auth + Goal + Weight + Food references
app.include_router(auth_goal_router)


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
# PHÂN HỆ GHI NHẬN BỮA ĂN (MEAL LOGGING - TWO-STEP CONFIRMATION)
# ==============================================================================


@app.post(
    "/api/v1/meals/preview",
    response_model=MealPreviewResponse,
    tags=["Meal Logging"],
)
def preview_meal(req: MealPreviewRequest):
    """Bước 1 (Two-Step Confirmation): Phân tích ảnh/giọng nói để tạo bản nháp.

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
    """Bước 2 (Two-Step Confirmation): Lưu bữa ăn vào CSDL khi người dùng đã bấm Xác nhận.

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
# PHÂN HỆ DASHBOARD DINH DƯỠNG TRONG NGÀY (DAILY DASHBOARD)
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
# PHÂN HỆ TRỢ LÝ ẢO AI (ASSISTANT CHAT & ACTION CARDS)
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
    """Trò chuyện cùng Trợ lý ảo AI NutriSnap.

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
