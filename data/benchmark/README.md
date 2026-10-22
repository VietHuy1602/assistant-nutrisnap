# NutriSnap — Bộ dữ liệu Benchmark 30 Món ăn Việt Nam (Week 2)

> **Người phụ trách:** Pair 3 — AI Orchestrator & QA/Benchmarking (Quốc Tuấn - QA Lead, phối hợp Phú Hiếu).  
> **Phiên bản:** 1.0.0 (Tuần 2).  
> **Trạng thái thu thập ảnh thực tế:** `0/30` mẫu hoàn tất (`30/30` mẫu ở trạng thái `pending`).  

---

## 1. Mục tiêu & Nguồn ảnh

Bộ dữ liệu Benchmark 30 món ăn Việt Nam được thiết kế nhằm mục đích:
1. Đánh giá thực nghiệm độ chính xác của mô hình thị giác máy tính (**AI Vision**) trong việc nhận diện món ăn và ước lượng khối lượng (gram).
2. Đo lường các chỉ số **MAE** (Mean Absolute Error - sai số tuyệt đối trung bình theo gram) và **MAPE** (Mean Absolute Percentage Error - sai số phần trăm tuyệt đối trung bình) đối chiếu với Ground Truth theo chuẩn mục 4.6 của Cẩm nang dự án.
3. Cung cấp tập dữ liệu đánh giá độc lập (Evaluation Dataset) bao phủ đa dạng các nhóm món ăn Việt Nam phổ biến:
   - Cơm / Tinh bột (Cơm trắng, Cơm tấm sườn, Cơm gà, Xôi...).
   - Bún / Phở / Hủ tiếu (Phở bò tái, Bún bò Huế, Bún riêu cua, Hủ tiếu Nam Vang...).
   - Món đạm / Thịt / Cá / Đậu hũ (Ức gà áp chảo, Thịt kho tàu, Cá nục kho cà chua, Cá kho tộ, Đậu hũ rán...).
   - Canh / Rau củ (Canh chua cá lóc, Canh khổ qua dồn thịt, Rau muống xào tỏi, Bông cải xanh hấp...).
   - Món cuốn / Bánh truyền thống (Gỏi cuốn tôm thịt, Chả giò rán, Bánh xèo miền Tây, Bánh mì kẹp thịt...).

### Nguyên tắc liêm chính dữ liệu
- **100% Ảnh chụp thực tế:** Toàn bộ ảnh phải do nhóm tự chụp hoặc thu thập có cấp phép rõ ràng từ bữa ăn thật.
- **Tuyệt đối không dùng ảnh stock hoặc ảnh sinh bởi AI** để làm Ground Truth.
- **Không nội suy số đo:** Khối lượng chuẩn bắt buộc phải được cân trực tiếp bằng cân nhà bếp điện tử. Mẫu chưa chụp/cân phải giữ nguyên trạng thái `pending`.

---

## 2. Quy trình cân đo & Định nghĩa Ground Truth

### 2.1 Quy trình thực nghiệm
1. Chuẩn bị món ăn trên đĩa/tô chuẩn bị dùng bữa.
2. Đặt đĩa lên cân điện tử nhà bếp (độ chia tối thiểu 1g). Bấm Tare trừ bì đĩa đựng nếu cân riêng thức ăn, hoặc cân tổng khối lượng đĩa trước và sau khi gắp thức ăn.
3. Ghi nhận số gram thực tế vào cột `measured_weight_g`.
4. Đặt đĩa thức ăn dưới điều kiện ánh sáng tự nhiên hoặc ánh sáng phòng ăn tiêu chuẩn, chụp ảnh với góc 45 độ hoặc từ trên xuống (top-down 90 độ).
5. Lưu trữ ảnh vào thư mục `data/benchmark/images/` với tên file đúng định dạng: `IMG001.jpg` đến `IMG030.jpg`.

### 2.2 Định nghĩa Ground Truth
- Trong đợt thử nghiệm Week 2, `measured_weight_g` được quy ước là **tổng khối lượng phần ăn có thể ăn được (edible portion weight)** của đĩa/tô món ăn (đơn vị: gram).
- Đối với các món nhiều thành phần rõ rệt (ví dụ Cơm tấm sườn bì chả), nhóm sẽ ghi nhận tổng khối lượng và mô tả thành phần trong cột `notes`. Không cộng gộp số đo thành phần và tổng đĩa trong cùng một phép tính thống kê để tránh trùng lặp.

---

## 3. Cấu trúc thư mục & Schema CSV

### 3.1 Cấu trúc
```text
data/benchmark/
├── images/                         # Thư mục lưu 30 file ảnh gốc (IMG001.jpg - IMG030.jpg)
│   └── .gitkeep
├── benchmark_30_meals.csv          # Bảng dữ liệu Ground Truth và kết quả AI
└── README.md                       # Tài liệu hướng dẫn, quy ước và giới hạn
```

### 3.2 Schema bảng `benchmark_30_meals.csv`

