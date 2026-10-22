"""Tests for NutriSnap's AI Vision meal-recognition module.

Run from the repository root:
    python -m pytest tests/test_vision_recognition.py -v

These tests do not call Gemini/OpenAI. They validate local input handling,
the response schema, and the offline mock result.
"""

import pytest

import src.ai.vision_recognition as vision

RecognizedFoodItem = vision.RecognizedFoodItem
VisionMealRecognitionResponse = vision.VisionMealRecognitionResponse
_generate_mock_recognition_result = vision._generate_mock_recognition_result
analyze_meal_image = vision.analyze_meal_image


def test_rejects_missing_image_input():
    """The function must require either image_path or image_bytes."""
    with pytest.raises(ValueError, match="image_path hoặc image_bytes"):
        analyze_meal_image()


def test_rejects_nonexistent_image_path(tmp_path):
    """A path that does not exist must fail clearly."""
    missing_path = tmp_path / "does_not_exist.jpg"

    with pytest.raises(FileNotFoundError, match="Không tìm thấy file ảnh"):
        analyze_meal_image(image_path=str(missing_path))


def test_recognized_food_item_rejects_confidence_below_zero():
    """Confidence must be between 0 and 1."""
    with pytest.raises(ValueError):
        RecognizedFoodItem(
            food_name="Cơm trắng",
            estimated_grams=150.0,
            confidence_score=-0.01,
        )


def test_recognized_food_item_rejects_confidence_above_one():
    """Confidence must be between 0 and 1."""
    with pytest.raises(ValueError):
        RecognizedFoodItem(
            food_name="Cơm trắng",
            estimated_grams=150.0,
            confidence_score=1.01,
        )


def test_mock_result_matches_response_schema():
    """Offline mock data should validate against the declared response schema."""
    result = _generate_mock_recognition_result()
    parsed = VisionMealRecognitionResponse.model_validate(result)

    assert parsed.meal_overview
    assert len(parsed.items) > 0
    assert all(item.food_name for item in parsed.items)
    assert all(0.0 <= item.confidence_score <= 1.0 for item in parsed.items)


def test_mock_total_grams_matches_sum_of_items():
    """Catch inconsistencies between the total and the item-level estimates."""
    result = _generate_mock_recognition_result()
    item_total = sum(item["estimated_grams"] for item in result["items"])

    assert result["total_estimated_grams"] == pytest.approx(item_total)


def test_mock_estimated_grams_are_nonnegative():
    """Food portion estimates must not be negative."""
    result = _generate_mock_recognition_result()

    assert all(item["estimated_grams"] >= 0 for item in result["items"])
    assert result["total_estimated_grams"] >= 0


def test_analyze_image_bytes_uses_mock_when_no_provider_key(monkeypatch):
    """When no SDK/key is configured, image bytes use the offline mock.

    SDK availability is disabled explicitly so this test is deterministic and
    does not make network requests.
    """
    import src.ai.vision_recognition as vision

    monkeypatch.setattr(vision, "HAS_GENAI", False)
    monkeypatch.setattr(vision, "HAS_OPENAI", False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    result = analyze_meal_image(image_bytes=b"fake-image-bytes")

    assert result["meal_overview"]
    assert isinstance(result["items"], list)
    assert result["total_estimated_grams"] > 0


def test_rejects_confidence_outside_range_when_validating_response():
    """The response schema must reject an item with an invalid confidence."""
    invalid_response = {
        "meal_overview": "Bữa ăn thử nghiệm",
        "items": [
            {
                "food_name": "Cơm trắng",
                "estimated_grams": 100.0,
                "confidence_score": 1.5,
            }
        ],
        "total_estimated_grams": 100.0,
    }

    with pytest.raises(ValueError):
        VisionMealRecognitionResponse.model_validate(invalid_response)
