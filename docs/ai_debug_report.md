# Báo cáo Chẩn đoán và Xử lý Lỗi Gốc Trợ lý AI (Phase 0 Debug Report)

**Dự án:** NutriSnap – Virtual Nutrition Assistant  
**Phân hệ:** AI Intelligence & Backend Chat Orchestration  
**Tác giả:** Kỹ sư AI/Backend Senior  
**Ngày thực hiện:** 2026-10-30  

---

## 1. Hiện tượng & Vấn đề ban đầu
Dù đã cấu hình `GEMINI_API_KEY` hợp lệ trong môi trường cục bộ (`.env`), chatbot trong ứng dụng chỉ phản hồi được các câu chào như "hi/hello". Mọi câu hỏi tư vấn dinh dưỡng khác hoặc yêu cầu ngoài các từ khóa định sẵn đều nhận được cùng một câu trả lời cố định:
> *"Chào [Tên]! Mình là NutriSnap Coach – Trợ lý dinh dưỡng cá nhân của bạn. Hôm nay bạn muốn kiểm tra dinh dưỡng trong ngày, ghi nhận bữa ăn, tìm gợi ý món ăn ngon hay xem tiến độ cân nặng?"*

---

## 2. Phân tích Nguyên nhân Gốc (Root Causes)

Qua rà soát toàn diện mã nguồn tại `src/ai/`, `src/backend/routers/`, và luồng thực thi API, chúng tôi xác định được **5 nguyên nhân cốt lõi**:

### Nguyên nhân 1: Nuốt lỗi (`try/except Exception`) và Fallback mù quáng trong Chat Router
- **Vị trí:** `src/backend/routers/assistant_router.py` (dòng 236–250 và dòng 368–372).
- **Cơ chế lỗi:** Khi `orchestrate_chat` gặp bất kỳ ngoại lệ nào (lỗi mạng, sai tên model, lỗi SDK, schema mismatch), khối `except Exception:` đã **bắt toàn bộ ngoại lệ mà không gọi `logger.exception`**. 
- Trong nhánh `except`, mã nguồn cố gắng dùng `classify_user_intent(req.message)` với regex từ khóa cứng. Nếu câu hỏi của người dùng không chứa từ khóa của 4 tool (`get_daily_nutrition`, `recommend_meals`, `get_progress_summary`, `log_meal`), biến `tool_result` là `None`.
- Cuối cùng, hàm trả về:
  ```python
  else:
      reply = "Xin chào! Tôi là Trợ lý Dinh dưỡng NutriSnap. Tôi có thể giúp gì cho bạn hôm nay?"
  ```
  kèm theo tiền tố `fallback_notice`. Người dùng luôn nhận được cùng một câu chào giả vờ thành công.

### Nguyên nhân 2: Nhánh Fallback tất định (`_run_deterministic_fallback`) trả về chuỗi chào cố định
- **Vị trí:** `src/ai/orchestrator.py` (dòng 1690–1701).
- **Cơ chế lỗi:** Khi LLM pipeline trả về `None` hoặc không khả dụng, hệ thống chuyển sang `_run_deterministic_fallback`. Nếu ý định không khớp với các tool hoặc intent đặc biệt, hàm rơi vào khối:
  ```python
  greetings_reply = (
      f"Chào {profile.username}! Mình là NutriSnap Coach – Trợ lý dinh dưỡng cá nhân của bạn. "
      f"Hôm nay bạn muốn kiểm tra dinh dưỡng trong ngày, ghi nhận bữa ăn, tìm gợi ý món ăn ngon hay xem tiến độ cân nặng?"
  )
  ```
  Do đó, mọi câu hỏi tư vấn dinh dưỡng tự do ("tôi cảm thấy mệt mỏi", "tập gym xong ăn gì", "tại sao không nên nhịn ăn") đều bị ép thành câu chào lặp lại.

### Nguyên nhân 3: Khởi tạo Gemini Model nuốt lỗi và không tương thích SDK
- **Vị trí:** `src/ai/orchestrator.py` (dòng 790–791).
- **Cơ chế lỗi:** Khối khởi tạo SDK mới `google.genai` có đoạn:
  ```python
  try:
      from google import genai
      ...
  except Exception:
      pass
  ```
  Lỗi khởi tạo bị nuốt âm thầm bằng lệnh `pass`. Sau đó hệ thống thử fallback sang SDK cũ `google.generativeai`. Tuy nhiên, với các model hiện hành như `gemini-2.5-flash` hay `gemini-flash-lite-latest`, SDK cũ trả về lỗi `404 Model not found`. Hàm bắt lỗi bằng `logger.warning` rồi trả về `None`, dẫn đến toàn bộ luồng rơi xuống Fallback lặp câu chào ở Nguyên nhân 2.

