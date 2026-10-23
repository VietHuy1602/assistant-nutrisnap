# KẾ HOẠCH TRIỂN KHAI KỸ THUẬT TUẦN 5 (W5): VOICE MODIFIER & CÁ NHÂN HÓA SÂU AI ASSISTANT

**Dự án:** NutriSnap - Trợ lý ghi nhận dinh dưỡng đa phương thức không ma sát  
**Repository:** `https://github.com/VietHuy1602/assistant-nutrisnap.git`  
**Phân hệ phụ trách:** Cặp 3 – AI Intelligence & QA/Benchmarking  
**Hạng mục triển khai:** 
1. Lập trình `voice_modifier.py` (xử lý ghi chú dầu/sốt/ăn thừa) và tích hợp dữ liệu mẫu hành vi (`analyze_user_patterns`) vào lời khuyên của AI Assistant.
2. Nâng cấp ngữ cảnh cá nhân hóa sâu cho Virtual AI Assistant và viết bộ kiểm thử gợi ý thực đơn theo ngân sách.

---

## 1. QUY TẮC BẮT BUỘC DÀNH CHO AI IDE (ANTIGRAVITY IDE)

Trước khi thực hiện bất kỳ thao tác nào, Antigravity IDE **PHẢI TUÂN THỦ TUYỆT ĐỐI** 5 quy tắc cốt lõi sau:

1. **TUYỆT ĐỐI KHÔNG XÓA BẤT KỲ FILE NÀO:**
   * Nghiêm cấm sử dụng lệnh `rm`, `git rm` hoặc xóa bất kỳ file mã nguồn, tài liệu (`docs/`), dữ liệu (`data/`), cấu hình hay bài kiểm thử (`tests/`) nào đang tồn tại trong dự án.
   * Chỉ được phép **tạo mới** các file cần thiết cho nhiệm vụ Tuần 5 hoặc **cập nhật/mở rộng** các file liên quan.

2. **ĐẶT TÊN FILE, NHÁNH VÀ PULL REQUEST THEO NỘI DUNG CHỨC NĂNG (KHÔNG ĐẶT THEO TÊN CÁ NHÂN HAY SỐ DÒNG):**
   * Tuyệt đối **không dùng tên riêng của thành viên** (như `phu_hieu`, `lhph`, `tuan`) và **không ghi chữ `(Dòng 58)`, `(Dòng 59)`** vào tên file, tên nhánh, commit message hay tiêu đề Pull Request.
   * **Tên file tài liệu hướng dẫn (trong `docs/`):** `docs/05_ai_personalization_and_voice_modifier_plan.md`
   * **Tên file mã nguồn Voice Modifier:** `src/ai/voice_modifier.py` (và tạo wrapper/re-export tương thích tại `src/backend/services/voice_modifier.py` nếu hệ thống yêu cầu import từ `services`)
   * **Tên file mã nguồn nâng cấp cá nhân hóa:** Cập nhật trực tiếp vào `src/ai/orchestrator.py`
   * **Tên file kiểm thử:** `tests/unit/test_voice_modifier_and_personalization.py`
   * **Tên nhánh Git làm việc:** `feat/w5-ai-personalization-voice-modifier`
   * **Tiêu đề Pull Request chuẩn:** `[W5] feat(ai): lập trình module voice_modifier và nâng cấp ngữ cảnh cá nhân hóa AI Assistant`

3. **KÉO CODE MỚI NHẤT TỪ GITHUB VỀ TRƯỚC KHI LÀM VIỆC:**
   * Thực thi đúng quy trình đồng bộ code mới nhất từ nhánh `main` (để lấy hàm `analyze_user_patterns()` mà Cặp 1 vừa hoàn thành ở Tuần 5):
     ```bash
     git checkout main
     git pull origin main
     git checkout -b feat/w5-ai-personalization-voice-modifier
     ```
   * *Lưu ý:* Nếu Pull Request Tuần 4 (`feat/w4-ai-orchestrator`) chưa được merge vào `main`, hãy chạy `git merge feat/w4-ai-orchestrator` vào nhánh mới này để kế thừa đầy đủ `src/ai/orchestrator.py`.

4. **KIỂM THỬ & ĐẢM BẢO CHẤT LƯỢNG (QA & LINTER):**
   * Chạy toàn bộ test suite hiện có và mới viết: `pytest tests/ -v` (Đảm bảo Pass 100%, không gây lỗi hồi quy).
   * Kiểm tra chuẩn PEP 8: `ruff check .` (Đảm bảo 0 lỗi, 0 cảnh báo).

5. **CẬP NHẬT NHẬT KÝ AI & TẠO PULL REQUEST:**
   * Ghi nhận quá trình sử dụng AI của Tuần 5 vào bảng trong `docs/ai_use_log.md`.
   * Đẩy nhánh `feat/w5-ai-personalization-voice-modifier` lên GitHub và **Tạo Pull Request (PR)** hướng vào nhánh `main`.

---

## 2. YÊU CẦU KỸ THUẬT CHI TIẾT TUẦN 5

