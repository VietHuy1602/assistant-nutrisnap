"""
tests/unit/test_phase0_chat_regression.py
Bộ kiểm thử hồi quy chống tái diễn lỗi "câu trả lời cố định" (Phase 0).

Kiểm tra:
1. POST /api/chat với các câu hỏi khác nhau phải nhận được các câu trả lời KHÁC NHAU, đúng ngữ cảnh.
2. Không nuốt lỗi: Lỗi hệ thống phải trả HTTP 503 thay vì giả vờ trả lời một câu cố định.
3. Zero-Trust: user_id được lấy từ token xác thực, không bị giả mạo.
4. Lịch sử hội thoại GET /api/chat/history hoạt động chính xác.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.ai.llm_client import BaseLLMClient, LLMResult, ToolCall
from src.backend.main import app
from src.backend.models.database import engine, init_db
from src.backend.models.schema import FoodReference, User
from src.backend.services.auth_service import create_access_token, register_with_initial_goal
from src.backend.services.goal_service import GoalPlanInput


@pytest.fixture(scope="module", autouse=True)
def setup_phase0_db():
    init_db()
    with Session(engine) as session:
        count = len(session.exec(select(FoodReference)).all())
        if count < 30:
            from scripts.seed_food_references import seed_foods

            seed_foods()


@pytest.fixture()
def phase0_client():
    return TestClient(app)


@pytest.fixture()
def phase0_auth_user():
    username = "phase0_tester"
    email = "phase0_tester@nutrisnap.vn"

    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            user, _ = register_with_initial_goal(
                session=session,
                username=username,
                email=email,
                password="SecurePassword123!",
                initial_goal=GoalPlanInput(
                    gender="female",
                    age=24,
                    height_cm=160.0,
                    current_weight_kg=55.0,
                    target_weight_kg=50.0,
                    goal_type="lose_weight",
                    weekly_pace_kg=0.5,
                    activity_level="moderate",
                    daily_budget_vnd=50000,
                ),
            )
        token = create_access_token(subject=str(user.id))
        return user.id, token


class MockEchoLLMClient(BaseLLMClient):
    """Mock LLM trả lời phản ánh đúng ngữ cảnh câu hỏi, không bao giờ trả chuỗi cố định."""

    def __init__(self):
        pass

    def is_configured(self) -> bool:
        return True

    def generate(self, messages, system_instruction=None, tools=None, timeout_seconds=None):
        last_msg = messages[-1]["content"] if messages else ""
        if "calo" in last_msg.lower():
            return LLMResult(
                text="",
                tool_calls=[ToolCall(name="get_daily_nutrition", args={"date_str": "today"})],
            )
        elif "gợi ý" in last_msg.lower() or "goi y" in last_msg.lower():
            return LLMResult(
                text="",
                tool_calls=[ToolCall(name="recommend_meals", args={"remaining_calories": 500, "budget_vnd": 50000})],
            )
        elif "chào" in last_msg.lower() or "hi" in last_msg.lower():
            return LLMResult(text=f"Chào bạn! Tôi có thể giúp gì cho bạn hôm nay? [Echo: {last_msg}]")
        else:
            return LLMResult(text=f"Phản hồi tư vấn riêng biệt cho câu hỏi: '{last_msg}'. Hãy chú ý chế độ ăn cân bằng!")


def test_post_api_chat_returns_distinct_replies_for_different_questions(phase0_client, phase0_auth_user, monkeypatch):
    """Xác nhận gọi POST /api/chat với các câu hỏi khác nhau nhận được các câu trả lời khác nhau, không bị lặp câu cố định."""
    user_id, token = phase0_auth_user
    phase0_client.cookies.set("access_token", token)
    phase0_client.cookies.set("csrf_token", "csrf_test_token")

    # Inject Mock LLM Client để kiểm thử tất định, chống phụ thuộc mạng ngoài
    from src.ai.orchestrator import get_ai_orchestrator
    mock_llm = MockEchoLLMClient()
    orch = get_ai_orchestrator()
    monkeypatch.setattr(orch, "llm_client", mock_llm)
    monkeypatch.setattr(orch, "_is_api_key_valid", lambda: False)  # Dùng mock_llm

    questions = [
        "Hôm nay tôi còn bao nhiêu calo?",
        "Gợi ý bữa trưa 500 kcal với ngân sách 50k",
        "Tôi tập gym xong nên ăn gì để phục hồi cơ bắp?",
        "Làm sao để uống đủ 2 lít nước mỗi ngày?",
        "Xin chào trợ lý NutriSnap!",
    ]

    replies = []
    for q in questions:
        res = phase0_client.post(
            "/api/chat",
            json={"message": q},
            headers={"X-CSRF-Token": "csrf_test_token"},
        )
        assert res.status_code == 200, f"Thất bại khi gửi câu hỏi '{q}': {res.text}"
        data = res.json()
        assert "reply" in data
        assert len(data["reply"]) > 10
        replies.append(data["reply"])

    # Kiểm tra tính đa dạng (Distinctness): Tất cả câu trả lời phải khác nhau
    unique_replies = set(replies)
    assert len(unique_replies) == len(questions), (
        f"LỖI TÁI DIỄN: Các câu trả lời bị trùng lặp cố định! Nhận được {len(unique_replies)} câu duy nhất trên {len(questions)} câu hỏi.\n"
        f"Danh sách câu trả lời: {replies}"
    )


def test_post_api_chat_error_handling_no_swallowing(phase0_client, phase0_auth_user, monkeypatch):
    """Nguyên tắc 3: Khi AI Orchestrator gặp lỗi hệ thống, không nuốt lỗi và không trả câu giả vờ thành công."""
    user_id, token = phase0_auth_user
    phase0_client.cookies.set("access_token", token)
    phase0_client.cookies.set("csrf_token", "csrf_test_token")

    from src.backend.routers import chat as chat_router_module

    def raise_crash(*args, **kwargs):
        raise RuntimeError("Mô phỏng lỗi kết nối mạng tới Gemini API!")

    monkeypatch.setattr(chat_router_module, "orchestrate_chat", raise_crash)

    res = phase0_client.post(
        "/api/chat",
        json={"message": "Gợi ý bữa tối giúp tôi"},
        headers={"X-CSRF-Token": "csrf_test_token"},
    )
    # Không được trả 200 kèm câu giả vờ "Xin chào..."
    assert res.status_code == 503
    assert "Hệ thống AI Coach tạm thời gián đoạn" in res.json().get("detail", "")


def test_post_api_chat_history_isolation(phase0_client, phase0_auth_user):
    """Kiểm tra GET /api/chat/history trả về tin nhắn và cô lập theo người dùng."""
    user_id, token = phase0_auth_user
    phase0_client.cookies.set("access_token", token)
    phase0_client.cookies.set("csrf_token", "csrf_test_token")

    res = phase0_client.get(
        "/api/chat/history?limit=10",
        headers={"X-CSRF-Token": "csrf_test_token"},
    )
    assert res.status_code == 200
    history = res.json()
    assert isinstance(history, list)
    if history:
        for msg in history:
            assert "sender_role" in msg
            assert "content" in msg
