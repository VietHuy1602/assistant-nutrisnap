# CHÍNH SÁCH QUẢN TRỊ & BẢO MẬT DỮ LIỆU (DATA GOVERNANCE POLICY)
> **Dự án:** NutriSnap - Virtual AI Nutrition Assistant  
> **Căn cứ pháp lý:** Nghị định 13/2023/NĐ-CP về Bảo vệ dữ liệu cá nhân (PDPD)

---

## 1. Phân loại Dữ liệu Thu thập
Hệ thống chỉ thu thập dữ liệu phục vụ mục đích tính toán dinh dưỡng, tuyệt đối không thu thập CCCD, số điện thoại hay địa chỉ nhà:
- **Dữ liệu định danh:** `username`, `email`, mật khẩu đã được băm (`password_hash` via bcrypt).
- **Dữ liệu sinh trắc học sức khỏe (Dữ liệu nhạy cảm):** `height`, `current_weight`, `target_weight`, `tdee_calories`.
- **Dữ liệu vận hành:** Ảnh chụp đĩa ăn, lịch sử bữa ăn, tin nhắn hội thoại với trợ lý ảo.

## 2. Nguyên tắc Bảo mật Kỹ thuật
1. **Kiến trúc Zero-Trust với AI Tool Calling:**
   - Schema cung cấp cho LLM tuyệt đối không chứa tham số `user_id`.
   - Backend tự động trích xuất `user_id` từ phiên đăng nhập an toàn (`HttpOnly Cookie JWT`), ngăn chặn việc dùng prompt injection để đọc dữ liệu của người khác.
2. **Quyền riêng tư với Dữ liệu Cân nặng (Privacy-First Health Journal):**
   - Cho phép người dùng bật chế độ ẩn hiển thị chỉ số cân nặng trên giao diện khi sử dụng ở nơi công cộng.
3. **Chính sách Lưu trữ Ảnh tạm:**
   - Ảnh chụp đĩa ăn chỉ được lưu tạm để trích xuất thông tin nguyên liệu và tự động dọn dẹp để bảo vệ tính riêng tư.
4. **Quyền của Chủ thể Dữ liệu:**
   - Người dùng có toàn quyền xem, tải về hoặc yêu cầu xóa vĩnh viễn toàn bộ nhật ký ăn uống và dữ liệu tài khoản khỏi CSDL SQLite.