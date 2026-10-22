# HƯỚNG DẪN KỸ THUẬT DÀNH CHO AI IDE (ANTIGRAVITY IDE)
**Dự án:** NutriSnap - Trợ lý ghi nhận dinh dưỡng đa phương thức không ma sát  
**Repository:** `https://github.com/VietHuy1602/assistant-nutrisnap.git`  
**Người thực hiện:** Lê Hoàng Phú Hiếu (MSSV: 25127049)  
**Vai trò:** Cặp 3 – AI Intelligence & QA/Benchmarking (Chuyên trách phần **AI-Integration**)

---

## 1. BỐI CẢNH & NGUYÊN TẮC CỐT LÕI DÀNH CHO AI IDE
Bạn là trợ lý lập trình AI hỗ trợ trực tiếp cho **Lê Hoàng Phú Hiếu**. Trong dự án này, công việc chung (Pair Session) giữa Phú Hiếu và Quốc Tuấn đã được phân chia luân phiên theo tuần chẵn/lẻ. **Tài liệu này CHỈ tập trung vào các nhiệm vụ cá nhân độc lập mang tên Lê Hoàng Phú Hiếu.**

### Kiến trúc & Nguyên tắc bắt buộc khi sinh code:
1. **Phân rã hệ thống (Decomposition):**
   - Tầng của Phú Hiếu là **AI Service Layer (Tầng Xử lý Thông minh)**.
   - **KHÔNG** tự ý tính toán Calo/Macro bằng AI hoặc bịa số liệu dinh dưỡng (nhiệm vụ tính toán dựa trên CSDL USDA thuộc về Cặp 1 - Core Data Layer). Tầng AI chỉ nhận ảnh/văn bản, gọi LLM/Vision API và bóc tách ra **tên món ăn**, **khối lượng ước tính (gam)**, **độ tự tin (`confidence_score`)** hoặc **các tham số điều chỉnh khẩu phần**.
2. **Quản lý mã nguồn & Bảo mật:**
   - Tuyệt đối không hardcode API Key trong code. Luôn đọc từ biến môi trường (`.env`) thông qua `os.getenv` hoặc `pydantic-settings`.
   - Làm việc trên nhánh riêng biệt (ví dụ: `feat/ai-vision-recognition`, `feat/ai-analyze-dish-api`, `feat/ai-voice-modifier`,...) trước khi tạo Pull Request.
3. **Nhật ký sử dụng AI (`docs/ai_use_log.md`):**
   - Mỗi khi hoàn thành một tính năng với sự hỗ trợ của IDE, cần nhắc nhở hoặc tự động cập nhật thêm một dòng vào bảng trong file `docs/ai_use_log.md` theo đúng quy chuẩn của môn học.

---

## 2. NHIỆM VỤ TRọng TÂM HIỆN TẠI: TUẦN 2 (W2) - ƯU TIÊN RẤT CAO
*(Dữ liệu trích xuất trực tiếp từ bảng phân công công việc W2)*

* **Tên đầu mục:** Module Vision Recognition
* **File mục tiêu:** `src/ai/vision_recognition.py` (hoặc đặt trong `src/backend/ai/vision_recognition.py` tùy theo cấu trúc nhánh hiện tại trên repo).
* **Yêu cầu kỹ thuật chi tiết:**
  1. Viết module nhận đầu vào là đường dẫn file ảnh hoặc dữ liệu bytes của ảnh chụp đĩa thức ăn.
  2. Gửi ảnh kèm System Prompt tối ưu hóa tới Vision API (Gemini Vision API `gemini-2.5-flash` / `gemini-1.5-flash` hoặc OpenAI Vision API).
  3. **Ép kiểu đầu ra (Structured Outputs / JSON Mode):** Bắt buộc phản hồi trả về phải là chuỗi JSON hợp lệ (hoặc parse qua Pydantic Model), chứa danh sách các món ăn nhận diện được trên đĩa.
  4. **Cấu trúc JSON bắt buộc cho mỗi món ăn:**
     ```json
     {
       "dishes": [
         {
           "dish_name": "Tên món ăn (tiếng Việt chuẩn hóa để dễ tra cứu trong vn_foods.csv)",
           "estimated_weight_gram": 150.0,
           "confidence_score": 0.92
         }
       ]
     }
     ```
  5. **Ràng buộc dữ liệu (Validation):**
     - `dish_name`: Chuỗi không rỗng.
     - `estimated_weight_gram`: Số thực dương ($> 0$), tuyệt đối không trả về số âm.
     - `confidence_score`: Số thực nằm trong khoảng từ $0.0$ đến $1.0$.
     - Đảm bảo tương thích hoàn toàn với bộ kiểm thử `pytest` của Quốc Tuấn.

---

## 3. LỘ TRÌNH NHIỆM VỤ CÁ NHÂN CÁC TUẦN TIẾP THEO (W1 - W7)

Để AI IDE nắm rõ bức tranh tổng thể và giữ tính liên kết khi viết code cho Phú Hiếu qua từng tuần:

### Tuần 1 (W1): Khởi tạo PoC Vision (Cơ sở)
* **File mục tiêu:** `poc_vision.py`
* **Yêu cầu:** Kết nối API thử nghiệm (Gemini/OpenAI), gửi 1 bức ảnh đĩa thức ăn lên API và in kết quả nhận diện ra màn hình console.

