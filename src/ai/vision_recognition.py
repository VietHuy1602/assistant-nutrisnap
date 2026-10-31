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

import hashlib
import json
import logging
import os
import re
from collections import OrderedDict
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

    # Tên tiếng Anh kiểu USDA FoodData Central (ví dụ "Pizza, cheese") để tra bảng usda_foods
    name_en: Optional[str] = Field(default=None)
    # Dinh dưỡng ước tính trên 100g do AI cung cấp, chỉ dùng khi món chưa có trong CSDL tham chiếu
    calories_per_100g: Optional[float] = Field(default=None, ge=0.0, le=950.0)
    protein_per_100g: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    carbs_per_100g: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    fat_per_100g: Optional[float] = Field(default=None, ge=0.0, le=100.0)

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    @property
    def has_ai_nutrition(self) -> bool:
        return self.calories_per_100g is not None and self.calories_per_100g > 0

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
    is_food: bool = Field(
        default=True,
        description="False khi ảnh không chứa món ăn/đồ uống (người, đồ vật, phong cảnh, giấy tờ...)",
    )
    not_food_reason: Optional[str] = Field(
        default=None,
        description="Mô tả ngắn ảnh chứa gì khi is_food=False",
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
    "BƯỚC 0 - KIỂM TRA ẢNH CÓ PHẢI MÓN ĂN KHÔNG (BẮT BUỘC):\n"
    "- Nếu ảnh KHÔNG có món ăn hoặc đồ uống thật sự có thể ăn/uống (ví dụ: người, thú cưng, đồ vật, bàn phím, "
    "màn hình, phong cảnh, giấy tờ, ảnh chụp màn hình, bao bì rỗng, ảnh đen/mờ không thấy gì), trả về "
    '"is_food": false, "dishes": [] và "not_food_reason" mô tả ngắn bằng tiếng Việt ảnh đang chứa gì.\n'
    "- Không được đoán món ăn khi không nhìn thấy món ăn. Không trả về món mẫu.\n"
    '- Nếu có món ăn/đồ uống, đặt "is_food": true rồi làm các bước dưới.\n\n'
    "QUY TẮC NHẬN DIỆN VÀ ĐẶC TẢ TÊN MÓN:\n"
    "1. Định danh chính xác từng món ăn, món mặn, món xào, món canh, cơm, rau củ, đồ uống, trái cây, bánh "
    "thực sự NHÌN THẤY trong ảnh (kể cả món nước ngoài, đồ ăn nhanh). Chỉ liệt kê món có trong ảnh.\n"
    "2. TÊN MÓN: nhận diện được món ăn của MỌI nền ẩm thực trên thế giới (Việt, Nhật, Hàn, Trung, Thái, Ấn, Âu, Mỹ, "
    "Mexico, Trung Đông...). Món Việt dùng tên tiếng Việt chuẩn có dấu, ưu tiên tên phổ biến (ví dụ: 'Cơm trắng', "
    "'Cơm tấm sườn nướng', 'Phở bò tái', 'Canh chua cá lóc', 'Rau muống xào tỏi'). Món nước ngoài dùng tên thông dụng "
    "tại Việt Nam, kèm tên gốc trong ngoặc nếu khác (ví dụ: 'Sushi cá hồi', 'Pizza phô mai (Margherita)', "
    "'Mì Ý sốt bò bằm (Spaghetti Bolognese)', 'Gà rán', 'Bánh mì kẹp thịt (Hamburger)', 'Kimchi', 'Cà ri gà Ấn Độ'). "
    "Đồ uống, trái cây, bánh kẹo, đồ ăn đóng gói cũng là món ăn.\n"
    "3. ƯỚC TÍNH KHỐI LƯỢNG (estimated_weight_gram): Dựa vào tỷ lệ kích thước so với đĩa chuẩn (đường kính 20-25cm), "
    "bát tô, ly, tay cầm hoặc bao bì, ước lượng số gam thực tế (> 0) của từng món. Người dùng sẽ tự chỉnh lại sau.\n"
    "3b. TÊN TIẾNG ANH (name_en): tên món theo phong cách USDA FoodData Central, danh từ chính đứng trước, "
    "ngắn gọn, phổ biến (ví dụ: 'Pizza, cheese', 'Sushi roll, salmon', 'Hamburger', 'Rice, white, cooked', "
    "'Caesar salad', 'Chicken curry', 'Ramen bowl with pork', 'Apple, raw', 'Fried rice', 'Bubble tea').\n"
    "4. ĐỘ TỰ TIN (confidence_score): Đánh giá mức độ chắc chắn từ 0.0 (rất không chắc) đến 1.0 (hoàn toàn chắc chắn).\n"
    "5. DINH DƯỠNG THAM KHẢO TRÊN 100g: với mỗi món, ước tính calories_per_100g, protein_per_100g, carbs_per_100g, "
    "fat_per_100g theo giá trị dinh dưỡng phổ biến (USDA/bảng thành phần thực phẩm) của món đã chế biến như trong ảnh. "
    "Đây là giá trị trên 100g, KHÔNG nhân theo khối lượng. Backend ưu tiên CSDL chuẩn và chỉ dùng số này cho món chưa có trong CSDL.\n\n"
    "ĐỊNH DẠNG ĐẦU RA BẮT BUỘC:\n"
    "Chỉ trả về DUY NHẤT một chuỗi JSON hợp lệ theo đúng cấu trúc sau (không kèm lời giải thích):\n"
    "{\n"
    '  "is_food": true,\n'
    '  "not_food_reason": "",\n'
    '  "dishes": [\n'
    "    {\n"
    '      "dish_name": "Tên món ăn tiếng Việt",\n'
    '      "name_en": "Rice, white, cooked",\n'
    '      "estimated_weight_gram": 150.0,\n'
    '      "confidence_score": 0.92,\n'
    '      "calories_per_100g": 130.0,\n'
    '      "protein_per_100g": 2.7,\n'
    '      "carbs_per_100g": 28.0,\n'
    '      "fat_per_100g": 0.3\n'
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

    if parsed_data.get("is_food") is False:
        return VisionRecognitionResult(
            dishes=[],
            is_mock=False,
            is_food=False,
            not_food_reason=str(parsed_data.get("not_food_reason") or "").strip() or None,
            raw_response=raw_text,
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


_PLACEHOLDER_KEYS = (
    "YOUR_GEMINI_API_KEY_HERE",
    "your_actual_api_key_here",
    "mock",
    "change-me",
    "dummy_api_key_for_testing",
    "your_api_key_here",
)

# Model Vision mặc định và danh sách dự phòng (gemini-1.5-* đã ngừng hoạt động, trả về 404).
# Với key miễn phí, gemini-flash-lite-latest ổn định hơn (ít bị 503) và đủ chính xác cho nhận diện món.
DEFAULT_VISION_MODEL = "gemini-flash-lite-latest"
VISION_FALLBACK_MODELS = [
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
]
_RETRYABLE_VISION_CODES = {404, 429, 500, 503, 504}
_VISION_CACHE_SIZE = 64
_VISION_CACHE: "OrderedDict[str, VisionRecognitionResult]" = OrderedDict()

# JSON schema cho structured output của google-genai
VISION_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "is_food": {"type": "BOOLEAN"},
        "not_food_reason": {"type": "STRING"},
        "dishes": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "dish_name": {"type": "STRING"},
                    "name_en": {"type": "STRING"},
                    "estimated_weight_gram": {"type": "NUMBER"},
                    "confidence_score": {"type": "NUMBER"},
                    "calories_per_100g": {"type": "NUMBER"},
                    "protein_per_100g": {"type": "NUMBER"},
                    "carbs_per_100g": {"type": "NUMBER"},
                    "fat_per_100g": {"type": "NUMBER"},
                },
                "required": [
                    "dish_name",
                    "name_en",
                    "estimated_weight_gram",
                    "confidence_score",
                    "calories_per_100g",
                    "protein_per_100g",
                    "carbs_per_100g",
                    "fat_per_100g",
                ],
            },
        },
    },
    "required": ["is_food", "dishes"],
}


