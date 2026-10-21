"""Unit tests for NutriSnap Tool Calling definitions.

Run from repository root:
    python -m pytest tests/unit/test_tools.py -v
"""
import google.generativeai as genai

from src.ai.tool_definitions import (
    NUTRISNAP_TOOLS,
    get_gemini_tool_declarations,
    get_tool_by_name,
    get_tool_definitions,
)

EXPECTED_TOOL_NAMES = {
    "get_daily_nutrition",
    "log_meal",
    "recommend_meals",
    "get_progress_summary",
}


def _contains_user_id(value):
    """Recursively detect user_id in schema keys."""
    if isinstance(value, dict):
        return any(
            key == "user_id" or _contains_user_id(child)
            for key, child in value.items()
        )
    if isinstance(value, list):
        return any(_contains_user_id(item) for item in value)
    return False


def test_all_four_tools_are_defined():
    names = [tool["function"]["name"] for tool in get_tool_definitions()]
    assert set(names) == EXPECTED_TOOL_NAMES
    assert len(names) == 4


def test_get_tool_definitions_returns_tool_list():
    assert get_tool_definitions() is NUTRISNAP_TOOLS
    assert isinstance(get_tool_definitions(), list)


def test_each_tool_has_function_parameters_schema():
    for tool in get_tool_definitions():
        assert tool["type"] == "function"
        function = tool["function"]
        assert isinstance(function["name"], str)
        assert isinstance(function["description"], str)
        assert function["description"].strip()
        parameters = function["parameters"]
        assert parameters["type"] == "object"
        assert isinstance(parameters["properties"], dict)


def test_no_tool_schema_exposes_user_id():
    assert not _contains_user_id(get_tool_definitions())
    assert not _contains_user_id(get_gemini_tool_declarations())


def test_get_tool_by_name_finds_each_tool():
    for name in EXPECTED_TOOL_NAMES:
        tool = get_tool_by_name(name)
        assert tool is not None
        assert tool["function"]["name"] == name


def test_get_tool_by_name_returns_none_for_unknown_tool():
    assert get_tool_by_name("unknown_tool") is None


def test_log_meal_requires_meal_type_and_items():
    tool = get_tool_by_name("log_meal")
    required = tool["function"]["parameters"]["required"]
    assert set(required) == {"meal_type", "items"}


def test_log_meal_supports_two_step_confirmation_flag():
    tool = get_tool_by_name("log_meal")
    props = tool["function"]["parameters"]["properties"]
    assert "is_confirmed" in props
    assert props["is_confirmed"]["type"] == "boolean"


def test_recommend_meals_requires_remaining_calories():
    tool = get_tool_by_name("recommend_meals")
    required = tool["function"]["parameters"]["required"]
    assert required == ["remaining_calories"]
    props = tool["function"]["parameters"]["properties"]
    assert "budget_vnd" in props
    # Đảm bảo không còn alias trùng lặp
    assert "max_calories" not in props
    assert "max_budget_vnd" not in props


def test_progress_summary_requires_days_range():
    tool = get_tool_by_name("get_progress_summary")
    required = tool["function"]["parameters"]["required"]
    assert required == ["days_range"]
    props = tool["function"]["parameters"]["properties"]
    assert props["days_range"]["type"] == "integer"


def test_gemini_tool_declarations_loadable_by_sdk():
    """Kiểm tra Gemini SDK chấp nhận 4 function declarations mà không văng lỗi additionalProperties."""
    gemini_tools = get_gemini_tool_declarations()
    assert len(gemini_tools) == 4
    for decl in gemini_tools:
        assert "name" in decl
        assert "parameters" in decl
        assert "additionalProperties" not in decl["parameters"]
        assert decl["parameters"]["type"] == "OBJECT"

    model = genai.GenerativeModel("gemini-1.5-flash", tools=gemini_tools)
    assert model._tools is not None
