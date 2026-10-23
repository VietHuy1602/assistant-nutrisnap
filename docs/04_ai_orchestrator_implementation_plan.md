# KẾ HOẠCH TRIỂN KHAI KỸ THUẬT TUẦN 4 (W4): MODULE AI ORCHESTRATOR

**Dự án:** NutriSnap - Trợ lý ghi nhận dinh dưỡng đa phương thức không ma sát  
**Repository:** `https://github.com/VietHuy1602/assistant-nutrisnap.git`  
**Phân hệ phụ trách:** Cặp 3 – AI Intelligence & QA/Benchmarking  
**Hạng mục triển khai:** Dòng 49 – Lập trình `src/ai/orchestrator.py` (Module AI Orchestrator)

---

## 1. QUY TẮC BẮT BUỘC DÀNH CHO AI IDE (ANTIGRAVITY IDE)

Trước khi thực hiện bất kỳ thao tác nào, Antigravity IDE **PHẢI TUÂN THỦ TUYỆT ĐỐI** 5 quy tắc cốt lõi sau:

1. **TUYỆT ĐỐI KHÔNG XÓA BẤT KỲ FILE NÀO:**
   * Nghiêm cấm sử dụng lệnh `rm`, `git rm` hoặc xóa bất kỳ file mã nguồn, tài liệu (`docs/`), dữ liệu (`data/`), cấu hình hay bài kiểm thử (`tests/`) nào đang tồn tại trong dự án.
   * Chỉ được phép **tạo mới** các file cần thiết cho nhiệm vụ Tuần 4 hoặc **cập nhật/bổ sung** vào các file liên quan.

2. **ĐẶT TÊN FILE VÀ NHÁNH THEO NỘI DUNG CHỨC NĂNG (KHÔNG ĐẶT THEO TÊN CÁ NHÂN):**
   * Mọi file tài liệu kế hoạch, mã nguồn, hoặc file kiểm thử tạo mới phải được đặt tên bằng tiếng Anh mô tả đúng bản chất kỹ thuật của tính năng. **Tuyệt đối không dùng tên riêng của thành viên** (như `phu_hieu`, `lhph`, v.v.) trong tên file hoặc tên nhánh.
   * **Tên file tài liệu hướng dẫn (nếu lưu trong `docs/`):** `docs/04_ai_orchestrator_implementation_plan.md`
   * **Tên file mã nguồn chính:** `src/ai/orchestrator.py`
   * **Tên file kiểm thử đơn vị cho module:** `tests/unit/test_ai_orchestrator.py`
   * **Tên nhánh Git làm việc:** `feat/w4-ai-orchestrator`

3. **KÉO CODE MỚI NHẤT TỪ GITHUB VỀ TRƯỚC KHI LÀM VIỆC:**
   * Thực thi đúng yêu cầu của nhóm trưởng để đồng bộ toàn bộ phần `services/assistant_tools.py` và CSDL mà Cặp 1 đã hoàn thành (đã tích xanh trên bảng tiến độ):
     ```bash
     git checkout main
     git pull origin main
     git checkout -b feat/w4-ai-orchestrator
     ```

4. **KIỂM THỬ & ĐẢM BẢO CHẤT LƯỢNG (QA & LINTER):**
   * Chạy toàn bộ test suite hiện có và mới viết: `pytest tests/ -v` (Đảm bảo Pass 100%, không gây lỗi hồi quy).
   * Kiểm tra chuẩn PEP 8: `ruff check .` (Đảm bảo 0 lỗi, 0 cảnh báo).

5. **CẬP NHẬT NHẬT KÝ AI & TẠO PULL REQUEST:**
   * Ghi nhận quá trình hỗ trợ của AI cho nhiệm vụ Tuần 4 vào bảng trong `docs/ai_use_log.md`.
   * Đẩy nhánh `feat/w4-ai-orchestrator` lên GitHub và **Tạo Pull Request (PR)** hướng vào nhánh `main` (tuyệt đối không gộp trực tiếp vào `main`).

