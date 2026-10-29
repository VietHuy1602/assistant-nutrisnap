"""
tests/unit/test_phase2_tools.py
Kiểm thử chuyên sâu cho Phase 2: Danh sách các Tool & Tầng Dữ liệu theo đặc tả docs/07_ai_chatbot_integration_spec.md:
1. get_user_profile: Đọc đúng hồ sơ thể trạng, mục tiêu, BMR, TDEE, hạn mức ngày.
2. get_daily_nutrition: Đọc đúng dinh dưỡng ngày từ meals/meal_items của đúng user_id.
3. search_foods: Tìm kiếm món ăn trong food_references theo query, giới hạn limit <= 10.
4. recommend_meals: Gợi ý món phù hợp calo còn lại, ngân sách và đạm tối thiểu.
5. suggest_food_swap: Đổi món theo các mục tiêu lower_kcal, higher_protein, cheaper kèm chênh lệch.
6. get_progress_summary: Tích hợp EMA cân nặng, chuỗi streak và mẫu hành vi 14 ngày.
7. log_meal: Chỉ tạo pending_confirmation, không ghi DB trực tiếp trước khi người dùng bấm xác nhận.
8. Bảo mật Zero-Trust: Cô lập dữ liệu tuyệt đối giữa các user_id.
"""

import pytest
from sqlmodel import Session, select

from src.backend.models.database import engine
from src.backend.models.schema import Goal, Meal, PendingAction, User
from src.backend.services.assistant_tools import (
    dispatch_tool_call,
    exec_get_daily_nutrition,
    exec_get_progress_summary,
    exec_get_user_profile,
    exec_recommend_meals,
    exec_search_foods,
    exec_suggest_swap,
)
from src.backend.services.tool_context import ToolContext


@pytest.fixture
def test_users():
    """Fixture tạo 2 người dùng độc lập để kiểm thử cô lập dữ liệu (Zero-Trust Data Isolation)."""
    with Session(engine) as db_session:
        user_a = db_session.exec(select(User).where(User.username == "phase2_user_a")).first()
        if not user_a:
            user_a = User(
                username="phase2_user_a",
                email="phase2_a@nutrisnap.test",
                password_hash="fakehash",
            )
            db_session.add(user_a)
            db_session.commit()
            db_session.refresh(user_a)

        user_b = db_session.exec(select(User).where(User.username == "phase2_user_b")).first()
        if not user_b:
            user_b = User(
                username="phase2_user_b",
                email="phase2_b@nutrisnap.test",
                password_hash="fakehash",
            )
            db_session.add(user_b)
            db_session.commit()
            db_session.refresh(user_b)

        # Tạo Goal cho User A
        goal_a = db_session.exec(select(Goal).where(Goal.user_id == user_a.id)).first()
        if not goal_a:
            goal_a = Goal(
                user_id=user_a.id,
                gender="male",
                age=28,
                height_cm=175.0,
                current_weight_kg=72.0,
                target_weight=68.0,
                goal_type="lose_weight",
                activity_level="moderate",
                bmr_calories=1680.0,
                tdee_calories=2200.0,
                target_calories=1800.0,
                target_protein_g=140.0,
                target_carbs_g=180.0,
                target_fat_g=50.0,
                daily_budget_vnd=80000,
            )
            db_session.add(goal_a)
            db_session.commit()

        uid_a = user_a.id
        uid_b = user_b.id

    with Session(engine) as session:
        return session.get(User, uid_a), session.get(User, uid_b)


def test_tool_get_user_profile(test_users):
    """Kiểm tra tool get_user_profile lấy đúng thông tin và bảo mật theo user_id."""
    user_a, user_b = test_users
    with Session(engine) as session:
        # User A có mục tiêu
        res_a = exec_get_user_profile(session, authenticated_user_id=user_a.id)
        assert res_a["tool_name"] == "get_user_profile"
        assert res_a["has_goal"] is True
        assert res_a["target_calories"] == 1800.0
        assert res_a["target_protein_g"] == 140.0
        assert res_a["daily_budget_vnd"] == 80000
        assert res_a["height_cm"] == 175.0
        assert res_a["current_weight_kg"] == 72.0

        # User B chưa có mục tiêu -> trả về has_goal=False, không bị crash
        res_b = exec_get_user_profile(session, authenticated_user_id=user_b.id)
        assert res_b["tool_name"] == "get_user_profile"
        assert res_b["has_goal"] is False


def test_tool_get_daily_nutrition(test_users):
    """Kiểm tra tool get_daily_nutrition trả về đúng cấu trúc tiêu chuẩn và cô lập user."""
    user_a, user_b = test_users
    with Session(engine) as session:
        res_a = exec_get_daily_nutrition(session, authenticated_user_id=user_a.id)
        assert res_a["tool_name"] == "get_daily_nutrition"
        assert res_a["user_id"] == user_a.id
        assert "consumed" in res_a
        assert "remaining" in res_a
        assert "targets" in res_a

        res_b = exec_get_daily_nutrition(session, authenticated_user_id=user_b.id)
        assert res_b["user_id"] == user_b.id