### Tuần 3 (W3): Đóng gói API Phân tích Đĩa ăn & Mock Fallback (Milestone PoC)
* **Endpoint mục tiêu:** `POST /api/v1/ai/analyze-dish`
* **Yêu cầu:**
  - Tích hợp module `vision_recognition.py` của Tuần 2 vào FastAPI router.
  - Nhận file ảnh upload từ Frontend (Camera Capture của Cặp 2).
  - **Cơ chế dự phòng (Mock Fallback):** Thiết lập cơ chế bắt lỗi (`try/except` timeout, mất mạng, hoặc hết quota API). Nếu gặp sự cố kết nối trong lúc demo trực tiếp, API tự động trả về một JSON dữ liệu mẫu chuẩn xác để luồng Web Demo không bị gián đoạn.

### Tuần 4 (W4): Lập trình Bộ phân tích Ghi chú Giọng nói (Voice Modifiers)
* **File mục tiêu:** `services/voice_modifier.py` (hoặc `src/ai/voice_modifier.py`)
* **Yêu cầu:**
  - Sử dụng mô hình ngôn ngữ nhỏ/nhanh để phân tích chuỗi văn bản do người dùng nói (đã được Web Speech API ở Frontend chuyển thành text).
  - Bóc tách các hành động điều chỉnh khẩu phần hoặc thành phần ẩn mà camera không thấy được.
  - *Ví dụ:* Phát hiện câu *"Ức gà áp chảo bằng 1 thìa dầu ô-liu, chỉ ăn nửa phần cơm"* $\rightarrow$ Trả về cấu trúc JSON chỉ thị: cộng thêm `14g` dầu ô-liu vào danh sách nguyên liệu, và nhân hệ số `0.5` cho khối lượng món cơm.

### Tuần 5 (W5): Bộ Gợi ý Bù trừ Bữa ăn Thông minh (Smart Compensation Engine)
* **File mục tiêu:** `services/smart_compensation.py` (hoặc `src/ai/smart_compensation.py`)
* **Yêu cầu:**
  - Nhận đầu vào là lượng Calo và Macro (Protein, Carbs, Fat) còn thiếu hoặc dư thừa trong ngày từ API của Cặp 1 (`GET /api/v1/analytics/daily-progress`).
  - Sinh ra thẻ gợi ý (Coaching Card) cho bữa ăn tiếp theo theo đúng triết lý **"Huấn luyện viên mang tính xây dựng" (Constructive Coach)** — giọng điệu nhẹ nhàng, khích lệ, không phán xét.
  - *Ví dụ:* *"Bữa trưa của bạn đã nạp khá nhiều tinh bột, bữa tối hãy thử một phần salad ức gà nướng thanh đạm để cân bằng lượng Protein nhé!"*

### Tuần 6 (W6): Cài đặt Bộ lọc An toàn AI (Input Guardrails)
* **File mục tiêu:** Tích hợp vào pipeline AI (`src/ai/guardrails.py`)
* **Yêu cầu:**
  - **Kiểm soát hình ảnh:** Phát hiện và từ chối xử lý nhẹ nhàng khi người dùng tải lên ảnh không phải đồ ăn/thức uống (ví dụ: ảnh phong cảnh, thú cưng, đồ vật).
  - **Kiểm soát văn bản/giọng nói:** Chặn các câu lệnh độc hại (Prompt Injection) hoặc các yêu cầu ép AI kê đơn thuốc, chẩn đoán y khoa, tư vấn chữa bệnh vượt quá phạm vi dinh dưỡng thường thức.

### Tuần 7 (W7): Phân tích Nguyên nhân Sai số (Error Analysis) & Hoàn thiện MVP
* **Mục tiêu:** Tài liệu báo cáo đánh giá & Tối ưu hóa cuối kỳ.
* **Yêu cầu:**
  - Phối hợp với kết quả chạy 100 mẫu benchmark thực tế (đo chỉ số sai số tuyệt đối trung bình $\text{MAE}$) để viết báo cáo giải trình chi tiết các trường hợp AI ước tính thể tích/khối lượng chưa chuẩn (ví dụ: món canh/bún/phở ngập nước dùng, món cuốn, hoặc nước sốt ẩn).
  - Đề xuất giải pháp kỹ thuật khắc phục trong tương lai.

---

## 4. CÂU LỆNH MẪU (PROMPT) ĐỂ BẠN COPY DÁN VÀO ANTIGRAVITY IDE NGAY LÚC NÀY

> **Copy đoạn dưới đây gửi cho Antigravity IDE để bắt đầu làm việc Tuần 2:**
> 
> *"Hãy đọc kỹ file `PHU_HIEU_AI_IDE_GUIDE.md` và quét cấu trúc thư mục hiện tại của dự án. Tôi là Lê Hoàng Phú Hiếu. Hiện tại chúng ta đang ở **Tuần 2 (W2)**. Hãy giúp tôi lập trình hoàn chỉnh file `src/ai/vision_recognition.py` theo đúng yêu cầu kỹ thuật của Tuần 2 đã mô tả trong tài liệu: nhận ảnh đĩa ăn, gọi Gemini Vision API, ép kiểu trả về JSON gồm danh sách món ăn (`dish_name`), số gam ước lượng (`estimated_weight_gram`) và độ tự tin (`confidence_score`), kèm xử lý ngoại lệ và kiểm tra tính hợp lệ của dữ liệu. Sau đó, hãy cung cấp nội dung để tôi cập nhật vào `docs/ai_use_log.md`."*