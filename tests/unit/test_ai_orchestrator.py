"""
tests/unit/test_ai_orchestrator.py
Bộ kiểm thử đơn vị toàn diện cho Module AI Orchestrator (src/ai/orchestrator.py) - Tuần 4 (Dòng 49).

Bao gồm 14 ca kiểm thử chuyên sâu:
1. test_01_user_profile_context_injection_existing_goal: Nạp đầy đủ hồ sơ thể trạng và mục tiêu từ CSDL.
2. test_02_user_profile_context_injection_default_fallback: Nạp hồ sơ mặc định an toàn y tế khi chưa có Goal.
3. test_03_system_instruction_contains_constructive_coach_and_metrics: Kiểm tra System Prompt vai trò Coach và chỉ số.
4. test_04_zero_trust_data_isolation: Khoá cứng authenticated user_id, chặn giả mạo user_id từ LLM/client.
5. test_05_dispatch_get_daily_nutrition_zero_hallucination: Tra cứu calo/macro thật từ DB, không tự bịa số liệu.
6. test_06_dispatch_recommend_meals_zero_hallucination: Gợi ý món từ food_references trong hạn mức calo và ngân sách.
7. test_07_dispatch_get_progress_summary_ema_and_streak: Tổng hợp tiến độ cân nặng EMA và số ngày duy trì streak.
8. test_08_log_meal_two_step_confirmation_preview: Ghi nhận bữa ăn ở chế độ xem trước (pending_confirmation=True).
9. test_09_clarification_on_vague_meal_statement: Cơ chế hỏi lại khi người dùng chỉ nói "vừa ăn tối xong".
10. test_10_clarification_on_ambiguous_dish_name: Cơ chế hỏi lại khi người dùng chỉ nói "ăn phở", "ăn cơm", "ăn bún".
11. test_11_clarification_on_unreasonable_portion_or_empty_items: Cơ chế hỏi lại khi số gam <= 0 hoặc > 3000g.
12. test_12_gemini_pipeline_with_mocked_llm_function_call: Mô phỏng LLM Function Calling, điều phối tool và tổng hợp số liệu.
13. test_13_offline_and_missing_api_key_zero_crash_fallback: Tự động chuyển Fallback khi thiếu/sai API Key, không văng lỗi.
14. test_14_orchestrate_chat_top_level_convenience_function: Kiểm tra hàm tiện ích orchestrate_chat hoạt động chuẩn xác.
"""

from unittest.mock import MagicMock, patch

import pytest
from sqlmodel import Session, select

from src.ai.orchestrator import (
    AIOrchestrator,
    UserProfileContext,
    build_system_instruction,
    check_clarification_needed,
    fetch_user_profile_context,
    get_ai_orchestrator,
    orchestrate_chat,
    synthesize_tool_output,
)
from src.backend.models.database import engine, init_db
from src.backend.models.schema import FoodReference, Goal, User
from src.backend.services.auth_service import register_with_initial_goal
from src.backend.services.goal_service import GoalPlanInput


@pytest.fixture(scope="module", autouse=True)
def setup_database_and_foods():
    """Đảm bảo CSDL được khởi tạo và có dữ liệu món ăn tham chiếu."""
    init_db()
    with Session(engine) as session:
        count = len(session.exec(select(FoodReference)).all())
        if count < 30:
            from scripts.seed_food_references import seed_foods

            seed_foods()


@pytest.fixture()
def demo_test_user():
    """Tạo người dùng kiểm thử có sẵn hồ sơ Goal hoàn chỉnh."""
    username = "orch_test_user"
    email = "orch_test_user@nutrisnap.vn"

    with Session(engine) as session:
        existing = session.exec(
            select(User).where((User.username == username) | (User.email == email))
        ).first()
        if existing:
            # Xóa các goal cũ
            old_goals = session.exec(select(Goal).where(Goal.user_id == existing.id)).all()
            for g in old_goals:
                session.delete(g)
            session.delete(existing)
            session.commit()

        user, goal = register_with_initial_goal(
            session=session,
            username=username,
            email=email,
            password="ValidPassword123",
            initial_goal=GoalPlanInput(
                gender="female",
                age=24,
                height_cm=162.0,
                current_weight_kg=56.0,
                target_weight_kg=52.0,
                goal_type="lose_weight",
                weekly_pace_kg=0.5,
                activity_level="moderate",
                daily_budget_vnd=55000,
            ),
        )
        return user.id


# ==============================================================================
# 1. USER PROFILE CONTEXT INJECTION TESTS
# ==============================================================================


