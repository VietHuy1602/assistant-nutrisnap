"""
tests/unit/test_w6_habit_and_monthly_report.py
Bộ kiểm thử tự động toàn diện Tuần 6: Service Habit Tracker & Monthly Report API.
Bao gồm đủ 9 kịch bản kiểm thử theo đặc tả:
1. test_streak_calculation_consecutive_and_gap_days: Kiểm tra tính chính xác current_streak và longest_streak.
2. test_seven_day_challenge_progress_and_badges: Kiểm tra tiến độ thử thách 7 ngày và huy hiệu.
3. test_back_on_track_mode_no_calorie_penalty: Kiểm tra chế độ quay lại đường đua không phạt lỗi calo.
4. test_monthly_report_logging_and_nutrition_aggregation: Kiểm tra tổng hợp nhật ký và dinh dưỡng tháng.
5. test_monthly_report_weight_fluctuation_and_ema: Kiểm tra biến động cân nặng thực tế và chuỗi EMA.
6. test_monthly_report_strengths_extraction: Kiểm tra trích xuất điểm mạnh và fallback khích lệ tài khoản mới.
7. test_api_get_monthly_report_endpoint: Kiểm tra endpoint GET /api/v1/reports/monthly trả về HTTP 200 và JSON hợp lệ.
8. test_api_get_habits_status_endpoint: Kiểm tra endpoint GET /api/v1/habits/status trả về HTTP 200 và dữ liệu thử thách 7 ngày.
9. test_zero_trust_data_isolation_monthly_report: Kiểm tra cách ly dữ liệu tuyệt đối giữa User A và User B (Zero-Trust).
"""

from datetime import UTC, date, datetime, timedelta

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
from src.backend.services.auth_service import (
    create_access_token,
    register_with_initial_goal,
)
from src.backend.services.goal_service import GoalPlanInput
from src.backend.services.habit_service import (
    calculate_user_streak,
    evaluate_back_on_track_mode,
    generate_monthly_report,
    get_habit_tracker_summary,
    get_seven_day_challenge_status,
)
from src.backend.services.nutrition_service import resolve_food_reference


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    """Khởi tạo CSDL và đảm bảo bảng food_references có đủ dữ liệu mẫu."""
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
                current_weight_kg=72.0,
                target_weight_kg=68.0,
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


# ==============================================================================
# 1. TEST STREAK CALCULATION (CONSECUTIVE & GAP DAYS)
# ==============================================================================


def test_streak_calculation_consecutive_and_gap_days():
    """Kiểm tra tính chính xác current_streak và longest_streak khi người dùng:

    - Ghi liên tiếp 5 ngày (Day 1 -> Day 5)
    - Nghỉ 2 ngày (Day 6, Day 7)
    - Ghi tiếp 3 ngày (Day 8 -> Day 10)
    Kết quả mong đợi: current_streak == 3, longest_streak == 5, total_logged_days == 8.
    """
    _, user = create_test_client_and_user("user_streak_test", "streak_test@nutrisnap.com")
    base_date = date(2026, 5, 1)

    with Session(engine) as session:
        # Xóa các bữa ăn cũ của user này nếu có
        old_meals = session.exec(select(Meal).where(Meal.user_id == user.id)).all()
        for m in old_meals:
            session.delete(m)
        session.commit()

        # 5 ngày liên tiếp: 2026-05-01 đến 2026-05-05
        for day_offset in range(5):
            d = base_date + timedelta(days=day_offset)
            dt = datetime(d.year, d.month, d.day, 12, 0, tzinfo=UTC)
            add_meal_helper(session, user.id, "lunch", "Cơm tấm sườn nướng", 250.0, dt)

        # Nghỉ 2 ngày (Day 6: 05-06, Day 7: 05-07)

        # 3 ngày tiếp theo: 2026-05-08 đến 2026-05-10
        for day_offset in [7, 8, 9]:
            d = base_date + timedelta(days=day_offset)
            dt = datetime(d.year, d.month, d.day, 12, 0, tzinfo=UTC)
            add_meal_helper(session, user.id, "lunch", "Phở bò tái", 350.0, dt)

        ref_date = base_date + timedelta(days=9)  # 2026-05-10
        res = calculate_user_streak(session, user.id, reference_date=ref_date)

        assert res["current_streak"] == 3, f"Expected current_streak 3, got {res['current_streak']}"
        assert res["longest_streak"] == 5, f"Expected longest_streak 5, got {res['longest_streak']}"
        assert res["total_logged_days"] == 8, f"Expected total_logged_days 8, got {res['total_logged_days']}"
        assert len(res["logged_dates_last_7_days"]) > 0


