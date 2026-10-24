"""tests/unit/test_ai_chat_flow.py
Unit tests for end-to-end chat orchestration flow, safety, and zero-trust tool execution (Tasks T1, T5, T6, T8).
"""

from __future__ import annotations

import pytest
from sqlmodel import Session, select

from src.ai.llm_client import MockLLMClient, ToolCall
from src.ai.orchestrator import AIOrchestrator, orchestrate_chat
from src.backend.models.database import engine, init_db
from src.backend.models.schema import FoodReference, Meal, User
from src.backend.services.assistant_tools import exec_get_daily_nutrition
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
def chat_test_user():
    """Tạo người dùng kiểm thử cho chat flow."""
    username = "chat_flow_user"
    email = "chat_flow_user@nutrisnap.vn"

    with Session(engine) as session:
        existing = session.exec(select(User).where(User.username == username)).first()
        if existing:
            return existing.id

        user, _ = register_with_initial_goal(
            session=session,
            username=username,
            email=email,
            password="ChatFlowPassword123!",
            initial_goal=GoalPlanInput(
                gender="male",
                age=25,
                height_cm=172.0,
                current_weight_kg=68.0,
                target_weight_kg=65.0,
                goal_type="lose_weight",
                weekly_pace_kg=0.5,
                activity_level="moderate",
                daily_budget_vnd=60000,
            ),
        )
        return user.id


def test_greetings_hi_and_hello_are_distinct_and_contain_no_unprompted_metrics(chat_test_user: int):
    """Greeting 'hi' and 'hello' return distinct friendly replies without nutritional numbers."""
    with Session(engine) as session:
        resp_hi = orchestrate_chat(
            session=session,
            user_id=chat_test_user,
            message="hi",
        )
        resp_hello = orchestrate_chat(
            session=session,
            user_id=chat_test_user,
            message="hello",
        )

    # Must not be identical
    assert resp_hi.reply != resp_hello.reply
    # Must not contain unprompted calorie metrics
    assert "kcal" not in resp_hi.reply.lower()
    assert "kcal" not in resp_hello.reply.lower()
    assert resp_hi.tool_called is None
    assert resp_hello.tool_called is None


def test_get_daily_nutrition_matches_backend_math(chat_test_user: int):
    """Querying daily nutrition activates get_daily_nutrition and matches exec_get_daily_nutrition."""
    with Session(engine) as session:
        # Run backend tool directly
        real_result = exec_get_daily_nutrition(
            session=session,
            authenticated_user_id=chat_test_user,
            date_str="today",
        )

        # Run via orchestrator
        resp = orchestrate_chat(
            session=session,
            user_id=chat_test_user,
            message="Hôm nay tôi còn bao nhiêu calo?",
        )

    assert resp.tool_called == "get_daily_nutrition"
    assert resp.tool_result is not None
    # Check numbers in reply match backend math
    expected_target = f"{real_result['target_calories']:.0f}"
    assert expected_target in resp.reply


def test_zero_trust_strips_forged_user_id_in_tool_call(chat_test_user: int):
    """When LLM returns tool_call with forged user_id=99999, system strips and enforces JWT authenticated_user_id."""
    forged_client = MockLLMClient(
        canned_tool_call=ToolCall(
            name="get_daily_nutrition",
            args={"user_id": 99999, "account_id": 88888, "date_str": "today"},
        ),
    )
    orch = AIOrchestrator(api_key="mock", llm_client=forged_client)

    with Session(engine) as session:
        resp = orch.process_message(
            session=session,
            user_id=chat_test_user,
            message="Xem calo của tôi",
        )

    assert resp.tool_called == "get_daily_nutrition"
    assert resp.tool_result["user_id"] == chat_test_user
    assert "user_id" not in resp.tool_args or resp.tool_args.get("user_id") != 99999


def test_log_meal_tool_call_enforces_pending_confirmation_only(chat_test_user: int):
    """LLM calling log_meal is forced to is_confirmed=False and never writes directly to DB."""
    # Count meals before
    with Session(engine) as session:
        meals_before = len(
            session.exec(select(Meal).where(Meal.user_id == chat_test_user)).all()
        )

    mock_client = MockLLMClient(
        canned_tool_call=ToolCall(
            name="log_meal",
            args={
                "meal_type": "lunch",
                "is_confirmed": True,  # Attacking or hallucinating confirmation
                "items": [{"food_name": "Phở bò tái", "estimated_gram": 400.0}],
            },
        )
    )
    orch = AIOrchestrator(api_key="mock", llm_client=mock_client)

    with Session(engine) as session:
        resp = orch.process_message(
            session=session,
            user_id=chat_test_user,
            message="Ghi nhận phở bò trưa nay",
        )

    assert resp.pending_confirmation is True
    assert resp.tool_args["is_confirmed"] is False

    # Verify no meal persisted to DB
    with Session(engine) as session:
        meals_after = len(
            session.exec(select(Meal).where(Meal.user_id == chat_test_user)).all()
        )
    assert meals_after == meals_before


def test_vague_meal_request_triggers_clarification_question(chat_test_user: int):
    """Vague request like 'ghi bữa ăn' triggers exactly one clarifying question without executing tool."""
    with Session(engine) as session:
        resp = orchestrate_chat(
            session=session,
            user_id=chat_test_user,
            message="ghi bữa ăn giúp mình",
        )

    assert resp.clarification_needed is True
    assert resp.tool_called is None
    assert "?" in resp.reply
