"""
tests/unit/test_w5_analytics_and_food_swap.py
Bộ kiểm thử tự động toàn diện Tuần 5: Phân tích hành vi ăn uống (7-14 ngày),
Food Swap Simulator đại số tất định và Làm mịn xu hướng cân nặng EMA.

Bao gồm 10 kịch bản kiểm thử:
1. test_01_analyze_patterns_insufficient_data_under_5_days: Rào chắn < 5 ngày dữ liệu trả về insufficient_data.
2. test_02_detect_skipping_breakfast_pattern: Phát hiện mẫu bỏ bữa sáng khi tỷ lệ ăn sáng < 50%.
3. test_03_detect_low_protein_pattern: Phát hiện mẫu thiếu hụt đạm khi lượng đạm trung bình < 75% mục tiêu.
4. test_04_detect_late_night_eating_pattern: Phát hiện mẫu ăn khuya sau 21:00 (>= 3 ngày hoặc >= 30%).
5. test_05_food_swap_reduce_calories_beverage_and_rice: Mô phỏng đổi món giảm calo cùng nhóm, độ chênh lệch đại số khớp 100%.
6. test_06_food_swap_high_protein_and_budget_filter: Mô phỏng đổi món tăng đạm kèm bộ lọc ngân sách VNĐ.
7. test_07_ema_weight_trend_mathematical_accuracy: Độ chính xác toán học công thức EMA_t = round(0.1*W_t + 0.9*EMA_{t-1}, 2).
8. test_08_non_punitive_calorie_target_stability: Khóa an toàn hạn mức calo, không cắt giảm calo ngày tiếp theo dù ăn vượt TDEE.
9. test_09_analytics_and_food_swap_api_endpoints: Kiểm thử 3 API endpoints qua TestClient với HttpOnly Cookie JWT.
10. test_10_zero_trust_analytics_user_isolation: Cách ly dữ liệu hoàn toàn giữa User A và User B (Zero-Trust).
"""

from datetime import UTC, datetime, time, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

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
from src.backend.services.auth_service import (
    create_access_token,
    register_with_initial_goal,
)
from src.backend.services.goal_service import GoalPlanInput
from src.backend.services.nutrition_service import resolve_food_reference
from src.backend.services.weight_trend import (
    calculate_ema_weight_trend,
    verify_safe_calorie_target_stability,
)


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    """Khởi tạo CSDL và đảm bảo bảng food_references có đủ dữ liệu tham chiếu."""
    init_db()
    with Session(engine) as session:
        count = len(session.exec(select(FoodReference)).all())
        if count < 30:
            from scripts.seed_food_references import seed_foods

            seed_foods()


def create_test_client_and_user(username: str, email: str) -> tuple[TestClient, User]:
    """Helper tạo TestClient có HttpOnly Cookie JWT của người dùng đã xác thực."""
    with Session(engine) as session:
        existing = session.exec(
            select(User).where((User.username == username) | (User.email == email))
        ).first()
        if existing:
            # Xóa các liên kết cũ trước
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
                height_cm=175.0,
                current_weight_kg=70.0,
                target_weight_kg=65.0,
                goal_type="lose_weight",
                weekly_pace_kg=0.5,
                activity_level="moderate",
                daily_budget_vnd=60000,
            ),
        )

    token = create_access_token(data={"sub": str(user.id), "username": user.username})
    client = TestClient(app)
    client.cookies.set("access_token", token)
    return client, user


def add_meal_helper(
    session: Session,
    user_id: int,
    meal_type: str,
    food_name: str,
    gram: float,
    logged_at: datetime,
) -> Meal:
    """Helper ghi nhận bữa ăn có món cụ thể vào CSDL."""
    ref = resolve_food_reference(session, food_name=food_name)
    meal = Meal(
        user_id=user_id,
        meal_type=meal_type,
        logged_at=logged_at,
    )
    session.add(meal)
    session.flush()

    cal = round((gram / 100.0) * ref.calories_per_100g, 2)
    meal_item = MealItem(
        meal_id=meal.id,  # type: ignore
        food_id=ref.id,  # type: ignore
        estimated_gram=gram,
        estimated_calories=cal,
    )
    session.add(meal_item)
    session.commit()
    session.refresh(meal)
    return meal


