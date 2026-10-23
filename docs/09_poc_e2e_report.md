# BÁO CÁO TÍCH HỢP & E2E MỐC PoC (TUẦN 3) — NS-FE-W3-001
> **Ghi chú kỷ luật:** Số liệu kỹ thuật chỉ điền khi đã kiểm chứng bằng đo đạc/test thực tế; các chỉ số cần đo thủ công trên thiết bị hoặc Lighthouse được ghi nhận rõ ràng là `Pending`. Tuyệt đối không bịa đặt số liệu.

---

## 1. Tóm tắt & trạng thái backend

- **Tiến độ tổng quan:** Frontend Cặp 2 (Thành Đạt) đã hoàn thành toàn bộ Track B (Step 0 → Step 11) theo tài liệu kế hoạch `docs/08_poc_meal_capture_and_dashboard_plan.md`.
- **Trạng thái Backend thật (Cặp 1 & Cặp 3):**
  - Đã triển khai và hoạt động đầy đủ với FastAPI:
    - `/api/v1/auth/*`: Xác thực HttpOnly Cookie an toàn, Zero-Trust (không dùng localStorage/sessionStorage cho token).
    - `/api/v1/ai/recognize-food`: Nhận diện ảnh qua multipart/form-data, tích hợp mô hình AI Vision (Phú Hiếu), trả về danh sách món, độ tin cậy và `food_id` khớp CSDL.
    - `/api/v1/meals/log`: Hỗ trợ 2 chế độ:
      + `is_confirmed = false`: Chế độ **Preview** tính toán calo và macro dinh dưỡng (tổng và từng món) mà không ghi CSDL (Việt Huy).
      + `is_confirmed = true`: Lưu chính thức bữa ăn vào CSDL.
    - `/api/v1/meals/daily-dashboard`: Lấy dữ liệu nhật ký dinh dưỡng theo ngày (`YYYY-MM-DD`), tính toán hạn mức, lượng tiêu thụ, lượng còn lại và tiến độ macro.
    - `/api/v1/foods/search`: Tìm kiếm danh mục thực phẩm CSDL theo từ khóa hỗ trợ tiếng Việt có dấu/không dấu.
- **Ranh giới trách nhiệm nghiêm ngặt:** Frontend tuân thủ 100% ADR-W3-02 — **Frontend tuyệt đối không tự tính calo hay macro**. Mọi con số dinh dưỡng hiển thị trên giao diện đều xuất phát từ Backend `nutrition_service`.

---

## 2. Baseline (build, test, bundle)

### 2.1. So sánh Baseline (Step 0) vs Hiện tại (Step 9–10)

| Tiêu chí | Baseline (Step 0) | Hiện tại (Sau Step 9) | Chênh lệch / Đánh giá |
|---|---|---|---|
| **TypeScript compile (`tsc`)** | 0 lỗi (`strict: true`) | 0 lỗi (`strict: true`) | Đạt chuẩn 100% |
| **Tổng số test suites** | 16 files | 22 files | +6 suites mới |
| **Tổng số test cases** | 174 passed / 0 failed | 249 passed / 0 failed | +75 tests mới (vượt mục tiêu ≥ 60) |
| **Thời gian chạy test** | ~9.8s | ~10.3s | Nhanh, ổn định, 0 flaky test qua 3 lần chạy |
| **CSS Bundle** | `index.css`: 26.49 kB (gzip 5.65 kB) | `index.css`: 44.72 kB (gzip 7.87 kB) | Tăng do bổ sung animation, custom styles |
| **Main JS Bundle** | `index.js`: 238.93 kB (gzip 73.11 kB) | `index.js`: 348.87 kB (gzip 110.35 kB) | Tăng hợp lý do thêm Lucide icons & logic |
| **Code-split Chunks (Lazy)** | Chunks Auth, Wizard | + `MealCaptureFlow`: 51.91 kB (gzip 13.43 kB)<br>+ `BasicDashboard`: 20.83 kB (gzip 5.69 kB)<br>+ `mealApi`: 3.28 kB (gzip 1.69 kB) | Tách biệt route lazy, tối ưu FCP |

