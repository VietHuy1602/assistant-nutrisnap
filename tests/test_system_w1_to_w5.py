"""
tests/test_system_w1_to_w5.py
Bộ kiểm thử tích hợp toàn hệ thống NutriSnap từ Tuần 1 đến Tuần 5 (End-to-End & Regression Test).
Cặp 1: Nguyễn Hoàng Việt Huy (25127060) & Nguyễn Trần Minh Đức (25127300).

Bao gồm 9 kịch bản kiểm thử toàn diện:
1. test_w1_database_8_tables_and_500_foods: Kiểm tra 8 bảng CSDL, PRAGMA foreign_keys = ON và 500 món ăn.
2. test_w2_auth_and_smart_goal_planner: Kiểm tra bcrypt, BMR/TDEE Mifflin-St Jeor và chặn weekly_pace > 1.0 kg/tuần.
3. test_w3_deterministic_nutrition_and_two_step_meal_log: Tính toán calo/macro đại số, eaten_ratio, Two-Step Confirmation.
4. test_w3_poc_deliverables_and_demo_seed: Kiểm tra tài liệu PoC 03_poc_report_and_slides.md và nạp 3 tài khoản demo.
5. test_w4_assistant_4_tools_and_zero_trust_security: Kiểm tra 4 Tool Executors và tool_security chặn giả mạo user_id.
6. test_w4_chat_session_isolation_idor_protection: Kiểm tra cô lập dữ liệu chat, chống IDOR giữa User A và User B.
7. test_w5_weight_trend_ema_smoothing: Thuật toán làm mịn EMA (alpha=0.1) và khóa an toàn không phạt calo.
8. test_w5_behavior_patterns_and_food_swap: Rào chắn 5 ngày của analyze_user_patterns và đại số Food Swap Simulator.
9. test_fastapi_app_routes_and_health: FastAPI TestClient kiểm tra /api/v1/health và đồng bộ các routes.
"""

from datetime import UTC, datetime, time, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlmodel import Session, select, text

from scripts.seed_demo_accounts import seed_demo_data
from src.backend.main import app
from src.backend.models.database import engine, init_db
from src.backend.models.schema import (
    FoodReference,
    Goal,
    Meal,
    MealItem,
    User,
    WeightLog,
    get_vn_today,
)
from src.backend.services.analytics_service import (
    analyze_user_patterns,
    simulate_food_swap,
)
from src.backend.services.assistant_tools import (
    dispatch_tool_call,
    exec_get_daily_nutrition,
    exec_get_progress_summary,
    exec_log_meal,
    exec_recommend_meals,
)
from src.backend.services.auth_service import (
    create_access_token,
    hash_password,
    register_with_initial_goal,
    verify_password,
)
from src.backend.services.chat_service import (
    get_chat_history,
    get_or_create_chat_session,
    save_chat_message,
)
from src.backend.services.goal_service import (
    GoalPlanInput,
    calculate_bmr_mifflin_st_jeor,
    calculate_goal_plan,
)
from src.backend.services.nutrition_service import (
    MealItemInput,
    calculate_item_nutrition,
    calculate_meal_nutrition,
    get_daily_dashboard_summary,
    log_user_meal,
    resolve_food_reference,
)
from src.backend.services.tool_security import (
    sanitize_llm_tool_arguments,
    verify_meal_ownership,
    verify_session_ownership,
)
from src.backend.services.weight_trend import (
    calculate_ema_series,
    get_user_weight_trend,
    verify_safe_calorie_target_stability,
)


@pytest.fixture(scope="module", autouse=True)
def ensure_db_ready():
    """Khởi tạo CSDL và đảm bảo có đủ 500 món ăn tham chiếu trước khi chạy kiểm thử."""
    init_db()
    with Session(engine) as session:
        count = len(session.exec(select(FoodReference)).all())
        if count < 500:
            from scripts.seed_food_references import seed_foods

            seed_foods()


