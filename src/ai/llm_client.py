"""src/ai/llm_client.py
LLM Client Adapter for Gemini API (Supports google-genai and google-generativeai).
Implements Task T2 from AI_ASSISTANT_IMPLEMENTATION_SPEC.md.
"""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from src.ai.config import (
    check_gemini_live_health,
    get_gemini_api_key,
    get_gemini_model_name,
    get_gemini_timeout_seconds,
)
from src.ai.tool_definitions import get_gemini_tool_declarations

logger = logging.getLogger("nutrisnap.ai.llm_client")

DEFAULT_MODEL_NAME = "gemini-2.5-flash"
DEFAULT_TIMEOUT_SECONDS = 15
DEFAULT_MAX_TOOL_ROUNDS = 5

_last_error_code: Optional[str] = None
_last_error_at: Optional[str] = None
_last_error_msg: Optional[str] = None


def record_llm_error(code: str, msg: str) -> None:
    """Ghi nhận lỗi gần nhất của LLM Client để phục vụ endpoint health check."""
    global _last_error_code, _last_error_at, _last_error_msg
    _last_error_code = code
    _last_error_msg = msg[:300]
    _last_error_at = datetime.now(UTC).isoformat()


# Kết quả lần chat gần nhất: health check chỉ "ping" được Gemini, còn đây là trạng thái thật
# của câu trả lời người dùng vừa nhận (llm hay chế độ cơ bản).
_last_chat_fell_back = False


def record_chat_outcome(used_llm: bool, reason: str = "") -> None:
    """Ghi nhận lần chat gần nhất có được AI trả lời thật hay phải dùng chế độ cơ bản."""
    global _last_chat_fell_back, _last_error_code, _last_error_msg, _last_error_at
    _last_chat_fell_back = not used_llm
    if used_llm:
        _last_error_code = None
        _last_error_msg = None
        _last_error_at = None
    else:
        record_llm_error("CHAT_FALLBACK", reason or "Gemini không trả lời được, đã dùng chế độ cơ bản.")


def get_llm_status() -> dict[str, Any]:
    """Lấy trạng thái vận hành của LLM cho endpoint health check (trung thực, có cache 60s)."""
    health = check_gemini_live_health()
    configured = health.get("configured", False)
    status_val = health.get("status", "fallback")
    # Ping thành công nhưng câu chat vừa rồi vẫn rơi về chế độ cơ bản: báo đúng cho giao diện
    if status_val == "online" and _last_chat_fell_back:
        status_val = "fallback"
    return {
        "status": status_val,
        "mode": status_val,
        "model": health.get("model", get_gemini_model_name()),
        "configured": configured,
        "last_error_code": _last_error_code or (None if status_val == "online" else "FALLBACK_MODE"),
        "last_error_at": _last_error_at,
        "last_error_msg": _last_error_msg or health.get("detail"),
    }


class ToolCall(BaseModel):
    """Represents a structured function call returned by LLM."""

    name: str = Field(..., description="Tên công cụ cần gọi")
    args: dict[str, Any] = Field(default_factory=dict, description="Tham số truyền vào công cụ")


class LLMResult(BaseModel):
    """Normalized result returned by any LLM client implementation."""

    text: str = Field(default="", description="Nội dung văn bản trả lời")
    tool_calls: list[ToolCall] = Field(default_factory=list, description="Danh sách các lệnh gọi công cụ")
    is_fallback: bool = Field(default=False, description="True nếu trả lời từ chế độ giả lập hoặc lỗi")
    raw_response: Any = Field(default=None, description="Đối tượng phản hồi nguyên bản từ SDK")


class BaseLLMClient(ABC):
    """Abstract base class for LLM clients."""

    @abstractmethod
    def generate(
        self,
        messages: list[dict[str, str]],
        system_instruction: str,
        tools: Optional[list[Any]] = None,
        timeout_seconds: Optional[int] = None,
    ) -> LLMResult:
        """Sinh phản hồi và công cụ từ danh sách tin nhắn."""
        pass


