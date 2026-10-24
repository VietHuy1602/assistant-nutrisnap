# ĐẶC TẢ HỢP ĐỒNG API (API CONTRACT) & LUỒNG MÀN HÌNH CHÍNH (SCREEN FLOWS)
> **Dự án:** NutriSnap – Virtual AI Nutrition Assistant  
> **Học phần:** CSC10014 – Tư duy tính toán (Computational Thinking) | FIT - HCMUS  
> **Chuyên trách:** Cặp 2 – Engineering & UI/UX Experience (Khôi Nguyên & Thành Đạt)  
> **Phiên bản:** 1.0.0 (Tuần 1 - Milestone 1 Initial Contract)

---

## 🎨 1. Hệ thống Thiết kế (Design System & UX Foundations)

Để đảm bảo tính nhất quán trên toàn bộ ứng dụng và tối ưu trải nghiệm ghi chép dinh dưỡng không áp lực (Zero-Stress Nutrition Tracking), hệ thống tuân thủ các quy chuẩn thiết kế sau:

### 1.1 Bảng màu Chủ đạo (Color Palette)
- **Primary Green (`#107C41`):** Màu xanh lá tươi mát của rau củ tươi, biểu trưng cho sức khỏe, cân bằng và năng lượng tích cực. Sử dụng cho các nút hành động chính (Primary CTA), trạng thái đạt mục tiêu và viền thanh tiến trình.
- **Background Light (`#F8FAFC`):** Màu xám trắng dịu mắt (Slate 50), chống mỏi mắt cho người dùng khi xem nhật ký ăn uống vào ban đêm.
- **Card Surface (`#FFFFFF`):** Nền thẻ màu trắng thuần, đổ bóng nhẹ (`shadow-sm` đến `shadow-md`) giúp phân tầng giao diện sạch sẽ.
- **Text Color:**
  - `text-slate-900` (`#0F172A`): Tiêu đề và nội dung quan trọng.
  - `text-slate-500` (`#64748B`): Nhãn phụ, thời gian, đơn vị tính.
- **Macro Badges:**
  - **Calories:** Cam san hô (`#EA580C` / `bg-orange-50`)
  - **Protein (Đạm):** Xanh dương (`#2563EB` / `bg-blue-50`)
  - **Carbs (Tinh bột):** Vàng mật ong (`#D97706` / `bg-amber-50`)
  - **Fat (Chất béo):** Tím oải hương (`#7C3AED` / `bg-purple-50`)

### 1.2 Typography & Quy chuẩn Hiển thị
- **Font chữ:** `Inter`, sans-serif (tối ưu khả năng đọc trên cả Web và Mobile).
- **Huy hiệu Minh bạch Dinh dưỡng (Responsible UX Badge):**  
  Mọi màn hình hiển thị số liệu Calo/Macro tính toán từ hình ảnh bắt buộc phải có nhãn cảnh báo mờ bên dưới:
  > *"Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế tư vấn y khoa."*

---

## 📱 2. Đặc tả 4 Khung Màn hình Cốt lõi & Luồng Tương tác (Screen Flows)

### 2.1 Màn hình 1: Đăng nhập & Đăng ký (Authentication)
* **Mục tiêu:** Xác thực tài khoản người dùng an toàn, bảo mật theo chuẩn Nghị định 13/2023/NĐ-CP.
* **Luồng tương tác:**
  1. Người dùng nhập `username/email` và `password`.
  2. Bấm [Đăng nhập] -> Gửi request tới `POST /api/v1/auth/login`.
  3. Backend xác thực và đính kèm JWT vào **HttpOnly Cookie** (`SameSite=Lax`, `Secure=False` ở dev).
  4. Trình duyệt tự lưu Cookie an toàn, Frontend kiểm tra trạng thái qua `GET /api/v1/auth/me`:
     - Nếu người dùng chưa có mục tiêu cá nhân (`has_goal == false`): Chuyển hướng tới **Goal Planner Wizard**.
     - Nếu đã có mục tiêu: Chuyển hướng thẳng vào **Dashboard**.