def test_01_user_profile_context_injection_existing_goal(demo_test_user: int):
    """Nạp chính xác ngữ cảnh hồ sơ người dùng và mục tiêu cá nhân từ CSDL."""
    with Session(engine) as session:
        ctx = fetch_user_profile_context(session, demo_test_user)

    assert isinstance(ctx, UserProfileContext)
    assert ctx.user_id == demo_test_user
    assert ctx.gender == "female"
    assert ctx.age == 24
    assert ctx.height_cm == 162.0
    assert ctx.current_weight_kg == 56.0
    assert ctx.target_weight_kg == 52.0
    assert ctx.goal_type == "lose_weight"
    assert ctx.target_calories > 1200.0  # Rào chắn calo an toàn y tế
    assert ctx.target_protein_g > 0.0
    assert ctx.daily_budget_vnd == 55000


def test_02_user_profile_context_injection_default_fallback():
    """Người dùng chưa có Goal trong CSDL nhận hồ sơ mặc định an toàn mà không crash."""
    with Session(engine) as session:
        ctx = fetch_user_profile_context(session, user_id=999999)

    assert isinstance(ctx, UserProfileContext)
    assert ctx.user_id == 999999
    assert ctx.target_calories == 2000.0
    assert ctx.target_protein_g == 120.0
    assert ctx.daily_budget_vnd == 60000


def test_03_system_instruction_contains_constructive_coach_and_metrics(demo_test_user: int):
    """System Instruction định hình phong cách Huấn luyện viên mang tính xây dựng và tích hợp metrics."""
    with Session(engine) as session:
        ctx = fetch_user_profile_context(session, demo_test_user)

    instruction = build_system_instruction(ctx)

    assert "Constructive Nutrition Coach" in instruction
    assert "KHÔNG phán xét hay chỉ trích" in instruction
    assert "162.0 cm" in instruction
    assert "56.0 kg" in instruction
    assert "Giảm cân khoa học" in instruction
    assert "ZERO-HALLUCINATION" in instruction
    assert "CLARIFICATION HANDLING" in instruction
    assert str(demo_test_user) in instruction


# ==============================================================================
# 2. ZERO-TRUST & DATA ISOLATION TESTS
# ==============================================================================


def test_04_zero_trust_data_isolation(demo_test_user: int):
    """Orchestrator luôn khoá chặt authenticated user_id, loại bỏ user_id ngoại lai do LLM/client cố tình truyền vào."""
    orchestrator = AIOrchestrator(use_mock_fallback=True)

    with Session(engine) as session:
        # Client gửi explicit_tool_call kèm user_id giả mạo = 8888
        resp = orchestrator.process_message(
            session=session,
            user_id=demo_test_user,
            message="Xem dinh dưỡng",
            explicit_tool_call={
                "tool_name": "get_daily_nutrition",
                "tool_args": {"user_id": 8888, "date_str": "today"},
            },
        )

    assert resp.tool_called == "get_daily_nutrition"
    assert resp.tool_result is not None
    # user_id trong kết quả thực thi bắt buộc phải là demo_test_user, không phải 8888
    assert resp.tool_result["user_id"] == demo_test_user


# ==============================================================================
# 3. ZERO-HALLUCINATION TOOL DISPATCHING & SYNTHESIS TESTS
# ==============================================================================


def test_05_dispatch_get_daily_nutrition_zero_hallucination(demo_test_user: int):
    """Truy xuất dinh dưỡng trong ngày từ DB và tổng hợp số liệu thật 100% không ảo giác."""
    orchestrator = AIOrchestrator(use_mock_fallback=True)

    with Session(engine) as session:
        resp = orchestrator.process_message(
            session=session,
            user_id=demo_test_user,
            message="Hôm nay tôi đã nạp bao nhiêu calo rồi?",
        )

    assert resp.tool_called == "get_daily_nutrition"
    assert resp.tool_result is not None
    assert "consumed_calories" in resp.tool_result
    assert "target_calories" in resp.tool_result

    # Câu trả lời phải chứa đúng số calo mục tiêu và lượng đã nạp từ kết quả DB
    target_cal = f"{resp.tool_result['target_calories']:.0f}"
    consumed_cal = f"{resp.tool_result['consumed_calories']:.0f}"
    assert target_cal in resp.reply
    assert consumed_cal in resp.reply
    assert resp.disclaimer != ""


