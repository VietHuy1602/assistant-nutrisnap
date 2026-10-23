"""
tests/unit/test_w3_nutrition_and_meals.py
Bộ kiểm thử tự động toàn diện Tuần 3: Deterministic Nutrition Engine, API Nhật ký & Dashboard.
Bao gồm 8 kịch bản kiểm thử:
1. test_01_deterministic_algebraic_calculation: Tính toán calo/macro đại số tuyệt đối.
2. test_02_leftover_deduction_eaten_ratio: Hệ số trừ hao thức ăn thừa (eaten_ratio).
3. test_03_fuzzy_food_matching_and_invalid_gram: Tìm kiếm món gần đúng và kiểm định số gam.
4. test_04_meal_log_two_step_pending_confirmation: Luồng xác nhận 2 bước - pending_confirmation.
5. test_05_meal_log_confirmed_persists_to_db: Luồng xác nhận 2 bước - ghi nguyên tử vào CSDL.
6. test_06_daily_dashboard_aggregation: Tổng hợp tiến trình ngày (calo, protein, remaining).
7. test_07_zero_trust_meal_and_dashboard_isolation: Cô lập dữ liệu giữa các người dùng (Zero-Trust).
8. test_08_seed_demo_accounts_idempotent: Tính lũy đẳng của script nạp 3 tài khoản demo.
"""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from scripts.seed_demo_accounts import seed_demo_data
from src.backend.main import app
from src.backend.models.database import engine, init_db
from src.backend.models.schema import FoodReference, Meal, MealItem, User, get_vn_today
from src.backend.services.auth_service import (
    create_access_token,
    register_with_initial_goal,
)
from src.backend.services.goal_service import GoalPlanInput
from src.backend.services.nutrition_service import (
    MealItemInput,
    calculate_meal_nutrition,
    resolve_food_reference,
)


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    """Khởi tạo CSDL và nạp 500 món ăn trước khi chạy các bài test."""
    init_db()
    with Session(engine) as session:
        count = len(session.exec(select(FoodReference)).all())
        if count < 30:
            from scripts.seed_food_references import seed_foods

            seed_foods()


def create_authenticated_client(username: str, email: str) -> tuple[TestClient, User]:
    """Helper tạo TestClient có HttpOnly Cookie JWT của người dùng đã xác thực."""
    with Session(engine) as session:
        existing = session.exec(select(User).where((User.username == username) | (User.email == email))).first()
        if existing:
            session.delete(existing)
            session.commit()

        user, _ = register_with_initial_goal(
            session=session,
            username=username,
            email=email,
            password="Password123",
            initial_goal=GoalPlanInput(
                gender="male",
                age=25,
                height_cm=170.0,
                current_weight_kg=65.0,
                target_weight_kg=65.0,
                goal_type="maintain",
                activity_level="moderate",
                daily_budget_vnd=60000,
            ),
        )

    token = create_access_token(data={"sub": str(user.id), "username": user.username})
    client = TestClient(app)
    client.cookies.set("access_token", token)
    return client, user


# ==============================================================================
# TEST SCENARIO 1: DETERMINISTIC ALGEBRAIC CALCULATION
# ==============================================================================


def test_01_deterministic_algebraic_calculation():
    """Kiểm tra hàm calculate_meal_nutrition với 'Cơm trắng' (200g) và 'Ức gà áp chảo' (150g).

    Công thức:
    - Cơm trắng: 200g * (130 / 100) = 260.0 kcal
    - Ức gà áp chảo: 150g * (165 / 100) = 247.5 kcal
    - Tổng calo = 507.5 kcal
    - Tổng đạm = (200/100)*2.7 + (150/100)*31.0 = 5.4 + 46.5 = 51.9 g
    - Tổng tinh bột = (200/100)*28.2 + (150/100)*0.0 = 56.4 g
    - Tổng chất béo = (200/100)*0.3 + (150/100)*3.6 = 0.6 + 5.4 = 6.0 g
    - Tổng chi phí = (200/100)*5000 + (150/100)*25000 = 10000 + 37500 = 47500 VNĐ
    """
    with Session(engine) as session:
        items = [
            MealItemInput(food_name="Cơm trắng", estimated_gram=200.0, eaten_ratio=1.0),
            MealItemInput(food_name="Ức gà áp chảo", estimated_gram=150.0, eaten_ratio=1.0),
        ]
        result = calculate_meal_nutrition(session, items)

        assert len(result.items) == 2
        assert result.total_weight_g == 350.0
        assert result.total_calories == 507.5
        assert result.total_protein_g == 51.9
        assert result.total_carbs_g == 56.4
        assert result.total_fat_g == 6.0
        assert result.total_estimated_price_vnd == 47500


# ==============================================================================
# TEST SCENARIO 2: LEFTOVER DEDUCTION (EATEN RATIO)
# ==============================================================================