def clear_user_weight_logs(session: Session, user_id: int) -> None:
    """Xóa toàn bộ weight logs của user để phục vụ kịch bản kiểm thử cô lập."""
    old_logs = session.exec(select(WeightLog).where(WeightLog.user_id == user_id)).all()
    for ol in old_logs:
        session.delete(ol)
    session.commit()


# ==============================================================================
# TEST 1: ANALYZE_PATTERNS_INSUFFICIENT_DATA_UNDER_5_DAYS
# ==============================================================================


def test_01_analyze_patterns_insufficient_data_under_5_days():
    """Người dùng mới chỉ ghi nhật ký 3 ngày (D = 3 < 5).

    Xác minh analyze_user_patterns trả về status == 'insufficient_data',
    is_sufficient_data is False và patterns == [].
    """
    _, user = create_test_client_and_user("w5_user_01", "w5_user_01@example.com")

    today = get_vn_today()
    with Session(engine) as session:
        # Ghi nhật ký vào 3 ngày khác nhau: today, today - 1, today - 2
        for i in range(3):
            meal_time = datetime.combine(today - timedelta(days=i), time(12, 0), tzinfo=UTC)
            add_meal_helper(session, user.id, "Trưa", "Phở bò tái", 400.0, meal_time)  # type: ignore

        result = analyze_user_patterns(session, user.id, days_range=14)  # type: ignore

        assert result["status"] == "insufficient_data"
        assert result["is_sufficient_data"] is False
        assert result["logged_days_count"] == 3
        assert result["minimum_required_days"] == 5
        assert result["patterns"] == []
        assert result["locked_daily_target_calories"] > 0
        assert "5 ngày" in result["disclaimer"]


# ==============================================================================
# TEST 2: DETECT_SKIPPING_BREAKFAST_PATTERN
# ==============================================================================


def test_02_detect_skipping_breakfast_pattern():
    """Người dùng ghi nhật ký 7 ngày nhưng chỉ ăn sáng 1 ngày (Breakfast_Rate = 1/7 = 0.14 < 0.50).

    Xác minh hệ thống phát hiện đúng 'skipping_breakfast' trong patterns.
    """
    _, user = create_test_client_and_user("w5_user_02", "w5_user_02@example.com")

    today = get_vn_today()
    with Session(engine) as session:
        # Ngày 0 (hôm nay): Có ăn sáng
        t0 = datetime.combine(today, time(7, 30), tzinfo=UTC)
        add_meal_helper(session, user.id, "Sáng", "Phở bò tái", 400.0, t0)  # type: ignore

        # Ngày 1 đến 6 (6 ngày còn lại): Chỉ ăn trưa, bỏ hoàn toàn bữa sáng
        for i in range(1, 7):
            t_other = datetime.combine(today - timedelta(days=i), time(12, 30), tzinfo=UTC)
            add_meal_helper(session, user.id, "Trưa", "Cơm tấm sườn nướng", 300.0, t_other)  # type: ignore

        result = analyze_user_patterns(session, user.id, days_range=14)  # type: ignore

        assert result["status"] == "analyzed"
        assert result["is_sufficient_data"] is True
        assert result["logged_days_count"] == 7

        pattern_codes = [p["pattern_code"] for p in result["patterns"]]
        assert "skipping_breakfast" in pattern_codes

        breakfast_pattern = next(p for p in result["patterns"] if p["pattern_code"] == "skipping_breakfast")
        assert breakfast_pattern["title"] == "Thói quen bỏ bữa sáng"
        assert breakfast_pattern["severity"] == "gentle_reminder"
        assert breakfast_pattern["metrics"]["breakfast_days"] == 1
        assert breakfast_pattern["metrics"]["logged_days"] == 7
        assert breakfast_pattern["metrics"]["breakfast_rate"] == round(1 / 7, 2)
        assert "bữa sáng" in breakfast_pattern["recommendation"].lower()


# ==============================================================================
# TEST 3: DETECT_LOW_PROTEIN_PATTERN
# ==============================================================================


