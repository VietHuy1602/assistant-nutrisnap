"""Unit tests for NutriSnap Tool Calling definitions.

Run from repository root:
    python -m pytest tests/unit/test_tools.py -v
"""
from src.ai.tool_definitions import (
    NUTRISNAP_TOOLS,
    get_tool_definitions,
    get_tool_by_name,
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
        assert parameters["additionalProperties"] is False


def test_no_tool_schema_exposes_user_id():
    assert not _contains_user_id(get_tool_definitions())


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


def test_recommend_meals_requires_meal_type():
    tool = get_tool_by_name("recommend_meals")
    required = tool["function"]["parameters"]["required"]
    assert required == ["meal_type"]



def test_progress_summary_requires_period_in_current_schema():
    tool = get_tool_by_name("get_progress_summary")
    required = tool["function"]["parameters"]["required"]
    assert required == ["period"]