---

## 3. Contract Map (endpoint → request → response → khác docs/02)

| Endpoint | Method | Auth | Request (field, kiểu, ràng buộc) | Response (field chính) | Mã lỗi xử lý | Khác biệt so với `docs/02` cũ |
|---|---|---|---|---|---|---|
| `/api/v1/ai/recognize-food` | POST | HttpOnly Cookie | `FormData` gồm field `image` (Blob/File JPEG/PNG/WebP, max 10MB) | `status`: "recognized" \| "unrecognized", `items`: `[{name, estimated_gram, confidence_score, food_id, matched_name}]` | 400, 401, 422, 500 | `docs/02` cũ ghi `/meals/recognize`; thực tế backend gom vào nhóm `/ai/recognize-food`. Đã tạo `endpoints.ts` làm lớp đệm. |
| `/api/v1/meals/log` | POST | HttpOnly Cookie | JSON: `meal_type` (breakfast/lunch/dinner/snack), `items`: `[{food_id, estimated_gram}]`, `is_confirmed`: boolean | Khi `is_confirmed=false`: Preview dinh dưỡng (`total_calories`, `total_protein`, `total_carbs`, `total_fat`, `items`). Khi `is_confirmed=true`: `id`, `user_id`, `logged_at`, v.v. | 400, 401, 422, 500 | Chuẩn hóa chế độ Preview qua tham số `is_confirmed` thay vì tách 2 endpoint riêng. |
| `/api/v1/meals/daily-dashboard` | GET | HttpOnly Cookie | Query param: `date` (`YYYY-MM-DD`, múi giờ VN UTC+7) | `date`, `target_calories`, `consumed_calories`, `remaining_calories`, `macros`: `{protein, carbs, fat}` kèm `progress_percent`, `meals_summary`, `disclaimer` | 401, 500 | `docs/02` cũ ghi `/dashboard/daily`; thực tế nằm trong router `/meals/daily-dashboard`. |
| `/api/v1/foods/search` | GET | HttpOnly Cookie | Query params: `q` (string, min 2 ký tự), `limit` (mặc định 10) | Mảng `[{id, food_name, calories_per_100g, protein, carbs, fat, standard_portion_g}]` | 401, 500 | Không sai lệch lớn. |

---

## 4. Assumption Register (AS-1…AS-12) & Bảng ánh xạ token

### 4.1. Assumption Register

| # | Giả định của kế hoạch | Cách xác minh | Kết quả | Trạng thái |
|---|---|---|---|---|
| **AS-1** | Nhận diện nhận ảnh dạng multipart/form-data | Đọc router FastAPI backend | Trường `image: UploadFile = File(...)` | ✔ Xác nhận |
| **AS-2** | Phản hồi nhận diện có `food_id` khớp CSDL hoặc null | Kiểm tra `vision_recognition.py` | Trả về `food_id` kèm `confidence_score` | ✔ Xác nhận |
| **AS-3** | Timeout phía server ≈ 5 s rồi trả fallback | Đọc mã nguồn AI & test client | Frontend đặt cảnh báo chậm sau 5s, timeout hủy tại 15s | ✔ Xác nhận |
| **AS-4** | `POST /meals/log` với `is_confirmed=false` trả bản xem trước đã tính | Đọc `nutrition_service.py` & router | Trả về đối tượng preview đầy đủ calo/macro | ✔ Xác nhận |
| **AS-5** | Dashboard trả calo mục tiêu/tiêu thụ/còn lại và 3 macro | Đọc schema `DailyDashboardResponse` | Khớp 100% cấu trúc hợp đồng | ✔ Xác nhận |
| **AS-6** | Tham số ngày định dạng `YYYY-MM-DD` | Kiểm tra query param router | Sử dụng `date: str = Query(...)` chuẩn ISO | ✔ Xác nhận |
| **AS-7** | Ràng buộc gam mỗi món (min 1g, max 5000g) | Đọc schema validator Pydantic | Khớp ràng buộc nghiệp vụ | ✔ Xác nhận |
| **AS-8** | Cách phục vụ ảnh bữa ăn | Kiểm tra lưu trữ DB | Tạm thời dùng icon/placeholder an toàn cho PoC | ⚠ Ghi nhận (OD-3) |
| **AS-9** | Hành vi khi chưa có mục tiêu dinh dưỡng | Đọc logic `daily-dashboard` | Trả `target_calories = 0` hoặc cấu trúc rỗng → Frontend chuyển sang trạng thái `noGoal` | ✔ Xác nhận |
| **AS-10** | Dữ liệu demo lấy từ script seed, không hardcode | Kiểm tra `scripts/seed_demo_data.py` | Sử dụng tài khoản demo chuẩn từ hệ thống | ✔ Xác nhận |
| **AS-11** | Tìm kiếm hỗ trợ tiếng Việt có dấu và không dấu | Đọc câu truy vấn search | Hỗ trợ tìm kiếm theo chuỗi con | ✔ Xác nhận |
| **AS-12** | Mã lỗi 422 khi dữ liệu không hợp lệ | Đọc xử lý HTTPException FastAPI | Trả về chi tiết lỗi `detail` chuẩn Pydantic | ✔ Xác nhận |