def test_03_detect_low_protein_pattern():
    """Người dùng có mục tiêu đạm 135g/ngày nhưng trong 6 ngày liên tiếp chỉ ăn món ít đạm

    (trung bình < 60g/ngày < 0.75 * 135 = 101.25g).
    Xác minh hệ thống phát hiện đúng 'low_protein'.
    """
    _, user = create_test_client_and_user("w5_user_03", "w5_user_03@example.com")

    today = get_vn_today()
    with Session(engine) as session:
        # Cập nhật Goal của user có target_protein_g = 135.0
        goal = session.exec(select(Goal).where(Goal.user_id == user.id)).first()
        if goal:
            goal.target_protein_g = 135.0
            session.add(goal)
            session.commit()

        # Trong 6 ngày liên tiếp, mỗi ngày chỉ ăn "Rau muống xào tỏi" (150g) và "Cơm trắng" (200g)
        # Rau muống xào tỏi: 2.5g protein/100g -> 150g = 3.75g protein
        # Cơm trắng: 2.7g protein/100g -> 200g = 5.4g protein
        # Tổng protein/ngày = 9.15g << 60g << 101.25g
        for i in range(6):
            t = datetime.combine(today - timedelta(days=i), time(12, 0), tzinfo=UTC)
            add_meal_helper(session, user.id, "Trưa", "Rau muống xào tỏi", 150.0, t)  # type: ignore
            add_meal_helper(session, user.id, "Trưa", "Cơm trắng", 200.0, t)  # type: ignore

        result = analyze_user_patterns(session, user.id, days_range=14)  # type: ignore

        assert result["status"] == "analyzed"
        assert result["is_sufficient_data"] is True
        assert result["logged_days_count"] == 6

        pattern_codes = [p["pattern_code"] for p in result["patterns"]]
        assert "low_protein" in pattern_codes

        prot_pattern = next(p for p in result["patterns"] if p["pattern_code"] == "low_protein")
        assert prot_pattern["title"] == "Lượng đạm (Protein) trung bình chưa đạt mục tiêu"
        assert prot_pattern["severity"] == "nutrition_balance"
        assert prot_pattern["metrics"]["avg_daily_protein_g"] < 60.0
        assert prot_pattern["metrics"]["target_protein_g"] == 135.0
        assert "đạm" in prot_pattern["recommendation"].lower()


# ==============================================================================
# TEST 4: DETECT_LATE_NIGHT_EATING_PATTERN
# ==============================================================================


def test_04_detect_late_night_eating_pattern():
    """Người dùng ghi nhận bữa ăn lúc 22:15 (sau 21:00) trong 4 trên 6 ngày có nhật ký.

    Xác minh hệ thống phát hiện đúng 'late_night_eating'.
    """
    _, user = create_test_client_and_user("w5_user_04", "w5_user_04@example.com")

    today = get_vn_today()
    with Session(engine) as session:
        # 4 ngày có bữa ăn khuya lúc 22:15
        for i in range(4):
            t_late = datetime.combine(today - timedelta(days=i), time(22, 15), tzinfo=UTC)
            add_meal_helper(session, user.id, "Tối", "Phở bò tái", 350.0, t_late)  # type: ignore

        # 2 ngày còn lại chỉ ăn trưa lúc 12:00
        for i in range(4, 6):
            t_normal = datetime.combine(today - timedelta(days=i), time(12, 0), tzinfo=UTC)
            add_meal_helper(session, user.id, "Trưa", "Cơm tấm sườn nướng", 300.0, t_normal)  # type: ignore

        result = analyze_user_patterns(session, user.id, days_range=14)  # type: ignore

        assert result["status"] == "analyzed"
        assert result["is_sufficient_data"] is True
        assert result["logged_days_count"] == 6

        pattern_codes = [p["pattern_code"] for p in result["patterns"]]
        assert "late_night_eating" in pattern_codes

        late_pattern = next(p for p in result["patterns"] if p["pattern_code"] == "late_night_eating")
        assert late_pattern["title"] == "Thói quen ăn muộn sau 21:00"
        assert late_pattern["severity"] == "habit_observation"
        assert late_pattern["metrics"]["late_night_days"] == 4
        assert late_pattern["metrics"]["logged_days"] == 6
        assert late_pattern["metrics"]["late_night_rate"] == round(4 / 6, 2)
        assert "21:00" in late_pattern["recommendation"]


# ==============================================================================
# TEST 5: FOOD_SWAP_REDUCE_CALORIES_BEVERAGE_AND_RICE
# ==============================================================================


