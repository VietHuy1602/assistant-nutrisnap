# CHÍNH SÁCH QUẢN TRỊ & BẢO MẬT DỮ LIỆU (DATA GOVERNANCE POLICY)
> **Dự án:** NutriSnap - Virtual AI Nutrition Assistant  
> **Căn cứ pháp lý:** Nghị định 13/2023/NĐ-CP về Bảo vệ dữ liệu cá nhân (PDPD)  
> **Phạm vi áp dụng:** Toàn bộ hệ thống NutriSnap (Frontend, Backend API, AI Assistant, SQLite Database)

---

## 1. Phân loại Dữ liệu Thu thập & Nguyên tắc Tối thiểu hóa (Data Minimization)

Hệ thống chỉ thu thập dữ liệu phục vụ mục đích tính toán dinh dưỡng, kiểm soát an toàn y tế và theo dõi tiến trình cá nhân. Tuyệt đối không thu thập CCCD/CMND, số điện thoại, định vị GPS hay địa chỉ cư trú:

### 1.1. Dữ liệu Định danh Cơ bản (Basic Identity Data)
- `username`: Tên đăng nhập người dùng (tối thiểu 3 ký tự, tối đa 50 ký tự).
- `email`: Địa chỉ email liên lạc và xác thực.
- `password_hash`: Chuỗi mật khẩu đã được băm an toàn một chiều qua thuật toán bcrypt (không lưu mật khẩu dạng plain-text).

### 1.2. Dữ liệu Sinh trắc học & Nhân khẩu học Sức khỏe (Sensitive Health & Demographic Data)
- **Nhân khẩu học phục vụ tính toán BMR:** `age` (tuổi), `gender` (giới tính sinh học: nam, nữ, khác).
- **Chỉ số thể trạng:** `height_cm` (chiều cao), `current_weight_kg` (cân nặng hiện tại), `target_weight_kg` (cân nặng mục tiêu).
- **Mức độ vận động:** `activity_level` (sedentary, light, moderate, active, very_active) để nhân hệ số PAL tính TDEE.
- **Mục tiêu thay đổi thể trạng:** `goal_type` (lose_weight, maintain, gain_muscle), `weekly_pace_kg` (tốc độ an toàn y tế), `daily_budget_vnd`.
- **Lịch sử theo dõi cân nặng:** `weight_logs` (ghi nhận cân nặng định kỳ để lọc nhiễu theo giải thuật EMA).

### 1.3. Dữ liệu Vận hành & Tương tác (Operational & Interaction Data)
- Lịch sử bữa ăn (`meals`, `meal_items`): Thời gian ăn, loại bữa, khối lượng ước tính và calo/macro tính toán.
- Nhật ký hội thoại (`chat_sessions`, `chat_messages`): Lời nhắc, câu hỏi và phản hồi từ Trợ lý ảo AI.

---

## 2. Chính sách Lưu trữ & Xử lý Ảnh Món ăn (Image Processing & Consent Policy)

Nhằm bảo đảm quyền riêng tư tuyệt đối cho người dùng theo Nghị định 13/2023/NĐ-CP:

1. **Giai đoạn Xem trước (Preview / Ingestion Phase):**
   - Ảnh chụp đĩa ăn được truyền tải qua chuỗi mã hóa tạm thời (`image_base64`) hoặc bộ nhớ đệm (In-memory buffer) phục vụ duy nhất phiên phân tích trích xuất nguyên liệu thị giác của AI Vision.
   - Dữ liệu ảnh này **tuyệt đối không được lưu trữ vĩnh viễn** vào ổ cứng hay CSDL khi người dùng chưa đồng ý xác nhận.
   - Nếu người dùng hủy phiên hoặc không bấm nút xác nhận, bộ nhớ đệm sẽ tự động giải phóng ngay lập tức.

2. **Giai đoạn Xác nhận Lưu (Confirmed Phase):**
   - Chỉ khi người dùng chủ động bấm **[Xác nhận lưu]** trên giao diện (`is_confirmed = True`), hệ thống mới tiến hành lưu trữ tệp ảnh tĩnh đã tối ưu hóa nén và ghi nhận đường dẫn `image_path` vào bảng `meals`.
   - Người dùng có quyền tùy chọn tắt tính năng lưu ảnh và chỉ lưu tên món ăn kèm số gam.

---

## 3. Nguyên tắc Bảo mật Kỹ thuật (Technical Safeguards)

1. **Kiến trúc Zero-Trust với AI Tool Calling:**
   - Schema Function Calling cung cấp cho AI LLM (`get_daily_summary`, `log_meal`, `recommend_meals`, `get_progress_summary`) **tuyệt đối không chứa tham số `user_id`**.
   - Backend tự động trích xuất `user_id` từ phiên đăng nhập an toàn (`HttpOnly JWT Cookie`), ngăn chặn hoàn toàn tấn công Prompt Injection nhằm đánh cắp hoặc xem trộm dữ liệu người dùng khác.

2. **Bảo vệ Chống Tấn công Web (CSRF & XSS Protection):**
   - JWT được lưu độc quyền trong Cookie `HttpOnly=True`, `SameSite=Lax`, ngăn chặn hoàn toàn JavaScript độc hại truy cập token.
   - Bộ lọc kiểm tra nguồn gốc (`verify_csrf_protection`) kiểm tra `Origin` / `Referer` trên các request làm thay đổi dữ liệu (`POST`, `PUT`, `DELETE`).

3. **Toàn vẹn Ràng buộc Dữ liệu & Xóa tầng (Cascade Clean-up):**
   - SQLite kích hoạt `PRAGMA foreign_keys = ON` bắt buộc.
   - Khi tài khoản người dùng bị xóa, toàn bộ dữ liệu phụ thuộc (`goals`, `meals`, `weight_logs`, `chat_sessions`, `chat_messages`) sẽ tự động được xóa sạch thông qua cơ chế `ON DELETE CASCADE`, không lưu trữ bất kỳ dữ liệu rác hay mồ côi (orphaned data).

4. **Quyền riêng tư với Dữ liệu Cân nặng (Privacy-First Health Journal):**
   - Cho phép người dùng bật chế độ ẩn/mờ chỉ số cân nặng trên màn hình giao diện khi sử dụng ở nơi công cộng hoặc trước sự hiện diện của người khác.

---

## 4. Quyền của Chủ thể Dữ liệu (Data Subject Rights)

Tuân thủ nghiêm ngặt Điều 9 Nghị định 13/2023/NĐ-CP, NutriSnap cung cấp đầy đủ các quyền:
- **Quyền được biết & Đồng thuận:** Người dùng được thông báo minh bạch về mục đích thu thập và phải xác nhận đồng thuận trước khi bắt đầu sử dụng.
- **Quyền truy cập & Xem dữ liệu:** Người dùng có thể xem lại toàn bộ lịch sử mục tiêu, nhật ký bữa ăn và biểu đồ cân nặng bất kỳ lúc nào tại giao diện Dashboard.
- **Quyền chỉnh sửa & Rút lại:** Người dùng có thể cập nhật thông tin vóc dáng, chỉnh sửa số gam bữa ăn hoặc xóa từng bữa ăn qua endpoint `DELETE /api/v1/meals/{meal_id}`.
- **Quyền xóa vĩnh viễn (Right to be Forgotten):** Người dùng có quyền yêu cầu xóa toàn bộ tài khoản và dữ liệu liên quan khỏi cơ sở dữ liệu hệ thống một cách không thể phục hồi.