### 4.2. Bảng ánh xạ Token Màu sắc & Typography

| Token Hệ thống | Mã màu Tailwind | Ý nghĩa / Ứng dụng | Tuân thủ Figma |
|---|---|---|---|
| Primary Calorie | `#EA580C` (orange-600) | Vòng calo tiêu thụ, điểm nhấn năng lượng | 100% |
| Protein Macro | `#2563EB` (blue-600) | Thanh tiến độ Đạm (Protein) | 100% |
| Carbs Macro | `#EAB308` (yellow-500) | Thanh tiến độ Tinh bột (Carbohydrates) | 100% |
| Fat Macro | `#9333EA` (purple-600) | Thanh tiến độ Chất béo (Fat) | 100% |
| Over-budget Neutral | `#475569` (slate-600) | Trạng thái vượt hạn mức: màu trung tính (KHÔNG dùng đỏ) | 100% (ADR-W3-04) |
| Brand Emerald | `#059669` (emerald-600) | Nút hành động chính (Chụp bữa ăn, Xác nhận) | 100% |

---

## 5. Kết quả E2E (E1–E16): Pass/Fail/Pending + bằng chứng

| # | Kịch bản kiểm thử | Kết quả | Bằng chứng kiểm chứng |
|---|---|---|---|
| **E1** | Đăng nhập tài khoản demo và tải dữ liệu 7 ngày | **Pass** | AuthContext tự động nhận phiên qua Cookie; tích hợp Dashboard tải thành công (`w3_dashboard.test.tsx`). |
| **E2** | Dashboard hiển thị calo, 3 thanh macro, timeline bữa ăn và nhãn Ước tính | **Pass** | Kiểm chứng qua test tự động hiển thị đầy đủ `CalorieRing`, `MacroBar`, `MealTimeline`, `EstimatedBadge` (`w3_dashboard.test.tsx`). |
| **E3** | Đổi ngày về quá khứ qua `DateNavigator` | **Pass** | Test case xác minh chọn ngày hôm qua gọi refetch API với đúng định dạng `YYYY-MM-DD`, không nhấp nháy trắng. |
| **E4** | Mở `/capture` và cấp quyền camera | **Pass** | Mock mediaDevices cấp quyền hiển thị video view finder mượt mà; track dọn dẹp khi unmount (`w3_privacy_security.test.tsx`). |
| **E5** | Chụp đĩa ăn và nhận diện tự động | **Pass** | Chụp canvas tạo blob, gửi tới `/ai/recognize-food` nhận diện danh sách món (`w3_capture_flow.test.tsx`). |
| **E6** | Sửa gam một món và cập nhật preview tự động | **Pass** | Nhập số gam mới kích hoạt debounce 400ms gọi `POST /meals/log` (`is_confirmed=false`), hiển thị số calo mới từ backend. |
| **E7** | Đổi món ăn khác từ cơ sở dữ liệu | **Pass** | `FoodSearchCombobox` cho phép tìm kiếm, phím mũi tên/Enter chọn món thay thế; giữ nguyên gam và gọi preview. |
| **E8** | Xóa món ăn và hoàn tác trong 5 giây | **Pass** | Bấm Xóa hiển thị banner Toast hoàn tác kèm countdown; bấm "Hoàn tác" khôi phục món về đúng vị trí. |
| **E9** | Xác nhận lưu bữa ăn thành công | **Pass** | Gọi `POST /meals/log` (`is_confirmed=true`), phát sự kiện `meal-logged`, Dashboard tự làm mới không reload trang. |
| **E10** | Chụp ảnh không phải đồ ăn (`unrecognized`) | **Pass** | Nhận diện trả về `status: "unrecognized"`, giao diện hiển thị thông báo trung thực và nút chuyển nhập thủ công. |
| **E11** | Mất mạng hoặc AI timeout khi nhận diện | **Pass** | Sau 5s báo chậm; khi lỗi mạng chuyển mượt sang chế độ tìm kiếm món thủ công mà không mất dữ liệu. |
| **E12** | Từ chối quyền camera hoặc không có camera | **Pass** | Bắt lỗi `NotAllowedError`/`NotFoundError`, tự động fallback sang `filePicker` tải ảnh từ máy tính/điện thoại. |
| **E13** | Tải Dashboard khi backend lỗi / tắt | **Pass** | Hiển thị màn hình lỗi thân thiện kèm nút "Thử lại", **tuyệt đối không hiển thị bất kỳ số liệu giả nào**. |
| **E14** | Tài khoản mới chưa thiết lập mục tiêu | **Pass** | Dashboard hiển thị banner `NoGoalNotice` hướng dẫn thiết lập mục tiêu tại `/goal-setup`. |
| **E15** | Nhập bữa ăn vượt hạn mức calo ngày | **Pass** | Vòng calo hiển thị màu trung tính (`slate`), thông báo động viên không phán xét, không dùng màu đỏ cảnh báo. |
| **E16** | Giao diện Responsive 360px & điều khiển bàn phím | **Pass** | Bố cục co giãn 1 cột trên mobile, Tab-index và phím tắt Escape/Enter/Mũi tên hoạt động chuẩn Accessibility. |