# ==============================================================================
# 2. TEST SEVEN DAY CHALLENGE PROGRESS AND BADGES
# ==============================================================================


def test_seven_day_challenge_progress_and_badges():
    """Kiểm tra tiến độ thử thách 7 ngày:

    - 7/7 ngày: completed_days == 7, progress_pct == 100.0, is_completed == True, badge == 'Chiến binh 7 Ngày Bền Bỉ'.
    - 5/7 ngày: completed_days == 5, progress_pct == 71.4, badge == 'Người Đồng Hành Đều Đặn'.
    - 3/7 ngày: completed_days == 3, progress_pct == 42.9, badge == 'Khởi Đầu Vững Chắc'.
    - 1/7 ngày: completed_days == 1, progress_pct == 14.3, badge == 'Hành Trình Mới'.
    """
    _, user = create_test_client_and_user("user_challenge_test", "challenge_test@nutrisnap.com")
    ref_date = date(2026, 6, 7)

    with Session(engine) as session:
        # Xóa các bữa ăn cũ
        old_meals = session.exec(select(Meal).where(Meal.user_id == user.id)).all()
        for m in old_meals:
            session.delete(m)
        session.commit()

        # Tạo đủ 7 ngày liên tiếp trong cửa sổ [2026-06-01, 2026-06-07]
        for offset in range(7):
            d = ref_date - timedelta(days=offset)
            dt = datetime(d.year, d.month, d.day, 8, 0, tzinfo=UTC)
            add_meal_helper(session, user.id, "breakfast", "Bánh mì ốp la", 180.0, dt)

        status_7 = get_seven_day_challenge_status(session, user.id, reference_date=ref_date)
        assert status_7["completed_days"] == 7
        assert status_7["progress_pct"] == 100.0
        assert status_7["is_completed"] is True
        assert status_7["badge_name"] == "Chiến binh 7 Ngày Bền Bỉ"

        # Thử với cửa sổ có 5 ngày
        ref_date_5 = date(2026, 6, 9)  # 2026-06-03 đến 2026-06-09 (có ngày 3,4,5,6,7 ghi, 8,9 không ghi -> 5 ngày)
        status_5 = get_seven_day_challenge_status(session, user.id, reference_date=ref_date_5)
        assert status_5["completed_days"] == 5
        assert status_5["progress_pct"] == 71.4
        assert status_5["badge_name"] == "Người Đồng Hành Đều Đặn"

        # Thử với cửa sổ có 3 ngày
        ref_date_3 = date(2026, 6, 11)  # 2026-06-05 đến 2026-06-11 (có ngày 5,6,7 ghi -> 3 ngày)
        status_3 = get_seven_day_challenge_status(session, user.id, reference_date=ref_date_3)
        assert status_3["completed_days"] == 3
        assert status_3["progress_pct"] == 42.9
        assert status_3["badge_name"] == "Khởi Đầu Vững Chắc"

        # Thử với cửa sổ có 1 ngày
        ref_date_1 = date(2026, 6, 13)  # 2026-06-07 đến 2026-06-13 (có ngày 7 ghi -> 1 ngày)
        status_1 = get_seven_day_challenge_status(session, user.id, reference_date=ref_date_1)
        assert status_1["completed_days"] == 1
        assert status_1["progress_pct"] == 14.3
        assert status_1["badge_name"] == "Hành Trình Mới"


# ==============================================================================
# 3. TEST BACK ON TRACK MODE (NO CALORIE PENALTY)
# ==============================================================================


