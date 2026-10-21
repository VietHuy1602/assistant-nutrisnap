"""
src/backend/services/metrics.py
Module tính toán các chỉ số đánh giá thực nghiệm (Evaluation Metrics):
- MAPE (Mean Absolute Percentage Error) cho sai số Calo/Khẩu phần.
- MAE (Mean Absolute Error) cho sai số tuyệt đối.
- Tool Selection Accuracy cho độ chính xác phân loại công cụ AI.
"""


def calculate_mape(predictions: list[float], references: list[float]) -> float:
    """Tính toán sai số phần trăm tuyệt đối trung bình (MAPE - Mean Absolute Percentage Error).

    Công thức theo mục 4.6 trang 17:
    MAPE = (1 / M) * sum(|C_est - C_gt| / C_gt) * 100%
    """
    if len(predictions) != len(references) or not references:
        raise ValueError("Danh sách dự đoán và tham chiếu phải có độ dài bằng nhau và không được rỗng.")

    if any(val <= 0 for val in references):
        raise ValueError("Giá trị calo tham chiếu (ground-truth) phải lớn hơn 0 để tránh chia cho 0.")

    total_error = sum(abs(p - r) / r for p, r in zip(predictions, references, strict=True))
    return (total_error / len(references)) * 100.0


def calculate_mae(predictions: list[float], references: list[float]) -> float:
    """Tính toán sai số tuyệt đối trung bình (MAE - Mean Absolute Error).

    Công thức: MAE = (1 / M) * sum(|C_est - C_gt|) (kcal)
    """
    if len(predictions) != len(references) or not references:
        raise ValueError("Danh sách dự đoán và tham chiếu phải có độ dài bằng nhau và không được rỗng.")

    total_error = sum(abs(p - r) for p, r in zip(predictions, references, strict=True))
    return total_error / len(references)


def calculate_tool_accuracy(correct_calls: int, total_calls: int) -> float:
    """Tính toán tỷ lệ chọn đúng công cụ AI (Tool Selection Accuracy).

    Công thức theo mục 4.6 trang 17:
    Tool_Accuracy = (Số câu LLM gọi đúng tool và đúng tham số / N) * 100%
    """
    if total_calls <= 0:
        raise ValueError("Tổng số lượt gọi phải lớn hơn 0.")
    if correct_calls < 0 or correct_calls > total_calls:
        raise ValueError("Số lượt gọi đúng phải nằm trong khoảng từ 0 đến total_calls.")

    return (correct_calls / total_calls) * 100.0
