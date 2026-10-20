# NHẬT KÝ SỬ DỤNG TRÍ TUỆ NHÂN TẠO (AI-USE LOG)
> **Dự án:** NutriSnap – Virtual AI Nutrition Assistant  
> **Học phần:** CSC10014 – Tư duy tính toán (Computational Thinking) | FIT - HCMUS  
> **Quy định Liêm chính Học thuật:** Mọi đóng góp từ công cụ AI hỗ trợ lập trình hoặc soạn thảo tài liệu đều phải được ghi nhận minh bạch, kèm phương thức kiểm thử xác minh độc lập.

---

| Tuần / Thành viên | Công cụ AI | Nội dung yêu cầu (Prompt tóm tắt) | Phần giữ lại & Phần đã chỉnh sửa thủ công | Cách thức kiểm thử xác minh (Verification) |
| :--- | :--- | :--- | :--- | :--- |
| **W1 – Việt Huy** | Claude 3.5 Sonnet | Sinh mã SQLModel cho 8 bảng CSDL có khóa ngoại | Giữ cấu trúc class; tự bổ sung `ForeignKey` và cờ PRAGMA `foreign_keys=ON`. | Chạy pytest thử xóa user hoặc chèn sai `user_id` để xác nhận DB báo lỗi. |
| **W1 – Phú Hiếu** | ChatGPT 4o | Khởi tạo JSON Schema cho 4 AI Tools | Giữ cấu trúc function schema; xóa bỏ hoàn toàn tham số `user_id` khỏi schema cung cấp cho LLM (Zero-Trust). | Chạy bộ kiểm thử tự động `tests/unit/test_tools.py` (9 test cases passed). |
| **W1 – Thành Đạt** | Antigravity AI | Thiết kế API Contract Pydantic v2 & Khung Backend FastAPI + Frontend React Tailwind | Giữ nguyên các Pydantic schema cho Auth, Goal, Meals, Dashboard, Chat; tự thêm Action Confirmation Card và cấu hình HttpOnly Cookie (`allow_credentials=True`). | Chạy `pytest tests/unit/test_api_contract.py` (8 test cases passed); chạy `ruff check --fix`; kiểm tra Swagger UI tại `/docs`. |