Trước khi viết code, hãy đọc kỹ các file hiện có trong repo (sau khi đã `git pull origin main`):
* Các file dịch vụ của Cặp 1 trong `src/backend/services/` (đặc biệt là hàm `analyze_user_patterns()` phân tích nhật ký 7-14 ngày để tìm thói quen bỏ bữa sáng, thiếu đạm, ăn khuya và `assistant_tools.py`).
* `src/ai/orchestrator.py` & `src/ai/vision_recognition.py`.

### 2.1. Lập trình Module `voice_modifier.py` (Xử lý ghi chú dầu/sốt/ăn thừa)
Xây dựng module phân tích văn bản/giọng nói bổ sung của người dùng khi chụp ảnh đĩa ăn (Voice/Text Modifiers) để giải quyết góc khuất thị giác máy tính:

1. **Đầu vào (Input):**
   * Danh sách các món ăn đã nhận diện từ Vision (`list[dict]` hoặc Pydantic schema chứa `dish_name`, `estimated_weight_gram`, v.v.).
   * Câu ghi chú văn bản từ giọng nói của người dùng (`transcript: str`), ví dụ:
     * *"Ức gà áp chảo bằng 1 muỗng dầu ô-liu, chỉ ăn nửa phần cơm"*
     * *"Phở bò không húp nước béo, bỏ lại 1/3 bánh phở, thêm 2 thìa sốt mè rang"*
     * *"Ăn hết đĩa nhưng có chan thêm 1 muỗng canh mỡ hành"*

2. **Xử lý thông minh (LLM Parser kết hợp Deterministic Rule/Regex Fallback):**
   * Bóc tách chính xác 3 nhóm hành động điều chỉnh khẩu phần:
     * **Tỷ lệ ăn thực tế / Ăn thừa (`consumed_ratio` / `leftover_adjustment`):** Nhận diện các cụm từ như *"ăn một nửa"* ($0.5$), *"bớt nửa chén"*, *"ăn 2/3"* ($0.67$), *"bỏ lại 1/4"* ($\rightarrow$ giữ lại $0.75$), *"ăn 150g"* để điều chỉnh lại `estimated_weight_gram` của đúng món ăn được nhắc tới hoặc toàn bộ bữa ăn.
     * **Gia vị ẩn / Dầu / Nước sốt thêm vào (`added_modifiers`):** Nhận diện các thành phần khó thấy qua ảnh như *"thêm 1 thìa/muỗng dầu ô-liu"* ($\approx 14\text{g}$), *"chan nước sốt mè rang"* ($\approx 15\text{g}-30\text{g}$), *"áp chảo bơ"*, *"thêm mỡ hành"*, *"thêm đường/sữa đặc"* và thêm chúng thành các item nguyên liệu mới (hoặc cộng thêm định lượng calo/chất béo tương ứng từ `food_references`).
     * **Loại bỏ thành phần (`removed_modifiers`):** Nhận diện *"bỏ da gà"*, *"không ăn hành/mỡ"*, *"không húp nước lèo"* để giảm trừ khối lượng/chất béo hợp lý.

3. **Đầu ra (Output):**
   * Trả về cấu trúc dữ liệu chuẩn xác (Pydantic Model / Dict) gồm danh sách món ăn sau khi đã điều chỉnh khối lượng gam, danh sách gia vị/dầu/sốt ẩn được thêm vào, và tóm tắt các thay đổi (`applied_modifications`) để truyền vào công thức tính calo tất định của Backend.
   * Luôn có cơ chế **Deterministic Rule-based Fallback** (dùng từ điển quy đổi định lượng tiếng Việt như *1 thìa/muỗng canh $\approx 14\text{g}-15\text{g}$, 1 muỗng cà phê $\approx 5\text{g}$, một nửa $= 0.5$, 1/3, 2/3, 3/4*) để hoạt động mượt mà 100% ngay cả khi không có kết nối mạng hoặc thiếu khóa Gemini API.

### 2.2. Nâng cấp Ngữ cảnh Cá nhân hóa Sâu cho Virtual AI Assistant (`src/ai/orchestrator.py`)
Tích hợp dữ liệu phân tích hành vi nhiều ngày (`analyze_user_patterns()`) vào bộ điều phối `src/ai/orchestrator.py`:

1. **Nạp mẫu hành vi ăn uống 7-14 ngày (`Behavioral Pattern Injection`):**
   * Kết nối trực tiếp với hàm `analyze_user_patterns` (do Cặp 1 xây dựng trong tầng Backend services) để lấy các mẫu thói quen ăn uống của người dùng (ví dụ: hay bỏ bữa sáng, thiếu hụt Protein kéo dài, thường xuyên ăn khuya, hoặc vượt calo cuối tuần).
   * Bổ sung dữ liệu hành vi này vào `UserProfileContext` và **System Prompt** của `AIOrchestrator`.

