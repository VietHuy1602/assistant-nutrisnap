# HƯỚNG DẪN TÍCH HỢP GEMINI API KEY VÀO BACKEND & FRONTEND (NUTRISNAP)

**Dự án:** NutriSnap - Trợ lý ghi nhận dinh dưỡng đa phương thức không ma sát  
**Mục tiêu:** Nhúng khóa Gemini API (`GEMINI_API_KEY`) lấy từ Google AI Studio vào hệ thống để kích hoạt chế độ AI trực tuyến thực tế (Live Gemini LLM & Vision) cho cả **Trợ lý Chat AI (Assistant Drawer)** và **Nhận diện món ăn qua ảnh (Camera Capture)**, đồng thời khắc phục cảnh báo `API: online ✓ (warn)` ở góc dưới giao diện Frontend.

---

## 1. NGUYÊN TẮC BẢO MẬT CỐT LÕI (SECURITY GOVERNANCE)

Theo quy chuẩn kiến trúc bảo mật của dự án NutriSnap (Tuần 5 & Tuần 6):
1. **TUYỆT ĐỐI KHÔNG gắn cứng (hardcode) API Key** trực tiếp vào trong các file code `.py`, `.ts`, `.tsx` hoặc đẩy file `.env` chứa key thật lên GitHub.
2. **Backend giữ vai trò cổng gọi AI duy nhất:** Khóa `GEMINI_API_KEY` được nạp tại tầng Backend (`.env` ở thư mục gốc) để `src/ai/orchestrator.py`, `src/ai/vision_recognition.py`, và `src/ai/voice_modifier.py` gọi tới Google Gemini API.
3. **Frontend kết nối qua Backend API:** Giao diện React (`localhost:5173`) giao tiếp với Backend FastAPI (`localhost:8000`) thông qua biến môi trường `VITE_API_BASE_URL` và hiển thị trạng thái kết nối AI thực tế.

---

## 2. CẤU HÌNH BIẾN MÔI TRƯỜNG (`.env`)

### 2.1. Tại thư mục gốc của dự án (Dành cho Backend & AI Layer)
Tạo hoặc mở file **`.env`** nằm ở thư mục gốc của dự án (`assistant-nutrisnap/.env`) và điền khóa API bạn vừa copy từ Google AI Studio vào:

```env
# Google AI Studio (Gemini API Configuration)
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
GOOGLE_API_KEY=YOUR_GEMINI_API_KEY_HERE
GEMINI_MODEL_NAME=gemini-2.5-flash

# Backend Application Settings
APP_ENV=development
SECRET_KEY=nutrisnap-local-dev-secret-key-2026
DATABASE_URL=sqlite:///./nutrisnap.db
```
*(Lưu ý: Khai báo cả `GEMINI_API_KEY` và `GOOGLE_API_KEY` để tương thích 100% với cả hai bộ thư viện `google-genai` và `google-generativeai` trong Python).*

### 2.2. Tại thư mục Frontend (`src/frontend/.env`)
Tạo hoặc mở file **`src/frontend/.env`** để đảm bảo React kết nối đúng tới cổng Backend FastAPI:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_ENABLE_LIVE_AI=true
```

### 2.3. Kiểm tra `.gitignore`
Đảm bảo file `.gitignore` ở thư mục gốc đã có các dòng sau để Git không bao giờ đẩy API Key của bạn lên GitHub công khai:
```gitignore
.env
.env.local
src/frontend/.env
src/frontend/.env.local
```

---

## 3. TÍCH HỢP VÀO TẦNG BACKEND & AI (`src/ai/` & `src/backend/`)

### 3.1. Bộ nạp cấu hình trung tâm (`src/ai/config.py` hoặc trong `orchestrator.py` / `vision_recognition.py`)
Đảm bảo tầng AI tự động nạp file `.env` bằng `python-dotenv` ngay khi khởi động server:

```python
import os
from pathlib import Path
from dotenv import load_dotenv

# Tự động tìm và nạp file .env ở thư mục gốc dự án
ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=ROOT_DIR / ".env", override=True)