def test_back_on_track_mode_no_calorie_penalty():
    """Kiểm tra khi người dùng ăn vượt TDEE hoặc bỏ lỡ 1 ngày:

    - back_on_track_active bật True.
    - calorie_penalty_applied BẮT BUỘC bằng False.
    - next_day_target_calories GIỮ NGUYÊN bằng tdee_calories (không bị cắt giảm).
    """
    _, user = create_test_client_and_user("user_back_on_track", "bot_test@nutrisnap.com")
    today = date(2026, 7, 10)
    yesterday = today - timedelta(days=1)

    with Session(engine) as session:
        # Lấy TDEE chuẩn của user
        goal = session.exec(select(Goal).where(Goal.user_id == user.id)).first()
        assert goal is not None
        user_tdee = float(goal.tdee_calories)

        # Xóa các bữa ăn cũ
        old_meals = session.exec(select(Meal).where(Meal.user_id == user.id)).all()
        for m in old_meals:
            session.delete(m)
        session.commit()

        # Kịch bản A: Hôm qua ăn vượt TDEE (nạp 3000 kcal > user_tdee)
        dt_yesterday = datetime(yesterday.year, yesterday.month, yesterday.day, 19, 0, tzinfo=UTC)
        # Thêm 4 phần cơm tấm sườn nướng (~600 kcal mỗi phần -> > 2400 kcal)
        for _ in range(5):
            add_meal_helper(session, user.id, "dinner", "Cơm tấm sườn nướng", 300.0, dt_yesterday)

        res_over = evaluate_back_on_track_mode(session, user.id, reference_date=today)
        assert res_over["back_on_track_active"] is True
        assert res_over["trigger_reason"] == "over_target_calories"
        assert res_over["calorie_penalty_applied"] is False
        assert res_over["next_day_target_calories"] == user_tdee
        assert "vượt mục tiêu" in res_over["encouragement_message"].lower()

        # Kịch bản B: Bỏ lỡ ngày hôm qua sau khi đã có lịch sử ghi nhật ký
        old_meals = session.exec(select(Meal).where(Meal.user_id == user.id)).all()
        for m in old_meals:
            session.delete(m)
        session.commit()

        # Ghi 2 ngày trước (2026-07-08), nhưng bỏ lỡ hôm qua (2026-07-09)
        two_days_ago = today - timedelta(days=2)
        dt_2days = datetime(two_days_ago.year, two_days_ago.month, two_days_ago.day, 12, 0, tzinfo=UTC)
        add_meal_helper(session, user.id, "lunch", "Phở bò tái", 350.0, dt_2days)

        res_missed = evaluate_back_on_track_mode(session, user.id, reference_date=today)
        assert res_missed["back_on_track_active"] is True
        assert res_missed["trigger_reason"] == "missed_day"
        assert res_missed["calorie_penalty_applied"] is False
        assert res_missed["next_day_target_calories"] == user_tdee
        assert "bỏ lỡ" in res_missed["encouragement_message"].lower()


# ==============================================================================
# 4. TEST MONTHLY REPORT LOGGING & NUTRITION AGGREGATION
# ==============================================================================


def test_monthly_report_logging_and_nutrition_aggregation():
    """Tạo dữ liệu bữa ăn trong tháng:

    - Kiểm tra total_logged_days, total_meals_logged, consistency_rate_pct.
    - Kiểm tra avg_daily_calories tính đúng trên các ngày có ghi.
    """
    _, user = create_test_client_and_user("user_report_agg", "report_agg@nutrisnap.com")
    ref_date = date(2026, 8, 30)
    period_days = 30

    with Session(engine) as session:
        # Xóa các bữa ăn cũ
        old_meals = session.exec(select(Meal).where(Meal.user_id == user.id)).all()
        for m in old_meals:
            session.delete(m)
        session.commit()

        # Tạo 10 ngày ghi nhật ký trong 30 ngày qua (mỗi ngày 2 bữa: sáng + trưa)
        # Bánh mì ốp la (180g) và Phở bò tái (350g)
        ref_bm = resolve_food_reference(session, food_name="Bánh mì ốp la")
        ref_pho = resolve_food_reference(session, food_name="Phở bò tái")
        cal_bm = (180.0 / 100.0) * ref_bm.calories_per_100g
        cal_pho = (350.0 / 100.0) * ref_pho.calories_per_100g
        expected_daily_calories = round(cal_bm + cal_pho, 1)

        for i in range(10):
            d = ref_date - timedelta(days=i * 2)
            dt_morning = datetime(d.year, d.month, d.day, 7, 30, tzinfo=UTC)
            dt_noon = datetime(d.year, d.month, d.day, 12, 15, tzinfo=UTC)
            add_meal_helper(session, user.id, "breakfast", "Bánh mì ốp la", 180.0, dt_morning)
            add_meal_helper(session, user.id, "lunch", "Phở bò tái", 350.0, dt_noon)

        report = generate_monthly_report(
            session=session,
            authenticated_user_id=user.id,
            days=period_days,
            reference_date=ref_date,
        )

        assert report["logging_summary"]["total_logged_days"] == 10
        assert report["logging_summary"]["total_meals_logged"] == 20
        assert report["logging_summary"]["consistency_rate_pct"] == round((10 / 30.0) * 100.0, 1)
        assert abs(report["nutrition_summary"]["avg_daily_calories"] - expected_daily_calories) < 1.0


# ==============================================================================
# 5. TEST MONTHLY REPORT WEIGHT FLUCTUATION & EMA
# ==============================================================================