def _resolve_api_key(api_key: Optional[str]) -> str:
    if api_key is not None:
        return api_key.strip()
    return (get_gemini_api_key() or os.getenv("GEMINI_API_KEY", "")).strip()


def _is_placeholder_key(key: str) -> bool:
    return not key or key in _PLACEHOLDER_KEYS or len(key) < 15


VISION_MAX_SIDE_PX = 1024


def shrink_image_for_vision(data: bytes, mime_type: str) -> tuple[bytes, str]:
    """Thu nhỏ ảnh (cạnh dài tối đa 1024px, JPEG) trước khi gửi Gemini.

    Ảnh điện thoại/PNG vài MB làm upload chậm và dễ timeout; độ phân giải này vẫn đủ để nhận diện món ăn.
    Nếu không đọc được ảnh, gửi nguyên bản.
    """
    try:
        from io import BytesIO

        from PIL import Image, ImageOps

        with Image.open(BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)
            if max(img.size) <= VISION_MAX_SIDE_PX and len(data) <= 500_000:
                return data, mime_type
            img.thumbnail((VISION_MAX_SIDE_PX, VISION_MAX_SIDE_PX))
            out = BytesIO()
            img.convert("RGB").save(out, format="JPEG", quality=85)
            return out.getvalue(), "image/jpeg"
    except Exception as exc:
        logger.debug("Không thu nhỏ được ảnh, gửi ảnh gốc: %s", exc)
        return data, mime_type


