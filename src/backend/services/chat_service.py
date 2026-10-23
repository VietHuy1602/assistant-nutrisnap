"""
src/backend/services/chat_service.py
Dịch vụ quản lý và lưu trữ hội thoại trợ lý ảo NutriSnap (Re-export & Security layer).
Tương thích với mọi module của Cặp 2 (Frontend) và Cặp 3 (AI Intelligence).
"""

from src.backend.models.schema import ChatMessage, ChatSession
from src.backend.services.assistant_tools import (
    create_or_get_chat_session,
    delete_user_chat_session,
    get_chat_history,
    get_or_create_chat_session,
    list_user_chat_sessions,
    save_chat_message,
)
from src.backend.services.tool_security import (
    sanitize_llm_tool_arguments,
    verify_meal_ownership,
    verify_session_ownership,
)

__all__ = [
    "ChatMessage",
    "ChatSession",
    "create_or_get_chat_session",
    "delete_user_chat_session",
    "get_chat_history",
    "get_or_create_chat_session",
    "list_user_chat_sessions",
    "sanitize_llm_tool_arguments",
    "save_chat_message",
    "verify_meal_ownership",
    "verify_session_ownership",
]