def test_monthly_report_weight_fluctuation_and_ema():
    """Tạo chuỗi weight_logs đầu tháng đến cuối tháng (từ 72.0kg xuống 70.2kg):

    - Kiểm tra start_weight_kg == 72.0, end_weight_kg == 70.2.
    - raw_weight_change_kg == -1.8.
    - Biến động EMA và trend_direction ('decreasing').
    """
    _, user = create_test_client_and_user("user_weight_report", "weight_report@nutrisnap.com")
    ref_date = date(2026, 9, 30)

    with Session(engine) as session:
        # Xóa weight logs cũ
        old_logs = session.exec(select(WeightLog).where(WeightLog.user_id == user.id)).all()
        for w in old_logs:
            session.delete(w)
        session.commit()

        # Tạo chuỗi cân nặng: 72.0kg, 71.5kg, 71.0kg, 70.6kg, 70.2kg
        weight_values = [72.0, 71.5, 71.0, 70.6, 70.2]
        for idx, val in enumerate(weight_values):
            d = ref_date - timedelta(days=(4 - idx) * 5)
            w_log = WeightLog(user_id=user.id, weight_kg=val, logged_date=d)
            session.add(w_log)
        session.commit()

        report = generate_monthly_report(
            session=session,
            authenticated_user_id=user.id,
            days=30,
            reference_date=ref_date,
        )

        w_sum = report["weight_summary"]
        assert w_sum["start_weight_kg"] == 72.0
        assert w_sum["end_weight_kg"] == 70.2
        assert w_sum["raw_weight_change_kg"] == -1.8
        assert w_sum["ema_start_kg"] == 72.0
        assert w_sum["ema_weight_change_kg"] < 0
        assert w_sum["trend_direction"] == "decreasing"


# ==============================================================================
# 6. TEST MONTHLY REPORT STRENGTHS EXTRACTION
# ==============================================================================


def test_monthly_report_strengths_extraction():
    """Kiểm tra danh sách strengths tự động nhận diện đúng điểm mạnh:

    - User đạt streak >= 3, thói quen ăn sáng >= 60%, calo sát mục tiêu (+/- 15%).
    - Tài khoản mới chưa có dữ liệu luôn trả về ít nhất 1 điểm mạnh fallback khởi đầu.
    """
    # 1. Kiểm tra tài khoản mới toanh
    _, new_user = create_test_client_and_user("user_new_strengths", "new_strengths@nutrisnap.com")
    with Session(engine) as session:
        report_new = generate_monthly_report(
            session=session,
            authenticated_user_id=new_user.id,
            days=30,
        )
        assert len(report_new["strengths"]) >= 1
        assert "Đã chủ động bắt đầu hành trình" in report_new["strengths"][0]

    # 2. Kiểm tra tài khoản có đủ các điểm mạnh
    _, active_user = create_test_client_and_user("user_active_strengths", "active_strengths@nutrisnap.com")
    ref_date = date(2026, 10, 20)

    with Session(engine) as session:
        goal = session.exec(select(Goal).where(Goal.user_id == active_user.id)).first()
        assert goal is not None
        target_tdee = float(goal.tdee_calories)
        assert target_tdee > 0

        # Tạo chuỗi 6 ngày liên tiếp (đạt total_logged_days >= 5 và longest_streak >= 3)
        # Các bữa sáng đều đặn (bữa sáng >= 60%)
        # Lượng calo nạp khoảng ~ target_tdee (+/- 15%)
        for i in range(6):
            d = ref_date - timedelta(days=5 - i)
            dt_bf = datetime(d.year, d.month, d.day, 7, 0, tzinfo=UTC)
            dt_lu = datetime(d.year, d.month, d.day, 12, 0, tzinfo=UTC)
            dt_di = datetime(d.year, d.month, d.day, 18, 30, tzinfo=UTC)

            add_meal_helper(session, active_user.id, "breakfast", "Bánh mì ốp la", 200.0, dt_bf)
            add_meal_helper(session, active_user.id, "lunch", "Cơm tấm sườn nướng", 300.0, dt_lu)
            add_meal_helper(session, active_user.id, "dinner", "Phở bò tái", 350.0, dt_di)

        report_active = generate_monthly_report(
            session=session,
            authenticated_user_id=active_user.id,
            days=30,
            reference_date=ref_date,
        )

        strengths = report_active["strengths"]
        assert len(strengths) >= 2
        # Kiểm tra sự xuất hiện của các điểm mạnh quan trọng
        strengths_str = " ".join(strengths)
        assert "thói quen ghi nhật ký" in strengths_str
        assert "chuỗi" in strengths_str
        assert "ăn sáng đều đặn" in strengths_str


