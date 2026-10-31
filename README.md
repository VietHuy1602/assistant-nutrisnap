# 🥗 NutriSnap - Virtual AI Nutrition Assistant
> **Effortless Multimodal Nutrition Logging & Personalized Habit Coaching**  
> *Đồ án môn học: CSC10014 – Tư duy tính toán (Computational Thinking) | FIT - HCMUS*

---

## 📌 1. Giới thiệu Dự án
**NutriSnap** là trợ lý ảo dinh dưỡng cá nhân giúp giải quyết bài toán mệt mỏi khi ghi chép dinh dưỡng thủ công. Hệ thống kết hợp nhận diện hình ảnh món ăn 3 giây, bổ sung gia vị ẩn qua giọng nói, tính toán calo tất định từ cơ sở dữ liệu khoa học và đồng hành thay đổi vóc dáng bền vững cùng người dùng.

### 🌟 Tính năng Cốt lõi:
- **Zero-Friction Ingestion:** Chụp ảnh đĩa ăn trước khi dùng bữa, bóc tách món ăn và ước lượng khẩu phần tức thì.
- **Voice/Text Modifiers:** Giữ micro nói nhanh để bổ sung các thành phần "vô hình" (dầu ô-liu, bơ, sốt) hoặc lượng ăn thực tế.
- **Deterministic Nutrition Math:** 100% con số calo/macro được tính bằng công thức đại số từ CSDL chuẩn (USDA & Món Việt), tuyệt đối không để LLM tự suy đoán số liệu.
- **Virtual AI Assistant (Tool Calling):** Trợ lý ảo hiểu ngữ cảnh cá nhân, hỗ trợ tra cứu calo còn lại, gợi ý món ăn theo ngân sách sinh viên và tổng kết tiến độ.

---

## 🏗️ 2. Kiến trúc Hệ thống & Ranh giới LLM - Backend
Hệ thống phân tách ranh giới kỹ thuật rõ ràng để đảm bảo an toàn và tính toán chính xác:
- **Presentation Layer (Frontend):** React (Vite), TypeScript, Tailwind CSS, Recharts (nằm trong `src/frontend/`).
- **Core Data & Business Logic (Backend):** Python 3.11, FastAPI, SQLModel/SQLite (nằm trong `src/backend/`).
- **AI Orchestrator & Tool Calling:** Gemini API kết hợp Function Calling (`src/ai/`).
- **Nguyên tắc Zero-Trust:** LLM chỉ phân tích ý định và trích xuất tham số món; Backend tự động lấy `user_id` từ phiên đăng nhập an toàn để truy vấn CSDL, chống truy cập chéo tài khoản.

---

## 📁 3. Cấu trúc Thư mục Chuẩn (Repository Hierarchy)
```text
assistant-nutrisnap/
├── data/                   # Dữ liệu 500 món Việt tham chiếu dinh dưỡng ước tính (vn_foods.csv - tổng hợp từ NIN & USDA)
├── docs/                   # Tài liệu thiết kế, Team Charter, ADR, ai_use_log.md
├── src/
│   ├── ai/                 # AI Orchestrator, Vision recognition, Tool definitions
│   ├── backend/            # FastAPI, Database models, Authentication, Caloric engine
│   └── frontend/           # Giao diện người dùng React, Camera WebRTC, Dashboard
└── tests/                  # Kiểm thử tự động pytest (unit/ & integration/)
```

---

## 🔐 4. Cấu hình Bảo mật & Môi trường (Security Configuration)

Hệ thống quản lý cấu hình tập trung qua `pydantic-settings` với cơ chế **Fail-fast**: ứng dụng sẽ từ chối khởi động nếu thiếu `SECRET_KEY` hoặc độ dài nhỏ hơn 32 ký tự.

### 4.1. Khởi tạo tệp `.env`
Sao chép từ tệp mẫu:
```bash
cp .env.example .env   # Linux/macOS
copy .env.example .env # Windows PowerShell
```

### 4.2. Sinh khóa bí mật `SECRET_KEY`
Sinh chuỗi ngẫu nhiên 32 bytes (64 hex characters):
```bash
python -c "import secrets; print(secrets.token_hex(32))"
# hoặc dùng openssl: openssl rand -hex 32
```

