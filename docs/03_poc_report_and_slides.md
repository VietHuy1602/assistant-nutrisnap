# BÁO CÁO KHẢ THI POC VÀ TỔNG HỢP SLIDE THUYẾT TRÌNH (TUẦN 1 — TUẦN 3)
> **Dự án:** NutriSnap — Virtual AI Nutrition Assistant  
> **Cặp phụ trách:** Cặp 1 (Data Core, Security & Governance) — Nguyễn Hoàng Việt Huy (25127060) & Nguyễn Trần Minh Đức (25127300)  
> **Mốc hoàn thành:** Proof of Concept (PoC Deliverable) — Tuần 3  
> **CSDL & Nền tảng:** SQLite (8 bảng chuẩn hóa, `PRAGMA foreign_keys = ON`, 500 món ăn Việt Nam `vn_foods.csv`), FastAPI Backend, Zero-Trust Architecture.

---

## PHẦN 1: BÁO CÁO KHẢ THI KỸ THUẬT POC (PROOF OF CONCEPT REPORT)

### 1.1. Mục Tiêu và Tuyên Bố Bài Toán (Problem Statement)
Các ứng dụng theo dõi dinh dưỡng truyền thống thường gặp hai vấn đề lớn:
1. **Ảo giác số học từ AI (Hallucination Math):** Việc yêu cầu trực tiếp mô hình ngôn ngữ lớn (LLM) ước lượng calo/macro dẫn đến sai số ngẫu nhiên lớn (±30–50%), không thể dùng trong y tế hoặc dinh dưỡng trách nhiệm.
2. **Nguy cơ rò rỉ dữ liệu (Insecure Direct Object Reference - IDOR):** Dữ liệu sức khỏe nhạy cảm bị truy cập chéo nếu backend tin tưởng trực tiếp `user_id` từ payload AI hoặc client.

**Mục tiêu PoC của NutriSnap:**
Xây dựng một hệ thống Trợ lý Dinh dưỡng Ảo kết hợp giữa Trí tuệ Nhân tạo và Công cụ Dinh dưỡng Tất định (Deterministic Nutrition Engine), đảm bảo:
- **0% Hallucination Math:** Toàn bộ công thức đại số calo, macro, BMR/TDEE được tính bằng mã nguồn Backend và CSDL tham chiếu 500 món Việt chuẩn hóa.
- **Zero-Trust Data Isolation:** Mọi hàm xử lý và API đều trích xuất `authenticated_user_id` từ HttpOnly JWT Cookie, loại bỏ hoàn toàn khả năng giả mạo danh tính.
- **Quy trình Xác nhận 2 bước (Two-Step Confirmation):** Mọi bữa ăn nhận diện qua AI chỉ là bản nháp (`is_confirmed=False`), chỉ lưu CSDL khi người dùng phê duyệt (`is_confirmed=True`).

---

### 1.2. Kiến Trúc CSDL 8 Bảng & Ràng Buộc Khóa Ngoại (Foreign Key Cascade)
Hệ thống sử dụng SQLite chuẩn hóa với cấu trúc 8 bảng và ràng buộc nghiêm ngặt:
- **Bật khóa ngoại:** `PRAGMA foreign_keys = ON` được thiết lập trên mọi kết nối thông qua SQLAlchemy listener.
- **8 Bảng CSDL:**
  1. `users`: Quản lý tài khoản, mật khẩu băm bcrypt an toàn (`$2b$12$...`), email duy nhất.
  2. `goals`: Mục tiêu dinh dưỡng cá nhân (BMR Mifflin-St Jeor, TDEE, macro, ngân sách ngày), liên kết `user_id` với `ON DELETE CASCADE`.
  3. `weight_logs`: Nhật ký cân nặng hàng ngày phục vụ theo dõi và phân tích xu hướng EMA.
  4. `food_references`: CSDL tham chiếu 500 món ăn Việt Nam (`vn_foods.csv`) với đầy đủ calo, protein, carbs, fat trên 100g và giá trung bình VNĐ.
  5. `meals`: Bữa ăn của người dùng (loại bữa: Sáng, Trưa, Tối, Phụ; thời gian ghi nhận; đường dẫn ảnh).
  6. `meal_items`: Món ăn chi tiết trong bữa, liên kết `meal_id` và `food_id`, lưu khối lượng thực tế và calo tính toán.
  7. `chat_sessions`: Phiên hội thoại của người dùng với trợ lý AI, bảo vệ nghiêm ngặt chống IDOR.
  8. `chat_messages`: Nội dung tin nhắn hội thoại (`user`, `assistant`, `tool`), liên kết `session_id`.

