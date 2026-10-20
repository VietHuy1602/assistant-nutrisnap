# NHẬT KÝ SỬ DỤNG TRÍ TUỆ NHÂN TẠO (AI-USE LOG)
> **Dự án:** NutriSnap – Virtual AI Nutrition Assistant  
> **Học phần:** CSC10014 – Tư duy tính toán (Computational Thinking) | FIT - HCMUS  
> **Quy định Liêm chính Học thuật:** Mọi đóng góp từ công cụ AI hỗ trợ lập trình hoặc soạn thảo tài liệu đều phải được ghi nhận minh bạch, kèm phương thức kiểm thử xác minh độc lập.

---

| Tuần / Thành viên | Công cụ AI | Nội dung yêu cầu (Prompt tóm tắt) | Phần giữ lại & Phần đã chỉnh sửa thủ công | Cách thức kiểm thử xác minh (Verification) |
| :--- | :--- | :--- | :--- | :--- |
| **W1 – Việt Huy** | Claude 3.5 Sonnet | Sinh mã SQLModel cho 8 bảng CSDL có khóa ngoại | Giữ cấu trúc class; tự bổ sung `ForeignKey` và cờ PRAGMA `foreign_keys=ON`. | Chạy script `init_db.py` và kiểm tra tạo bảng CSDL có khóa ngoại hợp lệ. |
| **W1 – Minh Đức** | ChatGPT 4o | Phân tích cơ chế bảo mật HttpOnly Cookie so với LocalStorage chống XSS và xây dựng ma trận kiểm soát truy cập 8 bảng | Giữ lập luận an ninh; tự bổ sung cơ chế kiểm soát gián tiếp cho bảng `meal_items` và `chat_messages` kèm quy chuẩn unit test. | Rà soát cấu hình CORS `allow_credentials=True` và kiểm tra luồng đính kèm Cookie trong `test_api_contract.py`. |
| **W1 – Khôi Nguyên** | Claude 3.5 Sonnet | Tư vấn bảng màu y tế/dinh dưỡng chuẩn (#107C41, #F8FAFC) và luồng Wireframe 4 màn hình chính | Tiếp thu đề xuất mã màu; tự thiết kế layout Figma chi tiết và gắn nhãn cảnh báo ước tính minh bạch. | Đối chiếu tài liệu đặc tả màn hình `02_api_contract_and_screen_flows.md` với giao diện Figma Prototype. |
| **W1 – Thành Đạt** | Antigravity AI | Thiết kế API Contract Pydantic v2 & Khung Backend FastAPI + Frontend React Tailwind | Giữ nguyên các Pydantic schema cho Auth, Goal, Meals, Dashboard, Chat; tự thêm Action Confirmation Card và cấu hình HttpOnly Cookie (`allow_credentials=True`). | Chạy `pytest tests/unit/test_api_contract.py` (8 test cases passed); chạy `ruff check --fix`; kiểm tra Swagger UI tại `/docs`. |
| **W1 – Phú Hiếu** | ChatGPT 4o | Khởi tạo JSON Schema cho 4 AI Tools & script kết nối Gemini mẫu | Giữ cấu trúc function schema; xóa bỏ hoàn toàn tham số `user_id` khỏi schema cung cấp cho LLM (Zero-Trust); bổ sung cờ `is_confirmed`. | Chạy `python scripts/test_gemini_api.py` (3/3 checks passed) và `tests/unit/test_tools.py`. |
| **W1 – Quốc Tuấn** | GitHub Copilot | Xây dựng khung kiểm thử tự động Pytest và chỉ tiêu đánh giá QA (Tool Accuracy >= 90%, MAPE <= 25%) | Giữ khung công thức toán học; điều chỉnh cấu trúc ma trận ca kiểm thử phù hợp với 8 bảng và 4 core tools. | Chạy `pytest -v` toàn bộ 22 test cases pass 100%. |
