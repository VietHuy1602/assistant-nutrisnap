"""
tests/unit/test_vision_recognition.py
Bộ kiểm thử đơn vị tự động (Unit Tests) cho module Vision Recognition (src/ai/vision_recognition.py).
Xác thực toàn bộ các yêu cầu kỹ thuật của Tuần 2 (W2):
1. Ràng buộc Pydantic Schemas (dish_name không rỗng, weight > 0, confidence trong [0.0, 1.0]).
2. Tiện ích xử lý ảnh (Magic Bytes MIME type, xác thực file/bytes hợp lệ).
3. Parser JSON linh hoạt (hỗ trợ bóc tách Markdown ```json, kiểm thực lỗi cú pháp).
4. Khởi tạo Gemini Model và xử lý API Key bảo mật.
5. Cơ chế Mock Fallback dự phòng khi offline hoặc mất kết nối.
6. Mocking API Gemini để kiểm thử toàn diện luồng end-to-end.
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from src.ai.vision_recognition import (
    APIConnectionError,
    DishItem,
    FoodValidationError,
    InvalidImageError,
    VisionRecognitionResult,
    detect_image_mime,
    get_gemini_vision_model,
    get_mock_fallback_dishes,
    load_image_bytes,
    parse_and_validate_vision_json,
    recognize_dishes_from_image,
)

# ==============================================================================
# 1. KIỂM THỬ PYDANTIC SCHEMAS (DATA VALIDATION)
# ==============================================================================


def test_dish_item_valid():
    """Kiểm tra tạo DishItem hợp lệ với dữ liệu chuẩn."""
    dish = DishItem(
        dish_name="Phở bò tái",
        estimated_weight_gram=350.0,
        confidence_score=0.95,
    )
    assert dish.dish_name == "Phở bò tái"
    assert dish.estimated_weight_gram == 350.0
    assert dish.confidence_score == 0.95
    assert dish.estimated_gram == 350.0
    assert dish.confidence == 0.95


def test_dish_item_strips_whitespace():
    """Kiểm tra tự động cắt bỏ khoảng trắng thừa ở tên món ăn."""
    dish = DishItem(
        dish_name="  Cơm tấm sườn nướng  ",
        estimated_weight_gram=200.0,
        confidence_score=0.9,
    )
    assert dish.dish_name == "Cơm tấm sườn nướng"


def test_dish_item_rejects_empty_name():
    """Kiểm tra từ chối tên món ăn rỗng hoặc chỉ có khoảng trắng."""
    with pytest.raises((ValueError, pytest.PytestAssertRewriteWarning)):
        DishItem(
            dish_name="",
            estimated_weight_gram=150.0,
            confidence_score=0.9,
        )

    with pytest.raises(ValueError, match="không được để trống"):
        DishItem(
            dish_name="   ",
            estimated_weight_gram=150.0,
            confidence_score=0.9,
        )


def test_dish_item_rejects_zero_or_negative_weight():
    """Kiểm tra tuyệt đối từ chối khối lượng <= 0."""
    with pytest.raises(ValueError):
        DishItem(
            dish_name="Cơm trắng",
            estimated_weight_gram=0.0,
            confidence_score=0.8,
        )

    with pytest.raises(ValueError):
        DishItem(
            dish_name="Cơm trắng",
            estimated_weight_gram=-50.0,
            confidence_score=0.8,
        )


def test_dish_item_rejects_out_of_bounds_confidence():
    """Kiểm tra độ tự tin phải nằm trong đoạn [0.0, 1.0]."""
    with pytest.raises(ValueError):
        DishItem(
            dish_name="Canh chua",
            estimated_weight_gram=150.0,
            confidence_score=-0.1,
        )

    with pytest.raises(ValueError):
        DishItem(
            dish_name="Canh chua",
            estimated_weight_gram=150.0,
            confidence_score=1.05,
        )


def test_vision_recognition_result_to_dict():
    """Kiểm tra xuất cấu trúc dict theo đúng đặc tả JSON của W2."""
    result = VisionRecognitionResult(
        dishes=[
            DishItem(
                dish_name="Ức gà áp chảo",
                estimated_weight_gram=180.0,
                confidence_score=0.92,
            )
        ]
    )
    expected_dict = {
        "dishes": [
            {
                "dish_name": "Ức gà áp chảo",
                "estimated_weight_gram": 180.0,
                "confidence_score": 0.92,
            }
        ]
    }
    assert result.to_dict() == expected_dict

    # Kiểm tra xuất chuỗi JSON
    json_str = result.to_json()
    parsed = json.loads(json_str)
    assert parsed == expected_dict


# ==============================================================================
# 2. KIỂM THỬ XỬ LÝ ẢNH & MIME TYPE (IMAGE UTILS)
# ==============================================================================


def test_detect_image_mime_jpeg():
    """Kiểm tra nhận diện đúng ảnh JPEG từ Magic Bytes."""
    jpeg_header = b"\xff\xd8\xff\xe0\x00\x10JFIF"
    assert detect_image_mime(jpeg_header) == "image/jpeg"


def test_detect_image_mime_png():
    """Kiểm tra nhận diện đúng ảnh PNG từ Magic Bytes."""
    png_header = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    assert detect_image_mime(png_header) == "image/png"


def test_detect_image_mime_webp():
    """Kiểm tra nhận diện đúng ảnh WebP từ Magic Bytes."""
    webp_header = b"RIFF\x00\x00\x00\x00WEBPVP8 "
    assert detect_image_mime(webp_header) == "image/webp"


def test_detect_image_mime_extension_fallback():
    """Kiểm tra fallback theo phần mở rộng file khi bytes không đặc trưng."""
    dummy_bytes = b"plain text data"
    assert detect_image_mime(dummy_bytes, "dish.jpg") == "image/jpeg"
    assert detect_image_mime(dummy_bytes, "dish.png") == "image/png"
    assert detect_image_mime(dummy_bytes, "dish.webp") == "image/webp"


def test_load_image_bytes_from_bytes():
    """Kiểm tra nạp ảnh trực tiếp từ dữ liệu bytes."""
    valid_bytes = b"\xff\xd8\xff\xe0dummy_jpeg_data"
    data, mime = load_image_bytes(valid_bytes)
    assert data == valid_bytes
    assert mime == "image/jpeg"


def test_load_image_bytes_rejects_empty_bytes():
    """Kiểm tra từ chối dữ liệu bytes rỗng."""
    with pytest.raises(InvalidImageError, match="không được rỗng"):
        load_image_bytes(b"")


def test_load_image_bytes_from_file(tmp_path: Path):
    """Kiểm tra đọc ảnh thành công từ đường dẫn file trên đĩa."""
    dummy_file = tmp_path / "test_food.png"
    dummy_content = b"\x89PNG\r\n\x1a\nsample_data"
    dummy_file.write_bytes(dummy_content)

    data, mime = load_image_bytes(dummy_file)
    assert data == dummy_content
    assert mime == "image/png"

    # Thử nghiệm với kiểu chuỗi str
    data_str, mime_str = load_image_bytes(str(dummy_file))
    assert data_str == dummy_content
    assert mime_str == "image/png"


def test_load_image_bytes_nonexistent_file():
    """Kiểm tra báo lỗi khi file ảnh không tồn tại."""
    with pytest.raises(InvalidImageError, match="không tồn tại"):
        load_image_bytes("/non/existent/path/to/food.jpg")


def test_load_image_bytes_empty_file(tmp_path: Path):
    """Kiểm tra báo lỗi khi file ảnh có kích thước 0 byte."""
    empty_file = tmp_path / "empty.jpg"
    empty_file.write_bytes(b"")
    with pytest.raises(InvalidImageError, match="File ảnh rỗng"):
        load_image_bytes(empty_file)


# ==============================================================================
# 3. KIỂM THỬ BÓC TÁCH VÀ XÁC THỰC JSON (PARSER & VALIDATOR)
# ==============================================================================


def test_parse_valid_json():
    """Kiểm tra parse chuỗi JSON hợp lệ."""
    raw = json.dumps(
        {
            "dishes": [
                {
                    "dish_name": "Cơm tấm sườn nướng",
                    "estimated_weight_gram": 250.0,
                    "confidence_score": 0.94,
                },
                {
                    "dish_name": "Canh chua cá lóc",
                    "estimated_weight_gram": 180.0,
                    "confidence_score": 0.89,
                },
            ]
        }
    )
    result = parse_and_validate_vision_json(raw)
    assert len(result.dishes) == 2
    assert result.dishes[0].dish_name == "Cơm tấm sườn nướng"
    assert result.dishes[0].estimated_weight_gram == 250.0
    assert result.dishes[1].dish_name == "Canh chua cá lóc"
    assert result.is_mock is False


def test_parse_json_wrapped_in_markdown():
    """Kiểm tra tự động làm sạch code block markdown ```json ... ```."""
    raw = (
        "```json\n"
        "{\n"
        '  "dishes": [\n'
        '    {"dish_name": "Bún chả Hà Nội", "estimated_weight_gram": 300.0, "confidence_score": 0.91}\n'
        "  ]\n"
        "}\n"
        "```"
    )
    result = parse_and_validate_vision_json(raw)
    assert len(result.dishes) == 1
    assert result.dishes[0].dish_name == "Bún chả Hà Nội"


def test_parse_invalid_json_syntax():
    """Kiểm tra từ chối chuỗi không phải JSON cú pháp chuẩn."""
    with pytest.raises(FoodValidationError, match="không phải là chuỗi JSON"):
        parse_and_validate_vision_json("Đây không phải là JSON")


def test_parse_json_missing_dishes_key():
    """Kiểm tra từ chối JSON thiếu trường 'dishes'."""
    with pytest.raises(FoodValidationError, match="bắt buộc phải chứa mảng 'dishes'"):
        parse_and_validate_vision_json('{"items": []}')


def test_parse_json_invalid_dish_item():
    """Kiểm tra từ chối khi một món ăn vi phạm ràng buộc (số âm, tên rỗng,...)."""
    invalid_raw = json.dumps(
        {
            "dishes": [
                {
                    "dish_name": "Phở gà",
                    "estimated_weight_gram": -100.0,  # Lỗi: số âm
                    "confidence_score": 0.95,
                }
            ]
        }
    )
    with pytest.raises(FoodValidationError, match="không thỏa mãn ràng buộc dữ liệu"):
        parse_and_validate_vision_json(invalid_raw)


# ==============================================================================
# 4. KIỂM THỬ MOCK FALLBACK & KHỞI TẠO MODEL
# ==============================================================================


def test_get_mock_fallback_dishes():
    """Kiểm tra dữ liệu mẫu từ Mock Fallback luôn thỏa mãn ràng buộc chất lượng."""
    mock_res = get_mock_fallback_dishes()
    assert mock_res.is_mock is True
    assert len(mock_res.dishes) >= 2
    for dish in mock_res.dishes:
        assert len(dish.dish_name) > 0
        assert dish.estimated_weight_gram > 0
        assert 0.0 <= dish.confidence_score <= 1.0


def test_get_gemini_vision_model_rejects_missing_key():
    """Kiểm tra báo lỗi APIConnectionError khi thiếu API Key."""
    with patch.dict("os.environ", {"GEMINI_API_KEY": ""}, clear=True):
        with pytest.raises(APIConnectionError, match="Chưa cấu hình GEMINI_API_KEY"):
            get_gemini_vision_model(api_key=None)


def test_get_gemini_vision_model_accepts_valid_key():
    """Kiểm tra khởi tạo GenerativeModel thành công khi có API Key."""
    model = get_gemini_vision_model(api_key="AIzaSyDummyKeyForTestingPurposes12345")
    assert model is not None
    assert model.model_name == "models/gemini-1.5-flash"


# ==============================================================================
# 5. KIỂM THỬ LUỒNG TOÀN DIỆN (END-TO-END RECOGNIZE WITH MOCKS)
# ==============================================================================


def test_recognize_dishes_with_mock_fallback_when_no_key():
    """Kiểm tra khi không có API Key, tự động chuyển về Mock Fallback nếu cờ bật."""
    sample_bytes = b"\xff\xd8\xff\xe0dummy_food_image"
    with patch.dict("os.environ", {"GEMINI_API_KEY": ""}, clear=True):
        res = recognize_dishes_from_image(
            sample_bytes,
            api_key=None,
            use_mock_fallback=True,
        )
        assert res.is_mock is True
        assert len(res.dishes) > 0


def test_recognize_dishes_raises_when_no_key_and_fallback_disabled():
    """Kiểm tra khi không có API Key và tắt Mock Fallback, hệ thống ném ngoại lệ đúng quy chuẩn."""
    sample_bytes = b"\xff\xd8\xff\xe0dummy_food_image"
    with patch.dict("os.environ", {"GEMINI_API_KEY": ""}, clear=True):
        with pytest.raises(APIConnectionError):
            recognize_dishes_from_image(
                sample_bytes,
                api_key=None,
                use_mock_fallback=False,
            )


def test_recognize_dishes_successful_api_call():
    """Kiểm tra mô phỏng gọi API thành công và trả về kết quả chuẩn xác."""
    sample_bytes = b"\xff\xd8\xff\xe0sample_image_data"
    mock_response_json = json.dumps(
        {
            "dishes": [
                {
                    "dish_name": "Rau muống xào tỏi",
                    "estimated_weight_gram": 120.0,
                    "confidence_score": 0.93,
                },
                {
                    "dish_name": "Thịt heo luộc",
                    "estimated_weight_gram": 150.0,
                    "confidence_score": 0.89,
                },
            ]
        }
    )

    mock_gemini_model = MagicMock()
    mock_api_resp = MagicMock()
    mock_api_resp.text = mock_response_json
    mock_gemini_model.generate_content.return_value = mock_api_resp

    with patch(
        "src.ai.vision_recognition.get_gemini_vision_model",
        return_value=mock_gemini_model,
    ):
        result = recognize_dishes_from_image(
            image_input=sample_bytes,
            api_key="valid_dummy_key",
            use_mock_fallback=False,
        )

        assert result.is_mock is False
        assert len(result.dishes) == 2
        assert result.dishes[0].dish_name == "Rau muống xào tỏi"
        assert result.dishes[0].estimated_weight_gram == 120.0
        assert result.dishes[1].dish_name == "Thịt heo luộc"
        assert result.dishes[1].estimated_weight_gram == 150.0
        mock_gemini_model.generate_content.assert_called_once()


def test_recognize_dishes_api_failure_triggers_fallback():
    """Kiểm tra khi Vision API bị sự cố (timeout/mạng), tự động fallback sang kết quả mẫu."""
    sample_bytes = b"\xff\xd8\xff\xe0sample_image_data"
    mock_gemini_model = MagicMock()
    mock_gemini_model.generate_content.side_effect = RuntimeError(
        "503 Service Unavailable"
    )

    with patch(
        "src.ai.vision_recognition.get_gemini_vision_model",
        return_value=mock_gemini_model,
    ):
        result = recognize_dishes_from_image(
            image_input=sample_bytes,
            api_key="valid_dummy_key",
            use_mock_fallback=True,
        )
        assert result.is_mock is True
        assert len(result.dishes) > 0
