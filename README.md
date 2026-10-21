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
