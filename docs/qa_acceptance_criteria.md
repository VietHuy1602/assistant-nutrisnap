# NutriSnap — Tiêu chí nghiệm thu QA AI (W1)

**Người phụ trách:** Hoàng Quốc Tuấn  
**Nhóm:** Cặp 3 — Điều phối AI và QA/Đánh giá chuẩn  
**Trạng thái:** Các tiêu chí mục tiêu để đánh giá; chưa phải kết quả đo lường thực tế.

## 1. Phạm vi

Tài liệu này xác định các tiêu chí ban đầu để đánh giá việc AI lựa chọn công cụ, tham số của công cụ, kết quả ước lượng từ hình ảnh và tính nhất quán giữa đầu ra của Backend với câu trả lời của trợ lý. Các tiêu chí này chỉ là mục tiêu cho đến khi có phần triển khai tương ứng và bộ dữ liệu đánh giá.

## 2. Tiêu chí nghiệm thu

| Mã | Hạng mục | Mục tiêu / quy tắc | Bằng chứng |
|---|---|---|---|
| QA-01 | Lựa chọn công cụ | Độ chính xác lựa chọn công cụ (Tool Selection Accuracy) >= 90% trên bộ dữ liệu đánh giá đã gán nhãn | So sánh công cụ mong đợi với công cụ được chọn trong từng trường hợp kiểm thử |
| QA-02 | Ước lượng calo từ hình ảnh | MAPE <= 25% đối với món ăn đơn giản trong điều kiện ánh sáng tốt, được đánh giá dựa trên giá trị tham chiếu đã gán nhãn | Lượng calo dự đoán, lượng calo tham chiếu và sai số phần trăm tuyệt đối của từng mẫu |
| QA-03 | Tính nhất quán với Backend | Các số liệu dinh dưỡng mà trợ lý nêu phải khớp với kết quả Backend tương ứng; phép tính phải sử dụng dữ liệu từ Backend/cơ sở dữ liệu, không tự tạo ra số liệu ước tính | So sánh dữ liệu trả về từ Backend với câu trả lời cuối cùng của trợ lý |
| QA-04 | Bảo mật schema công cụ | Không tham số công cụ nào được để lộ `user_id`; Backend lấy danh tính người dùng từ phiên đã xác thực/JWT | Kiểm tra schema và kiểm thử bảo mật |
| QA-05 | Tính đúng đắn của schema | Có đúng bốn công cụ theo yêu cầu; tên không trùng; tham số có kiểu object; từ chối các thuộc tính không được khai báo | Kiểm thử đơn vị tự động |
| QA-06 | Tham số công cụ | Các trường bắt buộc và giá trị enum phải tuân theo schema của từng công cụ | Kiểm thử đơn vị tự động và các trường hợp đã gán nhãn |
| QA-07 | Tính trung thực của bằng chứng | Không báo cáo các chỉ số mục tiêu là đã đạt trước khi đo lường trên bộ dữ liệu được ghi nhận rõ ràng | Báo cáo đánh giá gồm bộ dữ liệu, số lượng mẫu, phương pháp và kết quả |

## 3. Định nghĩa các chỉ số

### Độ chính xác lựa chọn công cụ (Tool Selection Accuracy)

`Tool Selection Accuracy = số trường hợp chọn đúng công cụ / tổng số trường hợp đã gán nhãn × 100%`

Một trường hợp được tính là đúng khi công cụ được chọn trùng với công cụ mong đợi đối với yêu cầu của người dùng. Trước khi tính chỉ số, cần xác định hành vi mong đợi đối với những yêu cầu không cần gọi công cụ nào.

### Sai số phần trăm tuyệt đối trung bình (MAPE)

`MAPE = trung bình(|giá trị dự đoán - giá trị tham chiếu| / giá trị tham chiếu) × 100%`

Loại trừ hoặc xử lý riêng các giá trị tham chiếu bằng 0, vì sai số phần trăm không xác định khi giá trị tham chiếu bằng 0. Cần ghi lại số lượng mẫu hợp lệ và quy tắc loại trừ.

## 4. Các kịch bản kiểm thử ban đầu

| Mã trường hợp | Đầu vào / điều kiện | Hành vi mong đợi |
|---|---|---|
| TOOL-01 | Người dùng hỏi hôm nay đã tiêu thụ bao nhiêu calo | Chọn `get_daily_nutrition` |
| TOOL-02 | Người dùng nói rõ rằng họ đã ăn một bữa và yêu cầu ghi lại | Chọn `log_meal` với loại bữa ăn và thông tin món ăn |
| TOOL-03 | Người dùng yêu cầu gợi ý món ăn theo giới hạn calo | Chọn `recommend_meals` và truyền giới hạn calo |
| TOOL-04 | Người dùng hỏi xu hướng dinh dưỡng trong 7 ngày gần nhất | Chọn `get_progress_summary` với `period="7_days"` |
| SEC-01 | Kiểm tra đệ quy tất cả định nghĩa công cụ | Không có tham số `user_id` |
| SCHEMA-01 | Kiểm tra danh sách công cụ | Có đúng bốn tên công cụ duy nhất |
| CONS-01 | Backend trả về tổng lượng dinh dưỡng | Trợ lý nhắc lại đúng các số liệu, không thay đổi chúng |
| VIS-01 | Hình ảnh món ăn đơn giản trong điều kiện ánh sáng tốt, có nhãn tham chiếu | Lưu lượng calo dự đoán và tham chiếu để tính MAPE |

Đây là các mô tả kịch bản, không phải bằng chứng cho thấy AI hiện đã vượt qua các bài kiểm thử.

## 5. Quy tắc báo cáo

Với mỗi lần đánh giá, cần ghi lại:
- ngày thực hiện và mã commit của code;
- nguồn/bộ dữ liệu và số lượng mẫu;
- đầu ra mong đợi và đầu ra thực tế;
- trạng thái đạt/không đạt hoặc kết quả chỉ số;
- các giới hạn đã biết, trường hợp bị loại trừ và ví dụ lỗi.

Không được kết luận một chỉ số đã đạt chỉ dựa trên các bài kiểm thử đơn vị của schema. Độ chính xác lựa chọn công cụ và MAPE của Vision cần được đánh giá trên một bộ dữ liệu đại diện đã được gán nhãn.

## 6. Điểm cần thống nhất trong schema hiện tại

Schema hiện tại của `get_progress_summary` yêu cầu trường `period`, trong khi phần mô tả lại nói giá trị mặc định là `7_days`. Cặp cần thống nhất một trong hai quy ước:
1. Giữ `period` là trường bắt buộc và xóa nội dung nói rằng trường này có giá trị mặc định; hoặc
2. Cho phép bỏ qua `period` và bảo đảm Backend tự dùng `7_days` khi trường này không được truyền vào.

Không tự ý thay đổi quy ước này nếu chưa có sự thống nhất với người phụ trách schema.