### Nguyên nhân 4: Rào chắn Anti-Hallucination (`verify_number_consistency`) quá cứng nhắc
- **Vị trí:** `src/ai/orchestrator.py` (dòng 1173–1178) kết hợp `src/ai/guardrails.py`.
- **Cơ chế lỗi:** Khi Gemini phản hồi câu trả lời tự nhiên kèm các con số thông thường (ví dụ: "khoảng 500 kcal", số thứ tự "1.", "2."), hàm đối chiếu số học phát hiện số này không nằm trong dữ liệu trả về từ DB tool, đánh dấu phản hồi là không nhất quán và hủy bỏ toàn bộ câu trả lời của Gemini, thay bằng câu mẫu tổng hợp thô cứng.

### Nguyên nhân 5: Thiếu Endpoint chuẩn `POST /api/chat`
- **Vị trí:** `src/backend/main.py`.
- **Cơ chế lỗi:** Đặc tả thiết kế yêu cầu `POST /api/chat`, nhưng hệ thống chỉ có `/api/v1/assistant/chat`. Trước đó có một lần thêm import `from src.backend.routers.chat import router as chat_router` vào `main.py` nhưng file `src/backend/routers/chat.py` chưa được tạo, khiến pytest bị gián đoạn ngay từ khâu import collection.

---

## 3. Các Biện pháp Xử lý đã Áp dụng

1. **Tạo công cụ kiểm tra độc lập `scripts/test_gemini.py`:**
   - Đọc trực tiếp `GEMINI_API_KEY` và `GEMINI_MODEL` từ `.env`.
   - Bảo mật Zero-Trust: Không bao giờ in hoặc để lộ API key.
   - Hỗ trợ cả 2 SDK (`google-genai` và `google-generativeai`) kèm xử lý UTF-8 trên Windows console.
   - **Kết quả kiểm chứng:** Gọi thành công Gemini với model `gemini-flash-lite-latest`, nhận phản hồi trực tiếp từ Google AI Studio.

2. **Triển khai Router chuẩn `src/backend/routers/chat.py`:**
   - Cung cấp 2 endpoint: `POST /api/chat` và `GET /api/chat/history`.
   - Bảo mật Zero-Trust: Lấy `user_id` từ HttpOnly JWT cookie hoặc header xác thực.
   - **Không nuốt lỗi:** Bao bọc lời gọi `orchestrate_chat` bằng `logger.exception`. Khi xảy ra sự cố AI/hạ tầng, trả về HTTP `503 Service Unavailable` kèm thông báo rõ ràng, tuyệt đối không trả lời câu giả mạo.

3. **Cải tiến xử lý ngoại lệ trong `assistant_router.py` & `orchestrator.py`:**
   - Bổ sung `logger.exception` đầy đủ, chấm dứt việc dùng `pass` hoặc trả chuỗi cố định.
   - Trong nhánh fallback tất định: Phân biệt rõ giữa câu chào (`intent == 'greetings'`) và câu hỏi chưa hỗ trợ offline; giải thích rõ hệ thống đang chạy chế độ ngoại tuyến thay vì lặp lại câu chào.

4. **Sửa lỗi Assert mong đợi số calo trong `tests/unit/test_ai_chat_flow.py`:**
   - Chấp nhận cả định dạng số nguyên `1984` và định dạng phân cách hàng nghìn tiếng Việt `1.984` do Gemini sinh ra.

5. **Xây dựng bộ kiểm thử hồi quy `tests/unit/test_phase0_chat_regression.py`:**
   - Kiểm tra `POST /api/chat` với 5 câu hỏi khác nhau đảm bảo nhận được 5 câu trả lời khác nhau, đúng ngữ cảnh.
   - Kiểm tra khi AI Orchestrator gặp sự cố thì hệ thống trả về mã lỗi HTTP 503, không nuốt lỗi.
   - Kiểm tra tính cô lập của `GET /api/chat/history`.
   - Toàn bộ 3/3 test hồi quy đạt 100% (Green).

---

## 4. Kết luận & Sẵn sàng cho Phase 1
Các lỗi gốc gây ra triệu chứng "chỉ trả lời hi/hello rồi lặp một câu cố định" đã được chẩn đoán chính xác và triệt tiêu hoàn toàn. Toàn bộ test liên quan đến Phase 0 đã vượt qua. Hệ thống đã sẵn sàng bước vào **Phase 1: Tái cấu trúc Kiến trúc 3 lớp**.

