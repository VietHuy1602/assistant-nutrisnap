"""
tests/unit/test_recognize_food_and_fuzzy.py
Bộ kiểm thử tự động (Unit & Integration Tests) cho Tuần 3 (W3):
1. Fuzzy Matching: Ánh xạ tên món ăn tiếng Việt vào CSDL food_references (có dấu, không dấu, viết tắt, sai chính tả nhẹ).
2. Tính toán dinh dưỡng tất định (Zero-Hallucination Math).
3. Tiện ích giải mã Base64 / Multipart ảnh.
4. Endpoint POST /api/v1/ai/recognize-food (Happy Path với mocked Vision).
5. Cơ chế Mock Fallback khi API/mạng gặp sự cố (Zero-Crash Demo Guarantee).
6. Tích hợp End-to-End luồng PoC: Từ nhận diện ảnh -> Ánh xạ CSDL -> Xác nhận lưu bữa ăn (Two-Step Confirmation).
"""

import base64
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.ai.fuzzy_matcher import (
    calculate_string_similarity,
    fuzzy_food_matcher,
    strip_vietnamese_accents,
)
from src.ai.vision_recognition import DishItem, VisionRecognitionResult
from src.backend.main import app
from src.backend.services.food_recognition import (
    decode_base64_image,
    get_fallback_recognition_response,
)

client = TestClient(app)

# Dữ liệu ảnh JPEG mẫu hợp lệ 1x1 pixel
SAMPLE_JPEG_BYTES = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00"
    b"\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19"
    b"\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9"
    b"=\x82\xc200\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f"
    b"\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02"
    b"\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"
)
SAMPLE_B64_IMAGE = base64.b64encode(SAMPLE_JPEG_BYTES).decode("utf-8")
SAMPLE_DATA_URI = f"data:image/jpeg;base64,{SAMPLE_B64_IMAGE}"


# ==============================================================================
# 1. KIỂM THỬ FUZZY MATCHING & CHUẨN HÓA TIẾNG VIỆT
# ==============================================================================


def test_strip_vietnamese_accents():
    """Kiểm tra loại bỏ dấu tiếng Việt chuẩn hóa, xử lý đ/Đ và chuyển chữ thường."""
    assert strip_vietnamese_accents("Phở Bò Tái") == "pho bo tai"
    assert strip_vietnamese_accents("Đậu hũ rán") == "dau hu ran"
    assert strip_vietnamese_accents("CƠM TẤM SƯỜN BÌ CHẢ") == "com tam suon bi cha"
    assert strip_vietnamese_accents("  Bánh Mì, Kẹp Thịt!  ") == "banh mi kep thit"


def test_calculate_string_similarity():
    """Kiểm tra hàm tính độ tương đồng chuỗi theo đặc thù ẩm thực Việt."""
    # Trùng khớp tuyệt đối
    assert calculate_string_similarity("Cơm trắng", "Cơm trắng") == 1.0

    # Trùng khớp không dấu
    assert calculate_string_similarity("com trang", "Cơm trắng") == 0.98

    # Chứa toàn bộ từ khóa
    score = calculate_string_similarity("pho bo", "Phở bò tái")
    assert score >= 0.85

    # Hai món khác nhau hoàn toàn
    diff_score = calculate_string_similarity("Gà rán", "Canh chua cá lóc")
    assert diff_score < 0.4


def test_fuzzy_matching_exact_dish():
    """Kiểm tra ánh xạ món ăn trùng khớp chính xác vào bảng food_references."""
    result = fuzzy_food_matcher.match_dish("Phở bò tái")
    assert result.is_matched is True
    assert result.matched_food_name == "Phở bò tái"
    assert result.food_id is not None
    assert result.match_score == 1.0
    assert result.calories_per_100g == 115.0
    assert result.protein_per_100g == 8.5


def test_fuzzy_matching_unaccented_dish():
    """Kiểm tra người dùng hoặc Vision trả về tên không dấu vẫn khớp chuẩn xác."""
    result = fuzzy_food_matcher.match_dish("com tam suon nuong")
    assert result.is_matched is True
    assert result.matched_food_name == "Cơm tấm sườn nướng"
    assert result.match_score >= 0.95
    assert result.calories_per_100g == 245.0


def test_fuzzy_matching_partial_name():
    """Kiểm tra tên món ăn viết gọn (ví dụ: 'Canh chua cá' thay vì 'Canh chua cá lóc')."""
    result = fuzzy_food_matcher.match_dish("Canh chua cá")
    assert result.is_matched is True
    assert "Canh chua" in (result.matched_food_name or "")
    assert result.match_score >= 0.7


