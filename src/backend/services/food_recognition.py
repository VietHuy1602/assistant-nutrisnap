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
from sqlmodel import Session, func, select

from src.ai.fuzzy_matcher import calculate_string_similarity, fuzzy_food_matcher
from src.ai.usda_matcher import usda_matcher
from src.ai.vision_recognition import (
    DishItem,
    VisionRecognitionResult,
    get_mock_fallback_dishes,
    load_image_bytes,
    recognize_dishes_from_image,
)
from src.backend.models import database
from src.backend.models.schema import FoodReference
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


NOT_FOOD_MESSAGE = "Đây không phải là món ăn, xin vui lòng chụp lại."
UNCLEAR_MESSAGE = (
    "Chưa nhận diện rõ món ăn trong ảnh. Bạn hãy chụp lại gần hơn, đủ sáng và thấy trọn đĩa ăn nhé."
)
SERVICE_ERROR_MESSAGE = (
    "Dịch vụ nhận diện AI đang bận hoặc mất kết nối. Vui lòng thử lại sau giây lát hoặc chọn món thủ công."
)


# Ngưỡng khớp tên món với CSDL chuẩn. Đủ chặt để không ghép nhầm (ví dụ "bì" thành "nước cam");
# món dưới ngưỡng sẽ dùng dinh dưỡng AI ước tính và được thêm vào CSDL.
DB_MATCH_THRESHOLD = 0.75
# Kiểm tra chiều ngược lại: tên trong CSDL cũng phải giống tên AI đưa ra, tránh ghép món phụ
# vào món chính chứa nó (ví dụ "Mỡ hành" bị ghép thành "Hàu nướng mỡ hành").
DB_REVERSE_MATCH_THRESHOLD = 0.6
# Độ tự tin tối thiểu để coi là AI thực sự nhìn thấy một món ăn trong ảnh
MIN_DISH_CONFIDENCE = 0.5


def save_new_food_reference(
    name: str,
    per_100g: dict[str, float],
    serving_g: float,
    serving_label: str,
) -> FoodReference | None:
    """Lưu món mới (chưa có trong CSDL) vào food_references, trả về bản ghi FoodReference.

    Nhờ vậy món của mọi nền ẩm thực đều có food_id để lưu bữa ăn, báo cáo và trợ lý dùng chung.
    Nếu món cùng tên đã tồn tại (ví dụ lần nhận diện trước) thì dùng lại bản ghi đó.
    """
    name = name.strip()[:200]
    try:
        with Session(database.engine) as session:
            existing = session.exec(
                select(FoodReference).where(func.lower(FoodReference.food_name) == name.lower())
            ).first()
            if existing:
                return existing
            ref = FoodReference(
                food_name=name,
                calories_per_100g=round(float(per_100g.get("kcal") or 0.0), 1),
                protein_per_100g=round(float(per_100g.get("protein") or 0.0), 1),
                carbs_per_100g=round(float(per_100g.get("carbs") or 0.0), 1),
                fat_per_100g=round(float(per_100g.get("fat") or 0.0), 1),
                avg_price_vnd=0,
                default_serving_g=round(float(serving_g), 1),
                serving_label=serving_label,
            )
            session.add(ref)
            session.commit()
            session.refresh(ref)
    except Exception as exc:
        logger.warning("Không lưu được món mới '%s': %s", name, exc)
        return None

    fuzzy_food_matcher.register_food(
        {
            "id": ref.id,
            "food_name": ref.food_name,
            "calories_per_100g": ref.calories_per_100g,
            "protein_per_100g": ref.protein_per_100g,
            "carbs_per_100g": ref.carbs_per_100g,
            "fat_per_100g": ref.fat_per_100g,
            "avg_price_vnd": ref.avg_price_vnd,
        }
    )
    logger.info("Đã thêm món mới vào CSDL: %s (id=%s, nguồn=%s)", ref.food_name, ref.id, serving_label)
    return ref


def _item_from_reference(
    ref: FoodReference, gram: float, confidence: float, source: str
) -> RecognizedFoodItem:
    factor = gram / 100.0
    return RecognizedFoodItem(
        food_id=ref.id,
        food_name=ref.food_name,
        matched_name=ref.food_name,
        match_score=1.0,
        is_matched=True,
        estimated_gram=gram,
        estimated_calories=round(factor * ref.calories_per_100g, 1),
        protein_g=round(factor * ref.protein_per_100g, 1),
        carbs_g=round(factor * ref.carbs_per_100g, 1),
        fat_g=round(factor * ref.fat_per_100g, 1),
        confidence=confidence,
        nutrition_source=source,
    )