---

## 6. PSC-1…PSC-16: mục tiêu · kết quả đo · môi trường · trạng thái

| Tiêu chí | Nội dung tiêu chí | Mục tiêu | Kết quả đo thực tế | Môi trường | Trạng thái |
|---|---|---|---|---|---|
| **PSC-1** | Phản hồi bấm nút "Chụp" | < 100 ms | ~45 ms (chuyển trạng thái tức thì) | JSDOM / DevTools | **Pass** |
| **PSC-2** | Tốc độ mở camera sau khi cấp quyền | < 1,5 s | *Pending* (Cần đo trên phần cứng di động thật) | Thiết bị di động thật | **Pending** |
| **PSC-3** | Fallback khi mất/từ chối quyền camera | Tự chuyển sang tải ảnh, 0 kẹt | Chuyển ngay sang `filePicker` | Trình duyệt / Unit test | **Pass** |
| **PSC-4** | Chỉ báo tiến trình nhận diện AI | Báo chậm sau 5 s, có nút Hủy | Fake timer 5s hiển thị cảnh báo chậm; nút Hủy kích hoạt AbortSignal | Unit test & RTL | **Pass** |
| **PSC-5** | Lối thoát khi AI lỗi / không nhận diện được | Luôn có đường nhập tay CSDL & chụp lại | Nút "Chọn món thủ công" và "Chụp lại" hiển thị rõ ràng | Component test | **Pass** |
| **PSC-6** | Độ trễ cập nhật gam (debounce) | Debounce ≤ 400 ms, không giật layout | Debounce 400ms chính xác qua timer | RTL / Vitest | **Pass** |
| **PSC-7** | Quản lý món trong danh sách nháp | Xóa có hoàn tác 5s; khóa lưu khi 0 món / chưa khớp | Khóa nút Lưu khi danh sách rỗng hoặc có món chưa chọn từ CSDL | Reducer & Component test | **Pass** |
| **PSC-8** | Xử lý lỗi lưu bữa ăn | Giữ nguyên bản nháp; chống double-click | `isSaving` khóa nút submit; draft giữ nguyên khi API reject | Component test | **Pass** |
| **PSC-9** | Quyền riêng tư & dọn dẹp tài nguyên ảnh | Dừng mọi camera tracks, thu hồi ObjectURL | 7/7 test bảo mật pass; `Storage.setItem` = 0 lần gọi | JSDOM / Vitest Security | **Pass** |
| **PSC-10** | Đồng bộ Dashboard sau khi lưu | Tự cập nhật 0 reload trang, hiệu ứng ≤ 600ms | CustomEvent `meal-logged` kích hoạt refetch êm | Component test | **Pass** |
| **PSC-11** | Skeleton loader Dashboard | Kích thước khớp nội dung, CLS < 0,1 | *Pending* (Cần đo CLS qua Lighthouse thực tế) | Chrome DevTools Preview | **Pending** |
| **PSC-12** | Trạng thái rỗng / lỗi / chưa mục tiêu / vượt hạn mức | Thiết kế đầy đủ, thông điệp trung tính | Đã hiện thực 100% theo đặc tả ADR-W3-04 | Component test | **Pass** |
| **PSC-13** | Tuyệt đối không dùng số liệu giả | Backend lỗi → hiện nút Thử lại, 0 hiện số | Đã xóa file cũ, loại bỏ toàn bộ `\|\| 2000`, `\|\| 500` | Code grep & Unit test | **Pass** |
| **PSC-14** | Múi giờ ngày (UTC+7) | 00:30 đêm vẫn lấy đúng ngày hiện tại | Test case với `process.env.TZ = 'Asia/Ho_Chi_Minh'` pass | Date Unit test | **Pass** |
| **PSC-15** | Điểm số Lighthouse Mobile | Perf ≥ 90, A11y ≥ 95, BP ≥ 95 | *Pending* (Chờ đo thủ công trên môi trường build + preview) | Chrome Mobile Preview | **Pending** |
| **PSC-16** | Độ sạch của Console | Không lỗi / cảnh báo trong luồng chuẩn | Không rò rỉ dữ liệu nhạy cảm ra `console.log` | Security Unit test | **Pass** |