def test_05_food_swap_reduce_calories_beverage_and_rice():
    """Kiểm tra simulate_food_swap khi đổi 'Cơm tấm sườn bì chả' (250g) hoặc 'Cà phê sữa đá'

    sang món cùng nhóm theo mục tiêu 'reduce_calories'.
    Xác minh mọi phương án gợi ý đều có delta_calories < 0, calories_saved > 0
    và phép trừ đại số khớp 100%.
    """
    with Session(engine) as session:
        # Trường hợp 1: Đổi món cơm "Cơm tấm sườn bì chả" (250g)
        res_rice = simulate_food_swap(
            session=session,
            current_food_name="Cơm tấm sườn bì chả",
            portion_gram=250.0,
            swap_goal="reduce_calories",
            same_category_only=True,
            limit=5,
        )

        assert res_rice["status"] == "success"
        assert res_rice["source_food"]["food_name"] == "Cơm tấm sườn bì chả"
        assert res_rice["source_food"]["category"] == "rice_dish"
        src_cal_rice = res_rice["source_food"]["calories"]
        src_prot_rice = res_rice["source_food"]["protein_g"]
        src_price_rice = res_rice["source_food"]["estimated_price_vnd"]

        assert len(res_rice["alternatives"]) > 0
        for alt in res_rice["alternatives"]:
            assert alt["category"] == "rice_dish"
            assert alt["delta_calories"] < 0
            assert alt["calories_saved"] > 0

            # Kiểm định phép tính đại số tuyệt đối
            expected_delta_cal = round(alt["calories"] - src_cal_rice, 2)
            expected_saved_cal = round(src_cal_rice - alt["calories"], 2)
            expected_delta_prot = round(alt["protein_g"] - src_prot_rice, 2)
            expected_delta_price = alt["estimated_price_vnd"] - src_price_rice

            assert alt["delta_calories"] == expected_delta_cal
            assert alt["calories_saved"] == expected_saved_cal
            assert alt["delta_protein_g"] == expected_delta_prot
            assert alt["delta_price_vnd"] == expected_delta_price

        # Trường hợp 2: Đổi đồ uống "Cà phê sữa đá" (200g)
        res_bev = simulate_food_swap(
            session=session,
            current_food_name="Cà phê sữa đá",
            portion_gram=200.0,
            swap_goal="reduce_calories",
            same_category_only=True,
            limit=5,
        )

        assert res_bev["status"] == "success"
        assert res_bev["source_food"]["category"] == "beverage"
        src_cal_bev = res_bev["source_food"]["calories"]

        assert len(res_bev["alternatives"]) > 0
        for alt in res_bev["alternatives"]:
            assert alt["category"] == "beverage"
            assert alt["delta_calories"] < 0
            assert alt["calories_saved"] > 0
            assert alt["delta_calories"] == round(alt["calories"] - src_cal_bev, 2)


# ==============================================================================
# TEST 6: FOOD_SWAP_HIGH_PROTEIN_AND_BUDGET_FILTER
# ==============================================================================


def test_06_food_swap_high_protein_and_budget_filter():
    """Kiểm tra simulate_food_swap với swap_goal='high_protein' và max_budget_vnd=45000.

    Xác minh tất cả các món thay thế đều có delta_protein_g > 0 và giá tiền ước tính <= 45,000 VNĐ.
    """
    with Session(engine) as session:
        # Đổi món "Cơm trắng" (250g, 2.7g protein/100g) sang món giàu đạm với ngân sách tối đa 45,000 VNĐ
        result = simulate_food_swap(
            session=session,
            current_food_name="Cơm trắng",
            portion_gram=250.0,
            swap_goal="high_protein",
            max_budget_vnd=45000,
            same_category_only=False,
            limit=5,
        )

        assert result["status"] == "success"
        src_protein = result["source_food"]["protein_g"]

        assert len(result["alternatives"]) > 0
        for alt in result["alternatives"]:
            # Phải có đạm cao hơn món gốc
            assert alt["delta_protein_g"] > 0
            assert alt["protein_g"] > src_protein
            # Giá tiền ước tính không được vượt quá max_budget_vnd
            assert alt["estimated_price_vnd"] <= 45000


# ==============================================================================
# TEST 7: EMA_WEIGHT_TREND_MATHEMATICAL_ACCURACY
# ==============================================================================