### 2.2 Màn hình 2: Thiết lập Mục tiêu Thông minh (Smart Goal Planner Wizard)
* **Mục tiêu:** Tính toán nhu cầu năng lượng BMR, TDEE và mục tiêu giảm mỡ / duy trì / tăng cơ có trách nhiệm y khoa.
* **Các bước nhập liệu:**
  - **Bước 1 (Thông số cơ thể):** Giới tính, Tuổi, Chiều cao (cm), Cân nặng hiện tại (kg), Tần suất vận động (PAL: Sedentary, Light, Moderate, Active).
  - **Bước 2 (Mục tiêu):** Chọn Giảm cân (`lose_weight`), Giữ cân (`maintain`), Tăng cơ (`gain_muscle`), Cân nặng mục tiêu (kg).
  - **Bước 3 (Kiểm tra an toàn):** Hệ thống tính toán BMR (Mifflin-St Jeor), TDEE, và giới hạn tốc độ thay đổi cân nặng an toàn (0.25kg - 0.75kg/tuần). Ngân sách chi tiêu mặc định 60.000 VNĐ/ngày.
  - **Bước 4 (Xác nhận):** Bấm [Lưu mục tiêu] -> Gọi `POST /api/v1/goals` -> Chuyển vào Dashboard.

### 2.3 Màn hình 3: Màn hình Chụp ảnh & Xác nhận Khẩu phần (Meal Capture & Review)
* **Mục tiêu:** Zero-Friction Logging – Ghi nhận món ăn 3 giây kèm cơ chế xác nhận 2 bước chống ảo giác AI.
* **Luồng tương tác:**
  1. Người dùng mở Camera (WebRTC) hoặc tải ảnh đĩa thức ăn lên.
  2. Hệ thống gửi ảnh tới `POST /api/v1/meals/preview` (AI Vision bóc tách món ăn và ước lượng gam).
  3. **Thẻ Xác nhận Khẩu phần (Two-Step Confirmation Card):**
     - Giao diện hiển thị danh sách các món ăn đã nhận diện kèm ô `input` khối lượng (gam) và tên món.
     - Người dùng có toàn quyền: Tăng/giảm số gam, xóa món nhận diện sai, thêm món phụ hoặc chọn từ danh sách 500 món ăn chuẩn.
     - Tổng Calo ước tính tự động nhảy theo công thức đại số thời gian thực:  
       `Calo = ∑ (gam / 100 * calo_tham_chiếu)`.
  4. Người dùng bấm [Xác nhận lưu] -> Gửi request `POST /api/v1/meals/log` với `is_confirmed: true` -> Ghi vào DB và cập nhật Dashboard.

### 2.4 Màn hình 4: Khung trò chuyện Trợ lý ảo (Assistant Chat Drawer) & Dashboard
* **Mục tiêu:** Trợ lý AI đồng hành thông minh, hỗ trợ qua hội thoại tự nhiên và đồng bộ thời gian thực.
* **Giao diện & Chức năng:**
  - Drawer trượt mở từ cạnh phải (Desktop) hoặc trượt từ đáy màn hình (Mobile).
  - **Quick Action Pills:** Các nút câu hỏi mẫu thông dụng:
    - *"Hôm nay tôi còn bao nhiêu calo?"*
    - *"Gợi ý bữa tối 40k đủ đạm"*
    - *"Xem tiến độ cân nặng tuần này"*
  - **Thẻ Xác nhận Thao tác trong Chat (Action Confirmation Cards):**
    - Khi người dùng chat: *"Trưa nay tôi ăn 1 bát phở bò 400g"*, AI nhận diện intent và gọi `log_meal` với `is_confirmed: false`.
    - Chatbot hiển thị câu chào và đính kèm 1 **Thẻ Xác nhận Thao tác**: [Món: Phở bò tái, Khẩu phần: 400g, Ước tính: ~460 kcal] kèm nút `[Xác nhận lưu]` và `[Chỉnh sửa]`.
    - Khi bấm `[Xác nhận lưu]`, Frontend gửi request xác nhận, tin nhắn cập nhật trạng thái đã lưu, và **Vòng tròn Calo trên Dashboard tự động nhảy số đồng bộ tức thì**.

