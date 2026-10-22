# NutriSnap — Kế hoạch đánh giá QA AI (W1)

**Người phụ trách:** Hoàng Quốc Tuấn  
**Nhóm:** Cặp 3 — Điều phối AI và QA/Đánh giá chuẩn  
**Trạng thái:** Các mục tiêu dự kiến; kết quả thực nghiệm sẽ được báo cáo sau khi đánh giá ở Tuần 7.

## 1. Mục đích

Tài liệu này xác định kế hoạch đánh giá ban đầu cho bộ điều phối AI của NutriSnap, chức năng gọi công cụ (Tool Calling), nhận diện món ăn, ước lượng khẩu phần/lượng calo và tính nhất quán giữa câu trả lời của AI với các giá trị do Backend cung cấp.

Các giá trị trong tài liệu này là **mục tiêu dự kiến**, không phải kết quả đã đo lường. Không được báo cáo một mục tiêu là kết quả đã đạt được trước khi chạy các bài kiểm thử liên quan và lưu lại bằng chứng.

## 2. Phạm vi

Kế hoạch W1 bao gồm:

- Chọn đúng một trong bốn công cụ đã đăng ký khi kịch bản kiểm thử yêu cầu gọi công cụ.
- Đảm bảo tham số công cụ an toàn, đặc biệt là quy tắc LLM không được tự truyền `user_id`.
- Đánh giá khả năng nhận diện món ăn và sai số ước lượng khẩu phần/lượng calo đối với các trường hợp được hỗ trợ.
- Đảm bảo tính nhất quán giữa giá trị do công cụ Backend trả về và giá trị trợ lý nêu trong câu trả lời.
- Xây dựng cấu trúc kiểm thử tự động cơ bản bằng `pytest`.

## 3. Mục tiêu dự kiến

| Hạng mục | Chỉ số / mục tiêu nghiệm thu | Phương pháp đánh giá |
|---|---|---|
| Tool Calling | Độ chính xác lựa chọn công cụ (Tool Selection Accuracy) **≥ 90%** trên các kịch bản kiểm thử đã xác định | So sánh công cụ trợ lý chọn với công cụ mong đợi trong từng kịch bản |
| Nhận diện món ăn và ước lượng khẩu phần/lượng calo | MAPE **≤ 25%** đối với món ăn đơn giản được chụp trong điều kiện ánh sáng phù hợp | So sánh lượng calo dự đoán với giá trị thực tế/tham chiếu; ghi lại các mẫu bị loại hoặc không hợp lệ |
| Tính nhất quán giữa Backend và trợ lý | Mọi giá trị dinh dưỡng dạng số mà trợ lý nêu phải khớp với giá trị tương ứng do Backend trả về trong cùng câu trả lời | Sử dụng dữ liệu kiểm thử cố định và so sánh giá trị trong câu trả lời với đầu ra của công cụ |
| Bảo mật tham số công cụ | Schema công cụ không được để lộ `user_id` dưới dạng tham số do LLM cung cấp | Kiểm tra schema công cụ đã đăng ký và xác nhận trường này không tồn tại |
| Thực thi kiểm thử | Các bài kiểm thử đơn vị liên quan được chạy bằng `pytest` và lỗi được ghi nhận | Chạy lệnh kiểm thử của dự án và lưu lại kết quả |

Đây là các mục tiêu ban đầu của dự án. Trước khi xem chúng là tiêu chí nghiệm thu cuối cùng, nhóm cần xác nhận bộ kiểm thử, định nghĩa các chỉ số và những ngưỡng chưa được nêu rõ trong đề bài dự án.

## 4. Các chỉ số và định nghĩa

### 4.1. Độ chính xác lựa chọn công cụ (Tool Selection Accuracy)

\[
\text{Tool Selection Accuracy} =
\frac{\text{Số kịch bản chọn đúng công cụ mong đợi}}
{\text{Tổng số kịch bản lựa chọn công cụ hợp lệ}} \times 100\%
\]

Chỉ tính một kịch bản là đúng khi công cụ được chọn trùng với công cụ mong đợi cho kịch bản đó. Cần ghi nhận riêng các đầu ra không hợp lệ, trường hợp không gọi công cụ và trường hợp gọi thêm công cụ ngoài dự kiến; không được âm thầm loại chúng khỏi mẫu số.

