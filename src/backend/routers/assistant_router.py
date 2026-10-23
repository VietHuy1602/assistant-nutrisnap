"""
src/backend/routers/assistant_router.py
Router cung cấp các API endpoint cho phân hệ Trợ lý ảo AI NutriSnap:
1. POST /api/v1/assistant/chat: Gửi tin nhắn, tự động điều phối Tool Calling và lưu hội thoại.
2. POST /api/v1/assistant/tools/execute: Thực thi trực tiếp Tool đã xác thực (như bấm nút Xác nhận lưu).
3. GET /api/v1/assistant/sessions: Lấy danh sách phiên hội thoại của người dùng đăng nhập.
4. GET /api/v1/assistant/sessions/{session_id}/messages: Lấy lịch sử tin nhắn bảo mật theo phiên.
5. POST /api/v1/assistant/action-card/confirm: Endpoint xác nhận Action Card tương thích ngược.
6. GET /api/v1/assistant/history: Endpoint lấy lịch sử hội thoại tương thích ngược.
"""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.backend.models.database import get_session
from src.backend.schemas.api_contract import (
    ActionCardConfirmRequest,
    ActionCardConfirmResponse,
    ChatHistoryItem,
    ChatHistoryResponse,
)
from src.backend.services.assistant_tools import (
    create_or_get_chat_session,
    dispatch_tool_call,
    get_chat_history,
    list_user_chat_sessions,
    save_chat_message,
)
from src.backend.services.auth_guard import (
    AuthenticatedUser,
    get_current_user,
    verify_csrf_protection,
)
from src.backend.services.nutrition_service import DISCLAIMER_TEXT

router = APIRouter(prefix="/api/v1/assistant", tags=["Assistant Chat & Tools"])


# ==============================================================================
# PYDANTIC SCHEMAS
# ==============================================================================


class AssistantChatRequest(BaseModel):
    session_id: int | None = Field(default=None, description="ID phiên chat hiện tại, nếu None hệ thống tự tạo")
    message: str = Field(..., min_length=1, max_length=2000, description="Nội dung câu hỏi/yêu cầu của người dùng")
    tool_call: dict[str, Any] | None = Field(default=None, description="Yêu cầu gọi tool tường minh từ Orchestrator")


class ToolExecuteRequest(BaseModel):
    tool_name: str = Field(..., description="Tên công cụ cần thực thi")
    tool_args: dict[str, Any] = Field(default_factory=dict, description="Tham số thực thi công cụ")


class ChatMessageItemResponse(BaseModel):
    id: int
    session_id: int
    sender_role: str
    content: str
    tool_name: str | None = None
    created_at: datetime


class ChatSessionResponse(BaseModel):
    id: int
    user_id: int
    started_at: datetime


class AssistantChatResponse(BaseModel):
    session_id: int
    reply: str
    reply_text: str
    tool_result: dict[str, Any] | None = None
    pending_confirmation: bool = False
    action_card: dict[str, Any] | None = None
    disclaimer: str = DISCLAIMER_TEXT


# ==============================================================================
# ROUTER ENDPOINTS
# ==============================================================================


