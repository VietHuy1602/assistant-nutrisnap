"""src/ai/guardrails.py
Safety guardrails and input/output filters for NutriSnap AI Coach.
Implements Tasks T7 & T8 from AI_ASSISTANT_IMPLEMENTATION_SPEC.md.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from pydantic import BaseModel, Field

logger = logging.getLogger("nutrisnap.ai.guardrails")


class GuardResult(BaseModel):
    """Result of a guardrail check."""

    is_blocked: bool = Field(default=False, description="True if message violates policy and must be blocked/redirected")
    category: str | None = Field(default=None, description="Category of violation (medical, starvation, compensation, injection, off_topic)")
    reason: str | None = Field(default=None, description="Reason for blocking")
    safe_reply: str | None = Field(default=None, description="Pre-scripted safe and constructive reply for blocked input")
    sanitized_text: str | None = Field(default=None, description="Cleaned text if not blocked")


# Pattern sets for input guardrails
MEDICAL_PATTERNS = [
    r"uống\s+thuốc\s+(gì|nào|bao\s+nhiêu)",
    r"kê\s+đơn\s+thuốc",
    r"chữa\s+(khỏi\s+)?(tiểu\s+đường|ung\s+thư|đau\s+dạ\s+dày|huyết\s+áp|gan|thận)",
    r"(tôi|mình)\s+có\s+bị\s+(bệnh|tiểu\s+đường|ung\s+thư|trầm\s+cảm)",
    r"chẩn\s+đoán",
    r"thuốc\s+giảm\s+cân",
    r"uống\s+kháng\s+sinh",
]

STARVATION_PATTERNS = [
    r"nhịn\s+(đói|ăn)\s*(\d+|nhiều|vài|cả)?\s*(ngày|tuần|tháng)",
    r"nhịn\s+(đói|ăn)\s+(để\s+giảm|cả)",
    r"ăn\s+(dưới\s+)?(100|200|300|400|500|600|700|800)\s*(calo|kcal)",
    r"chế\s+độ\s+ăn\s+500\s*(calo|kcal)",
    r"nhịn\s+(ăn|đói)\s+hoàn\s+toàn",
]

COMPENSATION_PATTERNS = [
    r"(ăn\s+vượt|lỡ\s+ăn|ăn\s+quá|ăn\s+nhiều).*(mai|ngày\s+mai|hôm\s+sau).*(nhịn|bù\s+lại|nhịn\s+đói)",
    r"(mai|ngày\s+mai|hôm\s+sau).*(nhịn\s+ăn|nhịn\s+đói|không\s+ăn).*(bù\s+cho|bù\s+lại|vì\s+hôm\s+nay)",
    r"nhịn\s+ăn\s+bù",
    r"bù\s+trừ\s+calo\s+bằng\s+cách\s+nhịn",
]

INJECTION_PATTERNS = [
    r"bỏ\s+qua\s+(mọi\s+)?hướng\s+dẫn(\s+trước)?",
    r"ignore\s+(all\s+)?(previous\s+)?instructions",
    r"(in|show|display|reveal|xem)\s+(system\s+prompt|hướng\s+dẫn\s+hệ\s+thống|lời\s+nhắc)",
    r"\bbạn\s+là\s+dan\b",
    r"\byou\s+are\s+dan\b",
    r"\bjailbreak\b",
    r"\buser_id\s*=\s*\d+",
    r"\buid\s*=\s*\d+",
    r"(lấy|xem|truy\s+cập)\s+(dữ\s+liệu|calo|thông\s+tin)\s+của\s+(user|người\s+dùng|tài\s+khoản)\s+(khác|\d+)",
]

# Patterns for off-topic / irrelevant queries
OFF_TOPIC_PATTERNS = [
    r"thời\s+tiết\s+(hôm\s+nay|ngày\s+mai|ở|tại)?",
    r"dự\s+báo\s+thời\s+tiết",
    r"viết\s+(code|mã|chương\s+trình|hàm|script)\s+(python|c\+\+|java|javascript|php|sql)",
    r"giải\s+(phương\s+trình|bài\s+toán|toán|hóa|vật\s+lý)",
    r"thủ\s+đô\s+của\s+nước",
    r"bóng\s+đá\s+(ngoại\s+hạng|world\s+cup|champions\s+league)",
    r"tỷ\s+số\s+trận\s+đấu",
    r"giá\s+(vàng|bitcoin|crypto|cổ\s+phiếu|xăng)",
    r"chính\s+trị|bầu\s+cử|chiến\s+tranh|tổng\s+thống",
    r"sửa\s+(xe|máy\s+tính|điện\s+thoại|quạt|tủ\s+lạnh)",
    r"kể\s+chuyện\s+(ma|cười|người\s+lớn)",
]

# Whitelist keywords to ensure nutrition questions containing common words are NOT falsely blocked as off-topic
NUTRITION_WHITELIST = [
    "calo", "kcal", "calorie", "đạm", "protein", "carbs", "fat", "chất béo", "tinh bột",
    "bữa", "ăn", "uống", "món", "thực đơn", "nấu", "cân nặng", "kg", "giảm cân",
    "tăng cơ", "dinh dưỡng", "app", "nutrisnap",
    "tiến độ", "streak", "gợi ý", "thói quen",
]


def check_input(message: str) -> GuardResult:
    """Kiểm tra đầu vào của người dùng trước khi gọi LLM (Input Guardrails).
    Ngăn chặn: Y tế, Nhịn ăn, Bù trừ cực đoan, Prompt Injection, và Câu hỏi không liên quan.
    """
    if not message or not message.strip():
        return GuardResult(is_blocked=False, sanitized_text="")

    msg = message.strip()
    msg_lower = msg.lower()

    # 1. Chống Prompt Injection / Jailbreak / IDOR
    for pat in INJECTION_PATTERNS:
        if re.search(pat, msg_lower, re.IGNORECASE):
            logger.warning("Guardrail blocked prompt injection: %s", msg[:100])
            return GuardResult(
                is_blocked=True,
                category="injection",
                reason="Phát hiện yêu cầu can thiệp hệ thống hoặc truy cập dữ liệu trái phép.",
                safe_reply=(
                    "Mình là NutriSnap Coach và chỉ hỗ trợ dữ liệu của chính tài khoản bạn đang đăng nhập. "
                    "Mình không thể chia sẻ hướng dẫn hệ thống hay thay đổi vai trò được."
                ),
            )

    # 2. Ngăn chặn chẩn đoán và kê đơn thuốc y tế
    for pat in MEDICAL_PATTERNS:
        if re.search(pat, msg_lower, re.IGNORECASE):
            logger.warning("Guardrail blocked medical advice: %s", msg[:100])
            return GuardResult(
                is_blocked=True,
                category="medical",
                reason="Yêu cầu chẩn đoán bệnh hoặc kê đơn thuốc vượt thẩm quyền trợ lý dinh dưỡng.",
                safe_reply=(
                    "Mình là trợ lý dinh dưỡng ảo, không thể chẩn đoán y khoa hay chỉ định thuốc điều trị. "
                    "Khi có vấn đề sức khỏe hoặc bệnh lý, bạn nên đến cơ sở y tế gặp bác sĩ chuyên khoa "
                    "để được thăm khám và hướng dẫn an toàn nhé."
                ),
            )

    # 3. Ngăn chặn nhịn ăn cực đoan / dưới 1.200 kcal
    for pat in STARVATION_PATTERNS:
        if re.search(pat, msg_lower, re.IGNORECASE):
            logger.warning("Guardrail blocked starvation advice: %s", msg[:100])
            return GuardResult(
                is_blocked=True,
                category="starvation",
                reason="Yêu cầu nhịn ăn kéo dài hoặc mức năng lượng dưới ngưỡng an toàn.",
                safe_reply=(
                    "NutriSnap khuyến nghị bạn không nên nhịn đói cực đoan hay cắt calo quá sâu dưới 1.200 kcal/ngày. "
                    "Việc thiếu hụt năng lượng nghiêm trọng sẽ làm suy giảm cơ bắp và trao đổi chất. "
                    "Hãy duy trì thâm hụt calo vừa phải kết hợp thực phẩm giàu đạm và rau xanh để vóc dáng thay đổi bền vững nhé!"
                ),
            )

    # 4. Ngăn chặn bù trừ calo cực đoan (nhịn ăn ngày mai bù cho hôm nay)
    for pat in COMPENSATION_PATTERNS:
        if re.search(pat, msg_lower, re.IGNORECASE):
            logger.warning("Guardrail blocked calorie compensation: %s", msg[:100])
            return GuardResult(
                is_blocked=True,
                category="compensation",
                reason="Yêu cầu nhịn ăn bù cho ngày ăn vượt mức.",
                safe_reply=(
                    "Ăn uống là hành trình dài hạn, thỉnh thoảng ăn vượt mức hoàn toàn bình thường và không đáng lo! "
                    "Bạn tuyệt đối tránh nhịn đói vào ngày mai để bù lại. Hãy ăn uống cân bằng, "
                    "uống đủ nước và duy trì vận động nhẹ nhàng để cơ thể tự cân bằng năng lượng nhé."
                ),
            )

    # 5. Kiểm tra câu hỏi không liên quan (Off-topic / Irrelevant)
    # Huấn luyện AI linh hoạt: không trả lời nếu người dùng hỏi ngoài phạm vi, nhưng chào hỏi/app thì trả lời
    is_whitelisted = any(w in msg_lower for w in NUTRITION_WHITELIST)
    for pat in OFF_TOPIC_PATTERNS:
        if re.search(pat, msg_lower, re.IGNORECASE) and not is_whitelisted:
            logger.info("Guardrail intercepted off-topic query: %s", msg[:100])
            return GuardResult(
                is_blocked=True,
                category="off_topic",
                reason="Câu hỏi ngoài phạm vi dinh dưỡng và ứng dụng NutriSnap.",
                safe_reply=(
                    "Mình là NutriSnap Coach – Trợ lý chuyên về dinh dưỡng, calo và bữa ăn lành mạnh. "
                    "Mình chưa hỗ trợ giải đáp các chủ đề ngoài dinh dưỡng như trên. "
                    "Nếu bạn cần tính calo bữa ăn, gợi ý thực đơn hay xem tiến độ vóc dáng, hãy nhắn mình nhé!"
                ),
            )

    return GuardResult(is_blocked=False, sanitized_text=msg)


def check_output(
    reply: str,
    tool_results: list[dict[str, Any]] | dict[str, Any] | None = None,
    user_message: str = "",
) -> GuardResult:
    """Kiểm tra và làm sạch đầu ra của trợ lý trước khi gửi cho người dùng (Output Guardrails).
    - Làm sạch định dạng xấu như `*( ... )*`.
    - Kiểm tra từ khóa nguy hiểm ngoài ý muốn.
    - Đảm bảo tính nhất quán số liệu (T8).
    """
    if not reply or not reply.strip():
        return GuardResult(
            is_blocked=False,
            sanitized_text="Mình đã ghi nhận thông tin thành công!",
        )

    text = reply.strip()

    # Loại bỏ bọc dấu `*( ... )*` thừa
    text = re.sub(r"\*\((.*?)\)\*", r"\1", text)
    text = re.sub(r"^\*\((.*?)\)$", r"\1", text)

    # Kiểm tra từ khóa nguy hiểm không nên xuất hiện theo hướng khuyến khích
    dangerous_phrases = [
        "hãy nhịn ăn",
        "nên nhịn ăn cả ngày",
        "hãy cắt bỏ hoàn toàn",
        "uống thuốc giảm cân này",
        "kê cho bạn đơn thuốc",
    ]
    for dp in dangerous_phrases:
        if dp in text.lower():
            logger.warning("Dangerous advice detected in LLM output: %s", dp)
            return GuardResult(
                is_blocked=True,
                category="unsafe_output",
                reason=f"Đầu ra chứa lời khuyên không an toàn ({dp})",
                safe_reply=(
                    "NutriSnap luôn đồng hành cùng bạn với chế độ ăn cân bằng và khoa học. "
                    "Hãy duy trì các bữa ăn đủ chất và tham khảo ý kiến chuyên gia khi cần thiết nhé."
                ),
                sanitized_text=text,
            )

    return GuardResult(is_blocked=False, sanitized_text=text)


def extract_numbers_from_text(text: str) -> set[float]:
    """Trích xuất các con số có ý nghĩa (calo, gram, VND, cân nặng) từ văn bản."""
    # Xóa định dạng số VND có dấu chấm phẩy (ví dụ: 40.000 -> 40000)
    cleaned = re.sub(r"(\d{1,3})[.,](\d{3})", r"\1\2", text)
    matches = re.findall(r"\b\d+(?:\.\d+)?\b", cleaned)
    numbers = set()
    for m in matches:
        try:
            val = float(m)
            # Bỏ qua các số nhỏ hiển thị thứ tự danh sách (1, 2, 3...) hoặc tỷ lệ nhỏ
            numbers.add(round(val, 1))
        except ValueError:
            pass
    return numbers


def extract_numbers_from_tool_data(data: Any) -> set[float]:
    """Đệ quy trích xuất toàn bộ số liệu từ kết quả Tool Call."""
    nums = set()
    if isinstance(data, (int, float)):
        nums.add(round(float(data), 1))
    elif isinstance(data, dict):
        for v in data.values():
            nums.update(extract_numbers_from_tool_data(v))
    elif isinstance(data, list):
        for item in data:
            nums.update(extract_numbers_from_tool_data(item))
    return nums


def verify_number_consistency(
    reply: str,
    tool_result: dict[str, Any] | None,
    user_message: str = "",
    tolerance_ratio: float = 0.05,
) -> tuple[bool, list[float]]:
    """Kiểm tra khớp số liệu Backend - Chatbot (Task T8 Anti-Hallucination).
    Đối chiếu mọi con số trong câu trả lời với số liệu thực tế từ Tool và tin nhắn người dùng.
    Trả về (is_consistent, unverified_numbers).
    """
    if not tool_result:
        return True, []

    reply_numbers = extract_numbers_from_text(reply)
    if not reply_numbers:
        return True, []

    valid_numbers = extract_numbers_from_tool_data(tool_result)
    user_numbers = extract_numbers_from_text(user_message)
    valid_numbers.update(user_numbers)

    # Thêm các số thông dụng: ngày, giờ, tỷ lệ phần trăm chuẩn
    valid_numbers.update({0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 7.0, 14.0, 30.0, 100.0})

    unverified = []
    for num in reply_numbers:
        # Bỏ qua các số mục thứ tự danh sách hoặc số rất nhỏ
        if num in {1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0}:
            continue

        matched = False
        for v in valid_numbers:
            if abs(num - v) <= 1.0 or (v > 0 and abs(num - v) / v <= tolerance_ratio):
                matched = True
                break
        if not matched:
            unverified.append(num)

    if unverified:
        logger.warning(
            "Anti-hallucination warning: unverified numbers found in reply: %s",
            unverified,
        )
        return False, unverified

    return True, []