### 2.5 Màn hình 5: Phân tích Tiến độ (Progress Analytics), Food Swap & Ghi chú Gia vị (Tuần 5)
* **Mục tiêu:** Cung cấp bức tranh trực quan về tiến trình cân nặng và calo dài hạn, mô phỏng linh hoạt việc đổi món không áp lực và ghi nhận gia vị ẩn bằng giọng nói tiếng Việt an toàn.
* **Các khối chính trên trang `/progress`:**
  - **Dual Line Chart (Cân nặng & Xu hướng EMA):** Đường nét liền xanh `#107C41` thể hiện cân nặng ghi nhận; đường nét đứt `#475569` thể hiện xu hướng EMA (chỉ vẽ khi backend có dữ liệu; khi thiếu hiển thị chip *"Đường xu hướng đang chờ hệ thống tính"* - Mode A).
  - **Bar Chart Calo ngày/tuần:** Màu cam `#EA580C` kèm đường hạn mức nét đứt. Áp dụng phương án suy giảm D (vẽ theo ngày kèm chú thích phân tuần nếu backend chưa tổng hợp theo tuần).
  - **Pattern Insights:** Các thẻ nhận xét thói quen (tối đa 4 thẻ, văn bản thuần từ backend); nếu người dùng có dưới 5 ngày dữ liệu sẽ hiển thị thông báo trung tính yêu cầu thêm dữ liệu.
  - **Hỗ trợ tiếp cận (A11y):** Nút [Xem dạng bảng] chuyển đổi dữ liệu thô, `role="img"`, hỗ trợ bàn phím và tôn trọng `prefers-reduced-motion`.
* **Luồng Food Swap Simulator:**
  - Ngữ cảnh `draft`: Người dùng bấm "Thử đổi món" trên màn hình xác nhận bữa ăn -> chọn ứng viên -> hiển thị chênh lệch calo/đạm/giá từ backend -> bấm [Áp dụng] (`SWAP_FOOD`) để backend preview tính lại.
  - Ngữ cảnh `logged`: Người dùng xem từ Dashboard -> chỉ mô phỏng tham khảo, không có nút áp dụng và 0 lời gọi ghi.
  - Luôn có nút [Giữ nguyên món] nổi bật.
* **Luồng Ghi chú Gia vị bằng Giọng nói (Voice Note):**
  - Web Speech API tiếng Việt (`vi-VN`) phiên âm trực tiếp tại trình duyệt ra ô văn bản cho phép người dùng xem/sửa trước khi áp dụng.
  - **Zero Audio Storage:** Tuyệt đối không thu âm hay gửi/lưu file âm thanh (không dùng MediaRecorder hay Blob).
  - Tự động fallback sang Textarea nhập tay khi không hỗ trợ, bị từ chối quyền, hoặc ngoại tuyến.

---

## 🔌 3. Bản Hợp đồng Giao tiếp API Chi tiết (REST API Contract)

Mọi API tuân thủ:
- **Base URL:** `/api/v1`
- **Xác thực:** HttpOnly Cookie mang JWT token (`access_token`). Tuyệt đối không truyền `user_id` qua URL hay Body đối với dữ liệu cá nhân.

```
+---------------------------------------------------------------------------------------------------+
| Phân hệ             | Method | Endpoint                        | Chức năng chính                  |
+---------------------+--------+---------------------------------+----------------------------------+
| Auth                | POST   | /api/v1/auth/register           | Đăng ký tài khoản mới            |
| Auth                | POST   | /api/v1/auth/login              | Đăng nhập, set HttpOnly Cookie   |
| Auth                | GET    | /api/v1/auth/me                 | Lấy thông tin user hiện tại      |
| Auth                | POST   | /api/v1/auth/logout             | Xóa Cookie, kết thúc phiên       |
| Goal                | GET    | /api/v1/goals                   | Lấy mục tiêu dinh dưỡng hiện tại |
| Goal                | POST   | /api/v1/goals                   | Tạo / cập nhật mục tiêu cá nhân  |
| Foods               | GET    | /api/v1/foods/search            | Tra cứu món ăn từ CSDL 500 món   |
| AI Vision           | POST   | /api/v1/ai/recognize-food       | Nhận diện ảnh món ăn qua AI      |
| Meals (Preview/Log) | POST   | /api/v1/meals/log               | Xem trước dinh dưỡng (is_confirmed=false) hoặc Ghi CSDL (is_confirmed=true) |
| Meals (Logging)     | GET    | /api/v1/meals/today             | Danh sách các bữa ăn hôm nay     |
| Meals (Logging)     | DELETE | /api/v1/meals/{meal_id}         | Xóa một bữa ăn                   |
| Dashboard           | GET    | /api/v1/meals/daily-dashboard   | Tổng calo, macro, hạn mức ngày   |
| Assistant           | POST   | /api/v1/assistant/chat          | Gửi tin nhắn và nhận phản hồi AI |
| Assistant           | GET    | /api/v1/assistant/history       | Lấy lịch sử hội thoại gần nhất   |
| Analytics (W5)      | GET    | /api/v1/analytics/weight-history| Lịch sử cân nặng & xu hướng EMA  |
| Analytics (W5)      | GET    | /api/v1/analytics/calorie-history| Lịch sử calo theo ngày/tuần     |
| Analytics (W5)      | GET    | /api/v1/analytics/patterns      | Mẫu thói quen (analyze_patterns) |
| Food Swap (W5)      | GET    | /api/v1/food/swap-candidates    | Ứng viên đổi món & chênh lệch    |
| Voice Note (W5)     | POST   | /api/v1/meal/voice-modifier     | Bóc tách gia vị từ ghi chú nói   |
+---------------------------------------------------------------------------------------------------+
```