### 4.2. Sai số phần trăm tuyệt đối trung bình (MAPE)

\[
\text{MAPE} = \frac{100\%}{n}\sum_{i=1}^{n}
\left|\frac{y_i-\hat{y}_i}{y_i}\right|
\]

Trong đó:

- \(y_i\) là giá trị calo tham chiếu của mẫu thứ \(i\).
- \(\hat{y}_i\) là giá trị calo được dự đoán/ước lượng.
- \(n\) là số mẫu hợp lệ có giá trị tham chiếu khác 0.

MAPE không xác định khi giá trị tham chiếu bằng 0. Các mẫu như vậy phải được xử lý rõ ràng và báo cáo riêng, không được chia cho 0. Mục tiêu ban đầu áp dụng cho món ăn đơn giản trong điều kiện ánh sáng phù hợp; các mẫu khó hơn cần được báo cáo riêng.

### 4.3. Tính nhất quán giữa Backend và trợ lý

Với mỗi trường hợp kiểm thử, so sánh số liệu dinh dưỡng trong câu trả lời của trợ lý với kết quả tương ứng từ công cụ Backend. Trợ lý không được tự tạo, âm thầm thay đổi hoặc đưa ra thông tin mâu thuẫn với lượng calo và các chất dinh dưỡng đa lượng do Backend cung cấp.

Tài liệu dự án phân biệt phép tính xác định với đầu vào hình ảnh không chắc chắn: phép tính dựa trên cơ sở dữ liệu tham chiếu có thể chính xác, trong khi món ăn được nhận diện hoặc khẩu phần ước lượng vẫn có thể chưa chắc chắn. Vì vậy, khi phù hợp, các giá trị dinh dưỡng hiển thị cho người dùng cần được mô tả là giá trị ước tính.

## 5. Các kịch bản kiểm thử ban đầu

| Mã | Kịch bản | Kết quả mong đợi |
|---|---|---|
| TOOL-01 | Người dùng hỏi tổng lượng calo và các chất dinh dưỡng đa lượng đã tiêu thụ hôm nay | Chọn `get_daily_nutrition` |
| TOOL-02 | Người dùng yêu cầu ghi nhận một bữa ăn | Chọn `log_meal`; không được lưu dữ liệu trước khi có xác nhận rõ ràng |
| TOOL-03 | Người dùng yêu cầu gợi ý món ăn dựa trên lượng calo còn lại và ngân sách | Chọn `recommend_meals` |
| TOOL-04 | Người dùng yêu cầu tóm tắt tiến độ trong một khoảng thời gian | Chọn `get_progress_summary` |
| SEC-01 | Kiểm tra các tham số được công khai của từng công cụ đã đăng ký | Không schema công cụ nào để lộ `user_id` như một tham số do LLM cung cấp |
| SEC-02 | Yêu cầu ghi nhận bữa ăn chưa được xác nhận | Trả về bước xác nhận/bản xem trước đang chờ; không lưu bữa ăn vào hệ thống |
| CONS-01 | Backend trả về các giá trị calo và chất dinh dưỡng đa lượng cố định | Câu trả lời của trợ lý phản ánh đúng các giá trị đó, không thay đổi chúng |
| VIS-01 | Hình ảnh món ăn được hỗ trợ có nhãn tham chiếu đã thống nhất | Ghi lại kết quả nhận diện và so sánh với nhãn tham chiếu |
| VIS-02 | Món ăn đơn giản có giá trị calo và khẩu phần tham chiếu hợp lệ | Tính và ghi lại sai số ước lượng calo |

Các kịch bản này là danh sách kiểm tra ban đầu. Những bài kiểm thử tự động thực tế phải được điều chỉnh theo các hàm và kiểu dữ liệu trả về đang được triển khai trong repository.

## 6. Dữ liệu kiểm thử và bằng chứng

Với mỗi lần đánh giá, cần ghi lại:

- Mã bài kiểm thử và mô tả kịch bản.
- Đầu vào/lời nhắc hoặc mã định danh mẫu hình ảnh.
- Công cụ mong đợi hoặc giá trị tham chiếu.
- Đầu ra thực tế.
- Trạng thái đạt/không đạt.
- Chi tiết lỗi và ghi chú về các mẫu không hợp lệ hoặc bị loại trừ.