def test_fuzzy_matching_below_threshold():
    """Kiểm tra món lạ / rác không có trong CSDL sẽ bị từ chối ánh xạ (is_matched=False)."""
    result = fuzzy_food_matcher.match_dish("Món ăn ngoài hành tinh xyz12345", threshold=0.5)
    assert result.is_matched is False
    assert result.food_id is None
    assert result.matched_food_name is None
    assert result.match_score < 0.5


def test_calculate_nutrition_deterministic():
    """Kiểm tra công thức đại số tất định: Calo = (gam / 100) * calories_per_100g."""
    # 400g Phở bò tái: 4 * 115 = 460.0 kcal, 4 * 8.5 = 34.0g protein
    calc = fuzzy_food_matcher.calculate_nutrition("Phở bò tái", 400.0, confidence_score=0.92)
    assert calc.food_name == "Phở bò tái"
    assert calc.estimated_gram == 400.0
    assert calc.estimated_calories == 460.0
    assert calc.protein_g == 34.0
    assert calc.carbs_g == 56.8
    assert calc.fat_g == 11.2
    assert calc.confidence == 0.92


# ==============================================================================
# 2. KIỂM THỬ TIỆN ÍCH BASE64 & SERVICE
# ==============================================================================


def test_decode_base64_data_uri():
    """Kiểm tra giải mã Base64 có tiền tố Data URI."""
    raw, mime = decode_base64_image(SAMPLE_DATA_URI)
    assert len(raw) > 0
    assert mime == "image/jpeg"


def test_decode_base64_raw():
    """Kiểm tra giải mã Base64 thô không có tiền tố."""
    raw, mime = decode_base64_image(SAMPLE_B64_IMAGE)
    assert len(raw) > 0
    assert mime == "image/jpeg"


def test_get_fallback_recognition_response():
    """Kiểm tra cấu trúc và tính toàn vẹn của dữ liệu Mock Fallback."""
    fallback = get_fallback_recognition_response(meal_type="dinner")
    assert fallback.success is True
    assert fallback.is_fallback is True
    assert fallback.status == "pending_confirmation"
    assert fallback.meal_type == "dinner"
    assert len(fallback.detected_items) >= 2
    assert fallback.total_estimated_calories > 0
    for item in fallback.detected_items:
        assert item.food_id is not None
        assert item.estimated_gram > 0
        assert item.estimated_calories > 0


# ==============================================================================
# 3. KIỂM THỬ ENDPOINT POST /api/v1/ai/recognize-food (HAPPY PATH)
# ==============================================================================