class GeminiVisionModel:
    """Bọc google-genai: gửi ảnh + prompt, ép JSON theo schema và tự chuyển model khi model lỗi tạm thời/404."""

    def __init__(self, api_key: str, model_name: str) -> None:
        from google import genai
        from google.genai import types

        # Tắt retry nội bộ của SDK (backoff nhiều giây khi 503) để chuyển ngay sang model dự phòng;
        # giới hạn mỗi lần gọi 20s để cả chuỗi vẫn nằm trong thời gian chờ của ứng dụng.
        self._client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                timeout=20_000,
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        )
        self.model_name = model_name
        self.candidate_models = [model_name] + [m for m in VISION_FALLBACK_MODELS if m != model_name]

    def generate_content(self, contents: list[Any]) -> Any:
        from google.genai import types

        parts: list[Any] = []
        for item in contents:
            if isinstance(item, dict) and "data" in item:
                data, mime = shrink_image_for_vision(item["data"], item.get("mime_type", "image/jpeg"))
                parts.append(types.Part.from_bytes(data=data, mime_type=mime))
            else:
                parts.append(str(item))

        config = types.GenerateContentConfig(
            system_instruction=VISION_SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=VISION_RESPONSE_SCHEMA,
            temperature=0.2,
        )
        last_exc: Exception | None = None
        for model in self.candidate_models:
            try:
                return self._client.models.generate_content(model=model, contents=parts, config=config)
            except Exception as exc:
                code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
                timed_out = "timed out" in str(exc).lower() or "timeout" in type(exc).__name__.lower()
                if code not in _RETRYABLE_VISION_CODES and not timed_out:
                    raise
                logger.warning("Vision model %s lỗi %s, thử model dự phòng.", model, code or "timeout")
                last_exc = exc
        raise APIConnectionError(f"Tất cả model Vision đều không khả dụng: {last_exc}")