def create_user_helper(username: str, email: str, gender: str = "male") -> tuple[User, str]:
    """Helper tạo nhanh người dùng kèm token JWT xác thực."""
    with Session(engine) as session:
        existing = session.exec(
            select(User).where((User.username == username) | (User.email == email))
        ).first()
        if existing:
            session.delete(existing)
            session.commit()

        user, _ = register_with_initial_goal(
            session=session,
            username=username,
            email=email,
            password="TestPassword123",
            initial_goal=GoalPlanInput(
                gender=gender,
                age=26,
                height_cm=172.0,
                current_weight_kg=68.0,
                target_weight_kg=68.0,
                goal_type="maintain",
                activity_level="moderate",
                daily_budget_vnd=70000,
            ),
        )
    token = create_access_token(data={"sub": str(user.id), "username": user.username})
    return user, token


# ==============================================================================
# 1. TEST TUẦN 1: CSDL 8 BẢNG, PRAGMA FOREIGN KEYS = ON & 500 MÓN ĂN
# ==============================================================================


def test_w1_database_8_tables_and_500_foods():
    """Kiểm tra:

    - Kết nối SQLite kích hoạt PRAGMA foreign_keys = ON.
    - CSDL chứa đầy đủ 8 bảng chuẩn hóa theo kiến trúc hệ thống.
    - Bảng food_references có đủ 500 món ăn Việt Nam từ vn_foods.csv.
    """
    with Session(engine) as session:
        # Kiểm tra PRAGMA foreign_keys
        pragma_val = session.exec(text("PRAGMA foreign_keys;")).first()
        fk_status = pragma_val[0]
        assert fk_status == 1, "Lỗi: PRAGMA foreign_keys chưa được bật trên SQLite"

        # Kiểm tra sự tồn tại của 8 bảng
        inspector = inspect(engine)
        actual_tables = set(inspector.get_table_names())
        expected_tables = {
            "users",
            "goals",
            "weight_logs",
            "food_references",
            "meals",
            "meal_items",
            "chat_sessions",
            "chat_messages",
        }
        missing_tables = expected_tables - actual_tables
        assert not missing_tables, f"Thiếu các bảng CSDL: {missing_tables}"

        # Kiểm tra 500 món ăn tham chiếu
        foods_count = len(session.exec(select(FoodReference)).all())
        assert foods_count >= 500, f"Bảng food_references chỉ có {foods_count}/500 món ăn"


# ==============================================================================
# 2. TEST TUẦN 2: AUTH BCRYPT & SMART GOAL PLANNER (MIFFLIN-ST JEOR)
# ==============================================================================


def test_w2_auth_and_smart_goal_planner():
    """Kiểm tra:

    - Mật khẩu được băm bcrypt an toàn ($2b$), xác thực thành công.
    - Tính BMR Mifflin-St Jeor: Nam: 10W + 6.25H - 5A + 5; Nữ: 10W + 6.25H - 5A - 161.
    - Chặn tốc độ giảm cân vượt mức y khoa an toàn (> 1.0 kg/tuần).
    """
    password = "MySecurePassword123"
    hashed = hash_password(password)
    assert hashed.startswith("$2b$") or hashed.startswith("$2a$")
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword", hashed) is False

    # BMR Mifflin-St Jeor Nam: 70kg, 175cm, 25 tuổi
    # BMR = 10*70 + 6.25*175 - 5*25 + 5 = 700 + 1093.75 - 125 + 5 = 1673.75
    bmr_male = calculate_bmr_mifflin_st_jeor(weight_kg=70.0, height_cm=175.0, age=25, gender="male")
    assert bmr_male == 1673.75

    # BMR Mifflin-St Jeor Nữ: 55kg, 160cm, 22 tuổi
    # BMR = 10*55 + 6.25*160 - 5*22 - 161 = 550 + 1000 - 110 - 161 = 1279.0
    bmr_female = calculate_bmr_mifflin_st_jeor(weight_kg=55.0, height_cm=160.0, age=22, gender="female")
    assert bmr_female == 1279.0

    # Chặn tốc độ giảm cân vượt ngưỡng an toàn y khoa (> 0.75 - 1.0 kg/tuần)
    with pytest.raises(ValueError, match="an toàn"):
        calculate_goal_plan(
            GoalPlanInput(
                gender="female",
                age=25,
                height_cm=160.0,
                current_weight_kg=70.0,
                target_weight_kg=60.0,
                goal_type="lose_weight",
                weekly_pace_kg=1.5,  # Vượt quá giới hạn an toàn
                activity_level="moderate",
                daily_budget_vnd=60000,
            )
        )

    # Tính toán kế hoạch dinh dưỡng hợp lệ
    valid_plan_input = GoalPlanInput(
        gender="male",
        age=25,
        height_cm=175.0,
        current_weight_kg=70.0,
        target_weight_kg=65.0,
        goal_type="lose_weight",
        weekly_pace_kg=0.5,
        activity_level="moderate",
        daily_budget_vnd=60000,
    )
    plan_result = calculate_goal_plan(valid_plan_input)
    assert plan_result.target_calories > 0
    assert plan_result.target_protein_g > 0
    assert plan_result.target_carbs_g > 0
    assert plan_result.target_fat_g > 0