**Bằng chứng Khởi tạo và Ràng buộc Khóa Ngoại:**
```sql
PRAGMA foreign_keys = ON;
-- Xác minh ràng buộc: Khi xóa một User, toàn bộ goals, weight_logs, meals, chat_sessions tự động xóa theo (Cascade).
```

---

### 1.3. CSDL Tham Chiếu 500 Món Ăn Việt Nam (`vn_foods.csv`)
- **Nguồn dữ liệu:** Nạp thành công 500 món ăn truyền thống và hiện đại của Việt Nam từ `scripts/generate_foods_csv.py` và `scripts/seed_food_references.py`.
- **Cấu trúc trường dữ liệu:**
  - `food_name`: Tên món ăn tiếng Việt có dấu chuẩn hóa.
  - `calories_per_100g`: Năng lượng chuẩn (kcal/100g).
  - `protein_per_100g`: Lượng đạm (g/100g).
  - `carbs_per_100g`: Lượng tinh bột (g/100g).
  - `fat_per_100g`: Lượng chất béo (g/100g).
  - `avg_price_vnd`: Giá bán bình quân ước tính theo thị trường Việt Nam (VNĐ/100g).
- **Cơ chế tra cứu linh hoạt (Resolve Food Reference):**
  - Tìm theo `food_id` chính xác.
  - Tìm khớp tên chính xác (Exact match, case-insensitive).
  - Tìm chuỗi con (`ILIKE %name%`).
  - Tìm kiếm tương đồng gần đúng (Fuzzy Match với `difflib.get_close_matches`, cutoff=0.6).

---

### 1.4. Động Cơ Tính Dinh Dưỡng Tất Định (Deterministic Nutrition Engine)
Mọi phép tính đều tuân theo công thức đại số cố định, không phụ thuộc vào LLM:
$$\text{Effective Gram} = \text{estimated\_gram} \times \text{eaten\_ratio}$$
$$\text{Calories} = \text{round}\left(\frac{\text{Effective Gram}}{100.0} \times \text{calories\_per\_100g}, 2\right)$$
$$\text{Protein} = \text{round}\left(\frac{\text{Effective Gram}}{100.0} \times \text{protein\_per\_100g}, 2\right)$$
$$\text{Carbs} = \text{round}\left(\frac{\text{Effective Gram}}{100.0} \times \text{carbs\_per\_100g}, 2\right)$$
$$\text{Fat} = \text{round}\left(\frac{\text{Effective Gram}}{100.0} \times \text{fat\_per\_100g}, 2\right)$$
$$\text{Price (VNĐ)} = \text{round}\left(\frac{\text{Effective Gram}}{100.0} \times \text{avg\_price\_vnd}\right)$$

- **Kiểm định y tế (Portion Validation):** Khối lượng món ăn phải nằm trong giới hạn an toàn thực tế ($1.0\text{g} \le \text{gram} \le 2000.0\text{g}$).
- **Hệ số thức ăn thừa (`eaten_ratio`):** Cho phép người dùng ghi nhận khẩu phần thực tế đã ăn (ví dụ ăn 80% bỏ thừa 20% $\rightarrow eaten\_ratio = 0.8$).

---