Sử dụng dữ liệu mẫu cố định cho kiểm thử đơn vị. Không yêu cầu gọi API Gemini trực tiếp trong các bài kiểm thử đơn vị thông thường; nếu có thể, hãy cô lập các lời gọi API bên ngoài bằng mock hoặc fixture. Không commit khóa API, file `.env`, cơ sở dữ liệu cục bộ, môi trường ảo hoặc thông tin bí mật khác.

## 7. Cấu trúc pytest cho W1

Sử dụng cấu trúc kiểm thử hiện có của repository. Hướng dẫn của nhóm xác định các vị trí sau:

- `tests/unit/test_tools.py` — kiểm tra schema công cụ, xác thực tham số và hành vi chọn/điều phối công cụ trong phạm vi có thể kiểm thử cục bộ.
- `tests/unit/test_vision.py` — kiểm tra đầu ra Vision và hành vi của các chỉ số đánh giá khi phần code tương ứng đã tồn tại.
- Có thể bổ sung các bài kiểm thử khác trong `tests/unit/` khi phần triển khai sẵn sàng.

Bài kiểm thử cần xác minh hành vi thực tế, không chỉ kiểm tra sự tồn tại của file. Tránh mặc định cứng tên hàm hoặc cấu trúc dữ liệu trả về trước khi kiểm tra phần triển khai hiện tại. Nếu một module chưa được triển khai, hãy ghi rõ phần phụ thuộc đó và bổ sung bài kiểm thử khi giao diện của module đã được thống nhất.

## 8. Các đầu việc cần hoàn thành trong Tuần 1

- [ ] Thống nhất các kịch bản ban đầu và định nghĩa chỉ số với thành viên phụ trách AI Orchestrator.
- [ ] Commit kế hoạch đánh giá này vào `docs/qa_evaluation_plan.md`.
- [ ] Tạo/mở rộng các bài kiểm thử đơn vị pytest trong các thư mục kiểm thử được quy định của repository.
- [ ] Chạy các bài kiểm thử hiện có trên máy và ghi nhận lỗi hoặc phần phụ thuộc chưa được triển khai.
- [ ] Cập nhật `docs/ai_use_log.md` nếu có sử dụng công cụ AI để hỗ trợ code hoặc tài liệu.
- [ ] Gửi thay đổi qua Pull Request hướng đến nhánh `main` và yêu cầu thành viên cùng cặp review.

## 9. Kết quả thực nghiệm Tuần 7 (sẽ hoàn thành sau)

Không điền các giá trị mục tiêu hoặc số liệu tự tạo vào phần này. Chỉ hoàn thiện sau khi đã chạy benchmark cuối cùng.

| Chỉ số | Mục tiêu W1 | Kết quả đo W7 | Bằng chứng / ghi chú |
|---|---:|---:|---|
| Độ chính xác lựa chọn công cụ (Tool Selection Accuracy) | ≥ 90% | Đang chờ | Cần đính kèm bộ kiểm thử và kết quả chạy |
| MAPE cho món ăn đơn giản trong điều kiện ánh sáng phù hợp | ≤ 25% | Đang chờ | Cần báo cáo số mẫu hợp lệ và phép tính |
| Tính nhất quán giữa Backend và trợ lý | Phải khớp với giá trị Backend | Đang chờ | Cần báo cáo kết quả kiểm thử đơn vị/tích hợp |
| Thực thi kiểm thử | Các bài kiểm thử liên quan được chạy và lỗi được ghi nhận | Đang chờ | Cần đính kèm kết quả pytest/CI |

## 10. An toàn và diễn giải kết quả

Kết quả nhận diện hình ảnh và ước lượng khẩu phần của NutriSnap về bản chất là các giá trị ước tính. Backend cần thực hiện phép tính dinh dưỡng xác định dựa trên cơ sở dữ liệu tham chiếu; trợ lý cần thể hiện sự không chắc chắn của đầu vào hình ảnh và không được trình bày các ước lượng như chẩn đoán y tế. Việc đánh giá không được khuyến khích hạn chế calo cực đoan hoặc nhịn ăn để bù trừ.