# ==============================================================================
# 3. TEST TUẦN 3: DINH DƯỠNG TẤT ĐỊNH & XÁC NHẬN BỮA ĂN 2 BƯỚC
# ==============================================================================


def test_w3_deterministic_nutrition_and_two_step_meal_log():
    """Kiểm tra:

    - Tính toán đại số món ăn theo số gam và tỷ lệ trừ hao (eaten_ratio).
    - Luồng xác nhận 2 bước:
      + is_confirmed = False: trả về pending_confirmation, không lưu DB.
      + is_confirmed = True: lưu nguyên tử vào meals và meal_items.
    - get_daily_dashboard_summary tổng hợp calo, macro và phần còn lại.
    """
    user, _ = create_user_helper("w3_sys_user", "w3_sys_user@example.com")

    with Session(engine) as session:
        rice_ref = resolve_food_reference(session, food_name="Cơm trắng")

        # Tính toán đại số: 200g * 0.8 (eaten_ratio) = 160g effective
        item_nutri = calculate_item_nutrition(
            session=session,
            food_id=rice_ref.id,  # type: ignore
            estimated_gram=200.0,
            eaten_ratio=0.8,
        )
        assert item_nutri["effective_gram"] == 160.0
        expected_cal = round((160.0 / 100.0) * rice_ref.calories_per_100g, 2)
        assert item_nutri["calories"] == expected_cal

        # Bước 1: Xem trước (is_confirmed = False)
        meals_before = len(session.exec(select(Meal).where(Meal.user_id == user.id)).all())
        preview_res = log_user_meal(
            session=session,
            authenticated_user_id=user.id,
            meal_type="Trưa",
            items=[{"food_id": rice_ref.id, "estimated_gram": 150.0, "eaten_ratio": 1.0}],
            is_confirmed=False,
        )
        assert preview_res.status == "pending_confirmation"
        assert preview_res.meal_id is None
        meals_after_preview = len(session.exec(select(Meal).where(Meal.user_id == user.id)).all())
        assert meals_after_preview == meals_before, "Lỗi: Đã ghi vào DB khi is_confirmed=False"

        # Bước 2: Xác nhận lưu (is_confirmed = True)
        confirm_res = log_user_meal(
            session=session,
            authenticated_user_id=user.id,
            meal_type="Trưa",
            items=[{"food_id": rice_ref.id, "estimated_gram": 150.0, "eaten_ratio": 1.0}],
            is_confirmed=True,
        )
        assert confirm_res.status == "logged"
        assert confirm_res.meal_id is not None
        meals_after_confirm = len(session.exec(select(Meal).where(Meal.user_id == user.id)).all())
        assert meals_after_confirm == meals_before + 1

        # Xác minh quyền sở hữu bữa ăn qua tool_security
        assert verify_meal_ownership(session, confirm_res.meal_id, user.id) is True
        assert verify_meal_ownership(session, confirm_res.meal_id, user.id + 9999) is False

        # Kiểm tra tính toán đại số đa món (calculate_meal_nutrition)
        meal_nutri = calculate_meal_nutrition(
            session=session,
            items=[MealItemInput(food_id=rice_ref.id, estimated_gram=150.0, eaten_ratio=1.0)],
        )
        assert meal_nutri.total_calories > 0

        # Kiểm tra Dashboard ngày
        dash = get_daily_dashboard_summary(session, user.id, target_date=get_vn_today())
        assert dash["consumed"]["calories"] > 0
        assert dash["meals_count"] >= 1


