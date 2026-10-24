"""W6 security regression tests using mocked sessions; no real database access."""
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.backend.services import assistant_tools
from src.backend.services.tool_security import (
    sanitize_llm_tool_arguments,
    verify_meal_ownership,
    verify_session_ownership,
)


def test_sanitizer_removes_sensitive_keys_recursively_and_case_insensitively():
    raw = {
        "date_str": "today",
        "user_id": 202,
        "nested": {"OWNER_ID": 303, "safe": "ok"},
        "items": [{"account_id": 404, "food_name": "rice"}],
        "IS_ADMIN": True,
    }
    assert sanitize_llm_tool_arguments(raw) == {
        "date_str": "today",
        "nested": {"safe": "ok"},
        "items": [{"food_name": "rice"}],
    }


def test_dispatch_uses_authenticated_user_not_user_id_from_tool_args(monkeypatch):
    called = {}
    def fake_exec(**kwargs):
        called.update(kwargs)
        return {"ok": True}
    monkeypatch.setattr(assistant_tools, "exec_get_daily_nutrition", fake_exec)

    result = assistant_tools.dispatch_tool_call(
        session=Mock(),
        authenticated_user_id=11,
        tool_name="get_daily_nutrition",
        tool_args={"user_id": 22, "authenticated_user_id": 22, "date_str": "today"},
    )
    assert result == {"ok": True}
    assert called["authenticated_user_id"] == 11
    assert "user_id" not in called


def test_session_ownership_allows_owner():
    session = Mock()
    session.get.return_value = SimpleNamespace(id=5, user_id=11)
    assert verify_session_ownership(session, 5, 11) is True


def test_session_ownership_denies_other_user_without_disclosing_data():
    session = Mock()
    session.get.return_value = SimpleNamespace(id=5, user_id=22)
    assert verify_session_ownership(session, 5, 11) is False
    with pytest.raises(PermissionError):
        verify_session_ownership(session, 5, 11, raise_exception=True)


def test_session_ownership_returns_false_for_missing_session():
    session = Mock()
    session.get.return_value = None
    assert verify_session_ownership(session, 999, 11) is False


def test_meal_ownership_allows_owner():
    session = Mock()
    session.get.return_value = SimpleNamespace(id=7, user_id=11)
    assert verify_meal_ownership(session, 7, 11) is True


def test_meal_ownership_denies_other_user():
    session = Mock()
    session.get.return_value = SimpleNamespace(id=7, user_id=22)
    assert verify_meal_ownership(session, 7, 11) is False
    with pytest.raises(PermissionError):
        verify_meal_ownership(session, 7, 11, raise_exception=True)


def test_meal_ownership_returns_false_for_missing_meal():
    session = Mock()
    session.get.return_value = None
    assert verify_meal_ownership(session, 999, 11) is False