def test_07_ema_weight_trend_mathematical_accuracy():
    """Nhập chuỗi 5 ngày cân nặng [70.0, 71.0, 70.5, 69.8, 69.5] cho người dùng.

    Xác minh calculate_ema_weight_trend tính chính xác từng điểm theo công thức:
    EMA_t = round(0.1 * W_t + 0.9 * EMA_{t-1}, 2).
    """
    _, user = create_test_client_and_user("w5_user_07", "w5_user_07@example.com")

    weights = [70.0, 71.0, 70.5, 69.8, 69.5]
    today = get_vn_today()

    with Session(engine) as session:
        clear_user_weight_logs(session, user.id)  # type: ignore

        # Ghi chuỗi 5 ngày liên tiếp
        for i, w in enumerate(weights):
            log_d = today - timedelta(days=4 - i)
            log = WeightLog(
                user_id=user.id,  # type: ignore
                weight_kg=w,
                logged_date=log_d,
            )
            session.add(log)
        session.commit()

        trend = calculate_ema_weight_trend(
            session=session,
            authenticated_user_id=user.id,  # type: ignore
            days_range=14,
            alpha=0.1,
        )

        assert trend["points_count"] == 5
        assert len(trend["series"]) == 5

        # Tính toán thủ công chính xác từng bước:
        # t=0: EMA_0 = 70.0
        # t=1: round(0.1 * 71.0 + 0.9 * 70.0, 2) = round(7.1 + 63.0, 2) = 70.1
        # t=2: round(0.1 * 70.5 + 0.9 * 70.1, 2) = round(7.05 + 63.09, 2) = 70.14
        # t=3: round(0.1 * 69.8 + 0.9 * 70.14, 2) = round(6.98 + 63.126, 2) = 70.11
        # t=4: round(0.1 * 69.5 + 0.9 * 70.11, 2) = round(6.95 + 63.099, 2) = 70.05
        expected_emas = [70.0, 70.1, 70.14, 70.11, 70.05]
        computed_emas = [pt["ema_weight_kg"] for pt in trend["series"]]

        assert computed_emas == expected_emas
        assert trend["start_weight_kg"] == 70.0
        assert trend["latest_weight_kg"] == 69.5
        assert trend["latest_ema_kg"] == 70.05
        assert trend["raw_change_kg"] == -0.5
        assert trend["ema_change_kg"] == round(70.05 - 70.0, 2)


# ==============================================================================
# TEST 8: NON_PUNITIVE_CALORIE_TARGET_STABILITY
# ==============================================================================


def test_08_non_punitive_calorie_target_stability():
    """Kiểm tra verify_safe_calorie_target_stability khi hôm qua ăn vượt 1000 kcal so với TDEE.

    Xác minh hạn mức calo hôm nay vẫn giữ nguyên, penalty_applied == 0.0 và is_target_locked is True.
    """
    _, user = create_test_client_and_user("w5_user_08", "w5_user_08@example.com")

    with Session(engine) as session:
        goal = session.exec(select(Goal).where(Goal.user_id == user.id)).first()
        assert goal is not None
        target_cal = float(goal.target_calories if goal.target_calories else goal.tdee_calories)

        # Giả lập hôm qua người dùng nạp vượt 1000 kcal so với mục tiêu
        yesterday_cals = target_cal + 1000.0

        stability = verify_safe_calorie_target_stability(
            session=session,
            authenticated_user_id=user.id,  # type: ignore
            yesterday_consumed_calories=yesterday_cals,
        )

        assert stability["baseline_target_calories"] == target_cal
        assert stability["today_target_calories"] == target_cal
        assert stability["penalty_applied"] == 0.0
        assert stability["is_target_locked"] is True
        assert "không tự động cắt giảm calo cực đoan" in stability["safety_message"]


# ==============================================================================
# TEST 9: ANALYTICS_AND_FOOD_SWAP_API_ENDPOINTS
# ==============================================================================