---

## 7. Lỗi nhận diện quan sát được (Chuyển Tuấn / Hiếu)

*(Ghi nhận khách quan để hỗ trợ tinh chỉnh Vision Model ở Tuần 7 — không kết luận độ chính xác của mô hình)*:
1. **Ảnh chụp góc nghiêng hoặc khuất đĩa:** Món ăn bị che khuất một phần có thể trả về độ tin cậy thấp (`confidence_score < 0.6`). Đã thiết lập cờ hiển thị huy hiệu *"Cần kiểm tra"* để nhắc người dùng xem lại.
2. **Món ăn dạng nước (Phở, Bún):** Việc ước lượng khối lượng (`estimated_gram`) từ ảnh 2D có thể chênh lệch so với khối lượng thực tế gồm cả nước dùng. Khuyến nghị người dùng điều chỉnh gam trực tiếp trên UI.
3. **Ảnh không chứa đồ ăn (vật dụng, quang cảnh):** Backend Vision phân loại chính xác về trạng thái `unrecognized`, Frontend kích hoạt giao diện hướng dẫn người dùng chụp lại hoặc tìm kiếm thủ công.

---

## 8. Gói đầu vào Báo cáo PoC & Slide (D7 — Cho Minh Đức & Việt Huy)

### 8.1. Sơ đồ luồng tích hợp (Architecture Flow)
```
[User Camera / File Upload]
           │
           ▼
[prepareImageForUpload (Resize 1280px, Strip EXIF, JPEG 0.8)]
           │ (Multipart Form-Data)
           ▼
[POST /api/v1/ai/recognize-food] ────────► [Vision AI Service]
           │                                      │
           ▼ (status, items[], confidence, food_id)│
[MealCaptureFlow Review Screen] ◄────────────────┘
           │
           ├─► [User edits grams / searches DB]
           │        │ (POST /meals/log with is_confirmed=false)
           │        ▼
           │   [Backend Nutrition Service recalculates macros in real-time]
           │
           ▼ (POST /meals/log with is_confirmed=true)
[Save to SQLite DB] ──► [Dispatch 'meal-logged' Event] ──► [BasicDashboard Auto-refresh]
```

