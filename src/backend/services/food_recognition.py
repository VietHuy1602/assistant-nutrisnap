"""
src/backend/services/food_recognition.py
Service điều phối nhận diện món ăn (Food Recognition Service) cho Tuần 3 (W3).
Chuyên trách: Lê Hoàng Phú Hiếu (MSSV: 25127049 - Cặp 3: AI Intelligence & QA/Benchmarking).

Nhiệm vụ:
1. Tiếp nhận ảnh từ UploadFile (multipart) hoặc chuỗi Base64 (Data URI / raw).
2. Gọi module Vision Recognition (Gemini API / Mock Fallback) để bóc tách món ăn.
3. Chạy qua tầng Fuzzy Matching để nối tên món vào bảng food_references và tính toán Calo/Macro tất định.
4. Cơ chế Mock Fallback đảm bảo không bao giờ ném lỗi 500 khi mạng/API gặp sự cố trong buổi Demo PoC.
"""

from __future__ import annotations

import base64
import logging
import re
from pathlib import Path
from typing import Optional

from fastapi import UploadFile

from src.ai.fuzzy_matcher import fuzzy_food_matcher
from src.ai.vision_recognition import (
    VisionRecognitionResult,
    get_mock_fallback_dishes,
    load_image_bytes,
    recognize_dishes_from_image,
)
from src.backend.schemas.api_contract import (
    RESPONSIBLE_NUTRITION_DISCLAIMER,
    RecognizedFoodItem,
    RecognizeFoodResponse,
)

logger = logging.getLogger("nutrisnap.service.recognition")


def decode_base64_image(image_base64: str) -> tuple[bytes, str]:
    """
    Giải mã chuỗi Base64 (hỗ trợ cả Data URI dạng 'data:image/jpeg;base64,...' hoặc chuỗi base64 thô).
    Trả về (image_bytes, mime_type).
    """
    cleaned = image_base64.strip()
    mime_type = "image/jpeg"

    # Xử lý Data URI prefix nếu có
    match = re.match(r"^data:(image\/[a-zA-Z0-9\+\-\.]+);base64,(.+)$", cleaned, flags=re.DOTALL)
    if match:
        mime_type = match.group(1)
        raw_b64 = match.group(2).strip()
    else:
        raw_b64 = cleaned

    try:
        image_bytes = base64.b64decode(raw_b64)
        if not image_bytes:
            raise ValueError("Dữ liệu base64 giải mã ra 0 bytes.")
        return image_bytes, mime_type
    except Exception as e:
        raise ValueError(f"Chuỗi Base64 không hợp lệ: {e}") from e


def extract_image_bytes(
    file: Optional[UploadFile] = None,
    image_base64: Optional[str] = None,
) -> tuple[bytes, str]:
    """
    Trích xuất dữ liệu bytes từ UploadFile hoặc image_base64.
    """
    if file and file.filename:
        content = file.file.read()
        if not content:
            raise ValueError("File ảnh upload rỗng (0 bytes).")
        mime = file.content_type or "image/jpeg"
        return content, mime

    if image_base64 and image_base64.strip():
        return decode_base64_image(image_base64)

    raise ValueError("Vui lòng cung cấp file ảnh qua multipart form-data hoặc chuỗi image_base64.")