### 1.5. Cơ Chế Xác Nhận Hai Bước (Two-Step Confirmation)
Để chống lại việc AI vô tình ghi đè hoặc lưu sai thông tin:
1. **Bước 1 (Preview / Pending):** Client/AI gửi `is_confirmed = False`. Backend thực hiện toàn bộ phép tính đại số, kiểm định món và trả về `status = "pending_confirmation"` kèm bảng dinh dưỡng chi tiết. **Tuyệt đối không ghi bản ghi nào vào bảng `meals` hay `meal_items`**.
2. **Bước 2 (Confirm / Logged):** Sau khi người dùng xác nhận trên giao diện, client gửi `is_confirmed = True`. Backend thực hiện transaction nguyên tử: lưu vào `meals` và các `meal_items`, trả về `status = "logged"` kèm `meal_id`.

---

### 1.6. Dữ Liệu Khởi Tạo Idempotent Cho 3 Tài Khoản Mẫu (Demo Seed)
Script `scripts/seed_demo_accounts.py` được thiết kế lũy đẳng (chạy nhiều lần an toàn, xóa sạch dữ liệu cũ của demo accounts trước khi nạp lại):
1. **`student_user` (Sinh viên duy trì cân nặng):**
   - 20 tuổi, Nữ, 160cm, 55kg.
   - Mục tiêu: Duy trì cân nặng, ngân sách tiết kiệm 50.000 VNĐ/ngày.
   - 7 ngày lịch sử cân nặng dao động 54.9 – 55.2 kg.
2. **`office_user` (Nhân viên văn phòng giảm mỡ):**
   - 28 tuổi, Nữ, 162cm, 68kg $\rightarrow$ 62kg (giảm 0.5 kg/tuần).
   - Mục tiêu: Giảm mỡ an toàn, lối sống ít vận động, ngân sách 80.000 VNĐ/ngày.
   - 7 ngày lịch sử giảm dần từ 68.6kg về 68.0kg.
3. **`gym_user` (Người tập gym tăng cơ):**
   - 24 tuổi, Nam, 175cm, 72kg $\rightarrow$ 76kg (tăng cơ 0.25 kg/tuần).
   - Mục tiêu: Tăng cơ giàu đạm, vận động cường độ cao, ngân sách 120.000 VNĐ/ngày.
   - 7 ngày lịch sử tăng dần từ 71.8kg lên 72.3kg.

---

## PHẦN 2: CẤU TRÚC BỘ 8 SLIDE BÁO CÁO MỐC POC (SLIDE DECK SPECIFICATION)

### Slide 1: Tiêu Đề & Giới Thiệu Đồ Án
- **Tiêu đề lớn:** NutriSnap — Virtual AI Nutrition Assistant
- **Phụ đề:** Báo cáo Khả thi Mốc PoC (Tuần 1 – Tuần 3)
- **Nhóm sinh viên thực hiện:** Cặp 1 — Data Core, Security & Governance
  - Nguyễn Hoàng Việt Huy (MSSV: 25127060)
  - Nguyễn Trần Minh Đức (MSSV: 25127300)
- **Giảng viên hướng dẫn:** Bộ môn Công nghệ Phần mềm — FIT HCMUS.

---

### Slide 2: Vấn Đề Thực Tế & Động Lực Phát Triển
- **Nghịch lý AI Dinh dưỡng hiện nay:**
  - LLM sinh số calo ngẫu nhiên, hay nhầm lẫn số liệu món ăn Việt Nam.
  - Nguy cơ ảo giác số học (Arithmetic Hallucination) gây nguy hiểm sức khỏe người dùng ăn kiêng.
  - Người dùng không có cách kiểm chứng tính toán calo của trợ lý ảo.
- **Giải pháp NutriSnap:**
  - AI chỉ đảm nhiệm phần thị giác nhận diện món và ngôn ngữ giao tiếp.
  - Backend đại số tất định chịu trách nhiệm 100% tính toán calo, macro và chi phí.

---

### Slide 3: Kiến Trúc Phân Lớp & Ranh Giới An Toàn (Architecture & Boundary)
- **Ranh giới rõ ràng:**
  - `Vision/LLM Layer`: Nhận diện ảnh món ăn, trích xuất tên món và số gam dự đoán.
  - `Security Guard Layer`: Loại bỏ mọi `user_id` giả mạo, trích xuất danh tính từ HttpOnly JWT Cookie.
  - `Deterministic Nutrition Engine`: Đối chiếu 500 món ăn Việt Nam, tính toán calo/macro đại số, áp dụng hệ số trừ hao thức ăn thừa (`eaten_ratio`).
  - `Storage Layer`: SQLite 8 bảng chuẩn hóa với `PRAGMA foreign_keys = ON`.