def test_06_dispatch_recommend_meals_zero_hallucination(demo_test_user: int):
    """Gợi ý món ăn lấy dữ liệu từ bảng food_references với số calo và giá tiền thật."""
    orchestrator = AIOrchestrator(use_mock_fallback=True)

    with Session(engine) as session:
        resp = orchestrator.process_message(
            session=session,
            user_id=demo_test_user,
            message="Gợi ý giúp mình món ăn trưa dưới 40k với",
        )

    assert resp.tool_called == "recommend_meals"
    assert resp.tool_result is not None
    assert "recommendations" in resp.tool_result
    recs = resp.tool_result["recommendations"]

    # Đảm bảo các món gợi ý nằm trong ngân sách và calo thực
    for r in recs:
        assert r["avg_price_vnd"] <= 50000
        assert r["food_name"] in resp.reply


def test_07_dispatch_get_progress_summary_ema_and_streak(demo_test_user: int):
    """Tổng hợp tiến độ 7 ngày gần nhất, tính chuỗi ngày streak và cân nặng làm mịn EMA."""
    orchestrator = AIOrchestrator(use_mock_fallback=True)

    with Session(engine) as session:
        resp = orchestrator.process_message(
            session=session,
            user_id=demo_test_user,
            message="Tổng hợp tiến độ và cân nặng của tôi trong 7 ngày qua",
        )

    assert resp.tool_called == "get_progress_summary"
    assert resp.tool_result is not None
    assert "logged_days_count" in resp.tool_result
    assert "avg_daily_calories" in resp.tool_result
    assert "7" in resp.reply or "ngày" in resp.reply


def test_08_log_meal_two_step_confirmation_preview(demo_test_user: int):
    """Khi người dùng yêu cầu ghi món ăn cụ thể, trả về bản xem trước (pending_confirmation=True)."""
    orchestrator = AIOrchestrator(use_mock_fallback=True)

    with Session(engine) as session:
        resp = orchestrator.process_message(
            session=session,
            user_id=demo_test_user,
            message="Tôi vừa ăn trưa phở bò tái khoảng 400g",
        )

    assert resp.tool_called == "log_meal"
    assert resp.pending_confirmation is True
    assert resp.action_card is not None
    assert resp.action_card["type"] == "confirm_log_meal"
    assert resp.action_card["status"] == "pending_user_action"
    assert "Xác nhận lưu" in resp.reply


# ==============================================================================
# 4. CLARIFICATION HANDLING TESTS (CƠ CHẾ HỎI LẠI KHI THÔNG TIN CHƯA RÕ)
# ==============================================================================


def test_09_clarification_on_vague_meal_statement(demo_test_user: int):
    """Khi người dùng chỉ nói 'Tôi vừa ăn tối xong', không được gọi log_meal mà phải hỏi lại."""
    orchestrator = AIOrchestrator(use_mock_fallback=True)

    with Session(engine) as session:
        resp = orchestrator.process_message(
            session=session,
            user_id=demo_test_user,
            message="Tôi vừa ăn tối xong",
        )

    assert resp.clarification_needed is True
    assert resp.tool_called is None  # Tuyệt đối không tự ý gọi log_meal
    assert "Bữa ăn vừa rồi của bạn gồm những món gì" in resp.reply


def test_10_clarification_on_ambiguous_dish_name(demo_test_user: int):
    """Khi người dùng nói 'Ghi giúp tôi món phở', hỏi lại cụ thể phở bò hay phở gà và khẩu phần."""
    orchestrator = AIOrchestrator(use_mock_fallback=True)

    # Test 10.1: Phở chung chung
    needs_clarify, clarify_msg = check_clarification_needed("Ghi giúp tôi món phở")
    assert needs_clarify is True
    assert "phở bò hay phở gà" in clarify_msg  # type: ignore

    with Session(engine) as session:
        resp = orchestrator.process_message(
            session=session,
            user_id=demo_test_user,
            message="Ghi giúp tôi món phở",
        )
    assert resp.clarification_needed is True
    assert resp.tool_called is None
    assert "phở bò hay phở gà" in resp.reply

    # Test 10.2: Cơm chung chung
    needs_cơm, msg_cơm = check_clarification_needed("Tôi vừa ăn cơm")
    assert needs_cơm is True
    assert "cơm với món gì" in msg_cơm  # type: ignore

    # Test 10.3: Bún chung chung
    needs_bún, msg_bún = check_clarification_needed("Ghi nhận tôi vừa ăn bún")
    assert needs_bún is True
    assert "bún gì" in msg_bún  # type: ignore


