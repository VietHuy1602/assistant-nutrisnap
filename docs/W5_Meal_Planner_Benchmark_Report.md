# BÁO CÁO W5 — MEAL PLANNER & BENCHMARK ẢNH MÓN ĂN

**Dự án:** NutriSnap  
**Phạm vi:** Kiểm thử `recommend_meals`, chuẩn bị dữ liệu benchmark món ăn và xác định các việc còn lại.

## 1. Tóm tắt tình trạng

W5 đã có bộ kiểm thử chức năng riêng cho `recommend_meals` và danh sách CSV được mở rộng lên 70 món ăn không trùng tên. Tuy nhiên, chưa thể kết luận benchmark 70 ảnh đã hoàn thành vì hiện mới xác nhận có 30 file ảnh trong thư mục dữ liệu; 40 ảnh tương ứng với các món mới chưa được bổ sung hoặc xác minh.

| Hạng mục | Kết quả hiện có | Trạng thái |
|---|---|---|
| Test `tests/test_recommend_meals_w5.py` | 19 passed, 0 failed, 1.46 giây theo log người dùng cung cấp | Đạt trong lần chạy đã báo cáo |
| Danh sách món trong CSV mới | 70 dòng dữ liệu, 70 tên món duy nhất | Đạt về số dòng và tính duy nhất của tên |
| Ảnh món ăn trong thư mục `data` | 30 file ảnh theo kết quả Terminal người dùng cung cấp | Chưa đạt mục tiêu 70 ảnh |
| 40 ảnh cho các món mới | Chưa được bổ sung/xác minh | Còn thiếu |
| Benchmark vision và số đo đánh giá | Chưa có kết quả chạy thực tế được cung cấp | Chưa xác minh |
| CSV benchmark gốc | Có dấu hiệu lệch cột ở ít nhất một dòng | Cần kiểm tra trước khi tính metric |

## 2. Kiểm thử chức năng `recommend_meals`

Người dùng đã chạy lệnh:

```powershell
python -m pytest tests/test_recommend_meals_w5.py -v
```

Kết quả được báo cáo:

```text
19 passed in 1.46s
```

Các kiểm thử bao gồm:
- Ngân sách 50.000, 60.000 và 80.000 VND.
- Giới hạn calo và kết hợp giới hạn calo với ngân sách.
- Trường hợp không tìm được món phù hợp.
- Xử lý ngân sách bằng 0 hoặc số âm.
- Giới hạn số lượng món trả về.
- Không trùng `food_id` trong kết quả.
- Tính nhất quán giữa các lần gọi với cùng đầu vào.
- Kiểm tra trường dữ liệu và metadata của phản hồi.
- Ghi chú an toàn khi giới hạn calo đầu vào rất thấp.

Kết quả này chỉ xác nhận bộ 19 test trên đã đạt ở lần chạy đó. Nó không tự chứng minh toàn bộ test suite của dự án hoặc benchmark ảnh đã đạt.

## 3. Danh sách 70 món ăn không trùng tên

File mới được tạo: `benchmark_70_meals_unique.csv`.

- Gồm 70 dòng dữ liệu, mã mẫu từ `IMG001` đến `IMG070`.
- Tên file ảnh dự kiến tương ứng từ `IMG001.png` đến `IMG070.png`.
- Đã kiểm tra số lượng tên món duy nhất trong CSV: 70.
- Cấu trúc cột đã được chuẩn hóa để tránh trường dữ liệu dư/lệch như dấu hiệu phát hiện trong CSV gốc.
- 40 món bổ sung có trạng thái `pending_capture`, vì ảnh thực tế và số cân chưa được thu thập/xác minh.

Ví dụ các món mới gồm: bánh cuốn nhân thịt, bánh ướt chả lụa, bánh canh cua, miến lươn Nghệ An, mì Quảng tôm thịt, cao lầu Hội An, bún đậu mắm tôm, bò lúc lắc khoai tây, bò né trứng ốp la, gà kho gừng, sườn nướng mật ong, tôm rang muối, cá diêu hồng hấp gừng, canh bí đỏ nấu tôm và gỏi ngó sen tôm thịt.

**Lưu ý:** Tính duy nhất ở đây dựa trên tên món đã chuẩn hóa; điều đó không thay thế việc kiểm tra ảnh thực tế để bảo đảm từng ảnh thể hiện đúng món và không phải ảnh trùng.

## 4. Dữ liệu ảnh và tính hợp lệ của benchmark

Kết quả Terminal do người dùng cung cấp cho lệnh đếm ảnh trong `data` là `Count: 30`.