2. **Tạo lời khuyên mang tính xây dựng & Smart Compensation (Bù trừ thông minh):**
   * Khi người dùng trò chuyện hoặc hỏi lời khuyên dinh dưỡng, AI Assistant chủ động lồng ghép nhận xét nhẹ nhàng dựa trên mẫu hành vi thực tế từ DB (ví dụ: *"Mình nhận thấy vài ngày gần đây bạn hơi thiếu đạm và hay bỏ bữa sáng, tối nay bạn có thể ưu tiên món giàu đạm dễ tiêu như ức gà hoặc đậu hũ nhé"*).
   * Hỗ trợ tích hợp `voice_modifier` vào luồng xử lý của Assistant khi người dùng gửi kèm ghi chú cách chế biến/ăn thừa.

### 2.3. Kiểm thử Gợi ý Thực đơn theo Ngân sách & Cá nhân hóa (`tests/unit/test_voice_modifier_and_personalization.py`)
Viết bộ kiểm thử tự động toàn diện bằng `pytest` kiểm tra cả 2 hạng mục của Tuần 5:
1. **Kiểm thử `voice_modifier.py`:**
   * Kiểm tra các ca thêm dầu/sốt ẩn (ví dụ: *"thêm 1 thìa dầu ô-liu"*, *"thêm sốt mayonnaise"*) tăng đúng số gam nguyên liệu.
   * Kiểm tra các ca ăn thừa/giảm khẩu phần (ví dụ: *"chỉ ăn nửa phần"*, *"bỏ lại 1/3 chén cơm"*) nhân đúng hệ số khối lượng ($> 0\text{g}$).
2. **Kiểm thử Cá nhân hóa Hành vi (`analyze_user_patterns` $\rightarrow$ `orchestrator.py`):**
   * Xác minh `orchestrator.py` nạp đúng kết quả từ `analyze_user_patterns()` vào ngữ cảnh System Prompt và phản hồi lời khuyên bám sát thói quen (bỏ bữa sáng, thiếu đạm, ăn khuya).
3. **Kiểm thử Gợi ý Thực đơn theo Ngân sách (`recommend_meals` integration):**
   * Kiểm thử luồng điều phối gọi công cụ `recommend_meals` với các mức ngân sách cụ thể (ví dụ: $50.000\text{đ} - 80.000\text{đ}$) và hạn mức calo/macro còn lại, đảm bảo kết quả trả về luôn khớp tiêu chí calo và nằm trong trần ngân sách của người dùng.

---

## 3. CÂU LỆNH MẪU (PROMPT) ĐỂ DÁN VÀO ANTIGRAVITY IDE

> **Bước 1:** Lưu nội dung file hướng dẫn này vào đường dẫn **`docs/05_ai_personalization_and_voice_modifier_plan.md`**.
>
> **Bước 2:** Copy đoạn lệnh dưới đây gửi vào khung Chat của Antigravity IDE:
>
> *"Hãy đọc kỹ file `docs/05_ai_personalization_and_voice_modifier_plan.md` và thực hiện toàn bộ nhiệm vụ Tuần 5 của Cặp 3. Hãy tuân thủ tuyệt đối các quy tắc sau:*
> 1. *TUYỆT ĐỐI KHÔNG XÓA bất kỳ file nào đang có trong dự án.*
> 2. *Đặt tên tất cả các file, nhánh, commit và tiêu đề Pull Request dựa trên nội dung chức năng kỹ thuật. Tuyệt đối KHÔNG dùng tên cá nhân của tôi và KHÔNG ghi số dòng bảng tính (như Dòng 58, Dòng 59) vào bất kỳ đâu.*
> 3. *Chuyển về nhánh `main`, chạy `git pull origin main` để kéo toàn bộ code mới nhất từ GitHub (đặc biệt là hàm `analyze_user_patterns()` và các service Tuần 5 của Cặp 1), sau đó tạo nhánh mới tên là `feat/w5-ai-personalization-voice-modifier` (nếu nhánh W4 chưa merge vào main thì merge `feat/w4-ai-orchestrator` sang nhánh mới để có đủ code).*
> 4. *Lập trình hoàn chỉnh `src/ai/voice_modifier.py` (kèm re-export tại `src/backend/services/voice_modifier.py` nếu cần) để xử lý ghi chú giọng nói về dầu/nước sốt ẩn và khẩu phần ăn thừa.*
> 5. *Nâng cấp `src/ai/orchestrator.py` để tích hợp dữ liệu mẫu hành vi từ `analyze_user_patterns()` vào ngữ cảnh cá nhân hóa và lời khuyên của Virtual AI Assistant.*
> 6. *Viết bộ kiểm thử tự động tại `tests/unit/test_voice_modifier_and_personalization.py` kiểm tra `voice_modifier`, tích hợp mẫu hành vi và kiểm thử gợi ý thực đơn theo ngân sách (`recommend_meals`). Chạy `pytest tests/ -v` và `ruff check .` đảm bảo pass 100% với 0 lỗi.*
> 7. *Cập nhật `docs/ai_use_log.md`, commit các thay đổi lên nhánh `feat/w5-ai-personalization-voice-modifier`, push lên GitHub và tạo Pull Request hướng vào nhánh `main` với tiêu đề chuẩn: `[W5] feat(ai): lập trình module voice_modifier và nâng cấp ngữ cảnh cá nhân hóa AI Assistant`."*