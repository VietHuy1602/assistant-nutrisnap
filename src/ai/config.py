"""
src/ai/config.py
Bộ nạp cấu hình trung tâm và quản lý biến môi trường cho tầng AI & Backend NutriSnap.
Tự động tìm và nạp file .env ở thư mục gốc dự án bằng python-dotenv.
"""

from __future__ import annotations

import os
from pathlib import Path

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
        os.getenv("GEMINI_MODEL")
        or os.getenv("GEMINI_MODEL_NAME")
        or "gemini-2.5-flash"
    ).strip()