def test_02_leftover_deduction_eaten_ratio():
    """Kiểm tra tính năng trừ hao thức ăn thừa khi người dùng chỉ ăn một nửa (eaten_ratio = 0.5)

    trên 200g 'Cơm tấm sườn nướng' (effective_gram = 100g, calo = 245.0 kcal).
    """
    with Session(engine) as session:
        items = [
            MealItemInput(food_name="Cơm tấm sườn nướng", estimated_gram=200.0, eaten_ratio=0.5),
        ]
        result = calculate_meal_nutrition(session, items)

        assert len(result.items) == 1
        item = result.items[0]
        assert item.estimated_gram == 200.0
        assert item.eaten_ratio == 0.5
        assert item.effective_gram == 100.0
        assert item.calories == 245.0
        assert result.total_calories == 245.0


# ==============================================================================
# TEST SCENARIO 3: FUZZY MATCHING & INVALID PORTION GRAM
# ==============================================================================


def test_03_fuzzy_food_matching_and_invalid_gram():
    """Kiểm tra tìm kiếm món bằng tên gần đúng ('cơm tấm sườn' hoặc 'phở bò tái')

    và kiểm tra khối lượng âm (-50g) hoặc vượt ngưỡng (5000g) bị chặn bởi ValueError.
    """
    with Session(engine) as session:
        # Ánh xạ tên gần đúng
        ref1 = resolve_food_reference(session, food_name="cơm tấm sườn")
        assert "Cơm tấm sườn" in ref1.food_name

        ref2 = resolve_food_reference(session, food_name="phở bò tái")
        assert ref2.food_name == "Phở bò tái"

        # Khối lượng âm (-50g)
        with pytest.raises(ValueError, match="lớn hơn 0 gam"):
            calculate_meal_nutrition(
                session,
                [MealItemInput(food_name="Cơm trắng", estimated_gram=-50.0)],
            )

        # Khối lượng vượt ngưỡng (> 3000g)
        with pytest.raises(ValueError, match="3000g"):
            calculate_meal_nutrition(
                session,
                [MealItemInput(food_name="Cơm trắng", estimated_gram=5000.0)],
            )


# ==============================================================================
# TEST SCENARIO 4: TWO-STEP CONFIRMATION - PENDING CONFIRMATION
# ==============================================================================


