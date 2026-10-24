"""src/ai/llm_client.py
LLM Client Adapter for Gemini API (Supports google-genai and google-generativeai).
Implements Task T2 from AI_ASSISTANT_IMPLEMENTATION_SPEC.md.
"""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from typing import Any, Optional

from pydantic import BaseModel, Field

from src.ai.config import get_gemini_api_key
from src.ai.tool_definitions import get_gemini_tool_declarations

logger = logging.getLogger("nutrisnap.ai.llm_client")

DEFAULT_MODEL_NAME = "gemini-1.5-flash"
DEFAULT_TIMEOUT_SECONDS = 8
DEFAULT_MAX_TOOL_ROUNDS = 3


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
        try:
            self.timeout_seconds = int(
                os.getenv("LLM_TIMEOUT_SECONDS", str(timeout_seconds or DEFAULT_TIMEOUT_SECONDS))
            )
        except ValueError:
            self.timeout_seconds = DEFAULT_TIMEOUT_SECONDS

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
            logger.info("Gemini API key is not configured; using offline fallback.")
            return LLMResult(
                text="Trợ lý đang chạy chế độ cơ bản (chưa cấu hình API Key).",
                is_fallback=True,
            )

        tools_to_use = tools if tools is not None else get_gemini_tool_declarations()
        timeout = timeout_seconds or self.timeout_seconds

        # 1. Thử dùng google-genai nếu thư viện mới có mặt
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=self.api_key)
            # Chuyển messages sang dạng phù hợp
            contents = []
            for m in messages:
                role = "model" if m.get("role") in ("assistant", "model") else "user"
                contents.append(types.Content(role=role, parts=[types.Part.from_text(text=m.get("content", ""))]))

            response = client.models.generate_content(
                model=self.model_name,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    tools=tools_to_use,
                    temperature=0.2,
                ),
            )
            return self._parse_genai_response(response)
        except ImportError:
            pass
        except Exception as exc:
            logger.warning("Error with google-genai SDK: %s. Falling back to google.generativeai", exc)

        # 2. Dùng google.generativeai (ổn định)
        try:
            import google.generativeai as gai

            gai.configure(api_key=self.api_key)
            model = gai.GenerativeModel(
                model_name=self.model_name,
                system_instruction=system_instruction,
                tools=tools_to_use,  # type: ignore
                generation_config={"temperature": 0.2},
            )

            # Chuyển đổi lịch sử
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
            logger.warning("Error calling Gemini API: %s. Returning fallback.", exc)
            return LLMResult(
                text=f"Trợ lý đang chạy chế độ cơ bản ({exc}).",
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
