"""
src/backend/services/tool_security.py
Lớp bảo vệ an toàn công cụ và kiểm soát truy cập (Zero-Trust & Tool Security).
Nhiệm vụ phối hợp Cặp 1: Nguyễn Hoàng Việt Huy & Nguyễn Trần Minh Đức.

Tuân thủ nghiêm ngặt các nguyên tắc:
1. Chặn Prompt Injection: Quét và loại bỏ triệt để các tham số định danh nhạy cảm
   (user_id, authenticated_user_id, account_id, owner_id, is_admin) mà LLM
   hoặc kẻ tấn công cố tình truyền vào.
2. Kiểm tra quyền sở hữu phiên chat (ChatSession Ownership): Ngăn ngừa IDOR
   khi truy cập hoặc thao tác trên chat_sessions và chat_messages.
3. Kiểm tra quyền sở hữu bữa ăn (Meal Ownership): Ngăn ngừa IDOR khi sửa, xóa
   hoặc xem chi tiết bữa ăn của người dùng khác.
"""

import logging
from typing import Any

from sqlmodel import Session

from src.backend.models.schema import ChatSession, Meal

logger = logging.getLogger(__name__)

# Danh mục các khóa nhạy cảm bị cấm nhận từ LLM / Client
SENSITIVE_TOOL_KEYS = {
    "user_id",
    "authenticated_user_id",
    "account_id",
    "owner_id",
    "is_admin",
}


def sanitize_llm_tool_arguments(raw_args: dict[str, Any] | None) -> dict[str, Any]:
    """Tự động quét và loại bỏ mọi khóa nhạy cảm nếu LLM hoặc client cố tình truyền vào.

    Hỗ trợ duyệt đệ quy qua các dictionary con để loại bỏ hoàn toàn các nỗ lực
    Prompt Injection / Parameter Tampering. Ghi cảnh báo an ninh mà không in payload nhạy cảm.
    """
    if not raw_args:
        return {}

    sanitized: dict[str, Any] = {}
    for key, val in raw_args.items():
        clean_key = str(key).strip().lower()
        if clean_key in SENSITIVE_TOOL_KEYS:
            logger.warning(
                "Cảnh báo an ninh: Phát hiện khóa định danh bị cấm '%s' trong tham số công cụ. Đã tự động loại bỏ.",
                clean_key,
            )
            continue
        if isinstance(val, dict):
            sanitized[key] = sanitize_llm_tool_arguments(val)
        elif isinstance(val, list):
            sanitized[key] = [
                sanitize_llm_tool_arguments(item) if isinstance(item, dict) else item
                for item in val
            ]
        else:
            sanitized[key] = val

    return sanitized


def verify_session_ownership(
    session: Session,
    session_id: int,
    authenticated_user_id: int,
    raise_exception: bool = False,
) -> bool:
    """Xác minh quyền sở hữu phiên hội thoại (ChatSession).

    Trả về True nếu phiên tồn tại và thuộc về authenticated_user_id.
    Nếu không hợp lệ:
    - Nếu raise_exception=True: ném ValueError (khi không tìm thấy) hoặc PermissionError (khi không chính chủ).
    - Mặc định: trả về False.
    """
    chat_session = session.get(ChatSession, session_id)
    if not chat_session:
        if raise_exception:
            raise ValueError(f"Không tìm thấy phiên hội thoại #{session_id}")
        return False

    if chat_session.user_id != authenticated_user_id:
        if raise_exception:
            raise PermissionError(
                "Cảnh báo bảo mật: Không có quyền truy cập phiên hội thoại của người dùng khác"
            )
        return False

    return True


def verify_meal_ownership(
    session: Session,
    meal_id: int,
    authenticated_user_id: int,
    raise_exception: bool = False,
) -> bool:
    """Xác minh quyền sở hữu bản ghi bữa ăn (Meal).

    Trả về True nếu bữa ăn tồn tại và thuộc về authenticated_user_id.
    Nếu không hợp lệ:
    - Nếu raise_exception=True: ném ValueError (khi không tìm thấy) hoặc PermissionError (khi không chính chủ).
    - Mặc định: trả về False.
    """
    meal = session.get(Meal, meal_id)
    if not meal:
        if raise_exception:
            raise ValueError(f"Không tìm thấy bữa ăn #{meal_id}")
        return False

    if meal.user_id != authenticated_user_id:
        if raise_exception:
            raise PermissionError(
                "Cảnh báo bảo mật: Không có quyền truy cập bữa ăn của người dùng khác"
            )
        return False

    return True