---

## 📦 4. Chi tiết Cấu trúc Dữ liệu Request / Response (Schemas)

### 4.1 Phân hệ Xác thực (Authentication)

#### `POST /api/v1/auth/register`
* **Request Body:**
```json
{
  "username": "thanhdat",
  "email": "dat@example.com",
  "password": "Password123"
}
```
* **Response (201 Created):**
```json
{
  "success": true,
  "message": "Đăng ký tài khoản thành công.",
  "user": {
    "id": 1,
    "username": "thanhdat",
    "email": "dat@example.com",
    "created_at": "2026-10-20T21:45:00Z"
  }
}
```

#### `POST /api/v1/auth/login`
* **Request Body:**
```json
{
  "username_or_email": "thanhdat",
  "password": "Password123"
}
```
* **Response (200 OK):** *(Đính kèm Header: Set-Cookie: access_token=...; HttpOnly; Path=/; SameSite=Lax)*
```json
{
  "success": true,
  "message": "Đăng nhập thành công.",
  "has_goal": true,
  "user": {
    "id": 1,
    "username": "thanhdat",
    "email": "dat@example.com"
  }
}
```

---

### 4.2 Phân hệ Mục tiêu Cá nhân (Goal Planner)

#### `POST /api/v1/goals`
* **Request Body:**
```json
{
  "gender": "male",
  "age": 20,
  "height_cm": 175.0,
  "current_weight_kg": 70.0,
  "target_weight_kg": 67.0,
  "activity_level": "moderate",
  "goal_type": "lose_weight",
  "weekly_pace_kg": 0.5,
  "daily_budget_vnd": 60000
}
```
* **Response (200 OK):**
```json
{
  "id": 1,
  "user_id": 1,
  "target_weight": 67.0,
  "bmr_calories": 1690.0,
  "tdee_calories": 2150.0,
  "target_calories": 1650.0,
  "target_protein_g": 125.0,
  "target_carbs_g": 185.0,
  "target_fat_g": 45.0,
  "daily_budget_vnd": 60000,
  "disclaimer": "Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế tư vấn y khoa."
}
```

---

### 4.3 Phân hệ Nhật ký Bữa ăn & Xác nhận 2 bước (Meal Logging)

#### `POST /api/v1/meals/preview`
* **Request Body (Multipart Form hoặc JSON):**
```json
{
  "meal_type": "lunch",
  "image_base64": "data:image/jpeg;base64,...",
  "voice_modifier_text": "Không lấy mỡ gà, chỉ ăn 1 đĩa vừa"
}
```
* **Response (200 OK - Bản nháp chờ xác nhận):**
```json
{
  "status": "pending_confirmation",
  "meal_type": "lunch",
  "detected_items": [
    {
      "food_id": 12,
      "food_name": "Cơm gà xối mỡ",
      "estimated_gram": 350.0,
      "estimated_calories": 620.0,
      "protein_g": 28.5,
      "carbs_g": 75.0,
      "fat_g": 22.0,
      "confidence": 0.88
    }
  ],
  "total_estimated_calories": 620.0,
  "disclaimer": "Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo."
}
```

