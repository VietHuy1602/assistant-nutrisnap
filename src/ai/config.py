"""
src/ai/config.py
Bộ nạp cấu hình trung tâm và quản lý biến môi trường cho tầng AI & Backend NutriSnap.
Tự động tìm và nạp file .env ở thư mục gốc dự án bằng python-dotenv.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# Tự động tìm và nạp file .env ở thư mục gốc dự án
ROOT_DIR = Path(__file__).resolve().parents[2]
DOTENV_PATH = ROOT_DIR / ".env"

if DOTENV_PATH.exists():
    load_dotenv(dotenv_path=DOTENV_PATH, override=True)
else:
    load_dotenv(override=True)


def get_gemini_api_key() -> str | None:
    """Lấy khóa API Gemini từ biến môi trường."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return None
    api_key = api_key.strip()
    invalid_keys = {
        "YOUR_GEMINI_API_KEY_HERE",
        "your_gemini_api_key_here",
        "your_actual_api_key_here",
        "change-me",
        "mock",
        "dummy_api_key_for_testing",
        "your_api_key_here",
    }
    if api_key in invalid_keys or len(api_key) < 15:
        return None
    return api_key


def is_live_ai_available() -> bool:
    """Kiểm tra xem khóa Gemini API đã được cấu hình hợp lệ để kích hoạt AI trực tuyến hay chưa."""
    return get_gemini_api_key() is not None


def get_gemini_model_name() -> str:
    """Lấy tên mô hình Gemini mặc định từ biến môi trường."""
    return (
        os.getenv("GEMINI_MODEL_NAME")
        or os.getenv("GEMINI_MODEL")
        or "gemini-2.5-flash"
    ).strip()


def get_gemini_timeout_seconds() -> int:
    """Lấy thời gian chờ tối đa (timeout) cho các cuộc gọi Gemini API (mặc định 15s)."""
    raw = os.getenv("GEMINI_TIMEOUT_SECONDS") or os.getenv("LLM_TIMEOUT_SECONDS") or "15"
    try:
        val = int(raw.strip())
        return val if val > 0 else 15
    except ValueError:
        return 15


_health_cache: dict[str, Any] = {
    "checked_at": 0.0,
    "result": None,
}


def check_gemini_live_health(force_refresh: bool = False, cache_ttl_seconds: float = 60.0) -> dict[str, Any]:
    """Kiểm tra trạng thái kết nối trung thực tới Gemini API (có bộ nhớ đệm cache 60s).

    Trả về:
    - status: "online" (gọi thử thành công) | "fallback" (thiếu khóa, hết quota, hoặc lỗi API).
    - mode: "online" hoặc "fallback" (tương thích cả 2 chuẩn giao diện).
    - model: tên model đang cấu hình.
    """
    import time

    now = time.time()
    if (
        not force_refresh
        and _health_cache["result"] is not None
        and (now - _health_cache["checked_at"] < cache_ttl_seconds)
    ):
        return dict(_health_cache["result"])

    api_key = get_gemini_api_key()
    model_name = get_gemini_model_name()

    if not api_key:
        res = {
            "status": "fallback",
            "mode": "fallback",
            "model": model_name,
            "configured": False,
            "detail": "GEMINI_API_KEY chưa được cấu hình hoặc là giá trị mẫu.",
        }
        _health_cache["checked_at"] = now
        _health_cache["result"] = res
        return dict(res)

    # Thử gọi ping nhẹ nhàng tới Gemini
    ping_ok = False
    err_msg = ""
    try:
        # Thử google.genai
        from google import genai
        client = genai.Client(api_key=api_key)
        resp = client.models.generate_content(
            model=model_name,
            contents="ping",
        )
        if resp:
            ping_ok = True
    except Exception as exc1:
        err_msg = str(exc1)
        try:
            import google.generativeai as gai
            gai.configure(api_key=api_key)
            model = gai.GenerativeModel(model_name=model_name)
            resp = model.generate_content("ping", request_options={"timeout": 5})
            if resp:
                ping_ok = True
        except Exception as exc2:
            err_msg = f"{exc1}; {exc2}"

    if ping_ok:
        res = {
            "status": "online",
            "mode": "online",
            "model": model_name,
            "configured": True,
            "detail": "Kết nối Gemini API thành công.",
        }
    else:
        res = {
            "status": "fallback",
            "mode": "fallback",
            "model": model_name,
            "configured": True,
            "detail": f"Không thể kết nối Gemini API ({err_msg[:200]}). Chuyển sang Fallback.",
        }

    _health_cache["checked_at"] = now
    _health_cache["result"] = res
    return dict(res)