def get_fallback_recognition_response(meal_type: str = "lunch") -> RecognizeFoodResponse:
    """
    Tạo dữ liệu phản hồi mẫu chuẩn xác (Mock Fallback) cho buổi Demo PoC:
    Được tính toán dinh dưỡng đầy đủ từ bảng food_references.
    """
    mock_vision = get_mock_fallback_dishes()
    items: list[RecognizedFoodItem] = []
    total_cal = 0.0

    for dish in mock_vision.dishes:
        nutrition = fuzzy_food_matcher.calculate_nutrition(
            dish_name=dish.dish_name,
            estimated_weight_gram=dish.estimated_weight_gram,
            confidence_score=dish.confidence_score,
        )
        total_cal += nutrition.estimated_calories
        items.append(
            RecognizedFoodItem(
                food_id=nutrition.food_id,
                food_name=nutrition.food_name,
                matched_name=nutrition.matched_food_name,
                match_score=nutrition.match_score,
                is_matched=nutrition.is_matched,
                estimated_gram=nutrition.estimated_gram,
                estimated_calories=nutrition.estimated_calories,
                protein_g=nutrition.protein_g,
                carbs_g=nutrition.carbs_g,
                fat_g=nutrition.fat_g,
                confidence=nutrition.confidence,
            )
        )

    return RecognizeFoodResponse(
        success=True,
        status="pending_confirmation",
        meal_type=meal_type,
        detected_items=items,
        total_estimated_calories=round(total_cal, 1),
        is_fallback=True,
        message="Đã kích hoạt dữ liệu mẫu chuẩn (Mock Fallback) do chế độ dự phòng an toàn.",
        disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER,
    )


def recognize_food_pipeline(
    image_input: str | Path | bytes,
    meal_type: str = "lunch",
    api_key: Optional[str] = None,
    use_mock_fallback: bool = True,
) -> RecognizeFoodResponse:
    """
    Pipeline xử lý toàn diện nhận diện món ăn Tuần 3:
    1. Kiểm tra ảnh hợp lệ.
    2. Gọi Gemini Vision API (hoặc Mock Fallback).
    3. Ánh xạ từng món qua Fuzzy Matching với danh mục 500 món ăn Việt (food_references).
    4. Tính toán Calo/Macro tất định (Deterministic Nutrition Engine).
    5. Đóng gói kết quả theo hợp đồng REST API Contract.
    """
    try:
        # Kiểm tra tính hợp lệ của ảnh
        image_bytes, _ = load_image_bytes(image_input)
    except Exception as e:
        logger.warning(f"Lỗi kiểm tra ảnh đầu vào: {e}")
        if use_mock_fallback:
            return get_fallback_recognition_response(meal_type=meal_type)
        raise

    try:
        vision_result: VisionRecognitionResult = recognize_dishes_from_image(
            image_input=image_bytes,
            api_key=api_key,
            use_mock_fallback=use_mock_fallback,
        )
    except Exception as e:
        logger.error(f"Lỗi Vision Recognition API: {e}")
        if use_mock_fallback:
            return get_fallback_recognition_response(meal_type=meal_type)
        raise

    # Ánh xạ Fuzzy Matching và tính toán dinh dưỡng
    items: list[RecognizedFoodItem] = []
    total_cal = 0.0

    for dish in vision_result.dishes:
        calc = fuzzy_food_matcher.calculate_nutrition(
            dish_name=dish.dish_name,
            estimated_weight_gram=dish.estimated_weight_gram,
            confidence_score=dish.confidence_score,
        )
        total_cal += calc.estimated_calories
        items.append(
            RecognizedFoodItem(
                food_id=calc.food_id,
                food_name=calc.food_name,
                matched_name=calc.matched_food_name,
                match_score=calc.match_score,
                is_matched=calc.is_matched,
                estimated_gram=calc.estimated_gram,
                estimated_calories=calc.estimated_calories,
                protein_g=calc.protein_g,
                carbs_g=calc.carbs_g,
                fat_g=calc.fat_g,
                confidence=calc.confidence,
            )
        )

    # Đánh giá trạng thái tổng thể
    has_items = len(items) > 0
    all_low_confidence = has_items and all(item.confidence < 0.5 for item in items)
    status_str = "unrecognized" if (not has_items or all_low_confidence) else "pending_confirmation"

    return RecognizeFoodResponse(
        success=True,
        status=status_str,
        meal_type=meal_type,
        detected_items=items,
        total_estimated_calories=round(total_cal, 1),
        is_fallback=vision_result.is_mock,
        message="Nhận diện và ánh xạ món ăn thành công.",
        disclaimer=RESPONSIBLE_NUTRITION_DISCLAIMER,
    )
