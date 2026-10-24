# NutriSnap: Kế hoạch sửa lỗi và nâng độ chính xác, độ đa dạng của Trợ lý AI

> Dành cho coding agent. Đọc code thật trước khi sửa (các số dòng bên dưới tính trên `main` ngày 24/10/2026, có thể lệch). Mỗi việc có tiêu chí nghiệm thu (AC). Vẫn giữ các ràng buộc của `docs/AI_ASSISTANT_IMPLEMENTATION_SPEC.md`: schema công cụ không có `user_id`, `log_meal` luôn qua xác nhận, số liệu chỉ lấy từ công cụ, giữ 8 bảng CSDL.

---

## A. Lỗi cần sửa ngay (quan sát từ ảnh chụp màn hình khi test)

Ngữ cảnh: người dùng gõ **"hôm nay tôi đã ăn gì"** và nhận về danh sách *gợi ý món*, kèm ngân sách âm.

### A1. Sai ý định: "đã ăn gì" bị coi là xin gợi ý món
- **Nguyên nhân:** `src/ai/intent_classifier.py`, nhóm `recommend_patterns` có mẫu `\b(nen an|an gi)\b`. Câu "toi da an gi" (đã bỏ dấu) khớp `an gi` nên trả `recommend_meals`.
- **Đã kiểm tra:** "hôm nay tôi đã ăn gì", "hom nay toi da an gi", "tôi đã ăn gì hôm qua" đều ra `recommend_meals`. Còn "tổng kết bữa ăn hôm nay", "hôm nay mình ăn bao nhiêu đạm rồi", "hôm qua tôi ăn bao nhiêu" ra `None` (bỏ sót).
- **Cách sửa:**
  1. Trước nhóm gợi ý, thêm nhóm **quá khứ/tra cứu**: `da an`, `vua an`, `hom nay an`, `hom qua an`, `an roi`, `an nhung gi`, `bua nao`, `tong ket`, `liet ke bua an` → tra cứu bữa đã ăn.
  2. Mẫu gợi ý chỉ khớp khi có dấu hiệu **tương lai/nhu cầu**: `nen an gi`, `an gi bay gio`, `an gi toi nay`, `goi y`, `de xuat`.
  3. Dùng cơ chế chấm điểm nhiều mẫu thay vì "mẫu nào khớp trước thì thắng".
- **AC:** thêm bảng test tham số hóa ≥ 40 câu (có dấu, không dấu, viết tắt) cho `intent_classifier`, trong đó có đủ 3 câu ở trên.

### A2. Chưa có công cụ liệt kê "đã ăn gì"
- `get_daily_nutrition` trả tổng calo/macro, chưa trả **danh sách món/bữa**. Với câu "hôm nay tôi đã ăn gì" cần liệt kê từng bữa, từng món, gam, calo ước tính.
- **Cách sửa:** mở rộng kết quả `get_daily_nutrition` thêm trường `meals: [{meal_type, logged_at_vn, items:[{food_name, gram, kcal}]}]`, hoặc thêm công cụ chỉ-đọc `list_meals(date)` (xem mục C2). Cập nhật tool schema, test và `docs/04_ai_orchestrator_implementation_plan.md`.
- **AC:** hỏi "hôm nay tôi đã ăn gì" trả danh sách khớp 100% với bảng `meals`/`meal_items` của đúng tài khoản.

### A3. Ngân sách âm hiển thị "(-132,000 VNĐ)"
- **Nguyên nhân:** `src/backend/services/assistant_tools.py` (khoảng dòng 560-575) lấy `dash["remaining"]["budget_vnd"]` (có thể âm khi chi vượt) rồi truyền thẳng; `src/ai/orchestrator.py` (khoảng dòng 463) in lại giá trị đó.
- **Cách sửa:** chuẩn hóa `budget_for_recommendation = max(remaining_budget, 0)`; nếu `remaining_budget <= 0` dùng ngân sách mặc định theo mục tiêu và nói rõ trong câu trả lời ("Hôm nay bạn đã vượt ngân sách dự kiến, mình gợi ý các món dưới 50.000đ"). Không bao giờ in số tiền âm như "ngân sách".
- **AC:** test với `daily_budget_vnd` nhỏ hơn tổng đã chi: câu trả lời không chứa chuỗi `-` đứng trước số tiền.

