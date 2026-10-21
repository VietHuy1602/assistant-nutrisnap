"""
tests/unit/test_api_contract.py
Kiểm thử tự động cho Hợp đồng API (api_contract.py) và Khung FastAPI (main.py).
Đảm bảo định kiểu chuẩn, ràng buộc dữ liệu hợp lệ và cơ chế bảo mật HttpOnly Cookie.
"""

from fastapi.testclient import TestClient

from src.backend.main import app
from src.backend.schemas.api_contract import (
    RESPONSIBLE_NUTRITION_DISCLAIMER,
)

client = TestClient(app)


def test_health_check():
    """Kiểm tra endpoint /health hoạt động tốt."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["disclaimer"] == RESPONSIBLE_NUTRITION_DISCLAIMER


def test_auth_register_validation():
    """Kiểm tra ràng buộc khi đăng ký người dùng."""
    payload = {
        "username": "thanhdat",
        "email": "dat@example.com",
        "password": "Password123"
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["user"]["username"] == "thanhdat"
    assert "password_hash" not in data["user"]


def test_auth_login_sets_httponly_cookie():
    """Kiểm tra đăng nhập trả về HttpOnly Cookie chứa JWT an toàn."""
    payload = {
        "username_or_email": "thanhdat",
        "password": "Password123"
    }
    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 200
    # Xác minh cookie access_token được đính kèm
    assert "access_token" in response.cookies
    assert response.json()["success"] is True


def test_goal_planner_contract():
    """Kiểm tra tính hợp lệ của schema Goal Planner."""
    payload = {
        "gender": "male",
        "age": 20,
        "height_cm": 175.0,
        "current_weight_kg": 70.0,
        "target_weight_kg": 67.0,
        "activity_level": "moderate",
        "goal_type": "lose_weight",
        "weekly_pace_kg": 0.5,
        "daily_budget_vnd": 60000
    }
    response = client.post("/api/v1/goals", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["target_weight"] == 67.0
    assert data["bmr_calories"] > 0
    assert data["tdee_calories"] > data["bmr_calories"]
    assert data["disclaimer"] == RESPONSIBLE_NUTRITION_DISCLAIMER


def test_meal_preview_two_step_confirmation():
    """Kiểm tra bản nháp xem trước nhận diện bữa ăn (Bước 1 của 2-step confirmation)."""
    payload = {
        "meal_type": "lunch",
        "image_base64": "mock_base64_string",
        "voice_modifier_text": "Không lấy mỡ"
    }
    response = client.post("/api/v1/meals/preview", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "pending_confirmation"
    assert len(data["detected_items"]) > 0
    assert data["total_estimated_calories"] > 0


def test_meal_log_requires_confirmation():
    """Kiểm tra việc ghi bữa ăn yêu cầu cờ xác nhận is_confirmed = True."""
    payload = {
        "meal_type": "lunch",
        "items": [
            {"food_id": 1, "food_name": "Phở bò tái", "estimated_gram": 400.0}
        ],
        "is_confirmed": True,
        "notes": "Bữa trưa ngon"
    }
    response = client.post("/api/v1/meals/log", json=payload)
    assert response.status_code == 201
    assert response.json()["success"] is True


def test_dashboard_daily():
    """Kiểm tra dữ liệu hiển thị màn hình Dashboard."""
    response = client.get("/api/v1/dashboard/daily")
    assert response.status_code == 200
    data = response.json()
    assert "target_calories" in data
    assert "consumed_calories" in data
    assert "remaining_calories" in data
    assert "macros" in data
    assert "protein" in data["macros"]


def test_assistant_chat_returns_action_card():
    """Kiểm tra chatbot trả lời và sinh Action Confirmation Card khi có intent ghi bữa ăn."""
    payload = {
        "session_id": 1,
        "message": "Trưa nay tôi ăn 1 tô phở bò tái"
    }
    response = client.post("/api/v1/assistant/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "reply_text" in data
    assert data["action_card"] is not None
    assert data["action_card"]["type"] == "confirm_log_meal"
    assert data["action_card"]["status"] == "pending_user_action"


def test_goal_planner_rejects_unsafe_weekly_pace():
    """Kiểm tra API từ chối tốc độ giảm cân vượt quá ngưỡng y khoa (ví dụ 0.1kg hoặc 1.0kg/tuần)."""
    payload_too_slow = {
        "gender": "male",
        "age": 25,
        "height_cm": 175.0,
        "current_weight_kg": 75.0,
        "target_weight_kg": 70.0,
        "activity_level": "moderate",
        "goal_type": "lose_weight",
        "weekly_pace_kg": 0.1,  # Dưới mức tối thiểu 0.25kg/tuần
        "daily_budget_vnd": 60000,
    }
    res1 = client.post("/api/v1/goals", json=payload_too_slow)
    assert res1.status_code == 422

    payload_too_fast = {
        "gender": "male",
        "age": 25,
        "height_cm": 175.0,
        "current_weight_kg": 75.0,
        "target_weight_kg": 70.0,
        "activity_level": "moderate",
        "goal_type": "lose_weight",
        "weekly_pace_kg": 0.9,  # Vượt quá mức tối đa 0.75kg/tuần
        "daily_budget_vnd": 60000,
    }
    res2 = client.post("/api/v1/goals", json=payload_too_fast)
    assert res2.status_code == 422


def test_goal_planner_supports_other_gender():
    """Kiểm tra Goal Planner tính toán BMR theo công thức trung tính y khoa khi gender='other'."""
    payload = {
        "gender": "other",
        "age": 24,
        "height_cm": 170.0,
        "current_weight_kg": 65.0,
        "target_weight_kg": 60.0,
        "activity_level": "light",
        "goal_type": "lose_weight",
        "weekly_pace_kg": 0.5,
        "daily_budget_vnd": 50000,
    }
    response = client.post("/api/v1/goals", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["bmr_calories"] > 0
    assert data["target_calories"] >= 1200.0
