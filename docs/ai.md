# HƯỚNG DẪN TÍCH HỢP GEMINI API KEY & XÂY DỰNG CHATBOT DINH DƯỠNG TOÀN DIỆN (NUTRISNAP)

**Dự án:** NutriSnap - Ứng dụng Quản lý Dinh dưỡng Đa phương thức  
**Tên khóa API (Google AI Studio):** `Nutrition-App-Key` (`projects/686734949287`)  
**Mục tiêu:** Nhúng khóa API `GEMINI_API_KEY` vào hệ thống và kết nối Chatbot AI (`src/ai/orchestrator.py` & `AssistantChatDrawer.tsx`) với **100% nguồn dữ liệu nội bộ của ứng dụng** để Chatbot có thể tư vấn, giải đáp và gợi ý mọi vấn đề của người dùng dựa trên số liệu thực tế trong app.

---

## 1. QUY TẮC BẮT BUỘC DÀNH CHO ANTIGRAVITY IDE

1. **TUYỆT ĐỐI KHÔNG XÓA BẤT KỲ FILE NÀO:** Giữ nguyên toàn bộ các file mã nguồn, tài liệu (`docs/`), dữ liệu (`data/`), kịch bản (`scripts/`) và kiểm thử (`tests/`) hiện có.
2. **BẢO MẬT KHÓA API (`.env` & `.gitignore`):**
   - Lưu khóa API trong file `.env` ở thư mục gốc của dự án.
   - Đảm bảo `.env` nằm trong `.gitignore` để không lộ khóa khi đẩy code lên GitHub.
3. **SỬ DỤNG DỮ LIỆU THẬT CỦA APP (ZERO HALLUCINATION):**
   - Mọi con số về Calo, Protein, Carbs, Fat, Giá tiền (VNĐ), Cân nặng, Chuỗi thói quen (Streak) mà Chatbot trả lời người dùng **bắt buộc phải truy xuất từ CSDL `nutrisnap.db` và bảng `food_references` (`data/vn_foods.csv`)** của ứng dụng.

---

## 2. CẤU HÌNH KHÓA API (`Nutrition-App-Key`)

### 2.1. File `.env` tại thư mục gốc dự án (Backend & AI Engine)
Cập nhật hoặc tạo mới file `.env` tại thư mục gốc với khóa API mới:

```env
# Google AI Studio - Nutrition-App-Key (projects/686734949287)
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
GOOGLE_API_KEY=YOUR_GEMINI_API_KEY_HERE
GEMINI_MODEL_NAME=gemini-2.5-flash

# Cấu hình Backend & Database
APP_ENV=development
DATABASE_URL=sqlite:///./nutrisnap.db
```