### A4. Mọi món đều "250g", calo vô lý
- **Hiện tượng:** "Trứng gà ốp la (1 quả) (250g) ~400 kcal", "Chả giò rán (250g) ~688 kcal".
- **Nguyên nhân:** `meal_portion_gram=250.0` mặc định trong `assistant_tools.py` (khoảng dòng 551, 873) và `suggested_gram` mặc định 250 trong `orchestrator.py` (khoảng dòng 487).
- **Cách sửa:** thêm khẩu phần tham chiếu theo từng món: cột `default_serving_g` (và `serving_label` như "1 quả", "1 tô", "1 ổ") trong `food_references` (thêm cột vào bảng hiện có, **không** thêm bảng), nạp từ `data/vn_foods.csv`. `recommend_meals` dùng khẩu phần này để tính calo và hiển thị. Chỉ rơi về 100g khi thiếu dữ liệu và ghi chú "khẩu phần ước tính".
- **AC:** không còn món nào hiển thị đúng 250g trừ khi khẩu phần chuẩn của nó là 250g; calo hiển thị = `default_serving_g / 100 * calories_per_100g` (test so khớp).

### A5. Ghi chú "Gợi ý bù trừ đạm (Smart Compensation)" chèn vô cớ
- **Vị trí:** `src/ai/orchestrator.py` (khoảng dòng 470). Mẫu này gắn vào câu trả lời gợi ý dù người dùng chỉ hỏi chuyện khác, và dùng từ "bù trừ" trái với nguyên tắc của dự án (không bù trừ calo).
- **Cách sửa:** đổi thành "Gợi ý cân bằng nhẹ nhàng", chỉ hiện khi (a) có ≥ 5 ngày dữ liệu (theo `analytics_service`) và (b) người dùng đang hỏi gợi ý món hoặc tiến độ. Không chèn vào câu chào hay câu tra cứu.
- **AC:** test "hi", "hello", "hôm nay tôi đã ăn gì" không chứa "bù trừ" hay "Smart Compensation".

### A6. Có vẻ Gemini không thực sự trả lời (đang chạy fallback từ khóa) và người dùng không biết
- **Dấu hiệu:** câu trả lời trong ảnh khớp mẫu dựng sẵn của code (danh sách đánh số, cụm "Bạn thích món nào nhất? Sau khi ăn xong hãy nhắn để mình giúp bạn ghi nhận nhé!"), và không có thông báo "chế độ cơ bản".
- **Nguyên nhân khả dĩ (cần kiểm chứng bằng log server):**
  1. `GEMINI_API_KEY` chưa đặt hoặc là giá trị mẫu (`config.get_gemini_api_key` bỏ qua các giá trị mẫu).
  2. Tên model mặc định `gemini-1.5-flash` ở `src/ai/llm_client.py` (dòng 20), `src/ai/config.py` và `.env.example` không khớp với `docs/07_gemini_api_integration_guide.md` (ghi `gemini-2.5-flash`). Các model 1.5 không còn nằm trong danh sách model hiện hành trên trang tài liệu của Google; nếu model không tồn tại, lời gọi lỗi 404 và bị nuốt.
  3. Mọi ngoại lệ ở `orchestrator.py` (khoảng dòng 755-790) và `llm_client.py` chỉ `logger.warning(...)` rồi rơi sang fallback, không báo lên giao diện.