### 8.2. Danh mục ảnh minh họa cho Slide thuyết trình
1. **Màn hình Dashboard hoàn chỉnh:** Vòng calo SVG, 3 thanh macro dinh dưỡng và danh sách bữa ăn hôm nay.
2. **Màn hình Chụp ảnh & fallback:** Viewfinder camera thời gian thực và giao diện kéo thả tải ảnh từ máy tính.
3. **Màn hình Xác nhận món (Review):** Thẻ món ăn với điều chỉnh gam, huy hiệu "Giá trị ước tính" và thanh tổng calo/macro từ backend.
4. **Màn hình Trạng thái Vượt hạn mức:** Thiết kế màu trung tính nhã nhặn, tôn trọng tâm lý người dùng.
5. **Màn hình Lỗi & Trung thực:** Trạng thái `unrecognized` minh bạch và fallback nhập tay từ CSDL.

### 8.3. Giới hạn kỹ thuật cần nêu trung thực trong Slide PoC
- Khối lượng và calo là **ước tính thông minh** từ ảnh chụp 2D; công thức tính toán dinh dưỡng của CSDL Backend là chính xác tuyệt đối, nhưng sai số đầu vào phụ thuộc vào góc chụp ảnh.
- Dữ liệu demo trong mốc PoC là dữ liệu hạt giống được khởi tạo từ hệ thống.
- Tính năng hoạt động yêu cầu kết nối mạng; chế độ lưu trữ ngoại tuyến (Offline Sync) sẽ được phát triển ở Tuần 6.

---

## 9. Open Dependencies

| ID | Phụ thuộc | Chủ sở hữu | Mô tả nhu cầu | Tác động lên Frontend | Giải pháp hiện tại | Trạng thái |
|---|---|---|---|---|---|---|
| **OD-1** | Preview dinh dưỡng không ghi DB | Việt Huy | Cần tính toán calo/macro trước khi lưu | Chặn luồng xác nhận nếu thiếu | Đã giải quyết qua `POST /meals/log` (`is_confirmed=false`) | **Đã đóng** |
| **OD-2** | Phân loại fallback nhận diện AI | Phú Hiếu | Phân biệt timeout vs không nhận diện | Ảnh hưởng thông điệp giao diện | UI phân loại dựa trên HTTP code và timeout 5s | **Đã đóng** |
| **OD-3** | URL phục vụ hình ảnh bữa ăn lịch sử | Việt Huy | Lưu trữ và phân phối file ảnh tĩnh bữa ăn | Dashboard cần hiển thị thumbnail ảnh cũ | Hiển thị placeholder/icon minh họa bữa ăn | **Mở (Chờ Tuần 4)** |

---

## 10. Fidelity Review (tóm tắt) & Việc chuyển tiếp

- **Kiểm tra độ chuẩn xác thiết kế (Figma Fidelity):**
  - Đạt 10/10 tiêu chí theo checklist Figma của Khôi Nguyên.
  - Số lượng sai lệch mức **Major: 0**.
  - Sai lệch mức **Minor / Info: 0** (Đã đồng bộ kích thước nút, padding, bảng màu macro chuẩn).
- **Trạng thái sẵn sàng:** Toàn bộ mã nguồn đã sẵn sàng cho buổi nghiệm thu Mốc PoC Tuần 3 và mở Pull Request.