def get_gemini_api_key() -> str | None:
    """Lấy khóa API Gemini từ biến môi trường."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if api_key and api_key.strip() and api_key != "your_api_key_here":
        return api_key.strip()
    return None
```

### 3.2. Kết nối vào các Module AI hiện có
1. **`src/ai/orchestrator.py` (Trợ lý Chat AI):**
   - Sử dụng `get_gemini_api_key()` để khởi tạo Gemini Client.
   - Khi có API Key hợp lệ, ưu tiên gọi trực tiếp mô hình Gemini (`gemini-2.5-flash` hoặc `gemini-2.0-flash`) kết hợp 4 Tools (`get_daily_nutrition`, `log_meal`, `recommend_meals`, `get_progress_summary`).
   - Định dạng câu trả lời sạch đẹp hoặc để Frontend render Markdown (in đậm `**món ăn**`, danh sách gợi ý).
   - Nếu API Key bị lỗi hoặc hết hạn mức, tự động chuyển mượt mà sang cơ chế `Safe Deterministic Fallback` mà không làm văng lỗi 500.
2. **`src/ai/vision_recognition.py` (Nhận diện đĩa thức ăn):**
   - Nạp `get_gemini_api_key()` để gửi ảnh đĩa thức ăn tới Gemini Vision và nhận về JSON định lượng gam kèm `confidence_score`.
3. **`src/ai/voice_modifier.py` (Xử lý ghi chú giọng nói/văn bản):**
   - Nạp `get_gemini_api_key()` để bóc tách các ghi chú dầu/sốt/ăn thừa chính xác.
4. **Endpoint kiểm tra trạng thái AI (`GET /api/v1/health` hoặc `/api/v1/ping`):**
   - Trả về trạng thái `{"status": "ok", "ai_provider": "gemini", "ai_live": True}` khi `GEMINI_API_KEY` đã được cấu hình thành công, giúp Frontend tắt cảnh báo `(warn)` ở góc dưới bên phải màn hình (`API: online ✓`).

---

## 4. TÍCH HỢP VÀO TẦNG FRONTEND (`src/frontend/`)

1. **Hiển thị định dạng Markdown trên khung Chat (`AssistantChatDrawer.tsx`):**
   - Trên màn hình hiện tại của bạn, câu trả lời của Trợ lý AI đang hiển thị các dấu sao thô như `**Cá nục kho cà chua**` hoặc `*💡 Gợi ý bù trừ đạm...*`.
   - Cần xử lý hiển thị (parse bold/italic/list) trong bong bóng chat để chữ `**...**` chuyển thành **chữ in đậm** đẹp mắt và dễ đọc.
2. **Xử lý ngân sách âm / cảnh báo hạn mức & Trạng thái `API: online ✓`:**
   - Khi Backend đã nạp `GEMINI_API_KEY` thành công, huy hiệu trạng thái ở góc dưới cùng bên phải chuyển từ `API: online ✓ (warn)` sang trạng thái hoạt động hoàn toàn (`API: online ✓`).

---

## 5. CÂU LỆNH MẪU (PROMPT) ĐỂ GỬI CHO ANTIGRAVITY IDE TỰ ĐỘNG CẤU HÌNH

> **Bước 1:** Lưu nội dung file này vào **`docs/07_gemini_api_integration_guide.md`**.  
> **Bước 2:** Copy đoạn lệnh dưới đây dán vào khung Chat của Antigravity IDE:
>
> *"Hãy đọc kỹ hướng dẫn trong file `docs/07_gemini_api_integration_guide.md` và thực hiện tích hợp khóa Gemini API vào cả Backend và Frontend của dự án theo các bước sau:
> 1. Tuyệt đối KHÔNG xóa bất kỳ file nào trong dự án và đảm bảo `.env` nằm trong `.gitignore` (tuyệt đối không commit khóa API thật lên GitHub).
> 2. Tạo/cập nhật file `.env` ở thư mục gốc với khóa `GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE` và `src/frontend/.env` với `VITE_API_BASE_URL=http://localhost:8000`.
> 3. Cập nhật các module trong `src/ai/` (`orchestrator.py`, `vision_recognition.py`, `voice_modifier.py`) và `src/backend/` để tự động đọc `GEMINI_API_KEY` từ file `.env` bằng `python-dotenv`, kích hoạt kết nối trực tiếp tới Google Gemini API (vẫn giữ cơ chế Safe Fallback nếu mạng lỗi hoặc key không hợp lệ).
> 4. Cập nhật endpoint kiểm tra trạng thái Backend và giao diện Frontend (`AssistantChatDrawer` & thanh trạng thái `API: online`) để: (a) nhận diện đúng trạng thái AI trực tuyến không còn báo `(warn)`, và (b) hiển thị mượt mà các ký tự định dạng Markdown (`**in đậm**`, `*in nghiêng*`, xuống dòng) trong tin nhắn của Trợ lý AI NutriSnap.
> 5. Chạy kiểm thử `pytest tests/ -v` và `ruff check .` đảm bảo toàn bộ hệ thống hoạt động ổn định 100%."*