- **Cách sửa:**
  1. Đồng bộ tên model ở mọi nơi; đặt mặc định lấy từ biến `GEMINI_MODEL` và **kiểm tra lúc khởi động** bằng cách liệt kê model hợp lệ (ListModels) rồi cảnh báo rõ nếu tên không tồn tại.
  2. Thêm endpoint chỉ-đọc `GET /api/v1/assistant/health` trả `{mode: "live"|"fallback", model, last_error_code, last_error_at}` (không trả khóa, không trả nội dung nhạy cảm).
  3. Mỗi phản hồi chat trả thêm trường `engine: "llm" | "fallback"`; giao diện hiện huy hiệu nhỏ "AI trực tuyến" hoặc "Chế độ cơ bản" thay cho nhãn "API: online (warn)".
  4. Khi rơi sang fallback vì lỗi, thêm câu thông báo ngắn ở đầu câu trả lời (đang có `fallback_notice` trong `assistant_router.py`, nhưng đường đi qua orchestrator không gắn vào).
- **AC:** tắt key hoặc đặt tên model sai thì giao diện hiện "Chế độ cơ bản" và log nêu lý do; đặt key và model đúng thì `engine="llm"` và `/assistant/health` báo `live`.

### A7. Kết quả đánh giá hiện tại không có giá trị thực nghiệm
- `data/benchmark/chat_eval_results.csv` có 50/50 dòng `mode=mock`, `tool_correct=True`, reply "Phản hồi giả lập từ MockLLMClient". Mock luôn trả đúng công cụ kỳ vọng nên 100% **không phản ánh** chất lượng thật.
- **Cách sửa:** chạy lại ở chế độ `live` có key; thêm một chế độ `keyword` chạy **trực tiếp** `classify_user_intent` để đo độ chính xác thật của fallback (kỳ vọng thấp hơn 100% rõ rệt; ví dụ câu Q002 "hom nay an gi roi, tong may kcal" chứa `an gi` nên khả năng cao bị phân sai); ghi 3 cột kết quả riêng. Chỉ số `live` mới được đưa vào báo cáo Tuần 7 như kết quả của LLM thật.
- **AC:** `chat_eval_results.csv` có cột `mode` ∈ {`live`, `keyword`, `mock`}; báo cáo ghi rõ chế độ nào.

---

## B. Làm AI trả lời đúng hơn

### B1. Để LLM là bộ định tuyến chính
- Thứ tự: LLM chọn công cụ (function calling) → kết quả công cụ → LLM viết câu trả lời. Từ khóa chỉ là phương án cuối khi LLM lỗi.
- Giữ `temperature` thấp (0.2-0.3) cho bước chọn công cụ và viết câu trả lời dựa trên số liệu; cho phép cao hơn chút (0.5-0.7) cho câu chào, câu giải thích chung để tự nhiên và đa dạng.
- Mô tả mỗi công cụ trong `tool_definitions.py` phải ghi rõ **khi nào dùng** và **khi nào không**, kèm 2-3 ví dụ câu tiếng Việt (có dấu/không dấu). Mô tả công cụ ảnh hưởng độ chính xác nhiều hơn bất kỳ chỉnh sửa nào khác.

### B2. Few-shot trong system prompt
- Thêm 10-15 ví dụ ngắn (người dùng nói → công cụ + tham số), gồm cả ca dễ nhầm: "đã ăn gì" (tra cứu) ≠ "nên ăn gì" (gợi ý); "hôm qua" → `date` = hôm qua theo giờ VN; "40k" → 40000; "tuần này" → 7; "tháng này" → 30.
- Không đưa nguyên văn câu của bộ đánh giá vào few-shot (tránh học vẹt làm đo sai).

### B3. Hiểu ngữ cảnh nhiều lượt
- Câu tiếp nối: "còn bữa tối thì sao?", "thêm 1 quả trứng nữa", "đổi sang cơm gà", "món thứ 2 đi" phải được hiểu dựa trên 10 tin nhắn gần nhất và bản xem trước đang chờ xác nhận.
- Khi thiếu thông tin, hỏi lại **một** câu cụ thể và ghi nhớ phần đã có (điền khuyết dần, không hỏi lại từ đầu).

### B4. Chống bịa số (đã có `numbers_consistent`, hãy nối vào luồng thật)
- Sau khi viết xong, trích mọi số trong câu trả lời và đối chiếu với kết quả công cụ; số lạ thì dựng lại câu trả lời từ kết quả công cụ. Ghi log `number_mismatch` để thống kê.