---

## 2. PHẠM VI NHIỆM VỤ TUẦN 4 (CHỈ LÀM DÒNG 49)

Tuần 4 là **tuần chẵn**, do đó chỉ thực hiện duy nhất phần nhiệm vụ riêng tại **Dòng 49** (không làm phần Pair Session chung ở Dòng 48 và phần kiểm thử của Quốc Tuấn ở Dòng 50):

* **Nội dung Dòng 49:** *"Lập trình `src/ai/orchestrator.py`: nạp ngữ cảnh hồ sơ người dùng, điều phối LLM gọi 4 Tools, lấy số liệu thật từ DB và hỏi lại khi chưa rõ"*
* **Đầu ra bàn giao:** **Module AI Orchestrator** (`src/ai/orchestrator.py`) hoạt động ổn định, kết nối chuẩn xác với `src/ai/tool_definitions.py` và `src/backend/services/assistant_tools.py`.

---

## 3. YÊU CẦU KỸ THUẬT CHI TIẾT CHO `src/ai/orchestrator.py`

Trước khi viết code, hãy đọc kỹ các file hiện có trong repo (sau khi đã `git pull origin main`):
* `src/ai/tool_definitions.py` (Định nghĩa schema của 4 công cụ AI từ Tuần 1)
* `src/backend/services/assistant_tools.py` (4 hàm thực thi của Việt Huy ở Dòng 41: `exec_get_daily_nutrition`, `exec_log_meal`, `exec_recommend_meals`, `exec_get_progress_summary`)
* `docs/01_architecture_and_boundaries.md` & `docs/02_api_contract_and_screen_flows.md`

### 3.1. Nạp Ngữ cảnh Hồ sơ Người dùng (User Profile Context Injection)
* Khi nhận yêu cầu từ người dùng (kèm `user_id` hợp lệ từ phiên đăng nhập/DB session), `orchestrator.py` phải truy vấn thông tin hồ sơ & mục tiêu hiện tại của người dùng đó (chiều cao, cân nặng, mục tiêu tăng/giảm cân, hạn mức TDEE, Protein, Carbs, Fat mỗi ngày).
* Đưa thông tin hồ sơ này vào **System Prompt** với vai trò là **"Constructive Nutrition Coach"** (Huấn luyện viên dinh dưỡng mang tính xây dựng, thân thiện, không phán xét).
* **Quy tắc bảo mật dữ liệu (Data Isolation):** Khoá cứng `user_id` lấy từ tham số xác thực truyền vào Orchestrator khi gọi các hàm Backend, tuyệt đối không cho phép LLM tự ý truyền hoặc thay đổi `user_id` của người dùng khác.

### 3.2. Điều phối LLM Gọi 4 Công cụ Backend (Tool Calling Dispatch)
Kết nối LLM (Gemini API kèm cơ chế xử lý an toàn/fallback khi thiếu API key hoặc lỗi kết nối) với 4 công cụ trong `services/assistant_tools.py`:
1. **`get_daily_nutrition` $\rightarrow$ `exec_get_daily_nutrition`:** Lấy tổng lượng calo và macro đã nạp trong ngày so với hạn mức TDEE.
2. **`log_meal` $\rightarrow$ `exec_log_meal`:** Ghi nhận món ăn và khối lượng vào nhật ký bữa ăn (hỗ trợ cơ chế trả về thông tin hoặc `action_card` / `pending_confirmation` theo chuẩn của dự án).
3. **`recommend_meals` $\rightarrow$ `exec_recommend_meals`:** Gợi ý món ăn từ CSDL `food_references` phù hợp với lượng calo/macro còn lại và ngân sách.
4. **`get_progress_summary` $\rightarrow$ `exec_get_progress_summary`:** Tổng hợp tiến độ dinh dưỡng và cân nặng qua các ngày.