def test_recognize_food_endpoint_multipart_happy_path():
    """Kiểm tra gọi endpoint bằng cách Upload file qua multipart/form-data."""
    mock_vision_result = VisionRecognitionResult(
        dishes=[
            DishItem(
                dish_name="Cơm tấm sườn nướng",
                estimated_weight_gram=250.0,
                confidence_score=0.95,
            ),
            DishItem(
                dish_name="Canh chua cá lóc",
                estimated_weight_gram=150.0,
                confidence_score=0.90,
            ),
        ],
        is_mock=False,
    )

    with patch(
        "src.backend.services.food_recognition.recognize_dishes_from_image",
        return_value=mock_vision_result,
    ):
        response = client.post(
            "/api/v1/ai/recognize-food",
            files={"file": ("food.jpg", SAMPLE_JPEG_BYTES, "image/jpeg")},
            data={"meal_type": "lunch"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["status"] == "pending_confirmation"
        assert data["meal_type"] == "lunch"
        assert len(data["detected_items"]) == 2

        # Món 1: Cơm tấm sườn nướng 250g (2.5 * 245 = 612.5 kcal)
        item0 = data["detected_items"][0]
        assert item0["food_name"] == "Cơm tấm sườn nướng"
        assert item0["estimated_gram"] == 250.0
        assert item0["estimated_calories"] == 612.5
        assert item0["confidence"] == 0.95
        assert item0["is_matched"] is True

        # Món 2: Canh chua cá lóc 150g (1.5 * 65 = 97.5 kcal)
        item1 = data["detected_items"][1]
        assert item1["food_name"] == "Canh chua cá lóc"
        assert item1["estimated_gram"] == 150.0
        assert item1["estimated_calories"] == 97.5
        assert item1["confidence"] == 0.90

        # Tổng calo: 612.5 + 97.5 = 710.0 kcal
        assert data["total_estimated_calories"] == 710.0
        assert data["is_fallback"] is False


def test_recognize_food_endpoint_json_base64_happy_path():
    """Kiểm tra gọi endpoint bằng JSON payload chứa image_base64."""
    mock_vision_result = VisionRecognitionResult(
        dishes=[
            DishItem(
                dish_name="Phở bò tái",
                estimated_weight_gram=400.0,
                confidence_score=0.94,
            )
        ],
        is_mock=False,
    )

    with patch(
        "src.backend.services.food_recognition.recognize_dishes_from_image",
        return_value=mock_vision_result,
    ):
        response = client.post(
            "/api/v1/ai/recognize-food",
            json={"image_base64": SAMPLE_DATA_URI, "meal_type": "breakfast"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["meal_type"] == "breakfast"
        assert len(data["detected_items"]) == 1
        assert data["detected_items"][0]["food_name"] == "Phở bò tái"
        assert data["total_estimated_calories"] == 460.0


def test_recognize_food_alias_analyze_dish():
    """Kiểm tra bí danh endpoint /api/v1/ai/analyze-dish hoạt động đồng nhất."""
    response = client.post(
        "/api/v1/ai/analyze-dish",
        json={"image_base64": SAMPLE_DATA_URI, "meal_type": "dinner"},
    )
    assert response.status_code == 200
    assert response.json()["success"] is True


# ==============================================================================
# 4. KIỂM THỬ CƠ CHẾ MOCK FALLBACK (ZERO-CRASH DEMO GUARANTEE)
# ==============================================================================


def test_recognize_food_fallback_when_api_exception():
    """Kiểm tra khi Gemini API ném lỗi mạng/timeout, endpoint không crash (trả Fallback 200 OK)."""
    with patch(
        "src.backend.services.food_recognition.recognize_dishes_from_image",
        side_effect=RuntimeError("503 Service Unavailable / Network Timeout"),
    ):
        response = client.post(
            "/api/v1/ai/recognize-food",
            files={"file": ("food.jpg", SAMPLE_JPEG_BYTES, "image/jpeg")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["is_fallback"] is True
        # Không hiển thị món mẫu giả: báo lỗi dịch vụ để người dùng thử lại/chọn thủ công
        assert data["status"] == "unrecognized"
        assert data["reason"] == "service_error"
        assert data["detected_items"] == []


def test_recognize_food_rejects_non_food_image():
    """Ảnh không phải món ăn trả về reason='not_food' kèm thông báo chụp lại."""
    with patch(
        "src.backend.services.food_recognition.recognize_dishes_from_image",
        return_value=VisionRecognitionResult(dishes=[], is_food=False, not_food_reason="Ảnh chụp bàn phím"),
    ):
        response = client.post(
            "/api/v1/ai/recognize-food",
            files={"file": ("keyboard.jpg", SAMPLE_JPEG_BYTES, "image/jpeg")},
        )
    data = response.json()
    assert response.status_code == 200
    assert data["status"] == "unrecognized"
    assert data["reason"] == "not_food"
    assert "không phải là món ăn" in data["message"]
    assert data["detected_items"] == []


def test_recognize_food_fallback_when_no_image_provided():
    """Kiểm tra khi request rỗng không có ảnh, tự động trả Fallback an toàn."""
    response = client.post("/api/v1/ai/recognize-food", json={})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["status"] == "unrecognized"
    assert data["detected_items"] == []


# ==============================================================================
# 5. KIỂM THỬ TÍCH HỢP END-TO-END LUỒNG DEMO POC
# ==============================================================================


def test_end_to_end_poc_flow():
    """
    Kiểm thử tích hợp luồng PoC hoàn chỉnh:
    1. Đăng nhập người dùng qua /api/v1/auth/login để nhận HttpOnly Cookie.
    2. Chụp ảnh gửi lên /api/v1/ai/recognize-food -> nhận danh sách món ăn đã bóc tách và tính Calo.
    3. Người dùng xác nhận lưu bữa ăn qua /api/v1/meals/log (Two-Step Confirmation: is_confirmed=True).
    4. Kiểm tra bữa ăn được ghi nhận thành công với mã 201 Created.
    """
    # Bước 1: Đăng nhập
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "thanhdat", "password": "Password123"},
    )
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.cookies

    # Bước 2: Nhận diện ảnh qua AI & Fuzzy Matching
    mock_vision = VisionRecognitionResult(
        dishes=[
            DishItem(
                dish_name="Phở bò tái",
                estimated_weight_gram=400.0,
                confidence_score=0.96,
            )
        ],
        is_mock=False,
    )
    with patch(
        "src.backend.services.food_recognition.recognize_dishes_from_image",
        return_value=mock_vision,
    ):
        rec_resp = client.post(
            "/api/v1/ai/recognize-food",
            json={"image_base64": SAMPLE_DATA_URI, "meal_type": "lunch"},
        )
        assert rec_resp.status_code == 200
        rec_data = rec_resp.json()
        assert rec_data["status"] == "pending_confirmation"
        assert len(rec_data["detected_items"]) == 1

        detected_item = rec_data["detected_items"][0]
        assert detected_item["food_name"] == "Phở bò tái"
        food_id = detected_item["food_id"] or 1
        estimated_gram = detected_item["estimated_gram"]

    # Bước 3: Người dùng bấm [Xác nhận lưu] (is_confirmed=True)
    log_payload = {
        "meal_type": "lunch",
        "items": [
            {
                "food_id": food_id,
                "food_name": "Phở bò tái",
                "estimated_gram": estimated_gram,
            }
        ],
        "is_confirmed": True,
        "notes": "Ăn trưa sau giờ làm việc",
    }
    log_resp = client.post("/api/v1/meals/log", json=log_payload)
    assert log_resp.status_code == 201
    log_data = log_resp.json()
    assert log_data["success"] is True
    assert log_data["meal_id"] > 0
    assert log_data["total_calories"] == 460.0


def test_unknown_global_dish_uses_ai_nutrition_and_is_saved_to_catalog():
    """Món nước ngoài chưa có trong CSDL: dùng dinh dưỡng AI ước tính, thêm vào food_references để lưu được."""
    import uuid

    from sqlmodel import Session, select

    from src.backend.models.database import engine
    from src.backend.models.schema import FoodReference

    dish_name = f"Zqxw {uuid.uuid4().hex}"  # tên ngẫu nhiên, không khớp món nào trong CSDL
    vision = VisionRecognitionResult(
        dishes=[
            DishItem(
                dish_name=dish_name,
                estimated_weight_gram=200.0,
                confidence_score=0.9,
                calories_per_100g=150.0,
                protein_per_100g=8.0,
                carbs_per_100g=25.0,
                fat_per_100g=2.0,
            )
        ],
        is_mock=False,
    )
    with patch("src.backend.services.food_recognition.recognize_dishes_from_image", return_value=vision):
        response = client.post(
            "/api/v1/ai/recognize-food",
            files={"file": ("sushi.jpg", SAMPLE_JPEG_BYTES, "image/jpeg")},
        )
    item = response.json()["detected_items"][0]
    assert item["nutrition_source"] == "ai_estimate"
    assert item["food_id"] is not None
    assert item["estimated_calories"] == 300.0
    assert item["protein_g"] == 16.0

    with Session(engine) as session:
        ref = session.exec(select(FoodReference).where(FoodReference.food_name == dish_name)).first()
        assert ref is not None and ref.id == item["food_id"]
        session.delete(ref)
        session.commit()


def test_foreign_dish_uses_usda_nutrition_by_english_name():
    """Món nước ngoài không có trong CSDL món Việt: lấy dinh dưỡng chuẩn USDA theo tên tiếng Anh."""
    import uuid

    from sqlmodel import Session, select

    from src.ai.usda_matcher import usda_matcher
    from src.backend.models.database import engine, init_db
    from src.backend.models.schema import FoodReference, UsdaFood

    init_db()
    fdc_id = 990000000 + uuid.uuid4().int % 1000000
    with Session(engine) as session:
        session.add(
            UsdaFood(
                fdc_id=fdc_id, description="Qwzt pie, blueberry", source="fndds",
                calories_per_100g=250.0, protein_per_100g=3.0, carbs_per_100g=35.0, fat_per_100g=11.0,
            )
        )
        session.commit()
    usda_matcher.reload()

    dish_name = f"Bánh Qwzt việt quất {uuid.uuid4().hex[:6]}"
    vision = VisionRecognitionResult(
        dishes=[
            DishItem(
                dish_name=dish_name, name_en="Qwzt pie, blueberry", estimated_weight_gram=120.0,
                confidence_score=0.9, calories_per_100g=900.0, protein_per_100g=1.0,
            )
        ],
    )
    try:
        with patch("src.backend.services.food_recognition.recognize_dishes_from_image", return_value=vision):
            response = client.post(
                "/api/v1/ai/recognize-food",
                files={"file": ("pie.jpg", SAMPLE_JPEG_BYTES, "image/jpeg")},
            )
        item = response.json()["detected_items"][0]
        # Dùng số USDA (250 kcal/100g), không dùng số AI ước tính (900)
        assert item["nutrition_source"] == "usda"
        assert item["estimated_calories"] == 300.0
        assert item["food_id"] is not None
    finally:
        with Session(engine) as session:
            for obj in session.exec(select(FoodReference).where(FoodReference.food_name == dish_name)).all():
                session.delete(obj)
            obj = session.get(UsdaFood, fdc_id)
            if obj:
                session.delete(obj)
            session.commit()
        usda_matcher.reload()
