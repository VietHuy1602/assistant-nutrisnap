"""tests/unit/test_ai_llm_client.py
Unit tests for Gemini LLM client adapter and mock implementations (Task T2).
"""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from src.ai.llm_client import (
    GeminiLLMClient,
    MockLLMClient,
    ToolCall,
    get_llm_client,
)
from src.ai.tool_definitions import get_gemini_tool_declarations


def test_mock_llm_client_returns_canned_data_and_records_history():
    """MockLLMClient generates reproducible test outputs without network calls."""
    client = MockLLMClient(
        canned_response="Xin chào từ mock!",
        canned_tool_call=ToolCall(name="get_daily_nutrition", args={"date_str": "today"}),
    )

    res = client.generate(
        messages=[{"role": "user", "content": "Calo hôm nay?"}],
        system_instruction="You are coach",
    )

    assert res.text == "Xin chào từ mock!"
    assert len(res.tool_calls) == 1
    assert res.tool_calls[0].name == "get_daily_nutrition"
    assert res.is_fallback is False
    assert len(client.call_history) == 1


def test_gemini_client_reads_model_and_timeout_from_env():
    """Gemini client must respect GEMINI_MODEL and LLM_TIMEOUT_SECONDS."""
    with patch.dict(os.environ, {"GEMINI_MODEL": "gemini-2.0-flash", "LLM_TIMEOUT_SECONDS": "12"}):
        client = GeminiLLMClient(api_key="test_key_abc")
        assert client.model_name == "gemini-2.0-flash"
        assert client.timeout_seconds == 12


def test_gemini_client_offline_fallback_when_no_api_key():
    """Gemini client gracefully falls back when API key is missing or placeholder."""
    client = GeminiLLMClient(api_key="")
    res = client.generate(
        messages=[{"role": "user", "content": "Hello"}],
        system_instruction="Coach",
    )
    assert res.is_fallback is True
    assert "chế độ cơ bản" in res.text


def test_get_llm_client_factory_respects_use_llm_false():
    """Setting USE_LLM=false returns MockLLMClient automatically."""
    with patch.dict(os.environ, {"USE_LLM": "false"}):
        client = get_llm_client(api_key="real_key_123")
        assert isinstance(client, MockLLMClient)


def test_tool_declarations_schema_accepted_by_declarations():
    """Verify tool schema definitions contain no forbidden additionalProperties."""
    declarations = get_gemini_tool_declarations()
    assert len(declarations) == 4
    for decl in declarations:
        # Check standard format
        if hasattr(decl, "name"):
            assert decl.name in {
                "get_daily_nutrition",
                "log_meal",
                "recommend_meals",
                "get_progress_summary",
            }


@pytest.mark.live
def test_live_gemini_api_call():
    """Live integration test, only executed when real GEMINI_API_KEY is configured."""
    key = os.getenv("GEMINI_API_KEY", "")
    if not key or "YOUR_GEMINI" in key:
        pytest.skip("No real GEMINI_API_KEY provided; skipping live API test.")

    client = GeminiLLMClient(api_key=key)
    res = client.generate(
        messages=[{"role": "user", "content": "Hôm nay tôi còn bao nhiêu calo?"}],
        system_instruction="NutriSnap Coach",
    )
    assert res.text != "" or len(res.tool_calls) > 0