# ==============================================================================
# 4. TEST TUẦN 3: BÀN GIAO HỒ SƠ POC & SEED 3 TÀI KHOẢN DEMO
# ==============================================================================


def test_w3_poc_deliverables_and_demo_seed():
    """Kiểm tra:

    - Tệp báo cáo khả thi PoC và 8 Slide thuyết trình docs/03_poc_report_and_slides.md tồn tại.
    - Script nạp 3 tài khoản demo (scripts/seed_demo_accounts.py) chạy thành công và lũy đẳng.
    - 3 tài khoản mẫu student_user, office_user, gym_user có đầy đủ goals và weight logs.
    """
    poc_file = Path("docs/03_poc_report_and_slides.md")
    assert poc_file.exists(), "Tệp docs/03_poc_report_and_slides.md không tồn tại"
    content = poc_file.read_text(encoding="utf-8")
    assert "BÁO CÁO KHẢ THI" in content
    assert "SLIDE" in content
    assert "student_user" in content
    assert "office_user" in content
    assert "gym_user" in content

    # Chạy thử hàm nạp dữ liệu demo
    created_ids = seed_demo_data()
    assert len(created_ids) == 3

    with Session(engine) as session:
        for username in ["student_user", "office_user", "gym_user"]:
            user = session.exec(select(User).where(User.username == username)).first()
            assert user is not None, f"Không tìm thấy tài khoản demo: {username}"
            goal = session.exec(select(Goal).where(Goal.user_id == user.id)).first()
            assert goal is not None, f"Tài khoản {username} thiếu bản ghi goals"
            w_logs = session.exec(select(WeightLog).where(WeightLog.user_id == user.id)).all()
            assert len(w_logs) >= 7, f"Tài khoản {username} chưa đủ 7 ngày weight_logs"


# ==============================================================================
# 5. TEST TUẦN 4: 4 HÀM BACKEND TOOL EXECUTORS & BẢO MẬT TOOL_SECURITY
# ==============================================================================


