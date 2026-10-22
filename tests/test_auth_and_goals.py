"""
tests/test_auth_and_goals.py
Kiểm thử tự động API Đăng nhập/Xác thực (Authentication) và Hoạch định Mục tiêu/TDEE (Goal Planner).
Phục vụ kế hoạch kiểm thử Week 2 của Pair 3 (AI Orchestrator & QA/Benchmarking).

Tuân thủ:
- REST API Contract & Pydantic v2 schemas thực tế trong `src/backend/schemas/api_contract.py`.
- Cơ chế xác thực Zero-Trust HttpOnly Cookie trong `src/backend/services/auth_guard.py`.
- Công thức tính BMR (Mifflin-St Jeor), TDEE và cảnh báo lâm sàng trong `src/backend/main.py`.
- Tái sử dụng FastAPI TestClient, không hardcode secret hoặc tài khoản production.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from src.backend.main import app, calculate_bmr, calculate_tdee
from src.backend.schemas.api_contract import (
    RESPONSIBLE_NUTRITION_DISCLAIMER,
    AuthResponse,
    GoalResponse,
)

# ==============================================================================
# FIXTURES
# ==============================================================================


@pytest.fixture(name="client")
def client_fixture() -> TestClient:
    """Test client tiêu chuẩn không có thông tin xác thực."""
    return TestClient(app)


@pytest.fixture(name="authenticated_client")
def authenticated_client_fixture() -> TestClient:
    """Test client đã đăng nhập hợp lệ qua HttpOnly Cookie 'access_token'."""
    authed_client = TestClient(app)
    # Thực hiện đăng nhập để nhận HttpOnly Cookie chính thức từ endpoint /login
    login_payload = {
        "username_or_email": "thanhdat",
        "password": "Password123",
    }
    response = authed_client.post("/api/v1/auth/login", json=login_payload)
    assert response.status_code == 200, "Đăng nhập fixture thất bại"
    assert "access_token" in response.cookies, "Cookie access_token không được cấp phát"
    return authed_client


# ==============================================================================
# 1. KIỂM THỬ XÁC THỰC & ĐĂNG NHẬP (AUTHENTICATION)
# ==============================================================================


def test_auth_login_success(client: TestClient):
    """Đăng nhập thành công với thông tin hợp lệ: trả về HTTP 200, set HttpOnly Cookie và đúng schema."""
    payload = {
        "username_or_email": "thanhdat",
        "password": "Password123",
    }
    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 200

    # Kiểm tra HttpOnly Cookie
    assert "access_token" in response.cookies
    token_value = response.cookies["access_token"]
    assert token_value and len(token_value) > 0

    # Kiểm tra cấu trúc response theo AuthResponse schema
    data = response.json()
    validated = AuthResponse.model_validate(data)
    assert validated.success is True
    assert validated.user.username == "thanhdat"
    assert validated.user.email == "dat@example.com"
    assert validated.user.id == 1

    # Đảm bảo không lộ thông tin nhạy cảm (mật khẩu / hash)
    assert "password" not in data
    assert "password_hash" not in data["user"]


def test_auth_login_missing_required_fields(client: TestClient):
    """Đăng nhập thiếu trường bắt buộc (username_or_email hoặc password) phải bị từ chối 422."""
    # Thiếu hoàn toàn body
    res_empty = client.post("/api/v1/auth/login", json={})
    assert res_empty.status_code == 422

    # Thiếu password
    res_no_pwd = client.post("/api/v1/auth/login", json={"username_or_email": "thanhdat"})
    assert res_no_pwd.status_code == 422

    # Thiếu username_or_email
    res_no_user = client.post("/api/v1/auth/login", json={"password": "Password123"})
    assert res_no_user.status_code == 422


def test_auth_register_success(client: TestClient):
    """Đăng ký tài khoản hợp lệ: trả về 201 Created và không lộ hash mật khẩu."""
    payload = {
        "username": "tester_qc",
        "email": "tester_qc@nutrisnap.vn",
        "password": "ValidPassword123",
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201

    data = response.json()
    validated = AuthResponse.model_validate(data)
    assert validated.success is True
    assert validated.user.username == "tester_qc"
    assert validated.user.email == "tester_qc@nutrisnap.vn"
    assert "password" not in data
    assert "password_hash" not in data["user"]


def test_auth_register_validation_errors(client: TestClient):
    """Đăng ký với email sai định dạng hoặc mật khẩu không đạt chuẩn y tế/an toàn bị từ chối 422."""
    # Mật khẩu dưới 8 ký tự
    res_short = client.post(
        "/api/v1/auth/register",
        json={"username": "user_short", "email": "valid@nutrisnap.vn", "password": "Pass1"},
    )
    assert res_short.status_code == 422

    # Mật khẩu không có chữ số
    res_no_digit = client.post(
        "/api/v1/auth/register",
        json={"username": "user_nodigit", "email": "valid@nutrisnap.vn", "password": "PasswordOnly"},
    )
    assert res_no_digit.status_code == 422

    # Email không đúng định dạng
    res_bad_email = client.post(
        "/api/v1/auth/register",
        json={"username": "user_bademail", "email": "invalid-email-address", "password": "Password123"},
    )
    assert res_bad_email.status_code == 422

    # Username quá ngắn (< 3 ký tự)
    res_short_user = client.post(
        "/api/v1/auth/register",
        json={"username": "ab", "email": "valid@nutrisnap.vn", "password": "Password123"},
    )
    assert res_short_user.status_code == 422


def test_auth_me_requires_cookie(client: TestClient, authenticated_client: TestClient):
    """Endpoint /api/v1/auth/me yêu cầu HttpOnly Cookie 'access_token' hợp lệ."""
    # Khi không có Cookie -> 401 Unauthorized
    res_no_cookie = client.get("/api/v1/auth/me")
    assert res_no_cookie.status_code == 401

    # Khi Cookie rỗng hoặc chuỗi trắng -> 401 Unauthorized
    client.cookies.set("access_token", "   ")
    res_blank_cookie = client.get("/api/v1/auth/me")
    assert res_blank_cookie.status_code == 401

    # Khi Cookie không hợp lệ (sai định dạng / quá ngắn và không phải mock token) -> 401 Unauthorized
    client.cookies.set("access_token", "invalid_bad")
    res_invalid_cookie = client.get("/api/v1/auth/me")
    assert res_invalid_cookie.status_code == 401

    # Khi Cookie hợp lệ (từ authenticated_client) -> 200 OK
    res_valid = authenticated_client.get("/api/v1/auth/me")
    assert res_valid.status_code == 200
    user_data = res_valid.json()["user"]
    assert user_data["username"] == "thanhdat"


def test_auth_logout_clears_cookie(authenticated_client: TestClient):
    """Đăng xuất thành công, xóa HttpOnly Cookie 'access_token' khỏi trình duyệt."""
    response = authenticated_client.post("/api/v1/auth/logout")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True

    # Trình duyệt nhận chỉ thị xóa cookie (max-age=0 hoặc giá trị rỗng hoặc cookie đã bị xóa)
    cookie_header = response.headers.get("set-cookie", "")
    assert "access_token" in cookie_header


# ==============================================================================
# 2. KIỂM THỬ ĐƠN VỊ CÔNG THỨC TOÁN HỌC BMR & TDEE (MIFFLIN-ST JEOR & PAL)
# ==============================================================================


def test_calculate_bmr_mifflin_st_jeor():
    """Kiểm thử tính toán BMR độc lập theo công thức Mifflin-St Jeor cho nam, nữ và khác."""
    # Nam: 10 * W + 6.25 * H - 5 * A + 5
    # 70kg, 175cm, 25 tuổi -> 10*70 + 6.25*175 - 5*25 + 5 = 700 + 1093.75 - 125 + 5 = 1673.75 -> làm tròn 1673.8
    assert calculate_bmr(70.0, 175.0, 25, "male") == 1673.8

    # Nữ: 10 * W + 6.25 * H - 5 * A - 161
    # 55kg, 160cm, 30 tuổi -> 10*55 + 6.25*160 - 5*30 - 161 = 550 + 1000 - 150 - 161 = 1239.0
    assert calculate_bmr(55.0, 160.0, 30, "female") == 1239.0

    # Khác (other): Trung vị y khoa (-78.0) giữa nam (+5) và nữ (-161)
    # 60kg, 170cm, 20 tuổi -> 10*60 + 6.25*170 - 5*20 - 78 = 600 + 1062.5 - 100 - 78 = 1484.5
    assert calculate_bmr(60.0, 170.0, 20, "other") == 1484.5


def test_calculate_tdee_activity_multipliers():
    """Kiểm thử tính TDEE qua 5 hệ số PAL chuẩn WHO/NHS."""
    bmr = 1500.0
    # sedentary: 1.2
    assert calculate_tdee(bmr, "sedentary") == round(1500.0 * 1.2, 1)  # 1800.0
    # light: 1.375
    assert calculate_tdee(bmr, "light") == round(1500.0 * 1.375, 1)  # 2062.5
    # moderate: 1.55
    assert calculate_tdee(bmr, "moderate") == round(1500.0 * 1.55, 1)  # 2325.0
    # active: 1.725
    assert calculate_tdee(bmr, "active") == round(1500.0 * 1.725, 1)  # 2587.5
    # very_active: 1.9
    assert calculate_tdee(bmr, "very_active") == round(1500.0 * 1.9, 1)  # 2850.0
    # Fallback mặc định khi level không xác định là moderate (1.55)
    assert calculate_tdee(bmr, "unknown_level") == round(1500.0 * 1.55, 1)


# ==============================================================================
# 3. KIỂM THỬ API HOẠCH ĐỊNH MỤC TIÊU & TDEE (GOAL PLANNER ENDPOINT)
# ==============================================================================


def test_goals_endpoint_requires_authentication(client: TestClient):
    """Zero-Trust: Endpoint /api/v1/goals từ chối 401 khi chưa đăng nhập."""
    # GET /goals
    res_get = client.get("/api/v1/goals")
    assert res_get.status_code == 401

    # POST /goals
    sample_payload = {
        "gender": "male",
        "age": 25,
        "height_cm": 175.0,
        "current_weight_kg": 70.0,
        "target_weight_kg": 67.0,
        "activity_level": "moderate",
        "goal_type": "lose_weight",
        "weekly_pace_kg": 0.5,
        "daily_budget_vnd": 60000,
    }
    res_post = client.post("/api/v1/goals", json=sample_payload)
    assert res_post.status_code == 401


def test_goals_get_authenticated(authenticated_client: TestClient):
    """Lấy thông tin mục tiêu hiện tại của người dùng đã xác thực: trả về 200 và đúng schema."""
    response = authenticated_client.get("/api/v1/goals")
    assert response.status_code == 200

    data = response.json()
    validated = GoalResponse.model_validate(data)
    assert validated.bmr_calories > 0
    assert validated.tdee_calories > validated.bmr_calories
    assert validated.target_calories > 0
    assert RESPONSIBLE_NUTRITION_DISCLAIMER in validated.disclaimer


def test_goals_create_lose_weight_calculation(authenticated_client: TestClient):
    """Kiểm tra tính toán giảm cân: TDEE - calorie_deficit, protein 1.6g/kg, phân bổ macro chuẩn y khoa."""
    payload: dict[str, Any] = {
        "gender": "male",
        "age": 25,
        "height_cm": 175.0,
        "current_weight_kg": 70.0,
        "target_weight_kg": 65.0,
        "activity_level": "moderate",
        "goal_type": "lose_weight",
        "weekly_pace_kg": 0.5,
        "daily_budget_vnd": 65000,
    }
    response = authenticated_client.post("/api/v1/goals", json=payload)
    assert response.status_code == 200

    data = response.json()
    validated = GoalResponse.model_validate(data)

    # Đối chiếu công thức độc lập:
    # BMR = 1673.8
    # TDEE = round(1673.8 * 1.55, 1) = 2594.4
    # Deficit = 0.5 * 7700 / 7 = 550.0
    # Target = 2594.4 - 550.0 = 2044.4
    assert validated.bmr_calories == 1673.8
    assert validated.tdee_calories == 2594.4
    assert validated.target_calories == 2044.4

    # Protein cho giảm cân: 70kg * 1.6 = 112.0g
    assert validated.target_protein_g == 112.0

    # Fat: 25% calo = 2044.4 * 0.25 / 9 = 56.8g
    assert validated.target_fat_g == 56.8

    # Carbs: phần còn lại
    assert validated.target_carbs_g == 271.3
    assert validated.daily_budget_vnd == 65000


def test_goals_create_maintain_auto_adjusts_pace(authenticated_client: TestClient):
    """Kiểm tra mục tiêu 'maintain' tự chuẩn hóa weekly_pace_kg = 0.0 và target_calories == tdee."""
    payload: dict[str, Any] = {
        "gender": "female",
        "age": 30,
        "height_cm": 160.0,
        "current_weight_kg": 55.0,
        "target_weight_kg": 55.0,
        "activity_level": "light",
        "goal_type": "maintain",
        "weekly_pace_kg": 0.5,  # Gửi giá trị khác 0 nhưng hệ thống tự điều chỉnh về 0
        "daily_budget_vnd": 50000,
    }
    response = authenticated_client.post("/api/v1/goals", json=payload)
    assert response.status_code == 200

    data = response.json()
    validated = GoalResponse.model_validate(data)
    # BMR nữ = 1239.0, light PAL = 1.375 -> TDEE = round(1239.0 * 1.375, 1) = 1703.6
    assert validated.bmr_calories == 1239.0
    assert validated.tdee_calories == 1703.6
    # Giữ cân thì target_calories = tdee_calories
    assert validated.target_calories == validated.tdee_calories
    # Protein giữ cân: 55 * 1.2 = 66.0g
    assert validated.target_protein_g == 66.0


def test_goals_create_gain_muscle_calculation(authenticated_client: TestClient):
    """Kiểm tra mục tiêu 'gain_muscle': calo thặng dư (surplus), protein 2.0g/kg."""
    payload: dict[str, Any] = {
        "gender": "other",
        "age": 20,
        "height_cm": 170.0,
        "current_weight_kg": 60.0,
        "target_weight_kg": 64.0,
        "activity_level": "sedentary",
        "goal_type": "gain_muscle",
        "weekly_pace_kg": 0.25,
        "daily_budget_vnd": 80000,
    }
    response = authenticated_client.post("/api/v1/goals", json=payload)
    assert response.status_code == 200

    data = response.json()
    validated = GoalResponse.model_validate(data)

    # BMR other = 1484.5, sedentary = 1.2 -> TDEE = 1781.4
    assert validated.bmr_calories == 1484.5
    assert validated.tdee_calories == 1781.4

    # Surplus = 0.25 * 7700 / 7 = 275.0 kcal -> Target = 1781.4 + 275.0 = 2056.4 kcal
    assert validated.target_calories == 2056.4
    # Protein tăng cơ: 60 * 2.0 = 120.0g
    assert validated.target_protein_g == 120.0


def test_goals_clinical_boundary_low_tdee(authenticated_client: TestClient):
    """Kiểm tra ngưỡng lâm sàng y tế: nếu TDEE <= 1200 kcal, không ép target = 1200 và bổ sung cảnh báo y tế."""
    payload: dict[str, Any] = {
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
    response = authenticated_client.post("/api/v1/goals", json=payload)
    assert response.status_code == 200

    data = response.json()
    validated = GoalResponse.model_validate(data)

    assert validated.tdee_calories <= 1200.0
    # Không được ép target_calories = 1200 vì > TDEE sẽ gây phản tác dụng (tăng cân)
    assert validated.target_calories == validated.tdee_calories
    assert "Cảnh báo y tế" in validated.disclaimer


def test_goals_validation_rejects_out_of_bounds(authenticated_client: TestClient):
    """Kiểm tra Pydantic & Custom Validators từ chối các giá trị sinh trắc học ngoài miền an toàn."""
    valid_base: dict[str, Any] = {
        "gender": "male",
        "age": 25,
        "height_cm": 175.0,
        "current_weight_kg": 70.0,
        "target_weight_kg": 67.0,
        "activity_level": "moderate",
        "goal_type": "lose_weight",
        "weekly_pace_kg": 0.5,
        "daily_budget_vnd": 60000,
    }

    # Tuổi < 10 hoặc > 120
    bad_age = {**valid_base, "age": 8}
    assert authenticated_client.post("/api/v1/goals", json=bad_age).status_code == 422

    # Chiều cao < 80cm hoặc > 250cm
    bad_height = {**valid_base, "height_cm": 50.0}
    assert authenticated_client.post("/api/v1/goals", json=bad_height).status_code == 422

    # Cân nặng < 25kg hoặc > 300kg
    bad_weight = {**valid_base, "current_weight_kg": 15.0}
    assert authenticated_client.post("/api/v1/goals", json=bad_weight).status_code == 422

    # weekly_pace_kg vượt ngưỡng an toàn y tế cho giảm cân (> 0.75 kg/tuần)
    unsafe_lose_pace = {**valid_base, "weekly_pace_kg": 1.2}
    assert authenticated_client.post("/api/v1/goals", json=unsafe_lose_pace).status_code == 422

    # weekly_pace_kg dưới ngưỡng khả thi cho giảm cân (< 0.25 kg/tuần)
    too_slow_lose_pace = {**valid_base, "weekly_pace_kg": 0.1}
    assert authenticated_client.post("/api/v1/goals", json=too_slow_lose_pace).status_code == 422

    # weekly_pace_kg vượt ngưỡng an toàn cho tăng cơ (> 0.50 kg/tuần)
    unsafe_gain_pace = {
        **valid_base,
        "goal_type": "gain_muscle",
        "weekly_pace_kg": 0.8,
    }
    assert authenticated_client.post("/api/v1/goals", json=unsafe_gain_pace).status_code == 422
