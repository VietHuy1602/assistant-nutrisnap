# KIẾN TRÚC BẢO MẬT JWT, SƠ ĐỒ ERD 8 BẢNG & QUY TẮC KIỂM SOÁT TRUY CẬP
> **Dự án:** NutriSnap - Virtual AI Nutrition Assistant  
> **Học phần:** CSC10014 – Tư duy tính toán (Computational Thinking) | FIT - HCMUS  
> **Cặp phụ trách:** Cặp 1 - Nguyễn Hoàng Việt Huy (25127060) & Nguyễn Trần Minh Đức (25127300)  
> **Tài liệu bàn giao:** Tuần 1 - Đặc tả Kiến trúc Bảo mật & Cơ sở Dữ liệu (Hoàn chỉnh)

---

## 1. Sơ đồ Quan hệ Thực thể Thống nhất 8 Bảng (ERD 8 Tables)

Hệ thống cơ sở dữ liệu SQLite (`nutrisnap.db`) được chuẩn hóa gồm đúng **8 bảng** với cờ kích hoạt khóa ngoại bắt buộc `PRAGMA foreign_keys = ON;`:

```text
       ┌────────────────────────────────────────┐
       │                 users                  │
       │────────────────────────────────────────│
       │ id (PK), username, email,              │
       │ password_hash, created_at              │
       └───────────────────┬────────────────────┘
                           │
    ┌──────────────────────┼──────────────────────┬──────────────────────┐
    │ 1-N                  │ 1-N                  │ 1-N                  │ 1-N
    ▼                      ▼                      ▼                      ▼
┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
│       goals        │ │    weight_logs     │ │       meals        │ │   chat_sessions    │
│────────────────────│ │────────────────────│ │────────────────────│ │────────────────────│
│ id (PK)            │ │ id (PK)            │ │ id (PK)            │ │ id (PK)            │
│ user_id (FK)       │ │ user_id (FK)       │ │ user_id (FK)       │ │ user_id (FK)       │
│ target_weight      │ │ weight_kg          │ │ meal_type          │ │ started_at         │
│ tdee_calories      │ │ logged_date        │ │ image_path         │ └─────────┬──────────┘
│ daily_budget_vnd   │ └────────────────────┘ │ logged_at          │           │ 1-N
└────────────────────┘                        └─────────┬──────────┘           ▼
                                                        │ 1-N        ┌────────────────────┐
┌────────────────────────┐                    ┌─────────▼──────────┐ │   chat_messages    │
│    food_references     │                    │     meal_items     │ │────────────────────│
│────────────────────────│                    │────────────────────│ │ id (PK)            │
│ id (PK), food_name     │◄────────1-N────────┤ id (PK)            │ │ session_id (FK)    │
│ calories_per_100g      │                    │ meal_id (FK)       │ │ sender_role        │
│ protein_per_100g       │                    │ food_id (FK)       │ │ content, tool_name │
│ carbs_per_100g         │                    │ estimated_gram     │ │ created_at         │
│ fat_per_100g           │                    │ estimated_calories │ └────────────────────┘
│ avg_price_vnd          │                    └────────────────────┘
└────────────────────────┘
```

### Ràng buộc Khóa chính (PK) và Khóa ngoại (FK) với ON DELETE CASCADE:
1. **users**: Khóa chính `id`. Bảng gốc lưu thông tin tài khoản và mật khẩu đã băm (`bcrypt`).
2. **goals**: Khóa chính `id`, khóa ngoại `user_id -> users.id` (`ondelete="CASCADE"`).
3. **food_references**: Khóa chính `id`. Bảng từ điển thực phẩm tham chiếu dinh dưỡng độc lập.
4. **weight_logs**: Khóa chính `id`, khóa ngoại `user_id -> users.id` (`ondelete="CASCADE"`).
5. **meals**: Khóa chính `id`, khóa ngoại `user_id -> users.id` (`ondelete="CASCADE"`).
6. **meal_items**: Khóa chính `id`, khóa ngoại kép: `meal_id -> meals.id` (`ondelete="CASCADE"`) và `food_id -> food_references.id` (`ondelete="RESTRICT"`).
7. **chat_sessions**: Khóa chính `id`, khóa ngoại `user_id -> users.id` (`ondelete="CASCADE"`).
8. **chat_messages**: Khóa chính `id`, khóa ngoại `session_id -> chat_sessions.id` (`ondelete="CASCADE"`).

