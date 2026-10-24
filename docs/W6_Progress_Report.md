# Báo cáo tiến độ W6 — Cô lập dữ liệu và Benchmark

**Trạng thái:** Đang thực hiện; chưa đủ bằng chứng để tuyên bố W6 hoàn tất.

## 1. Phạm vi đã xử lý trong bản làm việc

- Rà soát `src/backend/services/tool_security.py`, `src/backend/services/auth_guard.py`, `src/backend/services/assistant_tools.py` và `src/backend/routers/assistant_router.py`.
- Tạo `tests/test_w6_data_isolation.py` để kiểm tra sanitize tham số nhạy cảm đệ quy, dispatcher giữ nguyên `authenticated_user_id` phía backend, và kiểm tra quyền sở hữu session/meal.
- Tạo `scripts/validate_w6_benchmark.py`, chế độ chỉ đọc để kiểm tra manifest, file ảnh, hash trùng và bộ câu hỏi.
- Thêm `data/benchmark/benchmark_100_meals_unique_w6.csv` làm manifest W6 riêng, không ghi đè CSV gốc.
- Tạo `data/benchmark/chat_eval_w6_50.jsonl`: 50 câu hỏi, mã Q001–Q050, trong đó 20 câu dành cho tình huống bảo mật; các câu mới được đánh dấu `not_run`.

## 2. Kết quả xác minh thực tế

Lệnh validator:

```powershell
python scripts/validate_w6_benchmark.py
```

Kết quả từ bản ZIP được kiểm tra:

- Manifest: 100 dòng, 100 `sample_id` duy nhất, 100 tên món duy nhất.
- 100 đường dẫn ảnh được khai báo; chỉ 30 file ảnh hiện diện trong `data/benchmark/images/`.
- 30 ảnh hiện có đều giải mã được và có 30 hash khác nhau; không phát hiện ảnh trùng nội dung trong số 30 ảnh này.
- Còn thiếu 70 file ảnh thực tế để đạt 100 ảnh trong manifest.
- Bộ câu hỏi W6: 50 câu, 50 ID duy nhất; 20 câu thuộc nhóm security/security-positive.

**Lưu ý:** 100 món trong CSV không đồng nghĩa với 100 ảnh benchmark hợp lệ. 70 mẫu mới vẫn cần ảnh thực tế tương ứng và dữ liệu nhãn/ground truth được xác minh. Không được bịa số cân hoặc dự đoán.

## 3. Kiểm thử bảo mật

Đã thêm các test đơn vị dùng session giả lập/mock, không truy cập database thật. Tuy nhiên, chưa chạy được test trong môi trường hiện tại vì pytest dừng khi nạp `tests/conftest.py` với lỗi:

```text
ModuleNotFoundError: No module named 'sqlmodel'
```

Vì vậy, test W6 **chưa được xác nhận pass**. Cần cài dependencies theo `requirements.txt` trong virtual environment dự án rồi chạy lại. Sau đó phải bổ sung/kiểm tra test tích hợp endpoint chat/API trên database test cô lập.

## 4. Điểm cần lưu ý khi rà soát code

- `dispatch_tool_call` gọi `sanitize_llm_tool_arguments` và truyền `authenticated_user_id` được cấp từ backend vào các tool.
- `create_or_get_chat_session`, `save_chat_message` và `get_chat_history` kiểm tra quyền sở hữu session thông qua helper.
- `verify_session_ownership` và `verify_meal_ownership` có logic kiểm tra owner.
- Đây là dấu hiệu tốt trong code đã đọc, nhưng không thay thế kiểm thử tích hợp thực tế trên toàn bộ endpoint/luồng chat.
- `auth_guard.py` có nhánh fallback tạo `User` từ username trong trường hợp `session` không phải một SQLModel Session. Cần xác minh nhánh này chỉ dùng trong test/DI không chuẩn và không thể bị kích hoạt trong request production. Không tự ý thay đổi hành vi này nếu chưa có test xác nhận tác động.

## 5. Các bước còn lại

1. Cài dependencies và chạy `tests/test_w6_data_isolation.py`.
2. Chạy test liên quan đến auth, assistant tools, chat API và toàn bộ suite phù hợp; ghi kết quả thực tế.
3. Thêm test tích hợp với hai tài khoản giả lập A/B cho chat session, meal ID và các tool đọc/ghi dữ liệu.
4. Thu thập thêm 70 ảnh hợp lệ; xác minh nguồn, tính duy nhất và nhãn. Cân trực tiếp nếu benchmark yêu cầu trọng lượng thật.
5. Chạy 50 câu hỏi benchmark trong môi trường test; giữ `not_run` đến khi có kết quả thật. Phân biệt rõ mock với model/API thật.
6. Cập nhật báo cáo sau khi có kết quả mới.

## 6. Bảo toàn dữ liệu

- Không xóa file.
- Không chạy `git clean` hoặc `git reset --hard`.
- Không ghi đè CSV 30/70 món hoặc bộ 50 câu hỏi hiện có; các artefact W6 được tạo bằng tên riêng.
- Chưa commit, push, merge hoặc tạo PR.