Điền vào `.env`:
```env
SECRET_KEY=your_generated_32_bytes_random_secret_hex
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_ISSUER=nutriscan-api
BCRYPT_ROUNDS=12
```

### 4.3. Khởi chạy Backend an toàn (Chống xung đột cổng WinError 10013)
Trên Windows, nếu một tiến trình uvicorn/python chạy ngầm đang chiếm cổng 8000, lệnh uvicorn thông thường có thể gặp lỗi `[WinError 10013]`. Dự án cung cấp các công cụ tự động dọn dẹp và khởi chạy an toàn:

- **Cách 1 (Khuyến nghị - Tự động giải phóng cổng):**
```bash
python run_backend.py
# hoặc trên PowerShell: .\scripts\start_backend.ps1
```
- **Cách 2 (Sử dụng uvicorn truyền thống):**
```bash
python -m uvicorn src.backend.main:app --reload --host 127.0.0.1 --port 8000
```
- **Nếu cổng 8000 hoặc 5173 bị treo:**
```bash
python scripts/free_port.py              # Tự động giải phóng cả cổng 8000 và 5173
python scripts/free_port.py --port 8000  # Giải phóng riêng cổng 8000
```

### 4.4. Dữ liệu dinh dưỡng quốc tế USDA (nhận diện món toàn cầu)
Món Việt dùng `data/vn_foods.csv`. Để món nước ngoài (pizza, sushi, cà ri...) có số liệu chuẩn, nạp thêm bảng USDA FoodData Central (miễn phí):
1. Tải tại https://fdc.nal.usda.gov/download-datasets: **FNDDS (JSON)** và **SR Legacy (CSV)**.
2. Đặt file `.zip` (không cần giải nén) vào `data/usda/fndds/` và `data/usda/sr_legacy/`.
3. Chạy:
```bash
python scripts/import_usda.py
```
Thứ tự tra dinh dưỡng khi nhận diện ảnh: CSDL món Việt → USDA → AI ước tính. Món mới được thêm vào `food_references` để lưu bữa ăn.

### 4.5. Chạy app Android (emulator / điện thoại)
```bash
python run_backend.py --host 127.0.0.1 --port 8000
cd src/frontend && npm install && npm run android:open
```
`src/frontend/.env.local`: emulator dùng `VITE_API_BASE_URL=http://10.0.2.2:8000/api/v1` (điện thoại thật: `http://<IP-LAN-của-PC>:8000/api/v1`, backend `--host 0.0.0.0`). Trong Android Studio chọn **Gradle JDK = 21** (Settings → Build Tools → Gradle); JDK 25 đi kèm Android Studio mới không chạy được Gradle 8.14.

---

## 🚪 5. Phân hệ Xác thực (Authentication API)

Module Auth bảo mật cung cấp API đăng ký, đăng nhập và middleware bảo vệ route bằng Bearer JWT Access Token (và hỗ trợ song song HttpOnly Cookie cho trình duyệt Web).

### 5.1. Ví dụ cURL tương tác API:

**1. Đăng ký tài khoản mới (`POST /api/v1/auth/register`):**
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Passw0rd!","full_name":"Nguyen Van A"}'
```

**2. Đăng nhập nhận JWT Token (`POST /api/v1/auth/login`):**
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Passw0rd!"}'
```

*Phản hồi mẫu:*
```json
{
  "access_token": "eyJhbGciOiJIUzI1Ni...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

**3. Truy cập route được bảo vệ (`GET /api/v1/auth/me`):**
```bash
curl http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer <access_token>"
```

### 5.2. Hướng dẫn các thành viên bảo vệ Route mới
Để bảo vệ bất kỳ route nào trong hệ thống, sử dụng dependency `get_current_active_user`:

```python
from fastapi import APIRouter, Depends
from src.backend.api.deps import get_current_active_user
from src.backend.models.schema import User

router = APIRouter()

@router.post("/scan")
def scan_food(current_user: User = Depends(get_current_active_user)):
    # current_user đã được xác thực an toàn và có is_active = True
    return {"message": f"Hello {current_user.email}, scanning food..."}
```

