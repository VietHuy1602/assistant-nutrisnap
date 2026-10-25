"""
src/backend/services/api_security.py
Hàng rào Bảo mật API & Quản trị Rủi ro (Tuần 6 - Pair Session 6 của Việt Huy & Minh Đức):
1. Lớp 1 - Bộ giới hạn tần suất yêu cầu (SlidingWindowRateLimiter):
   - Chống quá tải, spam, DoS trên các endpoints nhạy cảm.
   - Lưu trữ in-memory sử dụng collections.deque, trả về HTTP 429 Too Many Requests khi vượt ngưỡng.
   - Cung cấp rate_limit_dependency cho FastAPI endpoints và reset_rate_limiter cho unit testing.
2. Lớp 2 - Rào chắn An toàn Đầu vào (validate_safe_api_payload):
   - Ngăn chặn Prompt Injection, System Prompt Tampering, SQLi mẫu (drop table), XSS (<script>).
   - Ngăn chặn yêu cầu kê đơn thuốc giảm cân và chế độ nhịn ăn cực đoan (< 800 kcal/ngày).
3. Lớp 3 - Middleware gắn HTTP Security Headers (add_security_headers_middleware):
   - X-Content-Type-Options: nosniff
   - X-Frame-Options: DENY
   - X-XSS-Protection: 1; mode=block
   - Referrer-Policy: strict-origin-when-cross-origin
"""

import collections
import re
import threading
import time
from collections.abc import Callable
from typing import Any

from fastapi import HTTPException, Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware

from src.backend.core.config import settings

# ==============================================================================
# 1. BỘ GIỚI HẠN TẦN SUẤT YÊU CẦU (SLIDING WINDOW RATE LIMITER)
# ==============================================================================


class SlidingWindowRateLimiter:
    """Bộ giới hạn tần suất cửa sổ trượt (Sliding Window Rate Limiter) hoạt động hoàn toàn

    in-memory với cấu trúc collections.deque, đảm bảo thread-safe và hỗ trợ reset phục vụ test.
    """

    def __init__(self) -> None:
        self._records: dict[tuple[str, str], collections.deque[float]] = {}
        self._lock = threading.Lock()

    def _get_client_identifier(self, request: Request) -> str:
        """Xác định danh tính client từ HttpOnly Cookie JWT hoặc IP address."""
        # Ưu tiên lấy từ cookie xác thực nếu có
        token = request.cookies.get(settings.AUTH_COOKIE_NAME) or request.cookies.get("access_token")
        if token and token.strip():
            # Sử dụng tiền tố token ngắn để cô lập theo từng phiên người dùng
            return f"user:{token[:32]}"

        # Nếu chưa đăng nhập, sử dụng IP client
        client_host = request.client.host if request.client else "unknown_client"
        return f"ip:{client_host}"

    def check_rate_limit(
        self,
        request: Request,
        scope: str = "default",
        max_requests: int = 30,
        window_seconds: int = 60,
    ) -> None:
        """Kiểm tra tần suất gọi API trong cửa sổ trượt window_seconds.

        Ném HTTPException(status_code=429) nếu số lượng yêu cầu vượt quá max_requests.
        """
        client_id = self._get_client_identifier(request)
        key = (client_id, scope)
        now = time.time()
        window_start = now - window_seconds

        with self._lock:
            queue = self._records.setdefault(key, collections.deque())

            # Loại bỏ các mốc thời gian ngoài cửa sổ trượt
            while queue and queue[0] < window_start:
                queue.popleft()

            if len(queue) >= max_requests:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Quá nhiều yêu cầu (Rate limit exceeded). Vui lòng thử lại sau ít phút.",
                    headers={"Retry-After": str(window_seconds)},
                )

            queue.append(now)

    def reset(self) -> None:
        """Xóa toàn bộ bản ghi rate limit (phục vụ kiểm thử cô lập)."""
        with self._lock:
            self._records.clear()


# Singleton Rate Limiter
_global_rate_limiter = SlidingWindowRateLimiter()


def reset_rate_limiter() -> None:
    """Hàm tiện ích toàn cục reset bộ đếm rate limiter cho các bài kiểm thử pytest."""
    _global_rate_limiter.reset()


def rate_limit_dependency(
    scope: str = "default",
    max_requests: int = 30,
    window_seconds: int = 60,
) -> Callable[[Request], None]:
    """FastAPI Dependency factory gắn bộ đếm rate limit vào từng endpoint."""

    def _dependency(request: Request) -> None:
        _global_rate_limiter.check_rate_limit(
            request=request,
            scope=scope,
            max_requests=max_requests,
            window_seconds=window_seconds,
        )

    return _dependency


