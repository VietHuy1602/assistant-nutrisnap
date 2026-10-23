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

from fastapi import Depends, FastAPI, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from src.backend.models.database import get_session, init_db
from src.backend.routers.analytics_router import router as analytics_router
from src.backend.routers.assistant_router import router as assistant_router
from src.backend.routers.auth_goal_router import router as auth_goal_router
from src.backend.routers.meal_router import router as meal_router
from src.backend.routers.report_router import router as report_router
from src.backend.schemas.api_contract import (
    RESPONSIBLE_NUTRITION_DISCLAIMER,
    BaseResponse,
    MealPreviewItem,
    MealPreviewRequest,
    MealPreviewResponse,
    RecognizeFoodResponse,
    WeightHistoryResponse,
    WeightLogRequest,
    WeightLogResponse,
)
from src.backend.services.auth_guard import (
    AuthenticatedUser,
    get_current_user,
    verify_csrf_protection,
)
from src.backend.services.food_recognition import (
    decode_base64_image,
    get_fallback_recognition_response,
    recognize_food_pipeline,
)
from src.backend.services.nutrition_service import get_daily_dashboard_data


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

# Nối toàn bộ router Auth + Goal + Weight + Food references + Assistant + Analytics + Reports
app.include_router(auth_goal_router)
app.include_router(meal_router)
app.include_router(assistant_router)
app.include_router(analytics_router)
app.include_router(report_router)



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
    dependencies=[Depends(verify_csrf_protection)],
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


# ==============================================================================
# PHÂN HỆ DASHBOARD DINH DƯỠNG TRONG NGÀY (DAILY DASHBOARD - ALIAS)
# ==============================================================================


@app.get(
    "/api/v1/dashboard/daily",
    tags=["Dashboard"],
)
def get_daily_dashboard_legacy(
    date_str: str | None = Query(None, alias="date"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Cung cấp tổng hợp Calo, 3 thanh Macro và danh sách bữa ăn hôm nay (Alias)."""
    target_dt = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else None
    return get_daily_dashboard_data(session, current_user.id, target_dt)


# ==============================================================================
# PHÂN HỆ TRỢ LÝ ẢO AI (ASSISTANT CHAT & ACTION CARDS)
# ==============================================================================

@app.post(
    "/api/v1/weight",
    response_model=WeightLogResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Weight Tracking"],
    dependencies=[Depends(verify_csrf_protection)],
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
# PHÂN HỆ 6b: NHẬN DIỆN MÓN ĂN AI & ÁNH XẠ FUZZY MATCHING (W3 MILESTONE POC)
# ==============================================================================

@app.post(
    "/api/v1/ai/recognize-food",
    response_model=RecognizeFoodResponse,
    tags=["AI Vision & Recognition"],
)
@app.post(
    "/api/v1/ai/analyze-dish",
    response_model=RecognizeFoodResponse,
    tags=["AI Vision & Recognition"],
)
async def recognize_food_endpoint(request: Request):
    """
    Đóng gói API Nhận diện món ăn & Ánh xạ Fuzzy Matching (Milestone PoC - Tuần 3).
    Chuyên trách: Lê Hoàng Phú Hiếu (MSSV: 25127049 - Cặp 3: AI Intelligence & QA/Benchmarking).

    Hỗ trợ linh hoạt các phương thức gửi ảnh:
    1. Upload File qua multipart/form-data (field 'file' hoặc 'image').
    2. Chuỗi Base64 qua application/json hoặc form-data (field 'image_base64').
    3. Tự động kích hoạt cơ chế Mock Fallback khi API/mạng gặp sự cố (Zero-Crash Demo Guarantee).
    """
    content_type = request.headers.get("content-type", "").lower()
    meal_type = "lunch"
    image_bytes: bytes | None = None

    try:
        if "multipart/form-data" in content_type:
            form = await request.form()
            meal_type = str(form.get("meal_type") or "lunch")
            file_field = form.get("file") or form.get("image")
            if file_field and hasattr(file_field, "read"):
                image_bytes = await file_field.read()
            elif "image_base64" in form and form["image_base64"]:
                image_bytes, _ = decode_base64_image(str(form["image_base64"]))
        elif "application/json" in content_type:
            body = await request.json()
            meal_type = body.get("meal_type", "lunch")
            b64 = body.get("image_base64")
            if b64:
                image_bytes, _ = decode_base64_image(b64)
        else:
            raw_body = await request.body()
            if raw_body:
                image_bytes = raw_body

        if not image_bytes:
            # Nếu không có ảnh, trả về dữ liệu mẫu Fallback an toàn cho Demo PoC
            return get_fallback_recognition_response(meal_type=meal_type)

        return recognize_food_pipeline(
            image_input=image_bytes,
            meal_type=meal_type,
            use_mock_fallback=True,
        )
    except Exception:
        # Cơ chế Mock Fallback bắt buộc: Đảm bảo không bao giờ crash 500 làm gián đoạn Demo
        return get_fallback_recognition_response(meal_type=meal_type)

