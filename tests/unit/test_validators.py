"""
tests/unit/test_validators.py
Kiểm thử các hàm kiểm định dữ liệu và logic an toàn y tế (Responsible Health Logic).
"""

from src.backend.services.validators import (
    validate_email,
    validate_goal_pace,
    validate_password,
    validate_portion_gram,
)


def test_validate_goal_pace_lose_weight():
    # Hợp lệ trong khoảng [0.25, 0.75]
    ok, _ = validate_goal_pace(0.25, "lose_weight")
    assert ok is True
    ok, _ = validate_goal_pace(0.5, "lose_weight")
    assert ok is True
    ok, _ = validate_goal_pace(0.75, "lose_weight")
    assert ok is True

    # Không hợp lệ: dưới 0.25 (ví dụ 0.1) hoặc trên 0.75 (ví dụ 1.0)
    ok, msg = validate_goal_pace(0.1, "lose_weight")
    assert ok is False
    assert "0.25kg đến tối đa 0.75kg/tuần" in msg

    ok, msg = validate_goal_pace(1.0, "lose_weight")
    assert ok is False
    assert "0.25kg đến tối đa 0.75kg/tuần" in msg

    ok, _ = validate_goal_pace(-0.5, "lose_weight")
    assert ok is False


def test_validate_goal_pace_gain_muscle():
    # Hợp lệ trong khoảng [0.10, 0.50]
    ok, _ = validate_goal_pace(0.2, "gain_muscle")
    assert ok is True
    ok, _ = validate_goal_pace(0.5, "gain_muscle")
    assert ok is True

    # Quá giới hạn
    ok, _ = validate_goal_pace(0.05, "gain_muscle")
    assert ok is False
    ok, _ = validate_goal_pace(0.8, "gain_muscle")
    assert ok is False


def test_validate_goal_pace_maintain():
    ok, _ = validate_goal_pace(0.0, "maintain")
    assert ok is True

    ok, msg = validate_goal_pace(0.5, "maintain")
    assert ok is False
    assert "phải là 0 kg" in msg


def test_validate_goal_pace_invalid_goal_type():
    ok, msg = validate_goal_pace(0.5, "unknown_goal")
    assert ok is False
    assert "Loại mục tiêu không hợp lệ" in msg


def test_validate_email():
    assert validate_email("user@example.com") is True
    assert validate_email("invalid-email") is False
    assert validate_email("@domain.com") is False


def test_validate_password():
    ok, _ = validate_password("StrongPass123")
    assert ok is True

    ok, msg = validate_password("short1")
    assert ok is False
    assert "8 ký tự" in msg

    ok, msg = validate_password("allletters")
    assert ok is False
    assert "chữ số" in msg


def test_validate_portion_gram():
    assert validate_portion_gram(250.0)[0] is True
    assert validate_portion_gram(0.0)[0] is False
    assert validate_portion_gram(-10.0)[0] is False
    assert validate_portion_gram(5000.0)[0] is False