#### `POST /api/v1/meals/log`
* **Request Body (Bấm Xác nhận Lưu):**
```json
{
  "meal_type": "lunch",
  "items": [
    {
      "food_id": 12,
      "food_name": "Cơm gà xối mỡ",
      "estimated_gram": 300.0
    }
  ],
  "is_confirmed": true,
  "notes": "Đã bớt cơm lại một chút"
}
```
* **Response (201 Created):**
```json
{
  "success": true,
  "meal_id": 45,
  "logged_at": "2026-10-20T12:30:00Z",
  "total_calories": 531.0,
  "message": "Đã ghi nhận bữa trưa thành công!"
}
```

---

### 4.4 Phân hệ Dashboard Dinh dưỡng Trong Ngày

#### `GET /api/v1/meals/daily-dashboard?date=2026-10-20`
* **Response (200 OK):**
```json
{
  "date": "2026-10-20",
  "target_calories": 1800.0,
  "consumed_calories": 1250.0,
  "remaining_calories": 550.0,
  "calories_progress_percent": 69.4,
  "macros": {
    "protein": { "consumed": 78.5, "target": 120.0, "unit": "g" },
    "carbs": { "consumed": 150.0, "target": 210.0, "unit": "g" },
    "fat": { "consumed": 38.0, "target": 55.0, "unit": "g" }
  },
  "meals_summary": [
    {
      "meal_id": 44,
      "meal_type": "breakfast",
      "time": "07:30",
      "calories": 420.0,
      "items_count": 2
    },
    {
      "meal_id": 45,
      "meal_type": "lunch",
      "time": "12:15",
      "calories": 830.0,
      "items_count": 3
    }
  ],
  "disclaimer": "Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo."
}
```

---

### 4.5 Phân hệ Trợ lý Ảo AI (Assistant Chat with Action Cards)

#### 1. `POST /api/v1/assistant/chat`
* **Nguyên tắc bảo mật:** Zero-Trust (không gửi `user_id` hay `Authorization` header trong request; định danh người dùng được trích xuất hoàn toàn từ HttpOnly Cookie JWT).
* **Request Body:**
```json
{
  "session_id": 1,
  "message": "Trưa nay mình vừa ăn một đĩa bún chả khoảng 350g, ghi nhận giúp mình nhé"
}
```
* **Response (200 OK):**
```json
{
  "session_id": 1,
  "reply": "Mình đã tính toán xong bữa trưa của bạn với bún chả (~520 kcal). Bạn kiểm tra lại định lượng bên dưới và bấm Xác nhận để mình lưu vào nhật ký nhé!",
  "reply_text": "Mình đã tính toán xong bữa trưa của bạn với bún chả (~520 kcal). Bạn kiểm tra lại định lượng bên dưới và bấm Xác nhận để mình lưu vào nhật ký nhé!",
  "pending_confirmation": true,
  "action_card": {
    "type": "confirm_log_meal",
    "status": "pending_user_action",
    "meal_type": "lunch",
    "items": [
      {
        "food_id": 24,
        "food_name": "Bún chả Hà Nội",
        "estimated_gram": 350.0,
        "calories": 521.5,
        "protein_g": 24.0,
        "carbs_g": 62.0,
        "fat_g": 18.5
      }
    ],
    "total_calories": 521.5,
    "totals": {
      "calories": 521.5,
      "protein": 24.0,
      "carbs": 62.0,
      "fat": 18.5
    }
  },
  "tool_result": null,
  "disclaimer": "Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo. Trợ lý không thay thế tư vấn y khoa."
}
```

#### 2. `GET /api/v1/assistant/sessions/{id}/messages`
* **Query Parameters:** `limit: int` (mặc định 20, tối đa 100).
* **Response (200 OK):** Danh sách tin nhắn văn bản trong phiên; thẻ hành động trong lịch sử tuân thủ ADR-W4-04 (hiển thị ở trạng thái `readonly`).

#### 3. Xác nhận Thẻ Hành động (Chiến lược S2 — `POST /api/v1/meals/log`)
* **Request Body:**
```json
{
  "meal_type": "lunch",
  "items": [
    {
      "food_id": 24,
      "estimated_gram": 350.0
    }
  ],
  "is_confirmed": true
}
```
* **Response (201 Created):**
```json
{
  "success": true,
  "meal_id": 46,
  "logged_at": "2026-10-24T12:30:00Z",
  "total_calories": 521.5,
  "status": "logged",
  "disclaimer": "Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo."
}
```
* **Đồng bộ giao diện:** Khi xác nhận thành công, Frontend phát sự kiện bus `nutrisnap:meal-logged` với payload `{ source: 'chat', date: 'YYYY-MM-DD', mealId: 46 }`. `useDailyDashboard` lắng nghe sự kiện, kiểm tra đúng ngày và gộp (debounce 300ms) để thực hiện refetch êm vòng calo Dashboard mà không tải lại trang.

