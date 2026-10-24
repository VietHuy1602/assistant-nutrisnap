"""
src/backend/services/tool_context.py
Đối tượng ngữ cảnh bất biến (ToolContext) và kiểm toán an toàn (Audit Logging)
cho phân hệ AI Tool Calling theo nguyên tắc Zero-Trust (README_03).
"""

import logging
from dataclasses import dataclass
from typing import Literal

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ToolContext:
    """
    Ngữ cảnh thực thi công cụ bất biến (frozen=True):
    - authenticated_user_id: ID người dùng đã xác thực độc quyền từ HttpOnly Cookie / JWT.
    - caller: Nguồn kích hoạt công cụ:
        * 'llm': Được sinh ra từ LLM / Orchestrator trong phiên trò chuyện.
                 Bắt buộc tuân thủ schema nghiêm ngặt (không được phép đặt is_confirmed=True).
        * 'user_action': Do người dùng chủ động nhấn nút xác nhận trên Action Card.
                 Được phép mang cờ is_confirmed=True để ghi vào CSDL.
        * Mặc định là 'llm' (fail-closed) để đảm bảo an toàn tuyệt đối nếu không chỉ định.
    - request_id: Mã định danh yêu cầu phục vụ truy vết phân tán (distributed tracing).
    """

    authenticated_user_id: int
    caller: Literal["llm", "user_action"] = "llm"
    request_id: str | None = None


def log_tool_audit(
    ctx: ToolContext,
    tool_name: str,
    status: Literal["ok", "denied"],
    detail: str | None = None,
) -> None:
    """
    Ghi nhật ký kiểm toán nhẹ (Audit Log) theo mục 3.9 của README_03.
    Chỉ ghi nhận request_id, user_id, caller, tool_name và trạng thái (ok/denied).
    TUYỆT ĐỐI KHÔNG ghi token, cookie, mật khẩu hay nội dung chi tiết của món ăn.
    """
    logger.info(
        "TOOL_AUDIT: request_id=%s user_id=%s caller=%s tool=%s status=%s%s",
        ctx.request_id or "none",
        ctx.authenticated_user_id,
        ctx.caller,
        tool_name,
        status,
        f" detail={detail}" if detail else "",
    )
