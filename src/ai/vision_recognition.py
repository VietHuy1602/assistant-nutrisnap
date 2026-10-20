"""
src/ai/vision_recognition.py
Module nhận diện món ăn từ hình ảnh đĩa ăn bằng AI Vision.
Ép trả về dữ liệu chuẩn JSON gồm: danh sách món ăn, số gam ước lượng & confidence_score.
"""

import os
import json
import base64
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

try:
    from google import genai
    from google.genai import types
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False


class RecognizedFoodItem(BaseModel):
    food_name: str = Field(
        description="Tên món ăn hoặc thành phần nguyên liệu nhận diện được bằng tiếng Việt (ví dụ: 'Cơm trắng', 'Thịt kho trứng', 'Rau muống xào tỏi')."
    )
    estimated_grams: float = Field(
        description="Khối lượng ước lượng của món ăn tính bằng gram (g) dựa trên khẩu phần nhìn thấy trên đĩa."
    )
    confidence_score: float = Field(
        ge=0.0,
        le=1.0,
        description="Độ tin cậy của mô hình đối với nhận diện món này (từ 0.0 đến 1.0)."
    )
    portion_description: Optional[str] = Field(
        default=None,
        description="Mô tả trực quan khẩu phần (ví dụ: 'khoảng 1 chén', '3 miếng thịt', '1 muỗng canh')."
    )
    visual_cues: Optional[str] = Field(
        default=None,
        description="Dấu hiệu thị giác giúp ước tính (ví dụ: 'sốt ngập', 'chiên nhiều dầu', 'luộc')."
    )


class VisionMealRecognitionResponse(BaseModel):
    meal_overview: str = Field(
        description="Tổng quan ngắn gọn về đĩa ăn hoặc bữa ăn trong ảnh (ví dụ: 'Đĩa cơm sườn bì chả đầy đủ')."
    )
    items: List[RecognizedFoodItem] = Field(
        description="Danh sách các món ăn/thực phẩm thành phần được phân tích từ hình ảnh."
    )
    total_estimated_grams: float = Field(
        description="Tổng khối lượng ước tính của toàn bộ bữa ăn trong ảnh (gram)."
    )
    image_quality_warning: Optional[str] = Field(
        default=None,
        description="Cảnh báo nếu ảnh mờ, tối, góc chụp khó xác định hoặc đĩa thức ăn bị che khuất."
    )


VISION_SYSTEM_PROMPT = """
Bạn là Chuyên gia Dinh dưỡng AI của hệ thống NutriSnap, am hiểu sâu sắc về ẩm thực Việt Nam và quốc tế.
Nhiệm vụ của bạn:
1. Quan sát kỹ lưỡng hình ảnh đĩa ăn/bữa ăn do người dùng cung cấp.
2. Tách nhỏ đĩa ăn thành từng món hoặc từng thành phần thực phẩm riêng biệt (ví dụ: một đĩa cơm tấm gồm cơm tấm, sườn nướng, chả trứng, dưa leo, mỡ hành).
3. Ước lượng số gam (gram) thực tế của từng phần dựa vào kích thước tương đối với đĩa, muỗng, hoặc bàn ăn.
4. Gán điểm tin cậy (confidence_score) từ 0.0 đến 1.0 cho từng món (ảnh càng rõ, món càng điển hình thì score càng cao).
5. BẮT BUỘC chỉ trả về đúng định dạng JSON tuân thủ schema VisionMealRecognitionResponse, không kèm văn bản giải thích ngoài JSON.
"""


def analyze_meal_image(
    image_path: Optional[str] = None,
    image_bytes: Optional[bytes] = None,
    mime_type: str = "image/jpeg",
    user_note: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Phân tích ảnh món ăn và trả về dictionary chuẩn JSON:
    - meal_overview: Mô tả tổng quan bữa ăn
    - items: Danh sách món ăn với tên, số gam ước lượng, confidence_score
    - total_estimated_grams: Tổng khối lượng ước lượng
    """
    if not image_path and not image_bytes:
        raise ValueError("Phải cung cấp image_path hoặc image_bytes.")

    if image_path:
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Không tìm thấy file ảnh: {image_path}")
        with open(image_path, "rb") as f:
            image_bytes = f.read()

        lower_path = image_path.lower()
        if lower_path.endswith(".png"):
            mime_type = "image/png"
        elif lower_path.endswith(".webp"):
            mime_type = "image/webp"
        else:
            mime_type = "image/jpeg"

    user_prompt = "Hãy nhận diện tất cả các món ăn trên đĩa trong ảnh, ước lượng khối lượng (gam) và đánh giá độ tin cậy."
    if user_note:
        user_prompt += f"\nGhi chú từ người dùng: {user_note}"

    gemini_key = api_key or os.getenv("GEMINI_API_KEY")
    if HAS_GENAI and gemini_key:
        client = genai.Client(api_key=gemini_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                user_prompt,
            ],
            config=types.GenerateContentConfig(
                system_instruction=VISION_SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=VisionMealRecognitionResponse,
                temperature=0.2,
            ),
        )
        return json.loads(response.text)

    openai_key = api_key or os.getenv("OPENAI_API_KEY")
    if HAS_OPENAI and openai_key:
        client = OpenAI(api_key=openai_key)
        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        response = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": VISION_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime_type};base64,{b64_image}"},
                        },
                    ],
                },
            ],
            response_format=VisionMealRecognitionResponse,
            temperature=0.2,
        )
        return json.loads(response.choices[0].message.content)

    return _generate_mock_recognition_result()


def _generate_mock_recognition_result() -> Dict[str, Any]:
    """Kết quả mẫu mô phỏng khi chạy offline hoặc chạy test tự động."""
    mock_data = VisionMealRecognitionResponse(
        meal_overview="Cơm sườn bì chả truyền thống Việt Nam",
        items=[
            RecognizedFoodItem(
                food_name="Cơm tấm",
                estimated_grams=180.0,
                confidence_score=0.96,
                portion_description="1 chén cơm vun",
                visual_cues="Hạt tấm nhỏ, rắc ít mỡ hành",
            ),
            RecognizedFoodItem(
                food_name="Sườn nướng",
                estimated_grams=120.0,
                confidence_score=0.92,
                portion_description="1 miếng sườn cốt lết vừa",
                visual_cues="Màu nâu cánh gián, có vệt cháy xém của than",
            ),
            RecognizedFoodItem(
                food_name="Chả trứng",
                estimated_grams=60.0,
                confidence_score=0.88,
                portion_description="1 miếng chả cắt tam giác",
                visual_cues="Mặt trên phủ lòng đỏ trứng vàng ươm",
            ),
            RecognizedFoodItem(
                food_name="Dưa leo và cà chua",
                estimated_grams=40.0,
                confidence_score=0.95,
                portion_description="3 lát dưa leo và 2 lát cà chua",
                visual_cues="Rau ăn kèm tươi",
            ),
        ],
        total_estimated_grams=400.0,
        image_quality_warning=None,
    )
    return mock_data.model_dump()


if __name__ == "__main__":
    print("=== Chạy kiểm tra nhanh module vision_recognition.py ===")
    test_result = analyze_meal_image()
    print(json.dumps(test_result, ensure_ascii=False, indent=2))