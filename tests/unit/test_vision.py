"""
tests/unit/test_vision.py
Kiểm thử tự động cho module đo lường sai số Vision & Tool Calling (src/backend/services/metrics.py).
Xác thực các công thức toán học MAPE, MAE theo mục 4.6 của Cẩm nang thực thi dự án.
"""

import pytest

from src.backend.services.metrics import (
    calculate_mae,
    calculate_mape,
    calculate_tool_accuracy,
)


def test_mape_zero_for_exact_predictions():
    """Kiểm tra MAPE = 0% khi giá trị dự đoán khớp tuyệt đối với tham chiếu."""
    assert calculate_mape([200.0, 350.0], [200.0, 350.0]) == 0.0


def test_mape_known_example():
    """Kiểm tra MAPE với ví dụ tính toán thực tế (10%)."""
    assert calculate_mape([110.0, 180.0], [100.0, 200.0]) == pytest.approx(10.0)


def test_mape_rejects_zero_or_negative_reference():
    """Kiểm tra từ chối chia cho 0 khi giá trị tham chiếu <= 0."""
    with pytest.raises(ValueError, match="lớn hơn 0"):
        calculate_mape([100.0], [0.0])
    with pytest.raises(ValueError, match="lớn hơn 0"):
        calculate_mape([100.0], [-50.0])


def test_mae_calculation():
    """Kiểm tra tính toán sai số tuyệt đối trung bình (MAE)."""
    # Món 1 lệch |110 - 100| = 10, Món 2 lệch |180 - 200| = 20 -> MAE = 15 kcal
    assert calculate_mae([110.0, 180.0], [100.0, 200.0]) == pytest.approx(15.0)


def test_tool_accuracy_calculation():
    """Kiểm tra tính toán Tool Selection Accuracy."""
    assert calculate_tool_accuracy(45, 50) == 90.0
    with pytest.raises(ValueError):
        calculate_tool_accuracy(55, 50)


def test_sample_meal_fixture(sample_meal):
    """Kiểm tra fixture dữ liệu mẫu."""
    assert sample_meal["estimated_calories"] > 0