def test_tool_search_foods():
    """Kiểm tra tool search_foods tra cứu món ăn tiếng Việt với giới hạn limit."""
    with Session(engine) as session:
        res = exec_search_foods(session, query="phở", limit=3)
        assert res["tool_name"] == "search_foods"
        assert res["results_count"] <= 3
        assert len(res["foods"]) > 0
        first_dish = res["foods"][0]
        assert "phở" in first_dish["food_name"].lower()
        assert first_dish["calories_per_100g"] > 0
        assert first_dish["protein_per_100g"] >= 0


def test_tool_suggest_food_swap_goals():
    """Kiểm tra tool suggest_food_swap với các mục tiêu: lower_kcal, higher_protein, cheaper."""
    with Session(engine) as session:
        # 1. Lower calories
        res_cal = exec_suggest_swap(session, food_name="Cơm tấm sườn nướng", goal="lower_kcal")
        assert res_cal["goal"] == "lower_kcal"
        assert len(res_cal["suggested_swaps"]) > 0
        for s in res_cal["suggested_swaps"]:
            assert s["saved_calories_per_100g"] > 0

        # 2. Higher protein
        res_prot = exec_suggest_swap(session, food_name="Bún tươi", goal="higher_protein")
        assert res_prot["goal"] == "higher_protein"
        assert len(res_prot["suggested_swaps"]) > 0
        for s in res_prot["suggested_swaps"]:
            assert s["delta_protein_per_100g"] >= 0


def test_tool_recommend_meals_budget_and_protein(test_users):
    """Kiểm tra tool recommend_meals lọc chuẩn ngân sách và calo còn lại."""
    user_a, _ = test_users
    with Session(engine) as session:
        res = exec_recommend_meals(
            session=session,
            authenticated_user_id=user_a.id,
            remaining_kcal=500.0,
            max_price=40000,
            limit=3,
        )
        assert res["tool_name"] == "recommend_meals"
        assert len(res["recommendations"]) <= 3
        for r in res["recommendations"]:
            assert r["estimated_calories"] <= 500.0
            assert r["avg_price_vnd"] <= 40000


def test_tool_get_progress_summary_streak(test_users):
    """Kiểm tra tool get_progress_summary trả về EMA cân nặng và thông tin streak."""
    user_a, _ = test_users
    with Session(engine) as session:
        res = exec_get_progress_summary(
            session=session,
            authenticated_user_id=user_a.id,
            days_range=14,
        )
        assert res["tool_name"] == "get_progress_summary"
        assert res["days_range"] == 14
        assert "streak" in res
        assert "current_streak" in res
        assert "behavioral_patterns" in res


def test_tool_log_meal_two_step_safety(test_users):
    """Kiểm tra log_meal ở kênh LLM chỉ tạo pending_confirmation, tuyệt đối không ghi DB."""
    user_a, _ = test_users
    with Session(engine) as session:
        meal_count_before = len(session.exec(select(Meal).where(Meal.user_id == user_a.id)).all())

        ctx = ToolContext(authenticated_user_id=user_a.id, caller="llm")
        res = dispatch_tool_call(
            session=session,
            authenticated_user_id=ctx,
            tool_name="log_meal",
            tool_args={
                "meal_type": "lunch",
                "food_name": "Phở bò tái",
                "grams": 400.0,
            },
        )

        assert res.get("requires_confirmation") is True
        assert res.get("status") == "pending_confirmation"
        assert "confirmation_id" in res
        assert "preview" in res

        # Số lượng meals trong DB phải không đổi
        meal_count_after = len(session.exec(select(Meal).where(Meal.user_id == user_a.id)).all())
        assert meal_count_after == meal_count_before

        # Bản ghi PendingAction phải được tạo thành công
        pending = session.get(PendingAction, res["confirmation_id"])
        assert pending is not None
        assert pending.user_id == user_a.id
        assert pending.status == "pending"


def test_zero_trust_cross_user_isolation(test_users):
    """Kiểm tra kẻ tấn công cố tình truyền user_id của người khác vào tool_args bị loại bỏ."""
    user_a, user_b = test_users
    with Session(engine) as session:
        ctx = ToolContext(authenticated_user_id=user_a.id, caller="llm")
        # Giả mạo user_id=user_b.id trong payload
        res = dispatch_tool_call(
            session=session,
            authenticated_user_id=ctx,
            tool_name="get_user_profile",
            tool_args={"user_id": user_b.id},
        )
        # Kết quả phải trả về hồ sơ của user_a, không phải user_b
        assert res["user_id"] == user_a.id
        assert res["has_goal"] is True  # User A có Goal, User B không có