def test_w4_assistant_4_tools_and_zero_trust_security():
    """Kiểm tra:

    - Cả 4 Tool Executors: exec_get_daily_nutrition, exec_log_meal, exec_recommend_meals, exec_get_progress_summary.
    - tool_security.py loại bỏ triệt để các tham số giả mạo (user_id, authenticated_user_id, is_admin).
    - dispatch_tool_call sử dụng đúng danh tính từ phiên backend, không bị đánh tráo.
    """
    user_a, _ = create_user_helper("w4_tool_user_a", "w4_tool_user_a@example.com")
    fake_user_id = 999999

    with Session(engine) as session:
        # Tool 1: exec_get_daily_nutrition
        daily_res = exec_get_daily_nutrition(session, user_a.id)
        assert daily_res["tool_name"] == "get_daily_nutrition"
        assert daily_res["user_id"] == user_a.id

        # Tool 2: exec_log_meal (preview)
        log_res = exec_log_meal(
            session=session,
            authenticated_user_id=user_a.id,
            meal_type="lunch",
            items_list=[{"food_name": "Phở bò tái", "estimated_gram": 350.0}],
            is_confirmed=False,
        )
        assert log_res["status"] == "pending_confirmation"

        # Tool 3: exec_recommend_meals
        recom_res = exec_recommend_meals(
            session=session,
            authenticated_user_id=user_a.id,
            remaining_calories=600.0,
            budget_vnd=50000,
            limit=3,
        )
        assert recom_res["tool_name"] == "recommend_meals"
        assert len(recom_res["recommendations"]) <= 3

        # Tool 4: exec_get_progress_summary
        prog_res = exec_get_progress_summary(session, user_a.id, days_range=7)
        assert prog_res["tool_name"] == "get_progress_summary"
        assert prog_res["user_id"] == user_a.id

        # Kiểm tra sanitize_llm_tool_arguments chặn giả mạo
        malicious_args = {
            "user_id": fake_user_id,
            "authenticated_user_id": fake_user_id,
            "account_id": fake_user_id,
            "owner_id": fake_user_id,
            "is_admin": True,
            "date": "today",
        }
        cleaned_args = sanitize_llm_tool_arguments(malicious_args)
        assert "user_id" not in cleaned_args
        assert "authenticated_user_id" not in cleaned_args
        assert "is_admin" not in cleaned_args
        assert cleaned_args["date"] == "today"

        # dispatch_tool_call bắt buộc ép dùng authenticated_user_id
        dispatch_res = dispatch_tool_call(
            session=session,
            authenticated_user_id=user_a.id,
            tool_name="get_daily_nutrition",
            tool_args=malicious_args,
        )
        assert dispatch_res["user_id"] == user_a.id
        assert dispatch_res["user_id"] != fake_user_id


# ==============================================================================
# 6. TEST TUẦN 4: CÔ LẬP PHIÊN HỘI THOẠI & CHỐNG TẤN CÔNG IDOR
# ==============================================================================


def test_w4_chat_session_isolation_idor_protection():
    """Kiểm tra:

    - User A tạo phiên chat hợp lệ.
    - User B không thể đọc (get_chat_history) hay gửi tin nhắn (save_chat_message) vào phiên của User A.
    - tool_security.verify_session_ownership từ chối quyền truy cập của User B.
    """
    user_a, _ = create_user_helper("w4_chat_user_a", "w4_chat_user_a@example.com")
    user_b, _ = create_user_helper("w4_chat_user_b", "w4_chat_user_b@example.com")

    with Session(engine) as session:
        # User A tạo phiên chat và lưu tin nhắn
        session_a = get_or_create_chat_session(session, user_a.id)
        assert session_a.user_id == user_a.id

        save_chat_message(
            session=session,
            authenticated_user_id=user_a.id,
            session_id=session_a.id,  # type: ignore
            sender_role="user",
            content="Xin chào trợ lý NutriSnap",
        )

        # User A đọc lịch sử thành công
        history_a = get_chat_history(session, user_a.id, session_a.id)  # type: ignore
        assert len(history_a) == 1
        assert history_a[0].content == "Xin chào trợ lý NutriSnap"

        # Xác thực kiểm tra quyền sở hữu bằng tool_security
        assert verify_session_ownership(session, session_a.id, user_a.id) is True  # type: ignore
        assert verify_session_ownership(session, session_a.id, user_b.id) is False  # type: ignore

        # User B cố tình đọc lịch sử của User A -> Bị chặn PermissionError
        with pytest.raises(PermissionError, match="Cảnh báo bảo mật"):
            get_chat_history(session, authenticated_user_id=user_b.id, session_id=session_a.id)  # type: ignore

        # User B cố tình ghi tin nhắn vào phiên của User A -> Bị chặn PermissionError
        with pytest.raises(PermissionError, match="Cảnh báo bảo mật"):
            save_chat_message(
                session=session,
                authenticated_user_id=user_b.id,
                session_id=session_a.id,  # type: ignore
                sender_role="user",
                content="Tin nhắn tấn công IDOR",
            )


