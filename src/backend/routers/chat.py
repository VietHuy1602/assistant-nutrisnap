"""
src/backend/routers/chat.py
Router cung cấp các API endpoint chính cho AI Nutrition Coach (NutriCoach):
1. POST /api/chat: Trò chuyện trực tiếp với AI Coach qua Orchestrator.
2. GET /api/chat/history: Truy xuất lịch sử hội thoại của người dùng.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.ai.orchestrator import orchestrate_chat
from src.backend.core.config import settings
from src.backend.models.database import get_session
from src.backend.services.api_security import rate_limit_dependency
from src.backend.services.assistant_tools import (
    create_or_get_chat_session,
    get_chat_history,
    save_chat_message,
)
from src.backend.services.auth_guard import (
    AuthenticatedUser,
    get_current_user,
    verify_csrf_protection,
)
from src.backend.services.nutrition_service import DISCLAIMER_TEXT

logger = logging.getLogger("nutrisnap.backend.routers.chat")

router = APIRouter(prefix="/api/chat", tags=["AI Coach Chat"])


# ==============================================================================
# SCHEMAS
# ==============================================================================


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="Nội dung câu hỏi/yêu cầu của người dùng")
    session_id: Optional[int] = Field(default=None, description="ID phiên chat hiện tại, nếu None hệ thống tự tạo")
    tool_call: Optional[dict[str, Any]] = Field(default=None, description="Lệnh gọi tool tường minh nếu có")


class ChatResponse(BaseModel):
    session_id: int = Field(..., description="ID phiên hội thoại")
    reply: str = Field(..., description="Câu trả lời từ AI Coach")
    reply_text: str = Field(..., description="Alias tương thích ngược cho reply")
    tool_called: Optional[str] = Field(default=None, description="Tên công cụ đã thực thi")
    tool_result: Optional[dict[str, Any]] = Field(default=None, description="Kết quả thực thi công cụ")
    pending_confirmation: bool = Field(default=False, description="Cần người dùng xác nhận hành động")
    action_card: Optional[dict[str, Any]] = Field(default=None, description="Thẻ hành động preview")
    is_fallback: bool = Field(default=False, description="Đang chạy chế độ offline fallback")
    engine: str = Field(default="llm", description="Engine thực thi: llm hoặc fallback")
    disclaimer: str = Field(default=DISCLAIMER_TEXT, description="Tuyên bố miễn trừ trách nhiệm")


class ChatHistoryItem(BaseModel):
    id: int
    session_id: int
    sender_role: str
    content: str
    tool_name: Optional[str] = None
    created_at: datetime


# ==============================================================================
# ENDPOINTS
# ==============================================================================


@router.post(
    "",
    response_model=ChatResponse,
    dependencies=[
        Depends(verify_csrf_protection),
        Depends(rate_limit_dependency("assistant_chat", settings.ASSISTANT_CHAT_RATE_LIMIT)),
    ],
)
def chat_endpoint(
    req: ChatRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Điểm vào duy nhất cho luồng trò chuyện với AI Coach (POST /api/chat):
    - Zero-Trust: user_id được lấy hoàn toàn từ token đã xác thực.
    - Không nuốt lỗi: Mọi lỗi từ AI layer được log đầy đủ và trả mã lỗi rõ ràng.
    """
    verified_user_id = current_user.id

    try:
        chat_session = create_or_get_chat_session(
            session=session,
            authenticated_user_id=verified_user_id,
            session_id=req.session_id,
        )
    except PermissionError as exc:
        logger.warning("Truy cập phiên chat trái phép cho user %s: %s", verified_user_id, exc)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    # Lưu tin nhắn người dùng
    save_chat_message(
        session=session,
        authenticated_user_id=verified_user_id,
        session_id=chat_session.id,  # type: ignore
        sender_role="user",
        content=req.message,
    )

    # Tải lịch sử tin nhắn gần nhất làm context
    recent_history = get_chat_history(
        session=session,
        authenticated_user_id=verified_user_id,
        session_id=chat_session.id,  # type: ignore
        limit=20,
    )
    chat_history_payload = [
        {"role": m.sender_role, "content": m.content}
        for m in recent_history
        if m.sender_role in ("user", "assistant") and m.content != req.message
    ]

    # Điều phối qua AI Orchestrator
    try:
        orch_res = orchestrate_chat(
            session=session,
            user_id=verified_user_id,
            message=req.message,
            explicit_tool_call=req.tool_call,
            chat_history=chat_history_payload,
        )
    except Exception as exc:
        logger.exception("Lỗi nghiêm trọng khi điều phối AI Orchestrator: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Hệ thống AI Coach tạm thời gián đoạn kết nối. Vui lòng thử lại sau.",
        ) from exc

    reply = orch_res.reply or orch_res.reply_text

    # Lưu phản hồi của trợ lý vào CSDL
    save_chat_message(
        session=session,
        authenticated_user_id=verified_user_id,
        session_id=chat_session.id,  # type: ignore
        sender_role="assistant",
        content=reply,
        tool_name=orch_res.tool_called,
    )

    return ChatResponse(
        session_id=chat_session.id,  # type: ignore
        reply=reply,
        reply_text=reply,
        tool_called=orch_res.tool_called,
        tool_result=orch_res.tool_result,
        pending_confirmation=orch_res.pending_confirmation,
        action_card=orch_res.action_card,
        is_fallback=orch_res.is_fallback,
        engine=getattr(orch_res, "engine", "llm" if not orch_res.is_fallback else "fallback"),
        disclaimer=DISCLAIMER_TEXT,
    )


@router.get(
    "/history",
    response_model=list[ChatHistoryItem],
    dependencies=[Depends(verify_csrf_protection)],
)
def chat_history_endpoint(
    session_id: Optional[int] = Query(default=None, description="Lọc theo ID phiên chat"),
    limit: int = Query(default=20, ge=1, le=100, description="Số lượng tin nhắn tối đa"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Lấy lịch sử hội thoại của người dùng đăng nhập hiện tại."""
    verified_user_id = current_user.id

    messages = get_chat_history(
        session=session,
        authenticated_user_id=verified_user_id,
        session_id=session_id,
        limit=limit,
    )

    return [
        ChatHistoryItem(
            id=m.id,  # type: ignore
            session_id=m.session_id,
            sender_role=m.sender_role,
            content=m.content,
            tool_name=m.tool_name,
            created_at=m.created_at,
        )
        for m in messages
    ]