def _map_dish_to_item(dish: DishItem) -> RecognizedFoodItem:
    """Ánh xạ một món AI nhận diện sang dòng kết quả có dinh dưỡng, theo thứ tự ưu tiên:

    1. CSDL món Việt chuẩn (food_references).
    2. Bảng USDA FoodData Central (usda_foods) theo tên tiếng Anh.
    3. Dinh dưỡng/100g do AI ước tính.
    Món ở bước 2-3 được thêm vào food_references với tên tiếng Việt để lưu bữa ăn được.
    """
    calc = fuzzy_food_matcher.calculate_nutrition(
        dish_name=dish.dish_name,
        estimated_weight_gram=dish.estimated_weight_gram,
        confidence_score=dish.confidence_score,
        threshold=DB_MATCH_THRESHOLD,
    )
    if calc.is_matched and calc.matched_food_name and (
        calculate_string_similarity(calc.matched_food_name, dish.dish_name) >= DB_REVERSE_MATCH_THRESHOLD
    ):
        return RecognizedFoodItem(
            food_id=calc.food_id,
            food_name=calc.food_name,
            matched_name=calc.matched_food_name,
            match_score=calc.match_score,
            is_matched=True,
            estimated_gram=calc.estimated_gram,
            estimated_calories=calc.estimated_calories,
            protein_g=calc.protein_g,
            carbs_g=calc.carbs_g,
            fat_g=calc.fat_g,
            confidence=calc.confidence,
            nutrition_source="database",
        )

    usda = usda_matcher.match(dish.name_en)
    if usda is not None:
        ref = save_new_food_reference(
            dish.dish_name,
            {
                "kcal": usda.calories_per_100g,
                "protein": usda.protein_per_100g,
                "carbs": usda.carbs_per_100g,
                "fat": usda.fat_per_100g,
            },
            dish.estimated_weight_gram,
            f"USDA {usda.fdc_id}",
        )
        if ref is not None:
            return _item_from_reference(ref, calc.estimated_gram, calc.confidence, "usda")

    if dish.has_ai_nutrition:
        ref = save_new_food_reference(
            dish.dish_name,
            {
                "kcal": dish.calories_per_100g,
                "protein": dish.protein_per_100g,
                "carbs": dish.carbs_per_100g,
                "fat": dish.fat_per_100g,
            },
            dish.estimated_weight_gram,
            "AI ước tính",
        )
        if ref is not None:
            return _item_from_reference(ref, calc.estimated_gram, calc.confidence, "ai_estimate")

    # Không có dinh dưỡng tham khảo: vẫn hiển thị món để người dùng chọn lại từ CSDL
    return RecognizedFoodItem(
        food_id=None,
        food_name=dish.dish_name,
        match_score=calc.match_score,
        is_matched=False,
        estimated_gram=calc.estimated_gram,
        confidence=calc.confidence,
    )


def build_unrecognized_response(
    meal_type: str,
    reason: str,
    message: str,
    is_fallback: bool = False,
) -> RecognizeFoodResponse:
    """Phản hồi khi không có món nào để xác nhận (không trả món mẫu giả)."""
    return RecognizeFoodResponse(
        success=True,
        status="unrecognized",
        meal_type=meal_type,
        detected_items=[],
        total_estimated_calories=0.0,
        is_fallback=is_fallback,
        message=message,
        reason=reason,
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
            return build_unrecognized_response(meal_type, "unclear", UNCLEAR_MESSAGE)
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
            # Báo lỗi thật cho người dùng thay vì hiển thị món mẫu không có trong ảnh
            return build_unrecognized_response(meal_type, "service_error", SERVICE_ERROR_MESSAGE, is_fallback=True)
        raise

    # Không phải món ăn, hoặc AI không thấy món nào đủ tin cậy (>= 50%): yêu cầu chụp lại.
    # Kiểm tra trước khi ánh xạ để không thêm món đoán bừa vào CSDL.
    if not vision_result.is_food or not any(
        d.confidence_score >= MIN_DISH_CONFIDENCE for d in vision_result.dishes
    ):
        return build_unrecognized_response(meal_type, "not_food", NOT_FOOD_MESSAGE)

    # Ánh xạ Fuzzy Matching và tính toán dinh dưỡng
    items: list[RecognizedFoodItem] = []
    total_cal = 0.0

    for dish in vision_result.dishes:
        item = _map_dish_to_item(dish)
        total_cal += item.estimated_calories
        items.append(item)

    status_str = "pending_confirmation"

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