### B5. Độ tin cậy món ăn trong lời khuyên
- Khi tên món người dùng nói không khớp CSDL (fuzzy matching dưới ngưỡng), trợ lý hỏi xác nhận thay vì đoán ("Ý bạn là *bún bò Huế* hay *bún riêu*?").

---

## C. Làm AI trả lời được nhiều loại câu hỏi hơn

Hiện 4 công cụ chỉ phủ: tổng dinh dưỡng ngày, ghi bữa, gợi ý món, tiến độ. Nhiều câu thường gặp chưa có chỗ trả lời. Đề xuất thêm công cụ **chỉ-đọc** (không ghi dữ liệu, nên không cần bước xác nhận), vẫn không có `user_id` trong schema. Đây là phần **mở rộng** ngoài 4 công cụ cốt lõi của kế hoạch: cập nhật `docs/04_ai_orchestrator_implementation_plan.md`, schema, test và báo cáo.

### C1. Bảng bổ sung công cụ chỉ-đọc

| Công cụ mới | Trả lời được câu | Nguồn dữ liệu |
|---|---|---|
| `list_meals(date)` | "hôm nay tôi đã ăn gì", "bữa sáng hôm qua ăn gì" | `meals`, `meal_items` (lọc theo user từ JWT) |
| `get_food_info(food_name, gram?)` | "bún bò Huế bao nhiêu calo", "100g ức gà bao nhiêu đạm", "1 tô phở bao nhiêu kcal" | `food_references` (dùng fuzzy matching sẵn có) |
| `compare_foods(food_a, food_b, gram?)` | "so sánh cơm và bún", "cơm tấm hay bánh mì ít calo hơn" | `food_references` |
| `get_goal_summary()` | "mục tiêu của tôi là gì", "TDEE của tôi bao nhiêu", "mỗi ngày tôi nên ăn bao nhiêu đạm" | `goals` |
| `suggest_swap(food_name)` | "thay trà sữa bằng gì cho đỡ calo" | logic Food Swap sẵn có |

Mỗi công cụ cần: schema (không `user_id`), hàm `exec_*`, test, mô tả "khi nào dùng", và dòng trong bảng ý định.

### C2. Câu hỏi kiến thức dinh dưỡng chung (không cần công cụ)
- Cho phép LLM trả lời **kiến thức chung** ngắn gọn ("chất béo tốt là gì", "uống nước bao nhiêu mỗi ngày", "protein có tác dụng gì") với điều kiện: không đưa số liệu cá nhân hóa, không kết luận y khoa, có nhãn "thông tin tham khảo", và khuyên gặp chuyên gia khi liên quan bệnh lý.
- Tách rõ ba loại trong prompt: (1) câu cần dữ liệu cá nhân → bắt buộc dùng công cụ, (2) kiến thức chung → trả lời trực tiếp có nhãn, (3) ngoài phạm vi/nguy hiểm → từ chối lịch sự và chuyển hướng.

### C3. Đa dạng cách hỏi
- Tiếng Việt có dấu/không dấu, viết tắt ("ko", "k", "40k", "kcal/cal"), lỗi chính tả nhẹ, câu ghép nhiều ý ("còn bao nhiêu calo rồi gợi ý món 50k"), xen tiếng Anh ("log lunch", "how many calories left").
- Chuẩn hóa đầu vào (bỏ dấu, chuẩn số "40k"→40000, thời gian "hôm qua", "tuần trước" theo giờ VN) **trước** khi tới LLM và trước khi vào fallback.
- Cho phép tối đa `LLM_MAX_TOOL_ROUNDS` lời gọi công cụ cho câu nhiều ý.

### C4. Giọng văn
- Mỗi lượt chào chọn ngẫu nhiên từ một số mẫu (hoặc để LLM sinh), không lặp y hệt giữa "hi" và "hello".
- Trả lời ngắn khi câu hỏi ngắn; chỉ đưa danh sách khi cần liệt kê; không chèn gợi ý ngoài ý hỏi.

---

## D. Đánh giá và cải tiến liên tục