# ==============================================================================
# 7. TEST TUẦN 5: THUẬT TOÁN LÀM MỊN CÂN NẶNG EMA & KHÓA AN TOÀN CALO
# ==============================================================================


def test_w5_weight_trend_ema_smoothing():
    """Kiểm tra:

    - Chuỗi EMA tính toán đại số chính xác theo công thức alpha=0.1:
      EMA_0 = W_0; EMA_t = round(alpha * W_t + (1 - alpha) * EMA_{t-1}, 2).
    - Khóa an toàn không tự ý cắt giảm calo ngày tiếp theo dù hôm qua ăn vượt mức (penalty_applied = 0.0).
    """
    weights = [70.0, 71.0, 69.5, 70.2]
    # EMA_0 = 70.0
    # EMA_1 = round(0.1*71.0 + 0.9*70.0, 2) = round(7.1 + 63.0, 2) = 70.1
    # EMA_2 = round(0.1*69.5 + 0.9*70.1, 2) = round(6.95 + 63.09, 2) = 70.04
    # EMA_3 = round(0.1*70.2 + 0.9*70.04, 2) = round(7.02 + 63.036, 2) = 70.06
    ema_series = calculate_ema_series(weights, alpha=0.1)
    assert ema_series[0] == 70.0
    assert ema_series[1] == 70.1
    assert ema_series[2] == 70.04
    assert ema_series[3] == 70.06

    user, _ = create_user_helper("w5_ema_user", "w5_ema_user@example.com")
    with Session(engine) as session:
        # Xóa các weight logs cũ tạo ra trong quá trình đăng ký khởi tạo
        old_logs = session.exec(select(WeightLog).where(WeightLog.user_id == user.id)).all()
        for ol in old_logs:
            session.delete(ol)
        session.commit()

        # Nạp lịch sử cân nặng
        today = get_vn_today()
        for idx, w in enumerate(weights):
            session.add(
                WeightLog(
                    user_id=user.id,
                    weight_kg=w,
                    logged_date=today - timedelta(days=3 - idx),
                )
            )
        session.commit()

        trend = get_user_weight_trend(session, user.id, days=14)
        assert trend["points_count"] == 4
        assert trend["calorie_penalty_applied"] is False

        # Kiểm tra tính ổn định calo (Non-punitive Calorie Stability)
        # Hôm qua ăn vượt mức 3500 kcal (vượt 1500 kcal so với mức 2000 kcal)
        stability = verify_safe_calorie_target_stability(session, user.id, yesterday_consumed_calories=3500.0)
        assert stability["penalty_applied"] == 0.0
        assert stability["today_target_calories"] == stability["baseline_target_calories"]
        assert stability["is_target_locked"] is True


# ==============================================================================
# 8. TEST TUẦN 5: MẪU HÀNH VI 5 NGÀY & FOOD SWAP SIMULATOR
# ==============================================================================