Do đó:
- Số lượng ảnh hiện được xác nhận: 30 file.
- Mục tiêu: 70 ảnh.
- Số lượng còn thiếu về mặt số học: 40 ảnh, với điều kiện 30 file hiện có đều hợp lệ, khác nhau và được benchmark sử dụng.

Không được coi các tên file `IMG031.png` đến `IMG070.png` trong CSV là bằng chứng rằng ảnh đã tồn tại. Cũng không được điền số cân, kết quả dự đoán, sai số hoặc confidence giả để làm dữ liệu trông hoàn chỉnh.

Để benchmark có giá trị, cần xác minh:
1. Ảnh tồn tại và mở/giải mã được.
2. Ảnh khác nhau, không phải bản sao.
3. Ảnh tương ứng đúng với tên món trong CSV.
4. Nguồn ảnh và quyền sử dụng được ghi nhận.
5. `measured_weight_g` được đo thực tế theo quy trình của dự án.
6. `ai_estimated_weight_g` và các metric chỉ được điền sau khi chạy model thực tế.
7. Script benchmark đọc đúng các dòng và ảnh dự kiến.

## 5. Điểm chưa thống nhất trong script sinh test

`scripts/gen_w5_test.py` ghi trực tiếp vào `tests/test_recommend_meals_w5.py`; chạy lại có thể ghi đè file test hiện tại.

Ngoài ra, TC08b trong generator yêu cầu danh sách đề xuất rỗng khi `remaining_calories=5`, trong khi file test hiện tại kiểm tra cơ chế điều chỉnh giới hạn lên 300 calo và cung cấp ghi chú. Hai kỳ vọng này khác nhau.

Không nên chạy lại generator trước khi kiểm tra implementation `exec_recommend_meals` và chốt hợp đồng hành vi. Không sửa logic chỉ nhằm làm cho test qua.

## 6. File đã tạo và trạng thái Git được báo cáo

Theo kết quả `git status --short` người dùng đã gửi trước đó:

```text
 M docs/ai_use_log.md
?? README_W5_Ke_hoach_Meal_Planner_Benchmark.md
?? scripts/gen_w5_test.py
?? tests/test_recommend_meals_w5.py
```

`M` là file đã được chỉnh sửa; `??` là file chưa được Git theo dõi. Sau đó, một CSV riêng mới `benchmark_70_meals_unique.csv` được tạo để tránh ghi đè CSV gốc.

Trạng thái Git sau khi tạo CSV mới chưa được kiểm tra lại, nên báo cáo này không khẳng định đó là trạng thái hiện tại.

## 7. Kế hoạch hoàn tất W5

1. Giữ nguyên các file gốc và kiểm tra cấu trúc/ý nghĩa của CSV benchmark.
2. Xác minh 30 ảnh hiện có, đối chiếu tên món, ảnh và trạng thái thu thập.
3. Bổ sung 40 ảnh thực tế hợp lệ, không trùng, có nguồn/quyền sử dụng phù hợp.
4. Cân trực tiếp từng khẩu phần theo quy trình thống nhất và cập nhật `measured_weight_g`.
5. Chạy benchmark bằng model thật; chỉ ghi kết quả dự đoán và metric khi có kết quả thực tế.
6. Kiểm tra lại TC08b và chạy bộ test W5 sau khi thống nhất kỳ vọng.
7. Chạy lại các test liên quan của dự án, ghi lại lệnh và kết quả chính xác.
8. Cập nhật báo cáo với số lượng ảnh hợp lệ cuối cùng và các metric đã xác minh.

## 8. Quy tắc bảo toàn dữ liệu

- Không xóa bất kỳ file hiện có nào.
- Không chạy `git clean`, `git reset --hard` hoặc lệnh xóa hàng loạt.
- Không chạy generator nếu chưa kiểm tra vì có thể ghi đè file test.
- Không ghi đè CSV gốc; dùng file mới để kiểm tra và đối chiếu.
- Không commit, push, merge hoặc tạo PR nếu chưa được yêu cầu.
- Ghi rõ mục nào đã xác minh, mục nào chưa; không tuyên bố benchmark hoàn tất khi chưa có đủ ảnh và kết quả thực tế.

## 9. Kết luận

**W5 hiện đạt phần kiểm thử chức năng đã báo cáo và đã có danh sách 70 món ăn với tên không trùng nhau. W5 chưa hoàn tất phần benchmark 70 ảnh:** hiện mới có 30 file ảnh được người dùng đếm trong thư mục dữ liệu, còn thiếu 40 ảnh hợp lệ cần thu thập và xác minh. Chưa có cơ sở để báo cáo metric benchmark vision như MAE/MAPE.