def get_gemini_vision_model(
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
) -> Any:
    """
    Khởi tạo client Gemini Vision (google-genai) với:
    - System instruction chuyên sâu về nhận diện món ăn Việt + kiểm tra ảnh có phải món ăn.
    - JSON mode & schema chuẩn, temperature thấp (0.2).
    - Danh sách model dự phòng khi model chính quá tải hoặc không tồn tại.
    """
    effective_key = _resolve_api_key(api_key)
    if _is_placeholder_key(effective_key):
        raise APIConnectionError(
            "Chưa cấu hình GEMINI_API_KEY hợp lệ trong môi trường hoặc tham số."
        )
    target_model = model_name or os.getenv("GEMINI_VISION_MODEL") or DEFAULT_VISION_MODEL
    try:
        return GeminiVisionModel(api_key=effective_key, model_name=target_model)
    except ImportError as e:
        raise APIConnectionError(
            "Thư viện google-genai chưa được cài đặt. Chạy: pip install google-genai"
        ) from e
    except Exception as e:
        raise APIConnectionError(f"Lỗi khi cấu hình Gemini Vision Model: {e}") from e


def recognize_dishes_from_image(
    image_input: str | Path | bytes,
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
    use_mock_fallback: bool = True,
) -> VisionRecognitionResult:
    """
    Hàm thực thi chính (Main Entrypoint) của module Vision Recognition:
    1. Tiếp nhận file ảnh (đường dẫn hoặc bytes).
    2. Gửi ảnh và hướng dẫn hệ thống tới Gemini Vision API.
    3. Nhận phản hồi JSON (kèm cờ is_food), kiểm tra tính hợp lệ và ép kiểu qua Pydantic.
    4. Chỉ dùng dữ liệu mẫu khi CHƯA cấu hình API key (chế độ demo). Khi đã có key mà API lỗi,
       ném APIConnectionError để giao diện báo lỗi thật thay vì hiển thị món giả.
    """
    # 1. Kiểm tra và tải dữ liệu ảnh
    image_bytes, mime_type = load_image_bytes(image_input)

    # 2. Chế độ demo khi chưa có API key
    effective_key = _resolve_api_key(api_key)
    if _is_placeholder_key(effective_key):
        if use_mock_fallback:
            logger.warning(
                "Không phát hiện GEMINI_API_KEY hợp lệ. Kích hoạt Mock Fallback theo đặc tả W2/W3."
            )
            return get_mock_fallback_dishes()
        raise APIConnectionError("Chưa cấu hình GEMINI_API_KEY hợp lệ trong môi trường hoặc tham số.")

    # 3. Ảnh đã nhận diện gần đây: trả lại kết quả cũ, không tốn thêm lượt gọi API (hạn mức miễn phí)
    cache_key = hashlib.sha256(image_bytes).hexdigest()
    cached = _VISION_CACHE.get(cache_key)
    if cached is not None:
        _VISION_CACHE.move_to_end(cache_key)
        return cached.model_copy(deep=True)

    # 4. Gọi Gemini Vision API
    try:
        model = get_gemini_vision_model(api_key=effective_key, model_name=model_name)
        user_prompt = (
            "Trước tiên xác định ảnh có chứa món ăn/đồ uống hay không. Nếu có, nhận diện từng món "
            "thực sự nhìn thấy, ước lượng khối lượng theo gram và độ tự tin. Trả về JSON chuẩn."
        )
        response = model.generate_content([user_prompt, {"mime_type": mime_type, "data": image_bytes}])

        text = getattr(response, "text", None) if response else None
        if not text:
            raise APIConnectionError("Gemini Vision API trả về phản hồi rỗng.")

        # 5. Parse và kiểm thực dữ liệu JSON
        result = parse_and_validate_vision_json(text)
        _VISION_CACHE[cache_key] = result.model_copy(deep=True)
        if len(_VISION_CACHE) > _VISION_CACHE_SIZE:
            _VISION_CACHE.popitem(last=False)
        return result
    except VisionRecognitionError:
        raise
    except Exception as e:
        logger.error("Lỗi không mong muốn khi gọi Vision API: %s", e)
        raise APIConnectionError(f"Lỗi thực thi Vision API: {e}") from e
