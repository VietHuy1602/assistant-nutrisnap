"""Vision QA scaffold; no AI recognition is evaluated yet."""

import pytest


def calorie_mape_percent(predictions, references):
    if len(predictions) != len(references) or not references:
        raise ValueError("Prediction and reference arrays must be nonempty and equal-length")
    if any(value <= 0 for value in references):
        raise ValueError("Reference calories must be positive")
    return sum(abs(pred - ref) / ref for pred, ref in zip(predictions, references)) / len(references) * 100


def test_mape_zero_for_exact_predictions():
    assert calorie_mape_percent([200, 350], [200, 350]) == 0


def test_mape_known_example():
    assert calorie_mape_percent([110, 180], [100, 200]) == pytest.approx(10)


def test_mape_rejects_zero_reference():
    with pytest.raises(ValueError):
        calorie_mape_percent([100], [0])


def test_sample_meal_fixture(sample_meal):
    assert sample_meal["estimated_calories"] > 0