def test_09_analytics_and_food_swap_api_endpoints():
    """Kiểm tra gọi trực tiếp 3 endpoints:

    - GET /api/v1/analytics/patterns
    - POST /api/v1/analytics/food-swap
    - GET /api/v1/analytics/weight-trend
    qua TestClient kèm HttpOnly Cookie JWT trả về HTTP 200 OK và đúng cấu trúc JSON.
    """
    client, user = create_test_client_and_user("w5_user_09", "w5_user_09@example.com")

    today = get_vn_today()
    with Session(engine) as session:
        clear_user_weight_logs(session, user.id)  # type: ignore

        # Ghi nhận 5 ngày bữa ăn để đủ điều kiện phân tích
        for i in range(5):
            t = datetime.combine(today - timedelta(days=i), time(12, 0), tzinfo=UTC)
            add_meal_helper(session, user.id, "Trưa", "Phở bò tái", 400.0, t)  # type: ignore

        # Ghi nhận 3 điểm cân nặng
        for i, w in enumerate([68.0, 68.2, 67.9]):
            session.add(
                WeightLog(
                    user_id=user.id,  # type: ignore
                    weight_kg=w,
                    logged_date=today - timedelta(days=2 - i),
                )
            )
        session.commit()

    # 1. GET /api/v1/analytics/patterns
    resp_pat = client.get("/api/v1/analytics/patterns?days_range=14")
    assert resp_pat.status_code == 200
    pat_data = resp_pat.json()
    assert pat_data["status"] == "analyzed"
    assert pat_data["is_sufficient_data"] is True
    assert pat_data["logged_days_count"] == 5
    assert "summary_metrics" in pat_data
    assert "patterns" in pat_data

    # 2. POST /api/v1/analytics/food-swap
    resp_swap = client.post(
        "/api/v1/analytics/food-swap",
        json={
            "current_food_name": "Cơm tấm sườn bì chả",
            "portion_gram": 250.0,
            "swap_goal": "reduce_calories",
            "same_category_only": True,
            "limit": 3,
        },
    )
    assert resp_swap.status_code == 200
    swap_data = resp_swap.json()
    assert swap_data["status"] == "success"
    assert len(swap_data["alternatives"]) > 0
    assert "source_food" in swap_data
    assert "comparison_delta" in swap_data["alternatives"][0]

    # 3. GET /api/v1/analytics/weight-trend
    resp_wt = client.get("/api/v1/analytics/weight-trend?days_range=14")
    assert resp_wt.status_code == 200
    wt_data = resp_wt.json()
    assert wt_data["points_count"] == 3
    assert len(wt_data["series"]) == 3
    assert wt_data["latest_weight_kg"] == 67.9


# ==============================================================================
# TEST 10: ZERO_TRUST_ANALYTICS_USER_ISOLATION
# ==============================================================================


def test_10_zero_trust_analytics_user_isolation():
    """Tạo User A (có 7 ngày dữ liệu bỏ bữa sáng & ăn khuya) và User B (mới đăng ký, 0 ngày dữ liệu).

    Khi User B gọi GET /api/v1/analytics/patterns và GET /api/v1/analytics/weight-trend,
    xác minh User B chỉ nhận trạng thái insufficient_data của riêng mình,
    tuyệt đối không bị rò rỉ dữ liệu của User A.
    """
    _, user_a = create_test_client_and_user("w5_user_10_a", "w5_user_10_a@example.com")
    client_b, user_b = create_test_client_and_user("w5_user_10_b", "w5_user_10_b@example.com")

    today = get_vn_today()
    with Session(engine) as session:
        clear_user_weight_logs(session, user_a.id)  # type: ignore
        clear_user_weight_logs(session, user_b.id)  # type: ignore

        # Nạp dữ liệu 7 ngày đầy đủ cho User A (ăn khuya 22:30 mỗi ngày)
        for i in range(7):
            t = datetime.combine(today - timedelta(days=i), time(22, 30), tzinfo=UTC)
            add_meal_helper(session, user_a.id, "Tối", "Phở bò tái", 400.0, t)  # type: ignore
            session.add(
                WeightLog(
                    user_id=user_a.id,  # type: ignore
                    weight_kg=72.0 - i * 0.2,
                    logged_date=today - timedelta(days=i),
                )
            )
        session.commit()

    # User B (0 ngày dữ liệu) gọi API Patterns
    resp_b_pat = client_b.get("/api/v1/analytics/patterns?days_range=14")
    assert resp_b_pat.status_code == 200
    data_b_pat = resp_b_pat.json()

    assert data_b_pat["status"] == "insufficient_data"
    assert data_b_pat["is_sufficient_data"] is False
    assert data_b_pat["logged_days_count"] == 0
    assert data_b_pat["patterns"] == []
    assert data_b_pat["user_id"] == user_b.id
    assert data_b_pat["user_id"] != user_a.id

    # User B gọi API Weight Trend
    resp_b_wt = client_b.get("/api/v1/analytics/weight-trend?days_range=14")
    assert resp_b_wt.status_code == 200
    data_b_wt = resp_b_wt.json()

    assert data_b_wt["points_count"] == 0
    assert data_b_wt["series"] == []
    assert data_b_wt["user_id"] == user_b.id
    assert data_b_wt["user_id"] != user_a.id
