"""
src/ai/vision_recognition.py
Module nhận diện món ăn đa phương thức (Vision Recognition) từ ảnh đĩa ăn 2D.
Chuyên trách: Lê Hoàng Phú Hiếu (MSSV: 25127049 - Cặp 3: AI Intelligence & QA/Benchmarking).

Nhiệm vụ trọng tâm Tuần 2 (W2):
1. Nhận đầu vào là đường dẫn file ảnh (str/Path) hoặc dữ liệu bytes ảnh chụp đĩa thức ăn.
2. Gửi ảnh kèm System Prompt tối ưu hóa tới Gemini Vision API (gemini-1.5-flash / gemini-2.5-flash).
3. Ép kiểu đầu ra Structured Outputs / JSON Mode, parse và kiểm thực qua Pydantic v2.
4. Ràng buộc dữ liệu nghiêm ngặt:
   - dish_name: Chuỗi không rỗng, chuẩn hóa tiếng Việt để tra cứu trong vn_foods.csv.
   - estimated_weight_gram: Số thực dương (> 0), tuyệt đối không âm.
   - confidence_score: Số thực nằm trong khoảng [0.0, 1.0].
5. Tuân thủ nguyên tắc Zero-Hallucination Math: Tầng AI KHÔNG tự ý tính calo/macro.
6. Tích hợp cơ chế Mock Fallback dự phòng khi mất kết nối/chưa nạp API Key để luồng demo không gián đoạn.
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Optional, TypedDict

from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.ai.config import get_gemini_api_key

logger = logging.getLogger("nutrisnap.ai.vision")

# ==============================================================================
# 1. PYDANTIC SCHEMAS (DATA VALIDATION & CONTRACT ENFORCEMENT)
# ==============================================================================


class DishItem(BaseModel):
    """Mô hình dữ liệu cho từng món ăn nhận diện được từ đĩa ăn."""

    dish_name: str = Field(
        ...,
        min_length=1,
        description="Tên món ăn tiếng Việt chuẩn hóa để tra cứu trong food_references/vn_foods.csv",
    )
    estimated_weight_gram: float = Field(
        ...,
        gt=0.0,
        description="Khối lượng ước tính của món ăn tính theo gram (phải lớn hơn 0)",
    )
    confidence_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Độ tự tin của mô hình nhận diện trong khoảng [0.0, 1.0]",
    )

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    @field_validator("dish_name")
    @classmethod
    def validate_dish_name(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("dish_name không được để trống hoặc chỉ chứa khoảng trắng.")
        return s

    @field_validator("estimated_weight_gram")
    @classmethod
    def validate_weight(cls, v: float) -> float:
        if v <= 0:
            raise ValueError(
                f"estimated_weight_gram phải là số thực dương > 0, nhận được: {v}"
            )
        return round(float(v), 2)

    @field_validator("confidence_score")
    @classmethod
    def validate_confidence(cls, v: float) -> float:
        if not (0.0 <= v <= 1.0):
            raise ValueError(
                f"confidence_score phải nằm trong đoạn [0.0, 1.0], nhận được: {v}"
            )
        return round(float(v), 4)

    # Thuộc tính bí danh thuận tiện cho việc tích hợp Backend & Preview
    @property
    def estimated_gram(self) -> float:
        return self.estimated_weight_gram

    @property
    def confidence(self) -> float:
        return self.confidence_score


class VisionRecognitionResult(BaseModel):
    """Kết quả bóc tách món ăn từ ảnh theo chuẩn JSON yêu cầu."""

    dishes: list[DishItem] = Field(
        default_factory=list,
        description="Danh sách các món ăn nhận diện được trên đĩa",
    )
    is_mock: bool = Field(
        default=False,
        description="Đánh dấu kết quả sinh ra từ cơ chế Mock Fallback (dùng khi offline/lỗi mạng)",
    )
    raw_response: Optional[str] = Field(
        default=None,
        description="Chuỗi JSON phản hồi thô từ Vision API (nếu có)",
    )

    model_config = ConfigDict(extra="ignore")

    def to_dict(self) -> dict[str, Any]:
        """Xuất ra định dạng dictionary chuẩn khớp với đặc tả W2."""
        return {
            "dishes": [
                {
                    "dish_name": dish.dish_name,
                    "estimated_weight_gram": dish.estimated_weight_gram,
                    "confidence_score": dish.confidence_score,
                }
                for dish in self.dishes
            ]
        }

    def to_json(self, indent: int = 2) -> str:
        """Xuất ra chuỗi JSON định dạng chuẩn."""
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=indent)


# Schema TypedDict cho Gemini SDK (tránh lỗi protobuf minLength/gt)
class DishItemSchema(TypedDict):
    dish_name: str
    estimated_weight_gram: float
    confidence_score: float


class VisionRecognitionSchema(TypedDict):
    dishes: list[DishItemSchema]


# ==============================================================================
# 2. ĐỊNH NGHĨA NGOẠI LỆ (CUSTOM EXCEPTIONS)
# ==============================================================================


class VisionRecognitionError(Exception):
    """Lớp ngoại lệ cơ sở cho các lỗi phát sinh trong Vision Recognition."""

    pass


class InvalidImageError(VisionRecognitionError):
    """Ngoại lệ khi file ảnh không tồn tại, rỗng hoặc định dạng không hỗ trợ."""

    pass


class APIConnectionError(VisionRecognitionError):
    """Ngoại lệ khi gọi Vision API thất bại do mất mạng, hết quota, hoặc sai key."""

    pass


class FoodValidationError(VisionRecognitionError):
    """Ngoại lệ khi dữ liệu món ăn trả về không thỏa mãn ràng buộc dữ liệu."""

    pass


# ==============================================================================
# 3. PROMPT TỐI ƯU HÓA CHO GEMINI VISION API (VIETNAMESE CUISINE FOCUS)
# ==============================================================================

VISION_SYSTEM_INSTRUCTION = (
    "Bạn là Chuyên gia Thị giác Máy tính & Dinh dưỡng Dành riêng cho Ẩm thực Việt Nam của dự án NutriSnap.\n"
    "Nhiệm vụ của bạn là phân tích hình ảnh 2D của đĩa thức ăn/bữa ăn và bóc tách cấu trúc từng thành phần món ăn.\n\n"
    "QUY TẮC NHẬN DIỆN VÀ ĐẶC TẢ TÊN MÓN:\n"
    "1. Định danh chính xác từng món ăn, món mặn, món xào, món canh, cơm, rau củ có trên đĩa hoặc trong mâm.\n"
    "2. Sử dụng tên món ăn bằng TIẾNG VIỆT CHUẨN HÓA, có dấu đầy đủ, ưu tiên khớp với cơ sở dữ liệu món Việt phổ biến "
    "(ví dụ: 'Cơm trắng', 'Cơm tấm sườn nướng', 'Phở bò tái', 'Ức gà áp chảo', 'Bông cải xanh hấp', "
    "'Canh chua cá lóc', 'Rau muống xào tỏi', 'Trứng gà ốp la (1 quả)', 'Thịt kho tàu nước dừa', 'Đậu hũ rán').\n"
    "3. ƯỚC TÍNH KHỐI LƯỢNG (estimated_weight_gram): Dựa vào tỷ lệ kích thước so với đĩa chuẩn (đường kính 20-25cm) "
    "hoặc bát tô chuẩn, ước lượng số gam thực tế (> 0) của từng món ăn.\n"
    "4. ĐỘ TỰ TIN (confidence_score): Đánh giá mức độ chắc chắn từ 0.0 (rất không chắc) đến 1.0 (hoàn toàn chắc chắn).\n\n"
    "NGUYÊN TẮC ZERO-HALLUCINATION NUTRITION (CỰC KỲ QUAN TRỌNG):\n"
    "- Bạn TUYỆT ĐỐI KHÔNG tự tính toán, suy đoán hay xuất ra lượng Calo (Calories), Protein, Carbs, hay Fat.\n"
    "- Tầng AI chỉ trả về tên món ăn, khối lượng gam ước tính, và độ tự tin. Việc tính toán dinh dưỡng do Backend đảm nhiệm.\n\n"
    "ĐỊNH DẠNG ĐẦU RA BẮT BUỘC:\n"
    "Chỉ trả về DUY NHẤT một chuỗi JSON hợp lệ theo đúng cấu trúc sau (không kèm lời giải thích):\n"
    "{\n"
    '  "dishes": [\n'
    "    {\n"
    '      "dish_name": "Tên món ăn tiếng Việt",\n'
    '      "estimated_weight_gram": 150.0,\n'
    '      "confidence_score": 0.92\n'
    "    }\n"
    "  ]\n"
    "}"
)


# ==============================================================================
# 4. TIỆN ÍCH XỬ LÝ ẢNH & MIME TYPE (IMAGE UTILS)
# ==============================================================================


def detect_image_mime(data: bytes, file_name: Optional[str] = None) -> str:
    """
    Tự động nhận diện MIME Type của ảnh dựa trên Magic Bytes ở đầu file,
    kết hợp với phần mở rộng của tên file nếu có.
    """
    if len(data) >= 3 and data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if len(data) >= 6 and (data[:6] == b"GIF87a" or data[:6] == b"GIF89a"):
        return "image/gif"
    if len(data) >= 2 and data[:2] == b"BM":
        return "image/bmp"

    # Kiểm tra theo phần mở rộng file nếu không khớp magic bytes
    if file_name:
        ext = Path(file_name).suffix.lower()
        ext_map = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".gif": "image/gif",
            ".bmp": "image/bmp",
        }
        if ext in ext_map:
            return ext_map[ext]

    return "image/jpeg"


def load_image_bytes(image_input: str | Path | bytes) -> tuple[bytes, str]:
    """
    Chuẩn hóa và kiểm tra tính hợp lệ của đầu vào ảnh:
    - Nếu là str hoặc Path: Đọc nội dung file từ đĩa, xác thực tồn tại và không rỗng.
    - Nếu là bytes: Xác thực dữ liệu bytes không rỗng (> 0 byte).

    Trả về:
        tuple[bytes, str]: (Dữ liệu bytes của ảnh, MIME type tương ứng)
    """
    if isinstance(image_input, (str, Path)):
        file_path = Path(image_input)
        if not file_path.exists():
            raise InvalidImageError(f"File ảnh không tồn tại tại: {file_path}")
        if not file_path.is_file():
            raise InvalidImageError(f"Đường dẫn không phải là một file: {file_path}")

        try:
            data = file_path.read_bytes()
        except OSError as e:
            raise InvalidImageError(f"Không thể đọc file ảnh: {e}") from e

        if not data:
            raise InvalidImageError(f"File ảnh rỗng (0 bytes): {file_path}")

        mime_type = detect_image_mime(data, file_path.name)
        return data, mime_type

    if isinstance(image_input, bytes):
        if not image_input:
            raise InvalidImageError("Dữ liệu bytes của ảnh không được rỗng (0 bytes).")
        mime_type = detect_image_mime(image_input)
        return image_input, mime_type

    raise InvalidImageError(
        f"Kiểu đầu vào không hợp lệ: {type(image_input)}. Kỳ vọng str, Path hoặc bytes."
    )


# ==============================================================================
# 5. DỮ LIỆU MOCK DỰ PHÒNG (MOCK FALLBACK ENGINE)
# ==============================================================================


def get_mock_fallback_dishes() -> VisionRecognitionResult:
    """
    Tạo ra kết quả nhận diện đĩa ăn mẫu chuẩn xác cho trường hợp offline,
    mất mạng, hoặc hết hạn mức API, đảm bảo luồng demo trực tiếp không bao giờ gãy.
    """
    return VisionRecognitionResult(
        dishes=[
            DishItem(
                dish_name="Cơm tấm sườn nướng",
                estimated_weight_gram=220.0,
                confidence_score=0.95,
            ),
            DishItem(
                dish_name="Trứng gà ốp la (1 quả)",
                estimated_weight_gram=60.0,
                confidence_score=0.92,
            ),
            DishItem(
                dish_name="Canh chua cá lóc",
                estimated_weight_gram=150.0,
                confidence_score=0.88,
            ),
        ],
        is_mock=True,
        raw_response=(
            '{"dishes": [{"dish_name": "Cơm tấm sườn nướng", "estimated_weight_gram": 220.0, "confidence_score": 0.95}, '
            '{"dish_name": "Trứng gà ốp la (1 quả)", "estimated_weight_gram": 60.0, "confidence_score": 0.92}, '
            '{"dish_name": "Canh chua cá lóc", "estimated_weight_gram": 150.0, "confidence_score": 0.88}]}'
        ),
    )


# ==============================================================================
# 6. BỘ PHÂN TÍCH & BÓC TÁCH JSON (RESPONSE PARSER & VALIDATOR)
# ==============================================================================


def parse_and_validate_vision_json(raw_text: str) -> VisionRecognitionResult:
    """
    Phân tích chuỗi phản hồi từ Vision API thành VisionRecognitionResult:
    - Loại bỏ markdown code block (```json ... ```) nếu có.
    - Parse JSON an toàn.
    - Xác thực qua Pydantic DishItem (dish_name không rỗng, weight > 0, 0 <= confidence <= 1).
    """
    cleaned = raw_text.strip()

    # Bóc tách nếu model vô tình bọc trong ```json ```
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

    try:
        parsed_data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise FoodValidationError(
            f"Phản hồi từ Vision API không phải là chuỗi JSON hợp lệ: {e}. Raw: {raw_text[:200]}"
        ) from e

    if not isinstance(parsed_data, dict):
        raise FoodValidationError(
            f"Phản hồi JSON phải là một đối tượng (object/dict), nhận được: {type(parsed_data)}"
        )

    dishes_raw = parsed_data.get("dishes")
    if dishes_raw is None or not isinstance(dishes_raw, list):
        raise FoodValidationError(
            "Cấu trúc JSON bắt buộc phải chứa mảng 'dishes' (ví dụ: {'dishes': [...]})."
        )

    dish_items: list[DishItem] = []
    for idx, item in enumerate(dishes_raw):
        if not isinstance(item, dict):
            raise FoodValidationError(
                f"Phần tử thứ {idx} trong 'dishes' không phải là object: {item}"
            )
        try:
            dish_obj = DishItem.model_validate(item)
            dish_items.append(dish_obj)
        except Exception as e:
            raise FoodValidationError(
                f"Món ăn thứ {idx} không thỏa mãn ràng buộc dữ liệu: {e}"
            ) from e

    return VisionRecognitionResult(
        dishes=dish_items,
        is_mock=False,
        raw_response=raw_text,
    )


# ==============================================================================
# 7. KHỞI TẠO CLIENT GEMINI & ĐIỀU PHỐI VISION (MAIN ORCHESTRATOR)
# ==============================================================================


def get_gemini_vision_model(
    api_key: Optional[str] = None,
    model_name: str = "gemini-1.5-flash",
) -> Any:
    """
    Khởi tạo đối tượng GenerativeModel của Google Generative AI với cấu hình:
    - System instruction chuyên sâu về nhận diện món ăn Việt.
    - JSON mode & TypedDict schema chuẩn.
    - Temperature thấp (0.2) để đảm bảo tính xác định (deterministic).
    """
    if api_key is not None:
        effective_key = api_key.strip()
    else:
        effective_key = (get_gemini_api_key() or os.getenv("GEMINI_API_KEY", "")).strip()
    target_model = model_name
    if not effective_key or effective_key in (
        "YOUR_GEMINI_API_KEY_HERE",
        "your_actual_api_key_here",
        "mock",
        "change-me",
        "dummy_api_key_for_testing",
        "your_api_key_here",
    ) or len(effective_key) < 15:
        raise APIConnectionError(
            "Chưa cấu hình GEMINI_API_KEY hợp lệ trong môi trường hoặc tham số."
        )

    try:
        import google.generativeai as genai

        genai.configure(api_key=effective_key)

        model = genai.GenerativeModel(
            model_name=target_model,
            system_instruction=VISION_SYSTEM_INSTRUCTION,
            generation_config={
                "response_mime_type": "application/json",
                "response_schema": VisionRecognitionSchema,
                "temperature": 0.2,
            },
        )
        return model
    except ImportError as e:
        raise APIConnectionError(
            "Thư viện google-generativeai chưa được cài đặt. Chạy: pip install google-generativeai"
        ) from e
    except Exception as e:
        raise APIConnectionError(f"Lỗi khi cấu hình Gemini Vision Model: {e}") from e


def recognize_dishes_from_image(
    image_input: str | Path | bytes,
    api_key: Optional[str] = None,
    model_name: str = "gemini-1.5-flash",
    use_mock_fallback: bool = True,
) -> VisionRecognitionResult:
    """
    Hàm thực thi chính (Main Entrypoint) của module Vision Recognition:
    1. Tiếp nhận file ảnh (đường dẫn hoặc bytes).
    2. Gửi ảnh và hướng dẫn hệ thống tới Gemini Vision API.
    3. Nhận phản hồi JSON, kiểm tra tính hợp lệ và ép kiểu qua Pydantic.
    4. Tự động chuyển đổi sang Mock Fallback nếu gặp sự cố mạng/hết quota (khi use_mock_fallback=True).

    Tham số:
        image_input: Đường dẫn file ảnh (str hoặc Path) hoặc dữ liệu bytes.
        api_key: API Key của Google Gemini (nếu None sẽ đọc từ os.getenv("GEMINI_API_KEY")).
        model_name: Tên mô hình Vision ('gemini-1.5-flash' hoặc 'gemini-2.5-flash').
        use_mock_fallback: Cho phép tự động trả về dữ liệu mẫu nếu API gặp lỗi.

    Trả về:
        VisionRecognitionResult: Danh sách món ăn hợp lệ kèm trọng lượng và độ tự tin.
    """
    # 1. Kiểm tra và tải dữ liệu ảnh
    image_bytes, mime_type = load_image_bytes(image_input)

    target_model = model_name

    # 2. Kiểm tra API Key sớm nếu cần kích hoạt mock fallback
    if api_key is not None:
        effective_key = api_key.strip()
    else:
        effective_key = (get_gemini_api_key() or os.getenv("GEMINI_API_KEY", "")).strip()
    is_mock_key = not effective_key or effective_key in (
        "YOUR_GEMINI_API_KEY_HERE",
        "your_actual_api_key_here",
        "mock",
        "change-me",
        "dummy_api_key_for_testing",
        "your_api_key_here",
    ) or len(effective_key) < 15

    if is_mock_key and use_mock_fallback:
        logger.warning(
            "Không phát hiện GEMINI_API_KEY hợp lệ. Kích hoạt Mock Fallback theo đặc tả W2/W3."
        )
        return get_mock_fallback_dishes()

    # 3. Gọi Gemini Vision API
    try:
        model = get_gemini_vision_model(api_key=effective_key, model_name=target_model)

        # Định dạng inline data cho Gemini API
        image_part = {
            "mime_type": mime_type,
            "data": image_bytes,
        }

        user_prompt = (
            "Hãy phân tích đĩa thức ăn trong ảnh này. Nhận diện các món ăn, "
            "ước lượng khối lượng theo gram và độ tự tin. Trả về kết quả JSON chuẩn."
        )

        response = model.generate_content([user_prompt, image_part])

        if not response or not hasattr(response, "text") or not response.text:
            raise APIConnectionError("Gemini Vision API trả về phản hồi rỗng.")

        # 4. Parse và kiểm thực dữ liệu JSON
        return parse_and_validate_vision_json(response.text)

    except (APIConnectionError, FoodValidationError) as e:
        if use_mock_fallback:
            logger.warning(
                f"Sự cố Vision API ({type(e).__name__}: {e}). Tự động chuyển sang Mock Fallback."
            )
            return get_mock_fallback_dishes()
        raise

    except Exception as e:
        logger.error(f"Lỗi không mong muốn khi gọi Vision API: {e}")
        if use_mock_fallback:
            return get_mock_fallback_dishes()
        raise APIConnectionError(f"Lỗi thực thi Vision API: {e}") from e
