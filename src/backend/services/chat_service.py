"""
src/backend/services/chat_service.py
Dịch vụ quản lý và lưu trữ hội thoại trợ lý ảo NutriSnap (Re-export layer).
Tương thích với mọi module của Cặp 2 (Frontend) và Cặp 3 (AI Intelligence).
"""

from src.backend.models.schema import ChatMessage, ChatSession
from src.backend.services.assistant_tools import (
    create_or_get_chat_session,
    delete_user_chat_session,
    get_chat_history,
    list_user_chat_sessions,
    save_chat_message,
)

__all__ = [
    "ChatMessage",
    "ChatSession",
    "create_or_get_chat_session",
    "delete_user_chat_session",
    "get_chat_history",
    "list_user_chat_sessions",
    "save_chat_message",
]