| Tên cột | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `sample_id` | `string` | Có | Mã định danh duy nhất của mẫu (`IMG001` đến `IMG030`). |
| `image_filename` | `string` | Có | Tên file ảnh tương ứng trong `images/` (ví dụ `IMG001.jpg`). |
| `dish_name` | `string` | Có | Tên món ăn tiếng Việt theo CSDL chuẩn (`vn_foods.csv`). |
| `food_item` | `string` | Có | Tên thành phần cụ thể hoặc tên món chính. |
| `measured_weight_g` | `float` | Có (khi done) | Khối lượng thực tế đo bằng cân điện tử (gram). Để trống khi `pending`. |
| `ai_estimated_weight_g`| `float` | Không | Khối lượng dự đoán bởi mô hình AI Vision (gram). Để trống khi chưa chạy AI thật. |
| `absolute_error_g` | `float` | Không | Sai số tuyệt đối: `\|ai_estimated_weight_g - measured_weight_g\|`. |
| `ape_percent` | `float` | Không | Sai số phần trăm tuyệt đối: `(absolute_error_g / measured_weight_g) * 100%`. |
| `confidence_score` | `float` | Không | Điểm tin cậy do mô hình AI trả về (nếu có). |
| `image_quality` | `string` | Có | Chất lượng ảnh (`good`, `low_light`, `blurry`, `pending_capture`). |
| `capture_angle` | `string` | Có | Góc chụp (`45_degree`, `top_down`, `side_view`, `pending_capture`). |
| `notes` | `string` | Không | Ghi chú về bối cảnh, thành phần, hoặc điều kiện chụp. |
| `collection_status` | `string` | Có | Trạng thái mẫu: `pending` (chưa thu thập), `collected` (đã chụp & cân), `evaluated` (đã chạy AI). |

---

## 4. Công thức đánh giá Sai số (Metrics)

Theo đặc tả tại `src/backend/services/metrics.py` và mục 4.6 tài liệu dự án:

### 4.1 Sai số Tuyệt đối Trung bình (MAE - Mean Absolute Error)
$$\text{MAE} = \frac{1}{M} \sum_{i=1}^{M} |W_{\text{est}, i} - W_{\text{gt}, i}| \quad (\text{gram})$$

### 4.2 Sai số Phần trăm Tuyệt đối Trung bình (MAPE)
$$\text{MAPE} = \frac{1}{M} \sum_{i=1}^{M} \frac{|W_{\text{est}, i} - W_{\text{gt}, i}|}{W_{\text{gt}, i}} \times 100\%$$

*Quy tắc tính toán:*
- Không tính MAPE cho các mẫu có $W_{\text{gt}} \le 0$ hoặc bị thiếu.
- Không đưa các mẫu ở trạng thái `pending` vào mẫu số tính MAE/MAPE.
- Tuyệt đối không sử dụng kết quả mock từ backend để báo cáo thay cho kết quả AI thật.

---

## 5. Hướng dẫn chạy kiểm thử tự động (Test Execution)

### 5.1 Kiểm thử Đăng nhập & Tính TDEE (Nhiệm vụ W2 Pair 3)
```powershell
python -m pytest tests/test_auth_and_goals.py -v
```

### 5.2 Kiểm thử toàn bộ Suite
```powershell
python -m pytest tests/test_auth_and_goals.py tests/unit/ -v
```

### 5.3 Kết quả kiểm thử thực tế (Baseline Week 2)
- `tests/test_auth_and_goals.py`: **15 passed**, 0 failed, 0 skipped.
- Toàn bộ test suite (`tests/`): **58 passed**, 0 failed, 0 skipped.

---

## 6. Trạng thái hiện tại, Giới hạn & Kế hoạch tiếp theo

### 6.1 Trạng thái thu thập mẫu
- Danh sách 30 món đã được lập khung (`IMG001` đến `IMG030`) dựa trên CSDL chuẩn 500 món Việt Nam.
- **Số mẫu đã có ảnh thật và số cân:** `0 / 30`.
- **Toàn bộ 30 mẫu hiện giữ trạng thái:** `pending`.

### 6.2 Các giới hạn đã biết (Known Limitations)
1. Kích thước mẫu 30 ảnh là tập benchmark sơ bộ ban đầu (PoC), chưa bao quát hết sự biến thiên kích thước đĩa bát và cách trình bày ẩm thực vùng miền.
2. Các món nước (phở, bún riêu, canh chua) có tỷ trọng nước dùng lớn, mô hình thị giác có thể gặp khó khăn trong việc tách biệt khối lượng cái (thịt, bún, rau) và khối lượng nước lèo.
3. API Gemini Vision hiện đang được hoàn thiện ở nhánh `origin/feat/ai-vision-recognition` của Phú Hiếu; việc tích hợp suy luận thực tế (inference) trên 30 ảnh sẽ diễn ra ngay sau khi ảnh thật được nạp vào thư mục `images/`.

### 6.3 Phân chia tập dữ liệu (Data Split)
- Khi hoàn tất 30 ảnh:
  - 20 ảnh dùng cho tập Validation/Tuning prompt thị giác.
  - 10 ảnh giữ riêng làm tập Blind Test (Final Evaluation) để đánh giá chỉ số MAPE cuối kỳ mà không bị overfit prompt.
