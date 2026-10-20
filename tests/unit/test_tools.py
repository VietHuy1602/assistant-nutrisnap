"""Tool Calling QA scaffold.

These tests check the test data and required tool inventory only.
Integration with src/ai/tool_definitions.py should be added once its API is confirmed.
"""

REQUIRED_TOOLS = (
    "get_daily_nutrition",
    "log_meal",
    "recommend_meals",
    "get_progress_summary",
)


def test_required_tool_names_are_unique():
    assert len(REQUIRED_TOOLS) == len(set(REQUIRED_TOOLS))


def test_required_tool_inventory():
    assert len(REQUIRED_TOOLS) == 4


def test_tool_selection_accuracy_formula():
    correct, total = 9, 10
    accuracy = correct / total * 100
    assert accuracy == 90
