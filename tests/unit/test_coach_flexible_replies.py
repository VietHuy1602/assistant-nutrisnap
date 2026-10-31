"""
tests/unit/test_coach_flexible_replies.py
Hồi quy cho "coach riêng": câu hỏi tư vấn không bị regex hỏi lại chặn, lịch sử hội thoại
được gửi kèm cho Gemini, và câu trả lời có số liệu lệch được cho tự sửa một lần.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from sqlmodel import Session

from src.ai.guardrails import verify_number_consistency
from src.ai.orchestrator import AIOrchestrator, build_gemini_history, check_clarification_needed
from src.backend.models.database import engine
from tests.unit.test_ai_orchestrator import demo_test_user  # noqa: F401  (fixture)


@pytest.mark.parametrize(
    "message",
    [
        "tôi có nên ăn cơm vào buổi tối không?",
        "ăn phở buổi sáng có tốt không",
        "tại sao ăn bún nhiều lại dễ đói?",
        "giảm cân thì ăn cơm như thế nào?",
    ],
)
def test_advice_questions_are_not_hijacked_by_clarification(message: str):
    needs, _ = check_clarification_needed(message)
    assert needs is False


@pytest.mark.parametrize(
    "message",
    ["Ghi giúp tôi món phở", "Tôi vừa ăn cơm", "Ghi nhận tôi vừa ăn bún", "trưa nay mình ăn phở"],
)
def test_vague_meal_logging_still_asks_for_details(message: str):
    needs, _ = check_clarification_needed(message)
    assert needs is True


def test_history_is_converted_to_alternating_gemini_turns():
    history = [
        {"role": "assistant", "content": "Chào bạn!"},  # lượt model đầu bị bỏ
        {"role": "user", "content": "tập gym xong nên ăn gì?"},
        {"role": "assistant", "content": "Ức gà kèm khoai lang."},
        {"role": "assistant", "content": "Hoặc trứng luộc."},
        {"role": "system", "content": "bỏ qua"},
        {"role": "user", "content": "câu đang chờ"},  # lượt user cuối bị bỏ
    ]
    assert build_gemini_history(history) == [
        {"role": "user", "parts": ["tập gym xong nên ăn gì?"]},
        {"role": "model", "parts": ["Ức gà kèm khoai lang.\nHoặc trứng luộc."]},
    ]


def test_dates_in_reply_are_not_treated_as_hallucinated_numbers():
    ok, unverified = verify_number_consistency(
        "Hôm nay 31/10/2026 bạn còn 717 kcal ước tính.", {"remaining_calories": 717}
    )
    assert ok is True, unverified


def _text_response(text: str) -> SimpleNamespace:
    return SimpleNamespace(candidates=[SimpleNamespace(content=SimpleNamespace(parts=[]))], function_calls=None, text=text)


def _call_response(name: str, args: dict) -> SimpleNamespace:
    call = SimpleNamespace(name=name, args=args)
    part = SimpleNamespace(function_call=call)
    return SimpleNamespace(candidates=[SimpleNamespace(content=SimpleNamespace(parts=[part]))], function_calls=[call], text="")


def _run(orchestrator: AIOrchestrator, mock_model: MagicMock, user_id: int, message: str, history=None):
    with (
        patch.object(orchestrator, "_is_api_key_valid", return_value=True),
        patch.object(orchestrator, "_init_gemini_model", return_value=mock_model),
        Session(engine) as session,
    ):
        return orchestrator.process_message(session=session, user_id=user_id, message=message, chat_history=history)


def test_gemini_receives_history_and_free_form_reply_is_kept(demo_test_user: int):  # noqa: F811
    chat = MagicMock()
    chat.send_message.return_value = _text_response("Trước khi tập, một quả chuối là đủ năng lượng nhanh.")
    model = MagicMock()
    model.start_chat.return_value = chat

    history = [
        {"role": "user", "content": "tập gym xong nên ăn gì?"},
        {"role": "assistant", "content": "Ức gà kèm khoai lang nhé."},
    ]
    resp = _run(AIOrchestrator(api_key="mock_valid_api_key_12345"), model, demo_test_user, "vậy còn trước khi tập?", history)

    assert resp.engine == "llm"
    assert resp.reply == "Trước khi tập, một quả chuối là đủ năng lượng nhanh."
    sent_history = model.start_chat.call_args.kwargs["history"]
    assert [h["role"] for h in sent_history] == ["user", "model"]


def test_number_mismatch_gets_one_correction_instead_of_template(demo_test_user: int):  # noqa: F811
    chat = MagicMock()
    chat.send_message.side_effect = [
        _call_response("get_daily_nutrition", {"date_str": "today"}),
        _text_response("Bạn còn khoảng 98765 kcal ước tính."),
        _text_response("Bạn vẫn còn kha khá năng lượng cho bữa tối, ưu tiên món giàu đạm nhé."),
    ]
    model = MagicMock()
    model.start_chat.return_value = chat

    resp = _run(AIOrchestrator(api_key="mock_valid_api_key_12345"), model, demo_test_user, "hôm nay tôi còn bao nhiêu calo?")

    assert chat.send_message.call_count == 3
    assert resp.tool_called == "get_daily_nutrition"
    assert resp.reply == "Bạn vẫn còn kha khá năng lượng cho bữa tối, ưu tiên món giàu đạm nhé."


@pytest.mark.parametrize(
    ("tool_name", "args", "expected_key"),
    [
        ("get_habit_summary", {}, "current_streak"),
        ("get_monthly_report", {"days": 30}, "logging_summary"),
        ("get_eating_patterns", {"days_range": 14}, "status"),
    ],
)
def test_coach_can_read_habit_report_and_pattern_data(demo_test_user: int, tool_name: str, args: dict, expected_key: str):  # noqa: F811
    from src.backend.services.assistant_tools import dispatch_tool_call
    from src.backend.services.tool_context import ToolContext

    with Session(engine) as session:
        res = dispatch_tool_call(
            session=session,
            authenticated_user_id=ToolContext(authenticated_user_id=demo_test_user, caller="llm"),
            tool_name=tool_name,
            tool_args=args,
        )
    assert expected_key in res
    assert "error" not in res


def test_new_tools_reject_unknown_arguments(demo_test_user: int):  # noqa: F811
    from src.backend.services.assistant_tools import dispatch_tool_call
    from src.backend.services.tool_context import ToolContext

    with Session(engine) as session:
        res = dispatch_tool_call(
            session=session,
            authenticated_user_id=ToolContext(authenticated_user_id=demo_test_user, caller="llm"),
            tool_name="get_monthly_report",
            tool_args={"month": 13},
        )
    assert res["error"] == "invalid_arguments"


def test_parallel_function_calls_are_all_answered(demo_test_user: int):  # noqa: F811
    today = SimpleNamespace(name="get_daily_nutrition", args={"date_str": "today"})
    month = SimpleNamespace(name="get_monthly_report", args={"days": 30})
    both = SimpleNamespace(
        candidates=[SimpleNamespace(content=SimpleNamespace(parts=[]))], function_calls=[today, month], text=""
    )
    chat = MagicMock()
    chat.send_message.side_effect = [both, _text_response("Hôm nay bạn ăn ít hơn mức trung bình tháng.")]
    model = MagicMock()
    model.start_chat.return_value = chat

    resp = _run(AIOrchestrator(api_key="mock_valid_api_key_12345"), model, demo_test_user, "so sánh hôm nay với cả tháng")

    second_turn = chat.send_message.call_args_list[1].args[0]
    assert isinstance(second_turn, list) and len(second_turn) == 2
    assert resp.reply == "Hôm nay bạn ăn ít hơn mức trung bình tháng."


def test_empty_gemini_reply_is_retried_and_health_reports_fallback(demo_test_user: int):  # noqa: F811
    """Gemini trả rỗng: thử lại một lần; nếu vẫn rỗng thì dùng chế độ cơ bản và health báo fallback."""
    from src.ai import llm_client

    orchestrator = AIOrchestrator(api_key="mock_valid_api_key_12345")
    with (
        patch.object(orchestrator, "_is_api_key_valid", return_value=True),
        patch.object(orchestrator, "_run_gemini_pipeline", return_value=None) as pipeline,
        patch.object(llm_client, "check_gemini_live_health", return_value={"status": "online", "configured": True}),
        Session(engine) as session,
    ):
        resp = orchestrator.process_message(session=session, user_id=demo_test_user, message="What should I eat tonight?")
        assert pipeline.call_count == 2
        assert resp.is_fallback is True
        assert llm_client.get_llm_status()["status"] == "fallback"

        llm_client.record_chat_outcome(used_llm=True)
        assert llm_client.get_llm_status()["status"] == "online"