1. **Mở rộng bộ câu hỏi** `data/benchmark/chat_eval_50.jsonl` lên ≥ 150 câu, thêm các nhóm: tra cứu món ăn (C1), so sánh, mục tiêu, kiến thức chung, câu nhiều ý, câu tiếp nối nhiều lượt, câu lỗi chính tả, tiếng Anh xen kẽ, ca đối kháng (injection, y tế, nhịn ăn, ngoài phạm vi). Giữ một **tập kiểm tra giữ kín** (không dùng để chỉnh prompt) để đo cuối kỳ.
2. **Ghi nhật ký hội thoại thật** (đã có `chat_messages`): thêm nút 👍/👎 ở giao diện; câu bị 👎 hoặc kích hoạt fallback thì đưa vào danh sách rà soát và bổ sung vào bộ đánh giá.
3. **Chỉ số cần báo cáo** (tách theo chế độ `live`/`keyword`): Tool Selection Accuracy (mục tiêu ≥ 90%), tỷ lệ số liệu khớp, tỷ lệ qua an toàn (100%), độ trễ trung bình và p95, tỷ lệ rơi vào fallback.
4. **Vòng lặp:** chạy → xem câu sai → chỉnh mô tả công cụ / few-shot / quy tắc → chạy lại → ghi phiên bản prompt và kết quả vào `docs/07_evaluation_report.md`. Báo cáo trung thực kể cả khi chưa đạt.

---

## E. Hạn mức miễn phí và độ ổn định

- Dùng model dòng **Flash** cho cả chat và Vision (gói miễn phí của dòng Pro rất hạn chế). Giới hạn thực tế của tài khoản xem tại AI Studio (trang rate limit), vì Google không còn công bố bảng số cố định trong tài liệu.
- Thêm giới hạn tần suất theo người dùng cho endpoint chat (`slowapi`, hiện chưa dùng trong code), retry có backoff khi gặp 429, và bộ nhớ đệm cho câu hỏi lặp lại không phụ thuộc dữ liệu cá nhân.
- Khi chạy benchmark, thêm khoảng nghỉ giữa các lời gọi và chia đợt nhỏ để không chạm hạn mức.
- Cân nhắc phản hồi dạng streaming để giao diện không bị "đơ" trong lúc chờ LLM.

---

## F. Định nghĩa hoàn thành

- [ ] "hôm nay tôi đã ăn gì" trả danh sách bữa ăn thật của đúng tài khoản (A1, A2).
- [ ] Không còn ngân sách âm, không còn khẩu phần 250g cho mọi món, không còn "bù trừ" (A3-A5).
- [ ] Giao diện cho biết đang ở "AI trực tuyến" hay "Chế độ cơ bản"; có endpoint health; tên model đồng bộ và được kiểm tra lúc khởi động (A6).
- [ ] Kết quả đánh giá tách `live` / `keyword` / `mock`, chỉ số `live` được dùng trong báo cáo (A7, D).
- [ ] Có thêm các công cụ chỉ-đọc ở C1 và câu hỏi kiến thức chung ở C2 hoạt động với nhãn tham khảo.
- [ ] Bộ đánh giá ≥ 150 câu; Tool Selection Accuracy `live` ≥ 90% hoặc có báo cáo trung thực lý do chưa đạt.
- [ ] `pytest`, `ruff check`, `npx tsc --noEmit`, `npx vitest run` đều xanh; `docs/ai_use_log.md` cập nhật.

## G. Điều không được làm

- Không đưa `user_id` vào schema/prompt; không để LLM tự đặt `is_confirmed`.
- Không cho LLM tự tính hoặc nhớ số dinh dưỡng; không in số âm như ngân sách.
- Không báo kết quả `mock` hay `keyword` như kết quả của LLM thật.
- Không commit khóa API hoặc file `.env`, `.db`.
- Không thêm bảng CSDL (chỉ thêm cột vào bảng có sẵn nếu cần).
- Không khuyên nhịn ăn, bù trừ calo, dưới 1.200 kcal, chẩn đoán hay kê đơn.