def test_04_meal_log_two_step_pending_confirmation():
    """Gọi POST /api/v1/meals/log với is_confirmed = False.

    Xác minh API trả về status == 'pending_confirmation', meal_id is None,
    có đầy đủ bảng tính calo xem trước và số bản ghi trong bảng meals vẫn bằng 0.
    """
    client, user = create_authenticated_client("user_step1", "user_step1@nutrisnap.vn")

    payload = {
        "meal_type": "Trưa",
        "items": [
            {"food_name": "Cơm tấm sườn nướng", "estimated_gram": 200.0, "eaten_ratio": 1.0}
        ],
        "is_confirmed": False,
    }

    resp = client.post("/api/v1/meals/log", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "pending_confirmation"
    assert data["meal_id"] is None
    assert data["nutrition"]["total_calories"] == 490.0
    assert len(data["nutrition"]["items"]) == 1

    # Kiểm tra trong DB không có bản ghi nào được ghi vào bảng meals
    with Session(engine) as session:
        user_meals = session.exec(select(Meal).where(Meal.user_id == user.id)).all()
        assert len(user_meals) == 0


# ==============================================================================
# TEST SCENARIO 5: TWO-STEP CONFIRMATION - CONFIRMED PERSISTS TO DB
# ==============================================================================


def test_05_meal_log_confirmed_persists_to_db():
    """Gọi POST /api/v1/meals/log với is_confirmed = True.

    Xác minh API trả về status == 'logged', meal_id hợp lệ,
    và các bản ghi được lưu chính xác vào bảng meals cùng meal_items.
    """
    client, user = create_authenticated_client("user_step2", "user_step2@nutrisnap.vn")

    payload = {
        "meal_type": "Trưa",
        "items": [
            {"food_name": "Phở bò tái", "estimated_gram": 350.0, "eaten_ratio": 1.0}
        ],
        "is_confirmed": True,
    }

    resp = client.post("/api/v1/meals/log", json=payload)
    assert resp.status_code == 201
    data = resp.json()

    assert data["status"] == "logged"
    assert data["meal_id"] is not None
    meal_id = data["meal_id"]

    # Kiểm tra bản ghi trong bảng meals và meal_items
    with Session(engine) as session:
        db_meal = session.get(Meal, meal_id)
        assert db_meal is not None
        assert db_meal.user_id == user.id
        assert db_meal.meal_type == "Trưa"

        items = session.exec(select(MealItem).where(MealItem.meal_id == meal_id)).all()
        assert len(items) == 1
        assert items[0].estimated_gram == 350.0
        assert items[0].estimated_calories == round(3.5 * 115.0, 2)


# ==============================================================================
# TEST SCENARIO 6: DAILY DASHBOARD AGGREGATION
# ==============================================================================


def test_06_daily_dashboard_aggregation():
    """Sau khi log 2 bữa ăn (Sáng và Trưa), gọi GET /api/v1/meals/daily-dashboard.

    Xác minh tổng calo đã nạp (consumed.calories), tổng đạm (consumed.protein_g)
    và số calo còn lại (remaining.calories = target - consumed) khớp chính xác 100%.
    """
    client, user = create_authenticated_client("user_dash", "user_dash@nutrisnap.vn")
    today = get_vn_today()

    # Log bữa Sáng: 150g Bánh mì trứng ốp la (150/100 * 230 = 345.0 kcal, 1.5 * 9.5 = 14.25g protein)
    client.post(
        "/api/v1/meals/log",
        json={
            "meal_type": "Sáng",
            "items": [{"food_name": "Bánh mì trứng ốp la", "estimated_gram": 150.0}],
            "is_confirmed": True,
        },
    )

    # Log bữa Trưa: 200g Cơm trắng (260.0 kcal, 5.4g protein) + 150g Ức gà áp chảo (247.5 kcal, 46.5g protein)
    client.post(
        "/api/v1/meals/log",
        json={
            "meal_type": "Trưa",
            "items": [
                {"food_name": "Cơm trắng", "estimated_gram": 200.0},
                {"food_name": "Ức gà áp chảo", "estimated_gram": 150.0},
            ],
            "is_confirmed": True,
        },
    )

    # Gọi API Dashboard
    dash_resp = client.get("/api/v1/meals/daily-dashboard", params={"target_date": today.isoformat()})
    assert dash_resp.status_code == 200
    data = dash_resp.json()

    expected_cal = 345.0 + 260.0 + 247.5  # 852.5 kcal
    expected_protein = round(14.25 + 5.4 + 46.5, 2)  # 66.15g

    assert data["consumed"]["calories"] == expected_cal
    assert data["consumed"]["protein_g"] == expected_protein
    assert data["meals_count"] == 2
    assert data["remaining"]["calories"] == round(data["targets"]["calories"] - expected_cal, 2)


# ==============================================================================
# TEST SCENARIO 7: ZERO-TRUST USER ISOLATION
# ==============================================================================


def test_07_zero_trust_meal_and_dashboard_isolation():
    """Tạo 2 người dùng User A và User B. User A log bữa ăn của mình;

    khi User B gọi GET /api/v1/meals/daily-dashboard, xác minh User B chỉ thấy
    dữ liệu của User B (0 kcal), tuyệt đối không thấy bữa ăn của User A.
    """
    client_a, user_a = create_authenticated_client("user_a", "user_a@nutrisnap.vn")
    client_b, user_b = create_authenticated_client("user_b", "user_b@nutrisnap.vn")
    today = get_vn_today()

    # User A log bữa ăn
    resp_a = client_a.post(
        "/api/v1/meals/log",
        json={
            "meal_type": "Trưa",
            "items": [{"food_name": "Phở bò tái", "estimated_gram": 400.0}],
            "is_confirmed": True,
        },
    )
    assert resp_a.status_code == 201

    # User B kiểm tra Dashboard của mình
    resp_b = client_b.get("/api/v1/meals/daily-dashboard", params={"target_date": today.isoformat()})
    assert resp_b.status_code == 200
    data_b = resp_b.json()

    assert data_b["user_id"] == user_b.id
    assert data_b["consumed"]["calories"] == 0.0
    assert data_b["meals_count"] == 0
    assert len(data_b["meals"]) == 0


# ==============================================================================
# TEST SCENARIO 8: IDEMPOTENT DEMO ACCOUNTS SEED
# ==============================================================================


def test_08_seed_demo_accounts_idempotent():
    """Thực thi seed_demo_data() 2 lần liên tiếp.

    Xác minh cả 3 tài khoản demo đều đăng nhập thành công, có hồ sơ Goal,
    có lịch sử 7 ngày và gọi GET /api/v1/meals/daily-dashboard trả về dữ liệu mẫu ngay.
    """
    # Lần 1
    res1 = seed_demo_data()
    assert "student_user" in res1
    assert "office_user" in res1
    assert "gym_user" in res1

    # Lần 2 (Tính lũy đẳng - không crash UNIQUE constraint)
    res2 = seed_demo_data()
    assert "student_user" in res2
    assert "office_user" in res2
    assert "gym_user" in res2

    client = TestClient(app)

    # Đăng nhập bằng tài khoản student_user
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "student_user", "password": "NutriSnap123"},
    )
    assert login_resp.status_code == 200

    # Lấy Dashboard ngày hôm nay
    today = get_vn_today()
    dash_resp = client.get("/api/v1/meals/daily-dashboard", params={"target_date": today.isoformat()})
    assert dash_resp.status_code == 200
    dash_data = dash_resp.json()

    # Xác minh có sẵn bữa Sáng và Trưa
    assert dash_data["meals_count"] == 2
    assert dash_data["consumed"]["calories"] > 0
    assert dash_data["remaining"]["calories"] > 0