---

### Slide 4: CSDL 8 Bảng & Kho Dữ Liệu 500 Món Ăn Việt Nam
- **Bảng CSDL:** `users`, `goals`, `weight_logs`, `food_references`, `meals`, `meal_items`, `chat_sessions`, `chat_messages`.
- **Ràng buộc khóa ngoại Cascade:** Đảm bảo toàn vẹn dữ liệu khi tài khoản bị xóa hoặc làm mới.
- **Kho 500 món Việt:** Dữ liệu chuẩn xác từ Viện Dinh Dưỡng Quốc Gia và khảo sát thực tế, bao gồm: Phở, Cơm tấm, Bún bò, Bánh mì, Canh chua, Đồ uống, Món chay...
- **Thuật toán Fuzzy Matching:** Tìm món thông minh ngay cả khi người dùng gõ sai chính tả hoặc gõ tắt.

---

### Slide 5: Động Cơ Tính Toán Tất Định (0% Hallucination Math)
- **Công thức đại số tuyệt đối:**
  $$\text{Effective Gram} = \text{estimated\_gram} \times \text{eaten\_ratio}$$
  $$\text{Nutrient} = \text{round}\left(\frac{\text{Effective Gram}}{100.0} \times \text{Nutrient\_per\_100g}, 2\right)$$
- **Medical Safety Floor:** Chặn không cho thiết lập calo dưới mức sàn y khoa (1200 kcal với nữ, 1500 kcal với nam).
- **Trừ hao thức ăn thừa:** Giải quyết bài toán thực tế người dùng không ăn hết suất ăn.

---

### Slide 6: Cơ Chế Xác Nhận Hai Bước & Bảo Vệ IDOR
- **Two-Step Confirmation Flow:**
  - `is_confirmed = False`: Trả về giao diện xem trước dinh dưỡng, trạng thái `pending_confirmation`, CSDL hoàn toàn sạch.
  - `is_confirmed = True`: Người dùng bấm "Xác nhận ghi", transaction nguyên tử lưu vào `meals` & `meal_items`.
- **Chống IDOR & Zero-Trust:**
  - Không endpoint nào nhận `user_id` từ client body.
  - Ngăn chặn triệt để tấn công đọc chéo nhật ký ăn uống hoặc phiên chat.

---

### Slide 7: Trực Quan Hóa 3 Hồ Sơ Demo (Student, Office, Gym)
- **Kịch bản Demo thực chiến trên 3 đối tượng người dùng:**
  - *Sinh viên (student_user):* Cân bằng calo, tiết kiệm chi phí sinh hoạt (< 50k/ngày).
  - *Văn phòng (office_user):* Giảm cân bền vững, theo dõi calo chặt chẽ khi ăn ngoài hàng quán.
  - *Gymer (gym_user):* Tối ưu hóa đạm (> 150g protein/ngày), nạp năng lượng tăng cơ hiệu quả.
- Dashboard tự động hiển thị tiến trình ngày ngay khi đăng nhập.

---

### Slide 8: Kết Quả Đạt Được & Lộ Trình Tuần 4 — Tuần 5
- **Kết quả nghiệm thu PoC Tuần 3:**
  - Đạt 100% test cases tự động (`test_w3_nutrition_and_meals.py`).
  - Hệ thống vận hành ổn định, sẵn sàng chuyển giao cho Cặp 2 (Frontend) và Cặp 3 (AI Intelligence).
- **Kế hoạch tiếp theo:**
  - Tuần 4: Lập trình 4 Tool Executors, bảo mật công cụ chống Prompt Injection (`tool_security.py`).
  - Tuần 5: Thuật toán làm mịn xu hướng cân nặng EMA, phân tích thói quen 7-14 ngày và Food Swap Simulator.