def test_11_clarification_on_unreasonable_portion_or_empty_items():
    """Phát hiện số gam phi lý (<= 0 hoặc > 3000g) hoặc tên món rỗng khi gọi tool."""
    # Khối lượng <= 0g
    needs_zero, msg_zero = check_clarification_needed(
        message="Ghi món ăn",
        tool_name="log_meal",
        tool_args={"items": [{"food_name": "Phở bò", "estimated_gram": 0}]},
    )
    assert needs_zero is True
    assert "lớn hơn 0g" in msg_zero  # type: ignore

    # Khối lượng > 3000g
    needs_huge, msg_huge = check_clarification_needed(
        message="Ghi món ăn",
        tool_name="log_meal",
        tool_args={"items": [{"food_name": "Cơm tấm", "estimated_gram": 5000}]},
    )
    assert needs_huge is True
    assert "hơi lớn" in msg_huge  # type: ignore

    # Danh sách items rỗng
    needs_empty, msg_empty = check_clarification_needed(
        message="Ghi món ăn",
        tool_name="log_meal",
        tool_args={"items": []},
    )
    assert needs_empty is True


# ==============================================================================
# 5. GEMINI API INTEGRATION & MOCK FALLBACK PIPELINE TESTS
# ==============================================================================


def test_12_gemini_pipeline_with_mocked_llm_function_call(demo_test_user: int):
    """Mô phỏng LLM Gemini SDK trả về Function Call: Orchestrator bóc tách và gọi backend tool an toàn."""
    orchestrator = AIOrchestrator(api_key="mock_valid_api_key_12345", use_mock_fallback=True)

    # Giả lập GenerativeModel và Candidate chứa FunctionCall
    mock_part = MagicMock()
    mock_part.function_call.name = "get_daily_nutrition"
    mock_part.function_call.args = {"date_str": "today"}

    mock_candidate = MagicMock()
    mock_candidate.content.parts = [mock_part]

    mock_response = MagicMock()
    mock_response.candidates = [mock_candidate]

    mock_chat = MagicMock()
    mock_chat.send_message.return_value = mock_response

    mock_model = MagicMock()
    mock_model.start_chat.return_value = mock_chat

    with (
        patch.object(orchestrator, "_is_api_key_valid", return_value=True),
        patch.object(orchestrator, "_init_gemini_model", return_value=mock_model),
        Session(engine) as session,
    ):
        resp = orchestrator.process_message(
            session=session,
            user_id=demo_test_user,
            message="Cho mình xem calo hôm nay",
        )

    assert resp.tool_called == "get_daily_nutrition"
    assert resp.tool_result is not None
    assert resp.is_fallback is False
    assert resp.tool_result["user_id"] == demo_test_user


def test_13_offline_and_missing_api_key_zero_crash_fallback(demo_test_user: int):
    """Khi không có API Key hoặc mất mạng, hệ thống tự động fallback mượt mà không crash (Zero-Crash)."""
    # Khởi tạo không có API key
    orchestrator = AIOrchestrator(api_key="", use_mock_fallback=True)
    assert orchestrator._is_api_key_valid() is False

    with Session(engine) as session:
        resp = orchestrator.process_message(
            session=session,
            user_id=demo_test_user,
            message="Hôm nay mình ăn bao nhiêu calo rồi?",
        )

    assert resp.is_fallback is True
    assert resp.tool_called == "get_daily_nutrition"
    assert resp.reply != ""


def test_14_orchestrate_chat_top_level_convenience_function(demo_test_user: int):
    """Kiểm tra hàm tiện ích orchestrate_chat cung cấp giao diện tích hợp dễ dàng cho Router."""
    with Session(engine) as session:
        resp = orchestrate_chat(
            session=session,
            user_id=demo_test_user,
            message="Gợi ý món ăn tối nay",
        )

    assert resp.tool_called == "recommend_meals"
    assert resp.tool_result is not None
    assert len(resp.reply) > 0

    singleton = get_ai_orchestrator()
    assert isinstance(singleton, AIOrchestrator)


def test_15_synthesize_tool_output_handles_over_calorie_constructively(demo_test_user: int):
    """Khi nạp vượt calo mục tiêu, Huấn luyện viên động viên nhẹ nhàng, tích cực, không phán xét."""
    with Session(engine) as session:
        ctx = fetch_user_profile_context(session, demo_test_user)

    fake_result = {
        "tool_name": "get_daily_nutrition",
        "consumed_calories": 2500.0,
        "target_calories": 2000.0,
        "remaining_calories": -500.0,
        "calories_progress_percent": 125.0,
        "meals_count": 3,
        "macros": {
            "protein": {"consumed_g": 130.0},
            "carbs": {"consumed_g": 260.0},
            "fat": {"consumed_g": 65.0},
        },
    }

    reply = synthesize_tool_output("get_daily_nutrition", fake_result, ctx)
    assert "Đừng lo lắng hay tự trách mình" in reply
    assert "2500" in reply
    assert "2000" in reply