def test_w5_behavior_patterns_and_food_swap():
    """Kiểm tra:

    - analyze_user_patterns: Dưới 5 ngày trả về insufficient_data; đủ 5 ngày mới đưa ra phân tích.
    - simulate_food_swap: Tính toán đại số chính xác độ chênh lệch calories_diff, protein_diff_g, price_diff_vnd.
    """
    user, _ = create_user_helper("w5_swap_user", "w5_swap_user@example.com")
    today = get_vn_today()

    with Session(engine) as session:
        # Trường hợp < 5 ngày dữ liệu: chỉ nạp 3 ngày
        rice_ref = resolve_food_reference(session, food_name="Cơm trắng")
        for i in range(3):
            meal = Meal(
                user_id=user.id,
                meal_type="Trưa",
                logged_at=datetime.combine(today - timedelta(days=i), time(12, 0), tzinfo=UTC),
            )
            session.add(meal)
            session.flush()
            session.add(
                MealItem(
                    meal_id=meal.id,  # type: ignore
                    food_id=rice_ref.id,  # type: ignore
                    estimated_gram=200.0,
                    estimated_calories=260.0,
                )
            )
        session.commit()

        # Dưới 5 ngày phải trả về insufficient_data
        under_5_res = analyze_user_patterns(session, user.id, days=14)
        assert under_5_res["status"] == "insufficient_data"
        assert under_5_res["patterns"] == []

        # Nạp thêm 3 ngày nữa để đạt 6 ngày (>= 5 ngày)
        for i in range(3, 6):
            meal = Meal(
                user_id=user.id,
                meal_type="Trưa",
                logged_at=datetime.combine(today - timedelta(days=i), time(12, 0), tzinfo=UTC),
            )
            session.add(meal)
            session.flush()
            session.add(
                MealItem(
                    meal_id=meal.id,  # type: ignore
                    food_id=rice_ref.id,  # type: ignore
                    estimated_gram=200.0,
                    estimated_calories=260.0,
                )
            )
        session.commit()

        # Khi >= 5 ngày: trạng thái analyzed
        over_5_res = analyze_user_patterns(session, user.id, days=14)
        assert over_5_res["status"] == "analyzed"
        assert over_5_res["is_sufficient_data"] is True

        # Kiểm tra Food Swap Simulator
        # Đổi món từ "Cơm tấm sườn nướng" sang món ít calo hơn
        swap_res = simulate_food_swap(
            session=session,
            current_food_name="Cơm tấm sườn nướng",
            current_gram=250.0,
            swap_goal="reduce_calories",
            limit=3,
        )
        assert swap_res["status"] == "success"
        assert len(swap_res["alternatives"]) > 0
        top_alt = swap_res["alternatives"][0]
        # Calo món thay thế phải ít hơn món gốc
        assert top_alt["calories"] < swap_res["source_food"]["calories"]
        # delta_calories = calo_alt - calo_src (< 0)
        assert top_alt["calories_diff"] < 0
        assert top_alt["calories_saved"] > 0
        assert "protein_diff_g" in top_alt
        assert "price_diff_vnd" in top_alt


# ==============================================================================
# 9. TEST KHỞI CHẠY ỨNG DỤNG FASTAPI, HEALTH CHECK & ĐỒNG BỘ ROUTERS
# ==============================================================================


def test_fastapi_app_routes_and_health():
    """Kiểm tra:

    - /api/v1/health hoạt động và trả về HTTP 200 OK.
    - Tài liệu OpenAPI tương tác /docs khả dụng.
    - Truy cập router có bảo vệ khi không có cookie trả về 401 Unauthorized.
    - Truy cập router với HttpOnly Cookie JWT trả về dữ liệu chuẩn xác.
    """
    client = TestClient(app)

    # 1. Health check
    health_resp = client.get("/api/v1/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["success"] is True

    # 2. OpenAPI Docs
    docs_resp = client.get("/docs")
    assert docs_resp.status_code == 200

    # 3. Chặn truy cập không xác thực (401 Unauthorized)
    unauth_resp = client.get("/api/v1/meals/daily-dashboard")
    assert unauth_resp.status_code == 401

    # 4. Truy cập với Cookie xác thực hợp lệ
    user, token = create_user_helper("fastapi_route_user", "fastapi_route_user@example.com")
    auth_client = TestClient(app)
    auth_client.cookies.set("access_token", token)

    dash_resp = auth_client.get("/api/v1/meals/daily-dashboard")
    assert dash_resp.status_code == 200
    data = dash_resp.json()
    assert data["user_id"] == user.id
    assert "targets" in data
    assert "consumed" in data
    assert "remaining" in data

    # 5. Kiểm tra Analytics endpoints khả dụng
    analytics_resp = auth_client.get("/api/v1/analytics/patterns?days=14")
    assert analytics_resp.status_code == 200
    assert "status" in analytics_resp.json()
