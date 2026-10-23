"""
tests/unit/test_w4_assistant_tools_and_chat.py
Bộ kiểm thử tự động toàn diện Tuần 4: 4 Hàm thực thi Tool Calling, Dispatcher Zero-Trust
và Dịch vụ lưu trữ/quản lý hội thoại bảo mật (chat_sessions & chat_messages).

Bao gồm 10 kịch bản kiểm thử:
1. test_01_exec_get_daily_nutrition_accuracy: Độ chính xác tính toán Calo/Macro và calo còn lại.
2. test_02_exec_log_meal_unconfirmed_preview_only: Xác nhận 2 bước - pending_confirmation không ghi DB.
3. test_03_exec_log_meal_confirmed_persists_db: Xác nhận 2 bước - is_confirmed=True ghi nguyên tử vào DB.
4. test_04_exec_recommend_meals_within_calo_and_budget: Lọc món Việt trong hạn mức calo và ngân sách VNĐ.
5. test_05_exec_get_progress_summary_ema_and_streak: Tính toán làm mịn xu hướng EMA và chuỗi ngày streak.
6. test_06_zero_trust_dispatcher_strips_forged_user_id: Dispatcher tước bỏ user_id ngoại lai do prompt injection.
7. test_07_chat_session_and_message_persistence: Tạo session, lưu các role (user/tool/assistant) và đọc lịch sử.
8. test_08_chat_history_limit_context_window: Giới hạn context window (limit=10) theo thứ tự thời gian tăng dần.
9. test_09_cross_user_chat_isolation_blocked: Ngăn chặn truy cập chéo session giữa User A và User B (PermissionError/403).
10. test_10_assistant_router_end_to_end_chat_and_confirm: Luồng API trọn vẹn Chat -> Action Card -> Execute Confirm -> Messages.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.backend.main import app
from src.backend.models.database import engine, init_db
from src.backend.models.schema import (
    FoodReference,
    Meal,
    MealItem,
    User,
    WeightLog,
    get_vn_today,
    utc_now,
)
from src.backend.services.assistant_tools import (
    create_or_get_chat_session,
    dispatch_tool_call,
    exec_get_daily_nutrition,
    exec_get_progress_summary,
    exec_log_meal,
    exec_recommend_meals,
    get_chat_history,
    save_chat_message,
)
from src.backend.services.auth_service import (
    create_access_token,
    register_with_initial_goal,
)
from src.backend.services.goal_service import GoalPlanInput


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    """Khởi tạo CSDL và đảm bảo bảng food_references có đủ dữ liệu tham chiếu."""
    init_db()
    with Session(engine) as session:
        count = len(session.exec(select(FoodReference)).all())
        if count < 30:
            from scripts.seed_food_references import seed_foods

            seed_foods()


def create_authenticated_client(username: str, email: str) -> tuple[TestClient, User]:
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


# ==============================================================================
# TEST 1: EXEC_GET_DAILY_NUTRITION_ACCURACY
# ==============================================================================


def test_01_exec_get_daily_nutrition_accuracy():
    """Kiểm tra exec_get_daily_nutrition tính đúng calo đã nạp, macro và calo còn lại."""
    _, user = create_authenticated_client("w4_user_01", "w4_user_01@example.com")

    with Session(engine) as session:
        # Ghi nhận 1 bữa ăn trưa: Cơm trắng (200g: 260 kcal, 5.4g protein) + Ức gà áp chảo (150g: 247.5 kcal, 46.5g protein)
        # Tổng calo = 507.5 kcal, tổng protein = 51.9g
        exec_log_meal(
            session=session,
            authenticated_user_id=user.id,  # type: ignore
            meal_type="Trưa",
            items_list=[
                {"food_name": "Cơm trắng", "estimated_gram": 200.0},
                {"food_name": "Ức gà áp chảo", "estimated_gram": 150.0},
            ],
            is_confirmed=True,
        )

        result = exec_get_daily_nutrition(
            session=session,
            authenticated_user_id=user.id,  # type: ignore
            date_str="today",
        )

        assert result["tool_name"] == "get_daily_nutrition"
        assert result["user_id"] == user.id
        assert result["consumed"]["calories"] == 507.5
        assert result["consumed"]["protein_g"] == 51.9
        assert result["remaining"]["calories"] == round(
            result["targets"]["calories"] - 507.5, 2
        )
        assert result["meals_count"] == 1
        assert "disclaimer" in result


# ==============================================================================
# TEST 2: EXEC_LOG_MEAL_UNCONFIRMED_PREVIEW_ONLY
# ==============================================================================


def test_02_exec_log_meal_unconfirmed_preview_only():
    """Kiểm tra exec_log_meal với is_confirmed=False: chỉ trả preview, không ghi DB."""
    _, user = create_authenticated_client("w4_user_02", "w4_user_02@example.com")

    with Session(engine) as session:
        # 400g Phở bò tái: 4 * 115 = 460.0 kcal
        result = exec_log_meal(
            session=session,
            authenticated_user_id=user.id,  # type: ignore
            meal_type="Sáng",
            items_list=[{"food_name": "Phở bò tái", "estimated_gram": 400.0}],
            is_confirmed=False,
        )

        assert result["status"] == "pending_confirmation"
        assert result["requires_confirmation"] is True
        assert result["meal_id"] is None
        assert result["nutrition"]["total_calories"] == 460.0
        assert result["action_card"]["type"] == "confirm_log_meal"
        assert result["action_card"]["status"] == "pending_user_action"

        # Kiểm tra CSDL không có bản ghi Meal nào
        meals_in_db = session.exec(
            select(Meal).where(Meal.user_id == user.id)
        ).all()
        assert len(meals_in_db) == 0


# ==============================================================================
# TEST 3: EXEC_LOG_MEAL_CONFIRMED_PERSISTS_DB
# ==============================================================================


def test_03_exec_log_meal_confirmed_persists_db():
    """Kiểm tra exec_log_meal với is_confirmed=True: ghi nguyên tử vào meals và meal_items."""
    _, user = create_authenticated_client("w4_user_03", "w4_user_03@example.com")

    with Session(engine) as session:
        result = exec_log_meal(
            session=session,
            authenticated_user_id=user.id,  # type: ignore
            meal_type="dinner",
            items_list=[{"food_name": "Phở bò tái", "estimated_gram": 400.0}],
            is_confirmed=True,
        )

        assert result["status"] == "logged"
        assert result["requires_confirmation"] is False
        assert isinstance(result["meal_id"], int)
        assert result["meal_id"] > 0
        assert result["meal_type"] == "Tối"

        # Kiểm tra CSDL có Meal và MealItem
        saved_meal = session.get(Meal, result["meal_id"])
        assert saved_meal is not None
        assert saved_meal.user_id == user.id
        assert saved_meal.meal_type == "Tối"

        items = session.exec(
            select(MealItem).where(MealItem.meal_id == saved_meal.id)
        ).all()
        assert len(items) == 1
        assert items[0].estimated_gram == 400.0


# ==============================================================================
# TEST 4: EXEC_RECOMMEND_MEALS_WITHIN_CALO_AND_BUDGET
# ==============================================================================


def test_04_exec_recommend_meals_within_calo_and_budget():
    """Kiểm tra exec_recommend_meals lọc đúng món Việt <= calo và <= ngân sách."""
    _, user = create_authenticated_client("w4_user_04", "w4_user_04@example.com")

    with Session(engine) as session:
        res = exec_recommend_meals(
            session=session,
            authenticated_user_id=user.id,  # type: ignore
            remaining_calories=500.0,
            budget_vnd=40000,
            meal_portion_gram=250.0,
            limit=5,
        )

        assert res["tool_name"] == "recommend_meals"
        assert len(res["recommendations"]) > 0
        for rec in res["recommendations"]:
            assert rec["estimated_calories"] <= 500.0
            assert rec["avg_price_vnd"] <= 40000
            assert "(USDA)" not in rec["food_name"]

        assert "disclaimer" in res


# ==============================================================================
# TEST 5: EXEC_GET_PROGRESS_SUMMARY_EMA_AND_STREAK
# ==============================================================================


def test_05_exec_get_progress_summary_ema_and_streak():
    """Kiểm tra exec_get_progress_summary tính đúng chuỗi ngày streak và EMA cân nặng."""
    _, user = create_authenticated_client("w4_user_05", "w4_user_05@example.com")
    today = get_vn_today()

    weights = [70.0, 69.5, 69.8, 69.2, 69.0]
    expected_ema: list[float] = []
    ema_current = weights[0]
    expected_ema.append(ema_current)
    for w in weights[1:]:
        ema_current = round(0.1 * w + 0.9 * ema_current, 2)
        expected_ema.append(ema_current)

    with Session(engine) as session:
        # Xóa bản ghi weight_logs khởi tạo từ registration để kiểm thử chính xác 5 ngày EMA
        for old_w in session.exec(select(WeightLog).where(WeightLog.user_id == user.id)).all():
            session.delete(old_w)
        session.commit()

        # Ghi nhận 5 ngày cân nặng và bữa ăn
        for idx, w in enumerate(weights):
            log_d = today - timedelta(days=4 - idx)
            w_log = WeightLog(user_id=user.id, weight_kg=w, logged_date=log_d)  # type: ignore
            session.add(w_log)

            meal = Meal(
                user_id=user.id,  # type: ignore
                meal_type="Trưa",
                logged_at=utc_now() - timedelta(days=4 - idx),
            )
            session.add(meal)
            session.flush()

            food = session.exec(select(FoodReference)).first()
            if food:
                session.add(
                    MealItem(
                        meal_id=meal.id,  # type: ignore
                        food_id=food.id,  # type: ignore
                        estimated_gram=100.0,
                        estimated_calories=food.calories_per_100g,
                    )
                )

        session.commit()

        summary = exec_get_progress_summary(
            session=session,
            authenticated_user_id=user.id,  # type: ignore
            days_range=7,
        )

        assert summary["logged_days_count"] == 5
        assert summary["total_meals_logged"] == 5
        assert summary["latest_ema_weight_kg"] == expected_ema[-1]
        assert summary["start_weight_kg"] == 70.0
        assert summary["latest_weight_kg"] == 69.0
        assert summary["weight_change_kg"] == -1.0


# ==============================================================================
# TEST 6: ZERO_TRUST_DISPATCHER_STRIPS_FORGED_USER_ID
# ==============================================================================


def test_06_zero_trust_dispatcher_strips_forged_user_id():
    """Kiểm tra dispatch_tool_call loại bỏ hoàn toàn user_id giả mạo do injection."""
    _, user_a = create_authenticated_client("w4_user_06", "w4_user_06@example.com")

    with Session(engine) as session:
        res = dispatch_tool_call(
            session=session,
            authenticated_user_id=user_a.id,  # type: ignore
            tool_name="get_daily_nutrition",
            tool_args={
                "user_id": 9999,
                "authenticated_user_id": 8888,
                "date_str": "today",
            },
        )

        assert res["user_id"] == user_a.id
        assert res["user_id"] != 9999


# ==============================================================================
# TEST 7: CHAT_SESSION_AND_MESSAGE_PERSISTENCE
# ==============================================================================


def test_07_chat_session_and_message_persistence():
    """Kiểm tra tạo phiên chat, lưu tin nhắn các vai trò và truy xuất lịch sử."""
    _, user = create_authenticated_client("w4_user_07", "w4_user_07@example.com")

    with Session(engine) as session:
        cs = create_or_get_chat_session(session, user.id)  # type: ignore
        assert cs.id is not None
        assert cs.user_id == user.id

        m1 = save_chat_message(
            session, user.id, cs.id, "user", "Hôm nay tôi ăn gì?"  # type: ignore
        )
        m2 = save_chat_message(
            session,
            user.id,  # type: ignore
            cs.id,
            "tool",
            "{'calories': 500}",
            tool_name="get_daily_nutrition",
        )
        m3 = save_chat_message(
            session, user.id, cs.id, "assistant", "Bạn đã nạp 500 kcal."  # type: ignore
        )

        history = get_chat_history(session, user.id, cs.id)  # type: ignore
        assert len(history) == 3
        assert history[0].id == m1.id
        assert history[0].sender_role == "user"
        assert history[1].id == m2.id
        assert history[1].tool_name == "get_daily_nutrition"
        assert history[2].id == m3.id
        assert history[2].sender_role == "assistant"


# ==============================================================================
# TEST 8: CHAT_HISTORY_LIMIT_CONTEXT_WINDOW
# ==============================================================================


def test_08_chat_history_limit_context_window():
    """Kiểm tra get_chat_history với limit=10 trả về đúng 10 tin nhắn mới nhất tăng dần."""
    _, user = create_authenticated_client("w4_user_08", "w4_user_08@example.com")

    with Session(engine) as session:
        cs = create_or_get_chat_session(session, user.id)  # type: ignore

        for i in range(15):
            save_chat_message(
                session,
                user.id,  # type: ignore
                cs.id,
                "user",
                f"Tin nhắn số {i}",
            )

        history = get_chat_history(session, user.id, cs.id, limit=10)  # type: ignore
        assert len(history) == 10
        assert history[0].content == "Tin nhắn số 5"
        assert history[-1].content == "Tin nhắn số 14"


# ==============================================================================
# TEST 9: CROSS_USER_CHAT_ISOLATION_BLOCKED
# ==============================================================================


def test_09_cross_user_chat_isolation_blocked():
    """Kiểm tra chặn truy cập chéo phiên hội thoại giữa User A và User B."""
    _, user_a = create_authenticated_client("w4_user_09a", "w4_user_09a@example.com")
    client_b, user_b = create_authenticated_client(
        "w4_user_09b", "w4_user_09b@example.com"
    )

    with Session(engine) as session:
        session_a = create_or_get_chat_session(session, user_a.id)  # type: ignore

        # User B cố tình đọc session_a -> ném PermissionError
        with pytest.raises(PermissionError):
            get_chat_history(session, user_b.id, session_a.id)  # type: ignore

        # User B cố tình ghi vào session_a -> ném PermissionError
        with pytest.raises(PermissionError):
            save_chat_message(session, user_b.id, session_a.id, "user", "Hack!")  # type: ignore

    # Qua API: Client B cố tình gọi API lấy messages của session_a -> HTTP 403 Forbidden
    resp = client_b.get(f"/api/v1/assistant/sessions/{session_a.id}/messages")
    assert resp.status_code == 403


# ==============================================================================
# TEST 10: ASSISTANT_ROUTER_END_TO_END_CHAT_AND_CONFIRM
# ==============================================================================


def test_10_assistant_router_end_to_end_chat_and_confirm():
    """Kiểm tra luồng API chat -> Action card (pending) -> execute (confirmed) -> messages."""
    client, _ = create_authenticated_client("w4_user_10", "w4_user_10@example.com")

    # 1. Gửi chat yêu cầu ghi món ăn
    chat_resp = client.post(
        "/api/v1/assistant/chat",
        json={"message": "Tôi vừa ăn phở bò"},
    )
    assert chat_resp.status_code == 200
    chat_data = chat_resp.json()
    assert chat_data["pending_confirmation"] is True
    assert chat_data["action_card"]["type"] == "confirm_log_meal"
    session_id = chat_data["session_id"]

    # 2. Người dùng nhấn nút Xác nhận trên thẻ Action Confirmation Card
    exec_resp = client.post(
        "/api/v1/assistant/tools/execute",
        json={
            "tool_name": "log_meal",
            "tool_args": {
                "meal_type": "lunch",
                "items": [{"food_name": "Phở bò tái", "estimated_gram": 400.0}],
                "is_confirmed": True,
            },
        },
    )
    assert exec_resp.status_code == 200
    exec_data = exec_resp.json()
    assert exec_data["status"] == "logged"
    assert exec_data["meal_id"] is not None

    # 3. Kiểm tra lịch sử hội thoại đã lưu đầy đủ tin nhắn
    msg_resp = client.get(f"/api/v1/assistant/sessions/{session_id}/messages")
    assert msg_resp.status_code == 200
    messages = msg_resp.json()
    assert len(messages) >= 2
    roles = [m["sender_role"] for m in messages]
    assert "user" in roles
    assert "assistant" in roles
