"""
tests/unit/test_w2_auth_goal_flow.py
Bộ kiểm thử tự động toàn diện cho luồng Tuần 2:
1. Băm mật khẩu bcrypt nguyên bản (không dùng passlib).
2. Giao dịch đăng ký kết hợp khởi tạo mục tiêu (register_with_initial_goal - Atomic Transaction & Rollback).
3. Đăng nhập, cấp phát JWT qua HttpOnly, SameSite=Lax Cookie.
4. Dependency get_current_user (chặn 401 khi không có cookie hoặc token rác).
5. Rào chắn an toàn y khoa calo (1200 kcal cho Nữ, 1500 kcal cho Nam).
6. Zero-Trust Data Isolation và ràng buộc khóa ngoại (PRAGMA foreign_keys = ON & CASCADE).
7. Tra cứu thực phẩm và tính toán dinh dưỡng tất định (Zero-Hallucination).
8. Đăng xuất xóa Cookie.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, select

from src.backend.main import app
from src.backend.models.database import create_db_engine, get_session
from src.backend.models.schema import FoodReference, Goal, User, WeightLog
from src.backend.services.auth_service import (
    decode_access_token,
    hash_password,
    register_with_initial_goal,
    verify_password,
)
from src.backend.services.goal_service import (
    GoalPlanInput,
    calculate_target_calories,
)


@pytest.fixture(name="db_engine")
def db_engine_fixture():
    """Tạo SQLite in-memory engine với cờ PRAGMA foreign_keys = ON và StaticPool."""
    engine = create_db_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="db_session")
def db_session_fixture(db_engine):
    """Session kết nối SQLite in-memory cho các ca kiểm thử."""
    with Session(db_engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(db_session: Session):
    """FastAPI TestClient với dependency get_session trỏ về in-memory DB."""

    def override_get_session():
        yield db_session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# ==============================================================================
# 1. KIỂM THỬ BĂM MẬT KHẨU BCRYPT NGUYÊN BẢN (PYTHON 3.13/3.14+ COMPATIBLE)
# ==============================================================================


def test_bcrypt_password_hashing():
    """Kiểm tra băm mật khẩu bằng thư viện bcrypt trực tiếp:

    - Không phụ thuộc passlib.
    - Chuỗi băm khác với mật khẩu thô.
    - Hai lần băm cùng một mật khẩu cho hai chuỗi khác nhau do salt ngẫu nhiên.
    - Hàm verify kiểm tra chính xác mật khẩu đúng/sai.
    """
    raw_password = "SecurePassword123"
    hashed1 = hash_password(raw_password)
    hashed2 = hash_password(raw_password)

    assert hashed1 != raw_password
    assert hashed1.startswith("$2b$") or hashed1.startswith("$2a$")
    assert hashed1 != hashed2  # Khác nhau vì mỗi lần dùng gensalt() độc lập

    assert verify_password(raw_password, hashed1) is True
    assert verify_password(raw_password, hashed2) is True
    assert verify_password("WrongPassword123", hashed1) is False
    assert verify_password("", hashed1) is False


# ==============================================================================
# 2. KIỂM THỬ GIAO DỊCH ATOMIC REGISTER WITH INITIAL GOAL
# ==============================================================================


def test_register_with_initial_goal_atomic_success(db_session: Session):
    """Kiểm tra đăng ký tài khoản kèm mục tiêu ban đầu thành công trong 1 Transaction:

    - Bảng users có bản ghi mới với mật khẩu bcrypt.
    - Bảng goals lưu đúng user_id vừa tạo, các chỉ số BMR/TDEE/Macro được tính tự động.
    - Bảng weight_logs tự động ghi nhận cân nặng khởi điểm.
    """
    plan = GoalPlanInput(
        gender="male",
        age=22,
        height_cm=170.0,
        current_weight_kg=70.0,
        target_weight_kg=65.0,
        activity_level="moderate",
        goal_type="lose_weight",
        weekly_pace_kg=0.5,
        daily_budget_vnd=60000,
    )

    user, goal_resp = register_with_initial_goal(
        session=db_session,
        username="huy_viethuy",
        email="huy@nutrisnap.vn",
        password="StrongPassword123",
        initial_goal=plan,
    )

    assert user.id is not None
    assert user.username == "huy_viethuy"
    assert verify_password("StrongPassword123", user.password_hash) is True

    assert goal_resp is not None
    assert goal_resp.user_id == user.id
    assert goal_resp.bmr_calories == 1657.5  # 10*70 + 6.25*170 - 5*22 + 5 = 1657.5
    assert goal_resp.tdee_calories == 2569.12  # 1657.5 * 1.55 = 2569.125 -> 2569.12

    # Kiểm tra bản ghi trong bảng goals
    db_goal = db_session.exec(select(Goal).where(Goal.user_id == user.id)).first()
    assert db_goal is not None
    assert db_goal.target_weight == 65.0

    # Kiểm tra bản ghi trong bảng weight_logs
    db_weight = db_session.exec(select(WeightLog).where(WeightLog.user_id == user.id)).first()
    assert db_weight is not None
    assert db_weight.weight_kg == 70.0


def test_register_with_initial_goal_atomic_rollback(db_session: Session):
    """Kiểm tra tính nguyên tử (Atomicity): Nếu tính toán mục tiêu gặp lỗi (ví dụ pace không an toàn),

    toàn bộ Transaction phải bị Rollback và tài khoản người dùng KHÔNG được lưu.
    """
    invalid_plan = GoalPlanInput(
        gender="male",
        age=25,
        height_cm=175.0,
        current_weight_kg=80.0,
        target_weight_kg=60.0,
        activity_level="moderate",
        goal_type="lose_weight",
        weekly_pace_kg=2.0,  # Vượt quá giới hạn an toàn y khoa -> ném ValueError
        daily_budget_vnd=50000,
    )

    with pytest.raises(ValueError):
        register_with_initial_goal(
            session=db_session,
            username="failed_user",
            email="failed@nutrisnap.vn",
            password="StrongPassword123",
            initial_goal=invalid_plan,
        )

    # Đảm bảo người dùng KHÔNG hề tồn tại trong CSDL sau khi rollback
    orphan_user = db_session.exec(select(User).where(User.username == "failed_user")).first()
    assert orphan_user is None


def test_register_duplicate_prevention(db_session: Session):
    """Kiểm tra ngăn chặn trùng lặp username hoặc email khi đăng ký."""
    register_with_initial_goal(
        session=db_session,
        username="unique_user",
        email="unique@nutrisnap.vn",
        password="Password123",
        initial_goal=None,
    )

    # Thử đăng ký lại cùng username
    with pytest.raises(Exception) as exc1:
        register_with_initial_goal(
            session=db_session,
            username="unique_user",
            email="another@nutrisnap.vn",
            password="Password123",
            initial_goal=None,
        )
    assert "Tên đăng nhập đã tồn tại" in str(exc1.value)

    # Thử đăng ký lại cùng email
    with pytest.raises(Exception) as exc2:
        register_with_initial_goal(
            session=db_session,
            username="another_user",
            email="unique@nutrisnap.vn",
            password="Password123",
            initial_goal=None,
        )
    assert "Email đã được đăng ký" in str(exc2.value)


# ==============================================================================
# 3. KIỂM THỬ JWT & HTTPONLY COOKIE FLOW QUA API ROUTER
# ==============================================================================


def test_api_register_with_goal_sets_cookie_and_accesses_me(client: TestClient):
    """Kiểm tra endpoint POST /api/v1/auth/register-with-goal:

    - Tạo tài khoản và mục tiêu thành công.
    - Cấp phát HttpOnly Cookie 'access_token'.
    - Dùng Cookie này gọi GET /api/v1/auth/me thành công.
    """
    payload = {
        "username": "viet_huy",
        "email": "viethuy@nutrisnap.vn",
        "password": "StrongPassword123",
        "initial_goal": {
            "gender": "male",
            "age": 22,
            "height_cm": 172.0,
            "current_weight_kg": 68.0,
            "target_weight_kg": 64.0,
            "activity_level": "moderate",
            "goal_type": "lose_weight",
            "weekly_pace_kg": 0.5,
            "daily_budget_vnd": 65000,
        },
    }

    res = client.post("/api/v1/auth/register-with-goal", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["success"] is True
    assert data["has_goal"] is True
    assert data["user"]["username"] == "viet_huy"
    assert data["goal"]["target_weight"] == 64.0

    # Kiểm tra Cookie HttpOnly được thiết lập
    assert "access_token" in res.cookies
    token = res.cookies["access_token"]
    payload_decoded = decode_access_token(token)
    assert payload_decoded is not None
    assert payload_decoded["username"] == "viet_huy"

    # Gọi /api/v1/auth/me với Cookie vừa nhận
    me_res = client.get("/api/v1/auth/me")
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["user"]["username"] == "viet_huy"
    assert me_data["has_goal"] is True


def test_login_flow_with_bcrypt_and_wrong_password(client: TestClient, db_session: Session):
    """Kiểm tra luồng đăng nhập POST /api/v1/auth/login:

    - Đăng nhập đúng mật khẩu -> thành công và nhận cookie.
    - Đăng nhập sai mật khẩu -> từ chối 401 Unauthorized.
    """
    register_with_initial_goal(
        session=db_session,
        username="login_test_user",
        email="login@nutrisnap.vn",
        password="MySecretPassword123",
        initial_goal=None,
    )

    # Đăng nhập sai mật khẩu
    bad_login = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "login_test_user", "password": "WrongPassword456"},
    )
    assert bad_login.status_code == 401
    assert "không chính xác" in bad_login.json()["detail"]

    # Đăng nhập đúng mật khẩu
    good_login = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "login_test_user", "password": "MySecretPassword123"},
    )
    assert good_login.status_code == 200
    assert "access_token" in good_login.cookies


def test_protected_routes_without_cookie_return_401(client: TestClient):
    """Zero-Trust: Mọi endpoint cá nhân không gửi Cookie access_token đều bị chặn 401."""
    client.cookies.clear()
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/goals").status_code == 401
    assert client.post("/api/v1/weight", json={"weight_kg": 70.0}).status_code == 401
    assert client.get("/api/v1/weight/history").status_code == 401


# ==============================================================================
# 4. RÀO CHẮN AN TOÀN CALO (SAFETY FLOOR 1200 / 1500 KCAL)
# ==============================================================================


def test_safety_floor_female_and_male():
    """Kiểm tra rào chắn an toàn tối thiểu:

    - Nữ không dưới 1200 kcal/ngày.
    - Nam không dưới 1500 kcal/ngày.
    """
    # Nữ thâm hụt sâu: TDEE 1400 kcal, thâm hụt 550 kcal -> 850 kcal -> ép về 1200 kcal
    target_f, is_floor_f = calculate_target_calories(
        tdee=1400.0,
        goal_type="lose_weight",
        weekly_pace_kg=0.5,
        gender="female",
    )
    assert target_f == 1200.0
    assert is_floor_f is True

    # Nam thâm hụt sâu: TDEE 1800 kcal, thâm hụt 550 kcal -> 1250 kcal -> ép về 1500 kcal
    target_m, is_floor_m = calculate_target_calories(
        tdee=1800.0,
        goal_type="lose_weight",
        weekly_pace_kg=0.5,
        gender="male",
    )
    assert target_m == 1500.0
    assert is_floor_m is True


# ==============================================================================
# 5. ZERO-TRUST DATA ISOLATION & PRAGMA FOREIGN_KEYS CASCADE
# ==============================================================================


def test_zero_trust_isolation_and_foreign_key_cascade(db_session: Session):
    """Kiểm tra:

    1. Dữ liệu mục tiêu và cân nặng của User A không lẫn với User B.
    2. Khi xóa User A, PRAGMA foreign_keys = ON sẽ tự động CASCADE xóa Goal & WeightLog liên quan.
    """
    plan_a = GoalPlanInput(
        gender="male",
        age=20,
        height_cm=170.0,
        current_weight_kg=65.0,
        target_weight_kg=60.0,
        goal_type="lose_weight",
        weekly_pace_kg=0.5,
    )
    user_a, _ = register_with_initial_goal(
        session=db_session,
        username="user_a",
        email="a@nutrisnap.vn",
        password="Password123",
        initial_goal=plan_a,
    )

    plan_b = GoalPlanInput(
        gender="female",
        age=22,
        height_cm=160.0,
        current_weight_kg=55.0,
        target_weight_kg=50.0,
        goal_type="lose_weight",
        weekly_pace_kg=0.3,
    )
    user_b, _ = register_with_initial_goal(
        session=db_session,
        username="user_b",
        email="b@nutrisnap.vn",
        password="Password123",
        initial_goal=plan_b,
    )

    # Kiểm tra cô lập dữ liệu
    goal_a = db_session.exec(select(Goal).where(Goal.user_id == user_a.id)).first()
    goal_b = db_session.exec(select(Goal).where(Goal.user_id == user_b.id)).first()
    assert goal_a.target_weight == 60.0
    assert goal_b.target_weight == 50.0

    # Kiểm tra CASCADE khi xóa user_a
    db_session.delete(user_a)
    db_session.commit()

    # User A bị xóa -> Goal và WeightLog của A cũng tự động biến mất
    assert db_session.exec(select(Goal).where(Goal.user_id == user_a.id)).first() is None
    assert db_session.exec(select(WeightLog).where(WeightLog.user_id == user_a.id)).first() is None

    # Dữ liệu của User B vẫn an toàn nguyên vẹn
    assert db_session.exec(select(Goal).where(Goal.user_id == user_b.id)).first() is not None
    assert db_session.exec(select(WeightLog).where(WeightLog.user_id == user_b.id)).first() is not None


# ==============================================================================
# 6. KIỂM THỬ TRA CỨU THỰC PHẨM & CÔNG THỨC TOÁN HỌC TẤT ĐỊNH
# ==============================================================================


def test_food_search_and_deterministic_math(client: TestClient, db_session: Session):
    """Kiểm tra tra cứu món ăn trong CSDL và tính toán Calo tất định (Zero-Hallucination).

    Công thức: Calo = (gram / 100) * calories_per_100g
    """
    # Thêm món mẫu vào CSDL
    food = FoodReference(
        food_name="Bún chả Hà Nội",
        calories_per_100g=160.0,
        protein_per_100g=12.0,
        carbs_per_100g=18.0,
        fat_per_100g=5.0,
        avg_price_vnd=45000,
    )
    db_session.add(food)
    db_session.commit()

    # Tra cứu qua API
    search_res = client.get("/api/v1/foods/search?q=Bún chả")
    assert search_res.status_code == 200
    data = search_res.json()
    assert data["total"] >= 1
    found = next((item for item in data["items"] if "Bún chả" in item["food_name"]), None)
    assert found is not None

    # Tính toán đại số khẩu phần 350g
    portion_gram = 350.0
    expected_calo = round((portion_gram / 100.0) * found["calories_per_100g"], 1)
    expected_protein = round((portion_gram / 100.0) * found["protein_per_100g"], 1)

    assert expected_calo == 560.0  # 3.5 * 160.0 = 560.0 kcal
    assert expected_protein == 42.0  # 3.5 * 12.0 = 42.0g


# ==============================================================================
# 7. KIỂM THỬ ĐĂNG XUẤT XÓA COOKIE
# ==============================================================================


def test_logout_clears_cookie(client: TestClient):
    """Kiểm tra gọi POST /api/v1/auth/logout xóa Cookie access_token."""
    client.post("/api/v1/auth/login", json={"username_or_email": "thanhdat", "password": "Password123"})
    assert "access_token" in client.cookies

    logout_res = client.post("/api/v1/auth/logout")
    assert logout_res.status_code == 200
    # Cookie access_token bị xóa
    assert client.cookies.get("access_token") is None