# ==============================================================================
# 2. RÀO CHẮN AN TOÀN ĐẦU VÀO (INPUT GUARDRAILS)
# ==============================================================================

# Danh sách mẫu tấn công Prompt Injection / System Tampering / XSS / SQLi
PROMPT_INJECTION_AND_EXPLOIT_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"drop\s+table",
    r"<\s*script\b",
    r"system\s+prompt",
    r"override\s+user_id",
    r"developer\s+mode",
    r"dan\s+mode",
    r"bypass\s+security",
    r"jailbreak",
    r"unrestricted\s+mode",
    r"javascript\s*:",
    r"onerror\s*=",
    r"onload\s*=",
]

# Danh sách từ khóa yêu cầu kê đơn thuốc giảm cân độc hại
DRUG_PRESCRIPTION_PATTERNS = [
    r"thuốc\s+giảm\s+cân(\s+cấp\s+tốc)?",
    r"kê\s+đơn(\s+thuốc)?",
    r"ozempic",
    r"wegovy",
    r"phentermine",
    r"sibutramine",
    r"thuốc\s+xổ",
]

# Danh sách từ khóa chế độ nhịn ăn cực đoan
EXTREME_STARVATION_PATTERNS = [
    r"nhịn\s+ăn\s+hoàn\s+toàn",
    r"nhịn\s+ăn\s+nhiều\s+ngày",
    r"nhịn\s+ăn\s+liên\s+tục",
    r"nhịn\s+đói",
    r"nhịn\s+ăn\s+\d+\s+ngày",
    r"tuyệt\s+thực",
    # Ép calo dưới 800 kcal/ngày
    r"(dưới|<|ít\s+hơn)\s*(800|700|600|500|400|300|200|100)\s*(calo|kcal)?",
    r"ép\s+calo\s+dưới\s*800",
    r"\b[1-7][0-9]{2}\s*kcal\b",  # 100-799 kcal
]


def validate_safe_api_payload(text_content: str | None) -> tuple[bool, str | None]:
    """Kiểm tra tính an toàn của nội dung văn bản đầu vào:

    1. Chặn tấn công Prompt Injection / System Prompt Tampering / SQLi / XSS.
    2. Chặn yêu cầu kê đơn thuốc giảm cân và các chế độ nhịn ăn cực đoan (< 800 kcal).
    Trả về (True, None) nếu an toàn, hoặc (False, lý do) nếu vi phạm.
    """
    if not text_content:
        return True, None

    normalized_text = text_content.strip().lower()

    # 1. Kiểm tra mẫu tấn công bảo mật hệ thống
    for pattern in PROMPT_INJECTION_AND_EXPLOIT_PATTERNS:
        if re.search(pattern, normalized_text, re.IGNORECASE):
            return False, "Yêu cầu bị từ chối bởi hàng rào bảo mật hệ thống."

    # 2. Kiểm tra yêu cầu kê đơn thuốc hoặc nhịn ăn cực đoan
    for pattern in DRUG_PRESCRIPTION_PATTERNS:
        if re.search(pattern, normalized_text, re.IGNORECASE):
            return (
                False,
                "NutriSnap không kê đơn thuốc hoặc hỗ trợ các chế độ nhịn ăn cực đoan gây hại sức khỏe.",
            )

    for pattern in EXTREME_STARVATION_PATTERNS:
        if re.search(pattern, normalized_text, re.IGNORECASE):
            return (
                False,
                "NutriSnap không kê đơn thuốc hoặc hỗ trợ các chế độ nhịn ăn cực đoan gây hại sức khỏe.",
            )

    return True, None


# ==============================================================================
# 3. MIDDLEWARE GẮN HTTP SECURITY HEADERS
# ==============================================================================


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Starlette/FastAPI Middleware tự động đính kèm các HTTP Security Headers chuẩn:

    - X-Content-Type-Options: nosniff
    - X-Frame-Options: DENY
    - X-XSS-Protection: 1; mode=block
    - Referrer-Policy: strict-origin-when-cross-origin
    """

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


async def add_security_headers_middleware(request: Request, call_next: Any) -> Response:
    """Hàm middleware HTTP độc lập đính kèm security headers (tương thích app.middleware('http'))."""
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response