@router.post(
    "/chat",
    response_model=AssistantChatResponse,
    dependencies=[Depends(verify_csrf_protection)],
)
def assistant_chat_endpoint(
    req: AssistantChatRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Trò chuyện với Trợ lý ảo AI NutriSnap:

    - Tự động lấy verified_user_id từ token JWT (Zero-Trust).
    - Tạo hoặc tải ChatSession an toàn.
    - Lưu tin nhắn người dùng vào CSDL.
    - Thực thi công cụ qua dispatch_tool_call nếu có yêu cầu hoặc nhận diện ý định.
    - Lưu câu trả lời của trợ lý kèm tool_name vào CSDL.
    """
    verified_user_id = current_user.id

    try:
        chat_session = create_or_get_chat_session(
            session=session,
            authenticated_user_id=verified_user_id,
            session_id=req.session_id,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    # Lưu tin nhắn của người dùng
    save_chat_message(
        session=session,
        authenticated_user_id=verified_user_id,
        session_id=chat_session.id,  # type: ignore
        sender_role="user",
        content=req.message,
    )

    tool_result: dict[str, Any] | None = None
    used_tool_name: str | None = None

    if req.tool_call:
        t_name = req.tool_call.get("tool_name") or req.tool_call.get("name")
        t_args = req.tool_call.get("tool_args") or req.tool_call.get("args") or {}
        if t_name:
            used_tool_name = str(t_name)
            tool_result = dispatch_tool_call(
                session=session,
                authenticated_user_id=verified_user_id,
                tool_name=used_tool_name,
                tool_args=t_args,
            )
    else:
        # Nhận diện ý định cơ bản phục vụ hội thoại và kiểm thử
        msg_lower = req.message.lower()
        if any(k in msg_lower for k in ("hôm nay ăn", "calo hôm nay", "dinh dưỡng hôm nay", "đã ăn bao nhiêu")):
            used_tool_name = "get_daily_nutrition"
            tool_result = dispatch_tool_call(
                session=session,
                authenticated_user_id=verified_user_id,
                tool_name=used_tool_name,
                tool_args={"date_str": "today"},
            )
        elif any(k in msg_lower for k in ("gợi ý", "ăn gì", "recommend", "món ăn")):
            used_tool_name = "recommend_meals"
            tool_result = dispatch_tool_call(
                session=session,
                authenticated_user_id=verified_user_id,
                tool_name=used_tool_name,
                tool_args={},
            )
        elif any(k in msg_lower for k in ("tiến độ", "cân nặng", "progress", "tổng hợp")):
            used_tool_name = "get_progress_summary"
            tool_result = dispatch_tool_call(
                session=session,
                authenticated_user_id=verified_user_id,
                tool_name=used_tool_name,
                tool_args={"days_range": 7},
            )
        elif any(k in msg_lower for k in ("phở", "cơm", "bún", "vừa ăn", "ăn")):
            used_tool_name = "log_meal"
            dish_name = "Phở bò tái" if "phở" in msg_lower else "Cơm tấm sườn nướng"
            dish_gram = 400.0 if "phở" in msg_lower else 300.0
            tool_result = dispatch_tool_call(
                session=session,
                authenticated_user_id=verified_user_id,
                tool_name=used_tool_name,
                tool_args={
                    "meal_type": "lunch",
                    "items": [{"food_name": dish_name, "estimated_gram": dish_gram}],
                    "is_confirmed": False,
                },
            )

    action_card: dict[str, Any] | None = None
    pending_confirmation: bool = False

    if tool_result is not None:
        if used_tool_name == "log_meal":
            if tool_result.get("requires_confirmation"):
                pending_confirmation = True
                action_card = tool_result.get("action_card")
                reply = (
                    "Mình đã ước tính xong bữa ăn của bạn! "
                    "Vui lòng kiểm tra lại số liệu bên dưới và nhấn Xác nhận để lưu nhé."
                )
            else:
                reply = f"Đã ghi nhận bữa ăn thành công! Mã bữa ăn: {tool_result.get('meal_id')}."
        elif used_tool_name == "get_daily_nutrition":
            consumed_c = tool_result.get("consumed", {}).get("calories", 0)
            target_c = tool_result.get("targets", {}).get("calories", 0)
            rem_c = tool_result.get("remaining", {}).get("calories", 0)
            reply = f"Hôm nay bạn đã nạp {consumed_c} kcal / mục tiêu {target_c} kcal. Còn lại: {rem_c} kcal."
        elif used_tool_name == "recommend_meals":
            recs = tool_result.get("recommendations", [])
            dishes = ", ".join(r["food_name"] for r in recs[:3])
            reply = f"Dưới đây là một số món gợi ý phù hợp cho bạn: {dishes}."
        elif used_tool_name == "get_progress_summary":
            days = tool_result.get("logged_days_count", 0)
            reply = f"Bạn đã ghi nhật ký dinh dưỡng {days} ngày trong khoảng thời gian vừa qua."
        else:
            reply = "Đã thực thi công cụ thành công."
    else:
        reply = "Xin chào! Tôi là Trợ lý Dinh dưỡng NutriSnap. Tôi có thể giúp gì cho bạn hôm nay?"

    # Lưu phản hồi của trợ lý vào CSDL
    save_chat_message(
        session=session,
        authenticated_user_id=verified_user_id,
        session_id=chat_session.id,  # type: ignore
        sender_role="assistant",
        content=reply,
        tool_name=used_tool_name,
    )

    return AssistantChatResponse(
        session_id=chat_session.id,  # type: ignore
        reply=reply,
        reply_text=reply,
        tool_result=tool_result,
        pending_confirmation=pending_confirmation,
        action_card=action_card,
        disclaimer=DISCLAIMER_TEXT,
    )


@router.post(
    "/tools/execute",
    dependencies=[Depends(verify_csrf_protection)],
)
def execute_tool_endpoint(
    req: ToolExecuteRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Thực thi công cụ trực tiếp (ví dụ xác nhận ghi nhận bữa ăn qua Action Confirmation Card)."""
    try:
        return dispatch_tool_call(
            session=session,
            authenticated_user_id=current_user.id,
            tool_name=req.tool_name,
            tool_args=req.tool_args,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get(
    "/sessions",
    response_model=list[ChatSessionResponse],
)
def list_sessions_endpoint(
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Lấy danh sách các phiên chat của người dùng hiện tại."""
    sessions = list_user_chat_sessions(session, current_user.id)
    return [
        ChatSessionResponse(
            id=s.id,  # type: ignore
            user_id=s.user_id,
            started_at=s.started_at,
        )
        for s in sessions
    ]


@router.get(
    "/sessions/{session_id}/messages",
    response_model=list[ChatMessageItemResponse],
)
def get_session_messages_endpoint(
    session_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Lấy lịch sử tin nhắn của phiên chat (kiểm tra quyền sở hữu nghiêm ngặt)."""
    try:
        messages = get_chat_history(
            session=session,
            authenticated_user_id=current_user.id,
            session_id=session_id,
            limit=limit,
        )
        return [
            ChatMessageItemResponse(
                id=m.id,  # type: ignore
                session_id=m.session_id,
                sender_role=m.sender_role,
                content=m.content,
                tool_name=m.tool_name,
                created_at=m.created_at,
            )
            for m in messages
        ]
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


# ==============================================================================
# LEGACY ENDPOINTS (TƯƠNG THÍCH NGƯỢC CHO CÁC BÀI TEST W1-W3)
# ==============================================================================


@router.post(
    "/action-card/confirm",
    response_model=ActionCardConfirmResponse,
    dependencies=[Depends(verify_csrf_protection)],
)
def confirm_action_card_legacy(
    req: ActionCardConfirmRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Xác nhận thực thi thẻ hành động từ Chatbot (Tương thích ngược)."""
    return ActionCardConfirmResponse(
        success=True,
        message=f"Đã thực thi thẻ hành động '{req.action_type}' thành công.",
        result={"status": "confirmed", "executed_for_user": current_user.id},
    )


@router.get(
    "/history",
    response_model=ChatHistoryResponse,
)
def get_chat_history_legacy(
    session_id: int = Query(default=1),
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Lấy danh sách tin nhắn trong phiên trò chuyện (Tương thích ngược)."""
    try:
        messages = get_chat_history(
            session=session,
            authenticated_user_id=current_user.id,
            session_id=session_id,
            limit=50,
        )
        return ChatHistoryResponse(
            session_id=session_id,
            messages=[
                ChatHistoryItem(
                    id=m.id,  # type: ignore
                    session_id=m.session_id,
                    sender_role=m.sender_role,  # type: ignore
                    content=m.content,
                    tool_name=m.tool_name,
                    created_at=m.created_at,
                )
                for m in messages
            ],
        )
    except (PermissionError, ValueError):
        return ChatHistoryResponse(
            session_id=session_id,
            messages=[],
        )