class GeminiLLMClient(BaseLLMClient):
    """Adapter cho Gemini API.
    Ưu tiên google.genai nếu có, tương thích ngược với google.generativeai.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        if api_key is not None:
            self.api_key = api_key.strip()
        else:
            self.api_key = (get_gemini_api_key() or os.getenv("GEMINI_API_KEY", "")).strip()
        self.model_name = (
            model_name or os.getenv("GEMINI_MODEL") or os.getenv("GEMINI_MODEL_NAME") or DEFAULT_MODEL_NAME
        ).strip()
        if timeout_seconds is not None:
            self.timeout_seconds = timeout_seconds
        else:
            self.timeout_seconds = get_gemini_timeout_seconds()

    def is_configured(self) -> bool:
        """Kiểm tra xem API key có hợp lệ không."""
        if not self.api_key:
            return False
        invalid_keys = {
            "YOUR_GEMINI_API_KEY_HERE",
            "your_gemini_api_key_here",
            "your_actual_api_key_here",
            "change-me",
            "mock",
            "dummy_api_key_for_testing",
            "your_api_key_here",
        }
        return self.api_key not in invalid_keys and len(self.api_key) >= 15

    def generate(
        self,
        messages: list[dict[str, str]],
        system_instruction: str,
        tools: Optional[list[Any]] = None,
        timeout_seconds: Optional[int] = None,
    ) -> LLMResult:
        if not self.is_configured():
            record_llm_error("API_KEY_NOT_CONFIGURED", "Khóa Gemini API chưa được cấu hình hoặc là giá trị mẫu.")
            logger.info("Gemini API key is not configured; using offline fallback.")
            return LLMResult(
                text="Trợ lý đang chạy chế độ cơ bản (chưa cấu hình API Key).",
                is_fallback=True,
            )

        tools_to_use = tools if tools is not None else get_gemini_tool_declarations()
        timeout = timeout_seconds or self.timeout_seconds
        candidate_models = [self.model_name]
        for m_cand in ("gemini-2.5-flash", "gemini-2.0-flash"):
            if m_cand not in candidate_models:
                candidate_models.append(m_cand)

        last_exc: Optional[Exception] = None

        # 1. Thử dùng google-genai nếu thư viện mới có mặt
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=self.api_key)
            contents = []
            for m in messages:
                role = "model" if m.get("role") in ("assistant", "model") else "user"
                contents.append(types.Content(role=role, parts=[types.Part.from_text(text=m.get("content", ""))]))

            for model_id in candidate_models:
                try:
                    response = client.models.generate_content(
                        model=model_id,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            tools=tools_to_use,
                            temperature=0.2,
                        ),
                    )
                    return self._parse_genai_response(response)
                except Exception as exc:
                    last_exc = exc
                    record_llm_error(type(exc).__name__, str(exc))
                    logger.warning("google-genai model '%s' failed: %s", model_id, exc)
        except ImportError:
            pass
        except Exception as exc:
            last_exc = exc
            record_llm_error(type(exc).__name__, str(exc))
            logger.warning("Error with google-genai SDK: %s. Falling back to google.generativeai", exc)

        # 2. Dùng google.generativeai (ổn định)
        try:
            import google.generativeai as gai

            gai.configure(api_key=self.api_key)

            for model_id in candidate_models:
                try:
                    model = gai.GenerativeModel(
                        model_name=model_id,
                        system_instruction=system_instruction,
                        tools=tools_to_use,  # type: ignore
                        generation_config={"temperature": 0.2},
                    )

                    chat = model.start_chat()
                    last_message = ""
                    for m in messages[:-1]:
                        role = "model" if m.get("role") in ("assistant", "model") else "user"
                        chat.history.append({"role": role, "parts": [m.get("content", "")]})
                    if messages:
                        last_message = messages[-1].get("content", "")

                    response = chat.send_message(last_message, request_options={"timeout": timeout})
                    return self._parse_generativeai_response(response)
                except Exception as exc:
                    last_exc = exc
                    record_llm_error(type(exc).__name__, str(exc))
                    logger.warning("google.generativeai model '%s' failed: %s", model_id, exc)
        except Exception as exc:
            last_exc = exc
            record_llm_error(type(exc).__name__, str(exc))
            logger.warning("Error calling Gemini API: %s. Returning fallback.", exc)

        err_msg = str(last_exc) if last_exc else "Kết nối AI không thành công"
        return LLMResult(
            text=f"Trợ lý đang chạy chế độ cơ bản ({err_msg}).",
            is_fallback=True,
        )

    def _parse_genai_response(self, response: Any) -> LLMResult:
        tool_calls: list[ToolCall] = []
        text = ""
        try:
            for candidate in getattr(response, "candidates", []):
                for part in getattr(candidate.content, "parts", []):
                    fn = getattr(part, "function_call", None)
                    if fn:
                        name = getattr(fn, "name", "")
                        args = dict(getattr(fn, "args", {}))
                        tool_calls.append(ToolCall(name=name, args=args))
                    elif getattr(part, "text", None):
                        text += part.text
        except Exception as e:
            logger.debug("Failed to parse genai response: %s", e)

        if not text and getattr(response, "text", None):
            text = response.text
        return LLMResult(text=text, tool_calls=tool_calls, raw_response=response)

    def _parse_generativeai_response(self, response: Any) -> LLMResult:
        tool_calls: list[ToolCall] = []
        text = ""
        try:
            if hasattr(response, "candidates") and response.candidates:
                first_cand = response.candidates[0]
                for part in getattr(first_cand.content, "parts", []):
                    fn = getattr(part, "function_call", None)
                    if fn:
                        name = getattr(fn, "name", "")
                        args = dict(getattr(fn, "args", {}))
                        tool_calls.append(ToolCall(name=name, args=args))
                    elif getattr(part, "text", None):
                        text += part.text
        except Exception as e:
            logger.debug("Failed to parse generativeai response: %s", e)

        if not text:
            try:
                text = response.text or ""
            except Exception:
                text = ""
        return LLMResult(text=text, tool_calls=tool_calls, raw_response=response)


class MockLLMClient(BaseLLMClient):
    """Client giả lập dùng cho kiểm thử tự động không cần API Key thật."""

    def __init__(
        self,
        canned_response: Optional[str] = None,
        canned_tool_call: Optional[ToolCall] = None,
    ) -> None:
        self.canned_response = canned_response
        self.canned_tool_call = canned_tool_call
        self.call_history: list[dict[str, Any]] = []

    def generate(
        self,
        messages: list[dict[str, str]],
        system_instruction: str,
        tools: Optional[list[Any]] = None,
        timeout_seconds: Optional[int] = None,
    ) -> LLMResult:
        self.call_history.append({
            "messages": messages,
            "system_instruction": system_instruction,
            "tools": tools,
        })
        tool_calls = [self.canned_tool_call] if self.canned_tool_call else []
        reply_text = self.canned_response or "Phản hồi giả lập từ MockLLMClient."
        return LLMResult(
            text=reply_text,
            tool_calls=tool_calls,
            is_fallback=False,
        )


def get_llm_client(
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
    force_mock: bool = False,
) -> BaseLLMClient:
    """Factory lấy LLM client thích hợp dựa trên biến môi trường."""
    use_llm = os.getenv("USE_LLM", "true").lower() in ("true", "1", "yes")
    if force_mock or not use_llm:
        return MockLLMClient()
    return GeminiLLMClient(api_key=api_key, model_name=model_name)
