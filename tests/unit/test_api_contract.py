"""
tests/unit/test_api_contract.py
Kiểm thử tự động toàn diện cho Hợp đồng API (api_contract.py) và Khung FastAPI (main.py).
Bao gồm:
- Zero-Trust HttpOnly Cookie authentication (401 khi thiếu cookie).
- Password strength validation khi đăng ký.
- Tự động chuẩn hóa weekly_pace_kg = 0.0 khi goal_type = 'maintain'.
- Cảnh báo an toàn y tế khi TDEE <= 1200 kcal.
- Từ chối ghi bữa ăn với HTTP 400 khi is_confirmed = False.
- Các endpoint mở rộng: GET /today, DELETE /meals/{id}, /daily-dashboard alias, /weight, /action-card/confirm.
"""

from fastapi.testclient import TestClient

from src.backend.main import app
from src.backend.schemas.api_contract import (
    RESPONSIBLE_NUTRITION_DISCLAIMER,
)


def test_health_check():
    """Kiểm tra endpoint /health hoạt động tốt."""
    client = TestClient(app)
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["disclaimer"] == RESPONSIBLE_NUTRITION_DISCLAIMER


def test_auth_register_validation():
    """Kiểm tra đăng ký thành công với mật khẩu chuẩn."""
    from sqlmodel import Session, select
    from src.backend.models.database import engine
    from src.backend.models.schema import User

    with Session(engine) as s:
        u = s.exec(select(User).where(User.username == "thanhdat")).first()
        if u:
            s.delete(u)
            s.commit()

    client = TestClient(app)
    payload = {
        "username": "thanhdat",
        "email": "dat@example.com",
        "password": "Password123",
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["user"]["username"] == "thanhdat"
    assert "password_hash" not in data["user"]


def test_auth_register_rejects_weak_password():
    """Kiểm tra đăng ký thất bại với mật khẩu yếu (không đủ 8 ký tự hoặc thiếu số/chữ)."""
    client = TestClient(app)
    # Ngắn hơn 8 ký tự
    res_short = client.post(
        "/api/v1/auth/register",
        json={"username": "user1", "email": "u1@example.com", "password": "abc"},
    )
    assert res_short.status_code == 422

    # Không có chữ số
    res_no_digit = client.post(
        "/api/v1/auth/register",
        json={"username": "user2", "email": "u2@example.com", "password": "onlyletterspassword"},
    )
    assert res_no_digit.status_code == 422


def test_unauthenticated_requests_return_401():
    """Zero-Trust: Yêu cầu không có HttpOnly Cookie 'access_token' bị từ chối 401 Unauthorized."""
    unauthed_client = TestClient(app)

    endpoints = [
        ("GET", "/api/v1/auth/me", None),
        ("GET", "/api/v1/goals", None),
        ("POST", "/api/v1/meals/log", {"meal_type": "lunch", "items": [{"food_id": 1, "food_name": "Phở", "estimated_gram": 100}], "is_confirmed": True}),
        ("GET", "/api/v1/meals/today", None),
        ("DELETE", "/api/v1/meals/101", None),
        ("GET", "/api/v1/meals/daily-dashboard", None),
        ("POST", "/api/v1/weight", {"weight_kg": 70.0}),
        ("GET", "/api/v1/weight/history", None),
        ("POST", "/api/v1/assistant/action-card/confirm", {"action_type": "confirm_log_meal"}),
    ]

    for method, path, json_data in endpoints:
        if method == "GET":
            res = unauthed_client.get(path)
        elif method == "POST":
            res = unauthed_client.post(path, json=json_data)
        elif method == "DELETE":
            res = unauthed_client.delete(path)
        assert res.status_code == 401, f"Endpoint {method} {path} should return 401 without cookie"


def test_auth_login_sets_httponly_cookie_and_accesses_protected_routes():
    """Kiểm tra đăng nhập trả về HttpOnly Cookie và truy cập được các endpoint cá nhân."""
    client = TestClient(app)
    payload = {
        "username_or_email": "thanhdat",
        "password": "Password123",
    }
    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 200
    assert "access_token" in response.cookies

    # Gọi /me thành công
    me_res = client.get("/api/v1/auth/me")
    assert me_res.status_code == 200
    assert me_res.json()["user"]["username"] == "thanhdat"


def test_goal_planner_contract():
    """Kiểm tra tính hợp lệ của schema Goal Planner khi đã xác thực."""
    client = TestClient(app)
    client.post("/api/v1/auth/login", json={"username_or_email": "thanhdat", "password": "Password123"})

    payload = {
        "gender": "male",
        "age": 20,
        "height_cm": 175.0,
        "current_weight_kg": 70.0,
        "target_weight_kg": 67.0,
        "activity_level": "moderate",
        "goal_type": "lose_weight",
        "weekly_pace_kg": 0.5,
        "daily_budget_vnd": 60000,
    }
    response = client.post("/api/v1/goals", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["target_weight"] == 67.0
    assert data["bmr_calories"] > 0
    assert data["tdee_calories"] > data["bmr_calories"]
    assert RESPONSIBLE_NUTRITION_DISCLAIMER in data["disclaimer"]


def test_goal_planner_maintain_auto_adjusts_pace():
    """Kiểm tra khi goal_type = 'maintain', weekly_pace_kg tự động được điều chỉnh về 0.0 mà không bị lỗi 422."""
    client = TestClient(app)
    client.post("/api/v1/auth/login", json={"username_or_email": "thanhdat", "password": "Password123"})

    payload = {
        "gender": "female",
        "age": 25,
        "height_cm": 160.0,
        "current_weight_kg": 52.0,
        "target_weight_kg": 52.0,
        "activity_level": "light",
        "goal_type": "maintain",
        "weekly_pace_kg": 0.5,  # Gửi 0.5 lên nhưng hệ thống tự điều chỉnh về 0.0
        "daily_budget_vnd": 50000,
    }
    response = client.post("/api/v1/goals", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["target_calories"] == data["tdee_calories"]


def test_goal_planner_clinical_boundary_low_tdee():
    """Kiểm tra ngưỡng lâm sàng: Nếu TDEE <= 1200 kcal, không ép target = 1200 (> TDEE) và đính kèm cảnh báo y tế."""
    client = TestClient(app)
    client.post("/api/v1/auth/login", json={"username_or_email": "thanhdat", "password": "Password123"})

    payload = {
        "gender": "female",
        "age": 85,
        "height_cm": 140.0,
        "current_weight_kg": 35.0,
        "target_weight_kg": 32.0,
        "activity_level": "sedentary",
        "goal_type": "lose_weight",
        "weekly_pace_kg": 0.5,
        "daily_budget_vnd": 40000,
    }
    response = client.post("/api/v1/goals", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["tdee_calories"] <= 1200.0
    assert data["target_calories"] == data["tdee_calories"]
    assert "Cảnh báo y tế" in data["disclaimer"]


def test_meal_preview_two_step_confirmation():
    """Kiểm tra bản nháp xem trước nhận diện bữa ăn (Bước 1 của 2-step confirmation)."""
    client = TestClient(app)
    payload = {
        "meal_type": "lunch",
        "image_base64": "mock_base64_string",
        "voice_modifier_text": "Không lấy mỡ",
    }
    response = client.post("/api/v1/meals/preview", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "pending_confirmation"
    assert len(data["detected_items"]) > 0
    # Phở bò tái 400g chuẩn xác = 460 kcal
    assert data["total_estimated_calories"] == 460.0


def test_meal_log_rejection_when_unconfirmed():
    """Kiểm tra việc ghi bữa ăn bị từ chối với HTTP 400 Bad Request khi is_confirmed = False."""
    client = TestClient(app)
    client.post("/api/v1/auth/login", json={"username_or_email": "thanhdat", "password": "Password123"})

    payload = {
        "meal_type": "lunch",
        "items": [
            {"food_id": 1, "food_name": "Phở bò tái", "estimated_gram": 400.0}
        ],
        "is_confirmed": False,
        "notes": "Chưa xác nhận",
    }
    response = client.post("/api/v1/meals/log", json=payload)
    assert response.status_code == 400
    assert "chưa được người dùng xác nhận" in response.json()["detail"]


def test_meal_log_success_when_confirmed():
    """Kiểm tra ghi bữa ăn thành công khi is_confirmed = True."""
    client = TestClient(app)
    client.post("/api/v1/auth/login", json={"username_or_email": "thanhdat", "password": "Password123"})

    payload = {
        "meal_type": "lunch",
        "items": [
            {"food_id": 1, "food_name": "Phở bò tái", "estimated_gram": 400.0}
        ],
        "is_confirmed": True,
        "notes": "Bữa trưa ngon",
    }
    response = client.post("/api/v1/meals/log", json=payload)
    assert response.status_code == 201
    assert response.json()["success"] is True
    assert response.json()["total_calories"] == 460.0


def test_meal_log_rejects_empty_items():
    """Kiểm tra validation từ chối ghi bữa ăn nếu items rỗng."""
    client = TestClient(app)
    client.post("/api/v1/auth/login", json={"username_or_email": "thanhdat", "password": "Password123"})

    payload = {
        "meal_type": "lunch",
        "items": [],
        "is_confirmed": True,
    }
    response = client.post("/api/v1/meals/log", json=payload)
    assert response.status_code == 422


def test_extended_meal_endpoints():
    """Kiểm tra các endpoint bổ sung: GET /meals/today, DELETE /meals/{id}, và GET /meals/daily-dashboard."""
    client = TestClient(app)
    client.post("/api/v1/auth/login", json={"username_or_email": "thanhdat", "password": "Password123"})

    # GET /meals/today
    today_res = client.get("/api/v1/meals/today")
    assert today_res.status_code == 200
    assert len(today_res.json()) >= 1

    # DELETE /meals/101
    del_res = client.delete("/api/v1/meals/101")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    # GET /meals/daily-dashboard (alias)
    dash_alias = client.get("/api/v1/meals/daily-dashboard")
    assert dash_alias.status_code == 200
    assert "target_calories" in dash_alias.json()


def test_weight_tracking_endpoints():
    """Kiểm tra phân hệ theo dõi cân nặng: POST /weight và GET /weight/history."""
    client = TestClient(app)
    client.post("/api/v1/auth/login", json={"username_or_email": "thanhdat", "password": "Password123"})

    log_res = client.post("/api/v1/weight", json={"weight_kg": 67.5, "notes": "Cân sáng"})
    assert log_res.status_code == 201
    assert log_res.json()["weight_kg"] == 67.5

    hist_res = client.get("/api/v1/weight/history")
    assert hist_res.status_code == 200
    assert len(hist_res.json()["items"]) >= 1


def test_assistant_action_card_and_confirm():
    """Kiểm tra chatbot sinh Action Card và xác nhận thực thi Action Card."""
    client = TestClient(app)
    client.post("/api/v1/auth/login", json={"username_or_email": "thanhdat", "password": "Password123"})

    chat_res = client.post("/api/v1/assistant/chat", json={"message": "Tôi vừa ăn phở bò"})
    assert chat_res.status_code == 200
    assert chat_res.json()["action_card"]["type"] == "confirm_log_meal"

    confirm_res = client.post(
        "/api/v1/assistant/action-card/confirm",
        json={"action_type": "confirm_log_meal", "action_data": {"meal_id": 101}},
    )
    assert confirm_res.status_code == 200
    assert confirm_res.json()["success"] is True


def test_goal_planner_rejects_unsafe_weekly_pace():
    """Kiểm tra API từ chối tốc độ giảm cân vượt quá ngưỡng y khoa (ví dụ 0.1kg hoặc 0.9kg/tuần)."""
    client = TestClient(app)
    client.post("/api/v1/auth/login", json={"username_or_email": "thanhdat", "password": "Password123"})

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
    client = TestClient(app)
    client.post("/api/v1/auth/login", json={"username_or_email": "thanhdat", "password": "Password123"})

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