---

### 4.6 Phân hệ Phân tích Tiến độ, Food Swap & Ghi chú Gia vị (Tuần 5)

#### 1. `GET /api/v1/analytics/weight-history`
* **Query Parameters:** `days: int` (7, 14, 30, hoặc 90).
* **Response (200 OK):**
```json
{
  "weight_entries": [
    {
      "recorded_at": "2026-10-18T07:00:00Z",
      "weight_kg": 65.5,
      "ema_weight": null
    },
    {
      "recorded_at": "2026-10-19T07:00:00Z",
      "weight_kg": 65.2,
      "ema_weight": null
    }
  ],
  "disclaimer": "Đường xu hướng chỉ mang tính tham khảo. Cân nặng hằng ngày dao động theo lượng nước, muối và thời điểm đo."
}
```
> **Mode A (Tolerant Reader):** `ema_weight` là optional/nullable. Khi vắng mặt, Frontend chỉ vẽ 1 đường cân nặng thực tế kèm chip *"Đường xu hướng đang chờ hệ thống tính"*. Tuyệt đối không tự tính EMA ở client (ADR-W5-01 Zero-Math).

#### 2. `GET /api/v1/analytics/calorie-history` (hoặc `calories-weekly`)
* **Query Parameters:** `weeks: int` (hoặc `days: int`).
* **Response (200 OK):**
```json
{
  "bars": [
    {
      "date": "2026-10-18",
      "week_label": "Tuần 42",
      "calories": 1850,
      "target_calories": 2000,
      "days_logged": 7
    }
  ],
  "disclaimer": "Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo."
}
```

#### 3. `GET /api/v1/analytics/patterns`
* **Response (200 OK):**
```json
{
  "insights": [
    {
      "pattern_id": "late_dinner",
      "title": "Bữa tối thường trễ",
      "description": "Bạn thường ghi nhận bữa tối sau 20:30. Ăn tối sớm hơn có thể giúp cải thiện chất lượng giấc ngủ.",
      "category": "timing",
      "days_analyzed": 7
    }
  ],
  "logged_days_count": 7
}
```
> Nếu `logged_days_count < 5`, mảng `insights` có thể rỗng và Frontend hiển thị thông báo trung tính: *"Cần ít nhất 5 ngày có ghi chép để đưa ra nhận xét."*

#### 4. `GET /api/v1/food/swap-candidates`
* **Query Parameters:** `food_id: int`.
* **Response (200 OK):**
```json
{
  "candidates": [
    {
      "food_id": 105,
      "name": "Bún chả ít mỡ",
      "current": {
        "calories": 520,
        "protein": 24,
        "price_vnd": 45000
      },
      "candidate": {
        "calories": 400,
        "protein": 27,
        "price_vnd": 45000
      },
      "diff": {
        "calories": -120,
        "protein": 3,
        "price_vnd": 0
      },
      "suggested_gram": 350
    }
  ]
}
```
> Toàn bộ các giá trị `diff` phải do Backend tính toán. Frontend hiển thị trực tiếp verbatim dạng chữ + dấu (ví dụ: "giảm 120 kcal", "tăng 3 g đạm").

#### 5. `POST /api/v1/meal/voice-modifier`
* **Request Body:**
```json
{
  "voice_note": "Ít dầu mỡ, chỉ ăn một nửa",
  "current_items": [
    {
      "food_id": 24,
      "food_name": "Bún chả Hà Nội",
      "estimated_gram": 350.0
    }
  ]
}
```
* **Response (200 OK):**
```json
{
  "items": [
    {
      "food_id": 24,
      "food_name": "Bún chả Hà Nội (ít dầu)",
      "estimated_gram": 175.0
    }
  ],
  "modifiers_summary": "Giảm 50% khẩu phần và điều chỉnh lượng dầu mỡ."
}
```
> **Bảo mật & Quyền riêng tư:** Trình duyệt sử dụng Web Speech API phiên âm trực tiếp và chỉ gửi chuỗi văn bản (`voice_note`). Tuyệt đối không thu âm hay truyền tải dữ liệu âm thanh qua mạng.


