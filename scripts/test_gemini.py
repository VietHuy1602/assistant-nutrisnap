"""
scripts/test_gemini.py
Script chẩn đoán độc lập kết nối Google Gemini API (Phase 0).
Đọc key từ .env qua biến môi trường GEMINI_API_KEY.
TUYỆT ĐỐI không in hay log giá trị key.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

def test_gemini_connection():
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("❌ LỖI: Không tìm thấy GEMINI_API_KEY trong biến môi trường hoặc .env!")
        return False

    model_name = os.getenv("GEMINI_MODEL") or os.getenv("GEMINI_MODEL_NAME") or "gemini-2.5-flash"
    print(f"[*] Đang kiểm tra kết nối Gemini với model: {model_name}")

    # 1. Thử với SDK mới: google-genai
    try:
        from google import genai
        print("  -> Đang thử SDK google-genai...")
        client = genai.Client(api_key=api_key)

        # Test 1: Simple prompt
        response = client.models.generate_content(
            model=model_name,
            contents="Trả lời ngắn gọn bằng tiếng Việt: Bạn là ai?",
        )
        print("  ✅ [google-genai] Phản hồi thành công!")
        print(f"  Nội dung: {response.text.strip()[:200]}")
        return True
    except Exception as e:
        print(f"  ⚠️ [google-genai] Thất bại với lỗi: {type(e).__name__}: {e}")

    # 2. Thử với SDK cũ: google-generativeai
    try:
        import google.generativeai as gai
        print("  -> Đang thử fallback SDK google-generativeai...")
        gai.configure(api_key=api_key)
        model = gai.GenerativeModel(model_name)
        response = model.generate_content("Trả lời ngắn gọn bằng tiếng Việt: Bạn là ai?")
        print("  ✅ [google-generativeai] Phản hồi thành công!")
        print(f"  Nội dung: {response.text.strip()[:200]}")
        return True
    except Exception as e:
        print(f"  ❌ [google-generativeai] Thất bại với lỗi: {type(e).__name__}: {e}")

    return False

if __name__ == "__main__":
    success = test_gemini_connection()
    sys.exit(0 if success else 1)