### 2.2. File `src/frontend/.env` (Giao diện React)
Đảm bảo Frontend trỏ đúng về Backend API và bật chế độ AI trực tuyến:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_ENABLE_LIVE_AI=true
```

---

## 3. KIẾN TRÚC KẾT NỐI CHATBOT VỚI 100% DỮ LIỆU CỦA APP

Để Chatbot có thể trả lời và gợi ý **tất cả mọi vấn đề trong app**, module `src/ai/orchestrator.py` và `src/backend/services/assistant_tools.py` cần nạp ngữ cảnh tổng thể (Full-App Context Injection) và cung cấp đầy đủ bộ công cụ (Tools) truy xuất dữ liệu theo đúng `user_id` đang đăng nhập:

### 3.1. 6 Nguồn Dữ liệu Nội bộ Chatbot phải nắm rõ
1. **Hồ sơ Thể trạng & Mục tiêu Cá nhân (`user_profiles` / Goal Planner):**
   - Chiều cao, cân nặng hiện tại, cân nặng mục tiêu, tuổi, giới tính, mức độ vận động.
   - Chỉ số $\text{BMR}$, $\text{TDEE}$ và hạn mức mục tiêu mỗi ngày: Tổng Calo ($\text{kcal}$), Protein ($\text{g}$), Carbs ($\text{g}$), Fat ($\text{g}$), ngân sách ăn uống trong ngày ($\text{VNĐ}$).
2. **Nhật ký Bữa ăn Hôm nay & Lịch sử Ăn uống (`meals`, `meal_items`):**
   - Danh sách các món đã ăn trong ngày (sáng, trưa, tối, bữa phụ), khối lượng ($\text{g}$), lượng Calo và Macro đã nạp, lượng Calo/Đạm còn thiếu hoặc vượt mức.
3. **Cơ sở dữ liệu 500+ Món ăn Việt Nam (`food_references` / `data/vn_foods.csv`):**
   - Tra cứu chính xác thành phần dinh dưỡng trên mỗi $100\text{g}$ và giá tiền ước tính ($\text{VNĐ}$) của các món ăn trong app để lên thực đơn hoặc gợi ý món theo số tiền còn lại và lượng Calo/Macro còn thiếu.
4. **Gợi ý Đổi món & Bù trừ Thông minh (`Food Swap Simulator` & `Smart Compensation`):**
   - Khi người dùng muốn đổi một món ăn (ví dụ: đổi phở bò hoặc cơm tấm sang món khác ít calo hơn / giàu đạm hơn / rẻ hơn), Chatbot truy vấn trực tiếp hàm đổi món của app để đề xuất món thay thế kèm độ chênh lệch Calo, Protein và chi phí.
5. **Xu hướng Cân nặng EMA & Phân tích Hành vi (`weight_trend.py` & `analyze_user_patterns`):**
   - Đọc dữ liệu cân nặng trung bình động $\text{EMA}$ 7–90 ngày và các mẫu thói quen ăn uống (như hay bỏ bữa sáng, thiếu hụt đạm, ăn khuya, vượt calo cuối tuần) để giải thích vì sao cân nặng tăng/giảm và đưa ra lời khuyên điều chỉnh.
6. **Chuỗi Thói quen & Báo cáo Tháng (`habit_service.py` & `/api/v1/reports/monthly`):**
   - Nắm được số ngày duy trì ghi nhật ký liên tiếp (Habit Streak), tiến độ thử thách 7 ngày và tổng kết tháng để khích lệ tinh thần người dùng theo đúng triết lý *Constructive Nutrition Coach* (không phán xét, không gây áp lực).
   - Hướng dẫn người dùng cách dùng mọi tính năng trong app (Chụp bữa ăn qua Camera, nhấn giữ Micro nói ghi chú dầu/sốt/ăn thừa, xem biểu đồ Tiến độ, xuất Báo cáo tháng).

---

### 3.2. Danh sách Công cụ (Tools) Điều phối Tự động trong `src/ai/orchestrator.py`
Đảm bảo LLM có thể gọi linh hoạt các công cụ sau để lấy số liệu thật từ CSDL:
- `get_daily_nutrition`: Lấy toàn bộ thông tin bữa ăn hôm nay, lượng Calo/Protein/Carbs/Fat đã nạp và hạn mức còn lại.
- `recommend_meals`: Tìm và gợi ý danh sách món ăn từ bảng `food_references` khớp với lượng Calo còn lại, ưu tiên bù đạm và khớp ngân sách ($\text{VNĐ}$).
- `log_meal`: Hỗ trợ người dùng ghi nhận nhanh bữa ăn ngay trong khung chat (kèm cơ chế thẻ xác nhận `pending_confirmation`).
- `get_progress_summary`: Lấy tổng hợp xu hướng cân nặng $\text{EMA}$, mẫu hành vi ăn uống 14 ngày, chuỗi ngày Streak và số liệu báo cáo tháng.
- `suggest_food_swap` (Mở rộng hoặc tích hợp trong công cụ gợi ý): Tìm món ăn thay thế tối ưu từ dữ liệu app khi người dùng hỏi *"Có món nào thay cho món X không?"*.

---

## 4. NÂNG CẤP GIAO DIỆN CHATBOT FRONTEND (`AssistantChatDrawer.tsx`)

1. **Hiển thị Định dạng Tin nhắn Đẹp mắt (Markdown Rendering):**
   - Chuyển đổi toàn bộ cú pháp Markdown từ AI (`**chữ in đậm**`, `*in nghiêng*`, danh sách gạch đầu dòng `-`, xuống dòng) thành giao diện HTML trực quan, loại bỏ hoàn toàn tình trạng hiển thị ký tự `**` thô trên màn hình.
2. **Gợi ý Câu hỏi Nhanh Toàn diện (Quick Suggestion Chips):**
   - Cung cấp các nút gợi ý nhanh bao quát mọi tính năng của app:
     - `💡 Hôm nay còn bao nhiêu Calo & Đạm?`
     - `🍱 Gợi ý thực đơn vừa ngân sách hôm nay`
     - `🔄 Gợi ý đổi món giàu Protein hơn`
     - `📈 Phân tích xu hướng cân nặng & thói quen của tôi`
     - `🍜 Ghi nhận nhanh bữa ăn vừa dùng`
3. **Đồng bộ Trạng thái Kết nối (`API: online ✓`):**
   - Khi Backend đã nạp thành công khóa `GEMINI_API_KEY`, trạng thái ở góc dưới khung chat hiển thị `API: online ✓` (không còn cảnh báo `warn`).
   - Giữ vững cơ chế **Hybrid Intelligent Fallback**: Nếu mạng chập chờn hoặc cổng API gặp sự cố tạm thời, Chatbot tự động tổng hợp dữ liệu trực tiếp từ SQLite DB (`nutrisnap.db`) để trả lời chính xác 100% số liệu của người dùng mà không bao giờ bị gián đoạn.

---

## 5. CÂU LỆNH MẪU (PROMPT) ĐỂ COPY DÁN VÀO ANTIGRAVITY IDE

> **Bước 1:** Copy toàn bộ nội dung file này lưu vào **`docs/07_full_app_chatbot_integration.md`** trong dự án của bạn.  
> **Bước 2:** Copy đoạn lệnh dưới đây dán vào khung Chat của Antigravity IDE:
>
> *"Hãy đọc kỹ tài liệu `docs/07_full_app_chatbot_integration.md` và thực hiện tích hợp khóa API mới cùng nâng cấp toàn diện Chatbot quản lý dinh dưỡng cho ứng dụng theo đúng các yêu cầu sau:
> 1. Tuyệt đối KHÔNG xóa bất kỳ file nào đang có trong dự án. Đảm bảo `.env` nằm trong `.gitignore`.
> 2. Cập nhật file `.env` ở thư mục gốc với khóa `GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE` (và `GOOGLE_API_KEY` tương ứng) cùng `src/frontend/.env` kết nối tới Backend.
> 3. Nâng cấp `src/ai/orchestrator.py`, `src/backend/services/assistant_tools.py` và endpoint `/api/v1/assistant/chat` để Chatbot nạp đầy đủ ngữ cảnh dữ liệu thật của người dùng trong app (Hồ sơ BMR/TDEE, Nhật ký bữa ăn hôm nay, CSDL 500+ món ăn `food_references`, Gợi ý đổi món Food Swap, Xu hướng cân nặng EMA, Mẫu hành vi ăn uống và Chuỗi thói quen Habit Streak). Đảm bảo Chatbot có thể tư vấn, giải đáp và gợi ý mọi vấn đề trong app dựa 100% trên dữ liệu thật của CSDL, kết hợp cơ chế Fallback an toàn tuyệt đối.
> 4. Cập nhật giao diện `AssistantChatDrawer.tsx` trên Frontend để render đẹp mắt định dạng Markdown (in đậm, danh sách món ăn, gợi ý bù trừ), bổ sung các nút gợi ý câu hỏi bao quát toàn bộ dữ liệu app và hiển thị trạng thái `API: online ✓` chuẩn xác.
> 5. Chạy kiểm thử `pytest tests/ -v` và `ruff check .` đảm bảo toàn bộ bài test pass 100% và 0 lỗi linter."*