# ==============================================================================
# 7. TEST API GET MONTHLY REPORT ENDPOINT
# ==============================================================================


def test_api_get_monthly_report_endpoint():
    """Dùng TestClient gọi GET /api/v1/reports/monthly với phiên đăng nhập hợp lệ:

    - Kiểm tra HTTP 200.
    - Đầy đủ các khóa cấu trúc JSON: logging_summary, weight_summary, nutrition_summary,
      habit_summary, strengths, disclaimer.
    """
    client, _ = create_test_client_and_user("user_api_report", "api_report@nutrisnap.com")

    resp = client.get("/api/v1/reports/monthly?days=30")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert "logging_summary" in data
    assert "weight_summary" in data
    assert "nutrition_summary" in data
    assert "habit_summary" in data
    assert "strengths" in data
    assert "disclaimer" in data

    assert "total_logged_days" in data["logging_summary"]
    assert "avg_daily_calories" in data["nutrition_summary"]
    assert isinstance(data["strengths"], list)


# ==============================================================================
# 8. TEST API GET HABITS STATUS ENDPOINT
# ==============================================================================


def test_api_get_habits_status_endpoint():
    """Dùng TestClient gọi GET /api/v1/habits/status:

    - Kiểm tra HTTP 200.
    - Kiểm tra cấu trúc seven_day_challenge, streak và back_on_track.
    """
    client, user = create_test_client_and_user("user_api_habits", "api_habits@nutrisnap.com")

    resp = client.get("/api/v1/habits/status")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert "seven_day_challenge" in data
    assert "completed_days" in data["seven_day_challenge"]
    assert "progress_pct" in data["seven_day_challenge"]
    assert "badge_name" in data["seven_day_challenge"]

    assert "streak" in data
    assert "current_streak" in data["streak"]
    assert "longest_streak" in data["streak"]

    assert "back_on_track" in data
    assert "calorie_penalty_applied" in data["back_on_track"]
    assert data["back_on_track"]["calorie_penalty_applied"] is False

    with Session(engine) as session:
        direct = get_habit_tracker_summary(session, user.id)
        assert direct["current_streak"] == data["current_streak"]


# ==============================================================================
# 9. TEST ZERO TRUST DATA ISOLATION MONTHLY REPORT
# ==============================================================================


def test_zero_trust_data_isolation_monthly_report():
    """Kiểm tra User B gọi GET /api/v1/reports/monthly tuyệt đối không nhìn thấy:

    - Số ngày ghi nhật ký của User A.
    - Cân nặng hoặc bữa ăn của User A.
    """
    client_a, user_a = create_test_client_and_user("user_iso_a", "iso_a@nutrisnap.com")
    client_b, _user_b = create_test_client_and_user("user_iso_b", "iso_b@nutrisnap.com")

    with Session(engine) as session:
        # Xóa dữ liệu cũ của user_a và user_b nếu có
        for u in [user_a, _user_b]:
            for m in session.exec(select(Meal).where(Meal.user_id == u.id)).all():
                session.delete(m)
            for w in session.exec(select(WeightLog).where(WeightLog.user_id == u.id)).all():
                session.delete(w)
        session.commit()

        # User A ghi 5 ngày cân nặng và bữa ăn
        today = get_vn_today()
        for i in range(5):
            d = today - timedelta(days=i)
            dt = datetime(d.year, d.month, d.day, 12, 0, tzinfo=UTC)
            add_meal_helper(session, user_a.id, "lunch", "Cơm tấm sườn nướng", 250.0, dt)
            session.add(WeightLog(user_id=user_a.id, weight_kg=75.0 - i * 0.2, logged_date=d))
        session.commit()

    # User A gọi API và thấy 5 ngày
    resp_a = client_a.get("/api/v1/reports/monthly?days=30")
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    assert data_a["logging_summary"]["total_logged_days"] == 5
    assert data_a["weight_summary"]["records_count"] == 5
    assert data_a["weight_summary"]["start_weight_kg"] is not None

    # User B gọi API và KHÔNG THỂ nhìn thấy bất kỳ dữ liệu nào của User A
    resp_b = client_b.get("/api/v1/reports/monthly?days=30")
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    assert data_b["logging_summary"]["total_logged_days"] == 0
    assert data_b["weight_summary"]["records_count"] == 0
    assert data_b["weight_summary"]["start_weight_kg"] is None
    assert data_b["weight_summary"]["trend_direction"] == "insufficient_data"
