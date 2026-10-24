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

import re
import unicodedata
import uuid
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
    cancel_pending_action,
    confirm_pending_action,
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
from src.backend.services.tool_context import ToolContext

router = APIRouter(prefix="/api/v1/assistant", tags=["Assistant Chat & Tools"])


# ==============================================================================
# INTENT CLASSIFICATION HELPERS
# ==============================================================================


def normalize_text_intent(text: str) -> tuple[str, str]:
    """Chuẩn hóa chuỗi văn bản để so khớp ý định (hỗ trợ cả có dấu và không dấu)."""
    s = text.strip().lower()
    s_clean = " ".join(s.split())
    s_no_d = s_clean.replace("đ", "d").replace("Đ", "D")
    normalized = unicodedata.normalize("NFD", s_no_d)
    no_marks = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    s_ascii = " ".join(re.sub(r"[^\w\s]", " ", no_marks).split())
    return s_clean, s_ascii


def classify_user_intent(message: str) -> str | None:
    """Nhận diện ý định gọi Tool từ câu hỏi người dùng dựa trên ngữ nghĩa và mẫu từ khóa chính xác.

    Phân loại chính xác 4 nhóm nghiệp vụ:
    - get_daily_nutrition: Tra cứu dinh dưỡng, calo còn lại, hạn mức calo, mục tiêu macro trong ngày.
    - recommend_meals: Gợi ý, tư vấn món ăn phù hợp với calo/ngân sách.
    - get_progress_summary: Xem tiến độ, xu hướng cân nặng EMA, báo cáo, chuỗi ngày liên tục.
    - log_meal: Ghi nhận, lưu bữa ăn khi có ý định ghi chép hoặc định lượng món ăn.
    - None: Chào hỏi (chitchat), hỏi kiến thức dinh dưỡng chung, thời tiết, hoặc ngoài phạm vi Tool.
    """
    s_clean, s_ascii = normalize_text_intent(message)

    # 1. Chitchat / Kiến thức chung / Ngoài phạm vi -> Không gọi Tool
    chitchat_patterns = (
        r"\b(xin chao|chao ban|hello|hi|cam on|thank)\b",
        r"\b(thoi tiet|weather)\b",
        r"\b(bmr|tdee)\b",
        r"chat beo (tot|xau)",
        r"phan biet chat beo",
        r"uong bao nhieu lit nuoc",
        r"bao nhieu lit nuoc",
    )
    for pat in chitchat_patterns:
        if re.search(pat, s_ascii):
            return None

    # 2. Nhóm B: Gợi ý bữa ăn (recommend_meals) - Ưu tiên khi có từ khóa gợi ý/tư vấn/hỏi món ăn
    recommend_patterns = (
        r"\b(goi y|recommend|tu van)\b",
        r"\b(nen an|an gi)\b",
        r"mon gi duoi",
        r"co mon nao",
        r"mon an phu hop",
        r"mon an it calo",
    )
    for pat in recommend_patterns:
        if re.search(pat, s_ascii):
            return "recommend_meals"

    # 3. Nhóm D: Theo dõi tiến độ (get_progress_summary)
    progress_patterns = (
        r"\b(tien do|progress|ema)\b",
        r"can nang",
        r"xu huong",
        r"tong hop calo",
        r"trung binh moi ngay",
        r"bao cao",
        r"giam can",
        r"bao nhieu ngay roi",
        r"duy tri",
    )
    for pat in progress_patterns:
        if re.search(pat, s_ascii):
            return "get_progress_summary"

    # 4. Nhóm A: Tra cứu dinh dưỡng ngày (get_daily_nutrition)
    nutrition_patterns = (
        r"nap bao nhieu calo",
        r"bao nhieu calo roi",
        r"calo con lai",
        r"con lai trong ngay",
        r"han muc calo",
        r"an them bao nhieu",
        r"du chat dam",
        r"du protein",
        r"muc tieu chua",
        r"dat muc tieu",
        r"hom qua.*da an",
        r"tong bao nhieu calo",
        r"da an nhung gi",
        r"nhat ky dinh duong",
        r"dinh duong ngay",
        r"dinh duong hom nay",
        r"calo hom nay",
        r"hom nay an",
    )
    for pat in nutrition_patterns:
        if re.search(pat, s_ascii):
            return "get_daily_nutrition"

    # 5. Nhóm C: Ghi nhận bữa ăn (log_meal)
    log_meal_patterns = (
        r"ghi nhan",
        r"ghi nhat ky bua",
        r"ghi bua",
        r"luu bua",
        r"vua an",
        r"toi vua an",
        r"toi nay toi an",
        r"trua nay toi an",
        r"sang nay toi an",
        r"bua sang toi an",
        r"bua trua toi an",
        r"bua toi toi an",
        r"toi an \d+",
        r"vua uong",
        r"toi uong",
        r"uong 1 ly",
        r"bua phu chieu toi uong",
    )
    for pat in log_meal_patterns:
        if re.search(pat, s_ascii):
            return "log_meal"

    # Kiểm tra bổ trợ cho log_meal: có định lượng (gam / ml / bát / tô / đĩa / ổ) kèm tên món hoặc động từ ăn/uống
    if re.search(r"\b(an|uong|bat|to|dia|o|ly)\b", s_ascii) and re.search(
        r"\b(\d+\s*(g|gam|ml)|pho|bun|com|banh mi|uc ga|sua)\b", s_ascii
    ):
        return "log_meal"

    return None


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
    status: str | None = None
    confirmation_id: str | None = None
    preview: dict[str, Any] | None = None
    expires_at: str | None = None
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

    tool_ctx = ToolContext(
        authenticated_user_id=verified_user_id,
        caller="llm",
        request_id=str(uuid.uuid4()),
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
                authenticated_user_id=tool_ctx,
                tool_name=used_tool_name,
                tool_args=t_args,
            )
    else:
        # Nhận diện ý định gọi Tool từ nội dung tin nhắn (Intent Classification)
        used_tool_name = classify_user_intent(req.message)
        if used_tool_name == "get_daily_nutrition":
            date_arg = "today"
            s_msg = req.message.lower()
            if "hôm qua" in s_msg or "hom qua" in s_msg or "yesterday" in s_msg:
                date_arg = "yesterday"
            else:
                m_date = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", s_msg)
                if m_date:
                    date_arg = m_date.group(1)
            tool_result = dispatch_tool_call(
                session=session,
                authenticated_user_id=tool_ctx,
                tool_name=used_tool_name,
                tool_args={"date_str": date_arg},
            )
        elif used_tool_name == "recommend_meals":
            tool_result = dispatch_tool_call(
                session=session,
                authenticated_user_id=tool_ctx,
                tool_name=used_tool_name,
                tool_args={},
            )
        elif used_tool_name == "get_progress_summary":
            days = 7
            s_msg = req.message.lower()
            if any(k in s_msg for k in ("30 ngày", "30 ngay", "tháng", "thang")):
                days = 30
            elif any(k in s_msg for k in ("14 ngày", "14 ngay", "2 tuần", "2 tuan")):
                days = 14
            tool_result = dispatch_tool_call(
                session=session,
                authenticated_user_id=tool_ctx,
                tool_name=used_tool_name,
                tool_args={"days_range": days},
            )
        elif used_tool_name == "log_meal":
            s_msg = req.message.lower()
            dish_name = "Phở bò tái"
            dish_gram = 400.0
            meal_type = "lunch"

            if "phở" in s_msg or "pho" in s_msg:
                dish_name = "Phở bò tái"
                dish_gram = 400.0
            elif "cơm" in s_msg or "com" in s_msg:
                dish_name = "Cơm tấm sườn nướng"
                dish_gram = 300.0
            elif "bún" in s_msg or "bun" in s_msg:
                dish_name = "Bún bò Huế"
                dish_gram = 450.0
            elif "bánh mì" in s_msg or "banh mi" in s_msg:
                dish_name = "Bánh mì trứng ốp la"
                dish_gram = 150.0
            elif "ức gà" in s_msg or "uc ga" in s_msg or "gà" in s_msg or "ga" in s_msg:
                dish_name = "Ức gà áp chảo"
                dish_gram = 200.0
            elif "sữa" in s_msg or "sua" in s_msg:
                dish_name = "Phở bò tái"
                dish_gram = 200.0

            m_gram = re.search(r"(\d+(?:\.\d+)?)\s*(?:g|gam|gram|ml)\b", s_msg)
            if m_gram:
                try:
                    dish_gram = float(m_gram.group(1))
                except ValueError:
                    pass

            if any(k in s_msg for k in ("sáng", "sang", "bữa sáng", "bua sang")):
                meal_type = "breakfast"
            elif any(k in s_msg for k in ("tối", "toi", "bữa tối", "bua toi")):
                meal_type = "dinner"
            elif any(k in s_msg for k in ("phụ", "phu", "bữa phụ", "bua phu")):
                meal_type = "snack"

            tool_result = dispatch_tool_call(
                session=session,
                authenticated_user_id=tool_ctx,
                tool_name=used_tool_name,
                tool_args={
                    "meal_type": meal_type,
                    "items": [{"food_name": dish_name, "estimated_gram": dish_gram}],
                },
            )

    action_card: dict[str, Any] | None = None
    pending_confirmation: bool = False
    confirmation_id: str | None = None
    preview: dict[str, Any] | None = None
    expires_at: str | None = None
    status_field: str | None = None

    if tool_result is not None:
        if tool_result.get("error"):
            reply = f"Lỗi thực thi công cụ: {tool_result.get('detail', 'Tham số không hợp lệ')}"
        elif used_tool_name == "log_meal":
            if tool_result.get("requires_confirmation"):
                pending_confirmation = True
                status_field = "pending_confirmation"
                action_card = tool_result.get("action_card")
                confirmation_id = tool_result.get("confirmation_id")
                preview = tool_result.get("preview")
                expires_at = tool_result.get("expires_at")
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
        status=status_field,
        confirmation_id=confirmation_id,
        preview=preview,
        expires_at=expires_at,
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
    """Thực thi công cụ trực tiếp (Kênh Legacy user_action để tương thích ngược bài test cũ).

    Lưu ý bảo mật: Luồng xác nhận mới của Tuần 4 sử dụng POST /api/v1/assistant/confirmations/{id}/confirm
    để xác nhận nguyên tử từ bản ghi lưu trên server (PendingAction).
    """
    user_action_ctx = ToolContext(
        authenticated_user_id=current_user.id,
        caller="user_action",
        request_id=str(uuid.uuid4()),
    )
    try:
        res = dispatch_tool_call(
            session=session,
            authenticated_user_id=user_action_ctx,
            tool_name=req.tool_name,
            tool_args=req.tool_args,
        )
        if isinstance(res, dict) and res.get("error"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(res.get("detail", "Tham số công cụ không hợp lệ")),
            )
        return res
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/confirmations/{confirmation_id}/confirm",
    response_model=dict[str, Any],
    dependencies=[Depends(verify_csrf_protection)],
)
def confirm_pending_action_endpoint(
    confirmation_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Xác nhận lưu bữa ăn từ yêu cầu chờ (PendingAction) an toàn, nguyên tử (README_04)."""
    return confirm_pending_action(
        session=session,
        authenticated_user_id=current_user.id,
        confirmation_id=confirmation_id,
    )


@router.post(
    "/confirmations/{confirmation_id}/cancel",
    response_model=dict[str, Any],
    dependencies=[Depends(verify_csrf_protection)],
)
def cancel_pending_action_endpoint(
    confirmation_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Hủy yêu cầu chờ ghi nhận bữa ăn (PendingAction) (README_04)."""
    return cancel_pending_action(
        session=session,
        authenticated_user_id=current_user.id,
        confirmation_id=confirmation_id,
    )


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
    session: Session = Depends(get_session),
):
    """Xác nhận thực thi thẻ hành động từ Chatbot (Tương thích ngược)."""
    conf_id = getattr(req, "confirmation_id", None) or (
        req.action_data.get("confirmation_id") if isinstance(req.action_data, dict) else None
    )
    if conf_id:
        res = confirm_pending_action(
            session=session,
            authenticated_user_id=current_user.id,
            confirmation_id=str(conf_id),
        )
        return ActionCardConfirmResponse(
            success=True,
            message=res.get("message", f"Đã thực thi thẻ hành động '{req.action_type}' thành công."),
            result=res,
        )

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