### 3.3. Lấy Số liệu Thật từ DB (Zero Hallucination)
* Mọi con số về Calo, Protein, Carbs, Fat, Giá tiền trả về cho người dùng **bắt buộc phải lấy từ kết quả trả về của 4 hàm trong `assistant_tools.py` (truy vấn từ SQLite DB)**.
* System Prompt và logic xử lý kết quả sau khi chạy Tool (Tool Output Synthesis) phải ép buộc LLM trích xuất đúng 100% số liệu từ DB, tuyệt đối không tự bịa số liệu dinh dưỡng.

### 3.4. Cơ chế Hỏi lại khi thông tin chưa rõ (Clarification Handling)
* Khi người dùng yêu cầu ghi nhận bữa ăn (`log_meal`) hoặc hỏi gợi ý nhưng thông tin quá mơ hồ (ví dụ: *"Tôi vừa ăn tối xong"*, *"Ghi giúp tôi món phở"* mà chưa rõ món gì hoặc khẩu phần/số lượng ra sao, hoặc nhập thông tin bất hợp lý), Orchestrator không được tự ý gọi `exec_log_meal` với dữ liệu bịa đặt.
* Thay vào đó, điều phối phản hồi lịch sự hỏi lại người dùng để làm rõ tên món ăn hoặc ước lượng khẩu phần (ví dụ: *"Bạn vừa ăn phở bò hay phở gà, khoảng 1 tô vừa (~400g) hay tô lớn nhỉ?"*).

---

## 4. CÂU LỆNH MẪU (PROMPT) ĐỂ DÁN VÀO ANTIGRAVITY IDE

> **Bước 1:** Lưu nội dung file hướng dẫn này vào đường dẫn **`docs/04_ai_orchestrator_implementation_plan.md`** (đặt tên theo đúng nội dung kỹ thuật, không dùng tên riêng).  
> **Bước 2:** Copy đoạn lệnh dưới đây gửi vào khung Chat của Antigravity IDE:
>
> *"Hãy đọc kỹ file `docs/04_ai_orchestrator_implementation_plan.md` và thực hiện nhiệm vụ Tuần 4 (Dòng 49). Hãy tuân thủ tuyệt đối các quy tắc sau:*
> 1. *TUYỆT ĐỐI KHÔNG XÓA bất kỳ file nào đang có trong dự án.*
> 2. *Đặt tên tất cả các file và nhánh dựa trên nội dung chức năng kỹ thuật, tuyệt đối không đặt theo tên cá nhân của tôi.*
> 3. *Chuyển về nhánh `main`, chạy `git pull origin main` để kéo toàn bộ code mới nhất từ GitHub (đặc biệt là `services/assistant_tools.py` của Cặp 1), sau đó tạo nhánh mới tên là `feat/w4-ai-orchestrator`.*
> 4. *Đọc kỹ `src/ai/tool_definitions.py`, `src/backend/services/assistant_tools.py` và các tài liệu kiến trúc trong `docs/` để lập trình hoàn chỉnh file `src/ai/orchestrator.py`: nạp ngữ cảnh hồ sơ người dùng, điều phối LLM gọi 4 Tools (`exec_get_daily_nutrition`, `exec_log_meal`, `exec_recommend_meals`, `exec_get_progress_summary`), lấy 100% số liệu thật từ DB và có cơ chế hỏi lại khi thông tin món ăn/khẩu phần chưa rõ.*
> 5. *Viết unit test cho module tại `tests/unit/test_ai_orchestrator.py`, chạy `pytest tests/ -v` và `ruff check .` đảm bảo pass 100% với 0 lỗi.*
> 6. *Cập nhật `docs/ai_use_log.md`, commit các thay đổi lên nhánh `feat/w4-ai-orchestrator`, push lên GitHub và tạo Pull Request hướng vào nhánh `main`."*