> [!NOTE]
> Toàn bộ hành vi ràng buộc khóa ngoại và xóa lan truyền `ON DELETE CASCADE` đã được khai báo chính thức trong [src/backend/models/schema.py](file:///d:/Projects/assistant-nutrisnap/src/backend/models/schema.py) và kiểm thử tự động đạt 100% tại [tests/unit/test_db_cascade.py](file:///d:/Projects/assistant-nutrisnap/tests/unit/test_db_cascade.py).

---

## 2. Kiến trúc Bảo mật Phiên làm việc: HttpOnly Cookie vs. LocalStorage

> [!IMPORTANT]
> **Phân định rõ ranh giới API Contract (Tuần 1) và Service Implementation (Tuần 2):**  
> Trong khuôn khổ Tuần 1, hệ thống tập trung hoàn thiện và đóng băng bản hợp đồng giao tiếp (REST API Contract) tại `api_contract.py` và khung ứng dụng (FastAPI Skeleton tại `main.py`). Các endpoint hiện trả về dữ liệu mẫu (Mock Responses) để phục vụ ghép nối giao diện Frontend. Tầng logic dịch vụ nghiệp vụ thực tế (`services/auth_service.py` băm bcrypt, sinh mã JWT thực thụ và dependency `get_current_user` trích xuất danh tính từ HttpOnly Cookie) sẽ được triển khai chính thức theo đúng lộ trình ở **Tuần 2**.

### 2.1. Phân tích Rủi ro XSS khi lưu JWT trong `localStorage`
- **Cơ chế tấn công XSS (Cross-Site Scripting):** Nếu ứng dụng lưu JWT token trong `localStorage` hoặc `sessionStorage`, bất kỳ lỗ hổng bảo mật nào cho phép mã JavaScript độc hại chạy trên trình duyệt (thông qua thư viện bên thứ ba bị nhiễm độc, nội dung inject từ người dùng không được sanitize, v.v.) đều có thể gọi `localStorage.getItem("token")`.
- **Hậu quả:** Kẻ tấn công đánh cắp trực tiếp chuỗi JWT, giả mạo phiên làm việc của nạn nhân từ bất kỳ đâu trên thế giới mà không cần biết mật khẩu của nạn nhân.
- **Kết luận:** Lưu trữ JWT trong `localStorage` là kiến trúc **không an toàn** cho các ứng dụng y tế, sức khỏe và tài chính cá nhân.

### 2.2. Phương án Kiến trúc Chuẩn: HttpOnly Cookie + SameSite=Lax + CSRF Protection
Hệ thống NutriSnap quyết định sử dụng mô hình xác thực chuẩn công nghiệp:

1. **HttpOnly Flag (`httponly=True`):**
   - Trình duyệt khóa hoàn toàn quyền đọc/ghi Cookie từ JavaScript (`document.cookie` không thể truy cập).
   - Ngay cả khi xảy ra lỗ hổng XSS, mã script độc hại **tuyệt đối không thể đọc được JWT**.
2. **SameSite=Lax Flag (`samesite="lax"`):**
   - Cookie chỉ được tự động gửi kèm trong các request nội bộ cùng domain hoặc điều hướng top-level thông thường.
   - Ngăn chặn hoàn toàn các cuộc tấn công CSRF (Cross-Site Request Forgery) xuyên miền thông qua các thẻ `<img>`, `<form>` giả mạo từ trang web độc hại.
3. **Secure Flag (`secure=True` ở production):**
   - Cookie chỉ được truyền tải qua kênh mã hóa HTTPS, ngăn chặn tấn công nghe lén đường truyền (Man-in-the-Middle). Ở môi trường dev cục bộ (`localhost`), cờ này có thể tạm đặt `False` để tiện debug.
4. **Cấu hình CORS phía Backend FastAPI:**
   - Bắt buộc khai báo `allow_credentials=True`.
   - Danh sách `allow_origins` chỉ định danh sách rõ ràng (ví dụ: `http://localhost:5173`), tuyệt đối không dùng wildcard `*`.

---

## 3. Quy tắc Kiểm soát Truy cập Dữ liệu trên 8 Bảng (Data Access Control)

### 3.1. Nguyên tắc Zero-Trust Tool Calling với LLM
- **Schema không chứa `user_id`:** Các công cụ đăng ký với AI Orchestrator (`get_daily_nutrition`, `log_meal`, `recommend_meals`, `get_progress_summary`) hoàn toàn không cho phép nhận tham số `user_id`.
- **Gắn cứng định danh từ JWT:** Tầng Backend Controller tự động lấy `current_user.id` từ HttpOnly Cookie JWT đã được giải mã và truyền trực tiếp vào các service thực thi:
  ```python
  @router.post("/api/v1/assistant/chat")
  def chat_with_assistant(req: ChatRequest, current_user: User = Depends(get_current_user)):
      # TUYỆT ĐỐI KHÔNG lấy user_id từ req hay từ LLM sinh ra!
      verified_user_id = current_user.id
      return orchestrator.handle_message(
          user_id=verified_user_id,
          session_id=req.session_id,
          message=req.message
      )
  ```

### 3.2. Quy tắc Truy vấn Bắt buộc (Mandatory WHERE Clause)
Mọi truy vấn Đọc (SELECT), Ghi (INSERT), Sửa (UPDATE), Xóa (DELETE) đối với dữ liệu người dùng đều phải thỏa mãn:

1. **Đối với các bảng trực tiếp chứa `user_id` (`goals`, `weight_logs`, `meals`, `chat_sessions`):**
   - Mọi câu lệnh SQLModel / SQLAlchemy đều bắt buộc có điều kiện ràng buộc quyền sở hữu:
     ```python
     # Ví dụ đọc thông tin bữa ăn:
     query = select(Meal).where(Meal.id == meal_id, Meal.user_id == current_user.id)
     # Ví dụ đọc lịch sử phiên chat:
     query = select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
     ```
2. **Đối với các bảng con liên kết gián tiếp (`meal_items`, `chat_messages`):**
   - **Bảng `meal_items` (liên kết qua `meal_id`):** Trước khi cập nhật, xóa hoặc thêm chi tiết món ăn, Backend bắt buộc phải kiểm tra bảng cha `meals` xem `meals.user_id == current_user.id`. Nếu không khớp, trả về ngay lập tức mã lỗi HTTP 403 Forbidden hoặc 404 Not Found.
   - **Bảng `chat_messages` (liên kết qua `session_id`):** Trước khi lưu tin nhắn hoặc tải lịch sử tin nhắn, Backend bắt buộc phải join hoặc xác minh bảng cha `chat_sessions` xem `chat_sessions.user_id == current_user.id`.

### 3.3. Quy trình Xác nhận 2 bước cho Thao tác Thay đổi Dữ liệu (Two-Step Confirmation)
- Mọi công cụ thay đổi trạng thái dữ liệu (đặc biệt là `log_meal`) qua hội thoại LLM phải đi qua 2 bước:
  - **Bước 1 (Nháp / Xem trước):** LLM gọi tool với `is_confirmed = False`. Backend tính toán calo/macro ước tính từ bảng `food_references` và trả về bản xem trước (status: `pending_confirmation`). Giao diện hiển thị Thẻ Xác nhận Thao tác (Action Confirmation Card).
  - **Bước 2 (Xác nhận ghi):** Người dùng chủ động kiểm tra số gam, tên món và bấm nút `[Xác nhận lưu]`. Lúc này Frontend mới gửi request hoặc LLM gọi tool với `is_confirmed = True` để chính thức ghi vào bảng `meals` và `meal_items`.

---

## 4. Bảng Quy chuẩn Cột Dữ liệu Dinh dưỡng (`food_references`)

Nhằm bảo đảm tính nhất quán giữa file dữ liệu CSV [data/vn_foods.csv](file:///d:/Projects/assistant-nutrisnap/data/vn_foods.csv), mô hình [src/backend/models/schema.py](file:///d:/Projects/assistant-nutrisnap/src/backend/models/schema.py) và script nạp dữ liệu [scripts/seed_food_references.py](file:///d:/Projects/assistant-nutrisnap/scripts/seed_food_references.py), tên các cột dinh dưỡng được chuẩn hóa theo đơn vị tính trên 100g thực phẩm:

| Tên cột trong CSDL / CSV | Kiểu dữ liệu | Ý nghĩa | Ví dụ |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER (PK) | Định danh duy nhất món ăn | `1` |
| `food_name` | TEXT (Index) | Tên món ăn tiếng Việt | `"Phở bò tái"` |
| `calories_per_100g` | REAL | Năng lượng (kcal) trên 100g | `115.0` |
| `protein_per_100g` | REAL | Lượng chất đạm (g) trên 100g | `8.5` |
| `carbs_per_100g` | REAL | Lượng tinh bột (g) trên 100g | `14.2` |
| `fat_per_100g` | REAL | Lượng chất béo (g) trên 100g | `2.8` |
| `avg_price_vnd` | INTEGER | Giá tham khảo trung bình (VNĐ) | `40000` |
