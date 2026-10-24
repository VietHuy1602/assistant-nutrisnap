# BÁO CÁO TÍCH HỢP HABIT TRACKER, BÁO CÁO THÁNG & LƯU NHÁP OFFLINE (TUẦN 6) — NS-FE-W6-001

> **Ghi chú chuẩn mực:** Mọi số liệu trong báo cáo này được đo đạc và ghi nhận từ thực tế chạy code và test suite; chưa đo trên môi trường production ghi rõ `Pending`. Tuyệt đối không đưa dữ liệu sức khỏe thật, tên người dùng, hay bản ghi bữa ăn thật vào báo cáo và repository.

---

## 1. Tóm tắt điều hành & Trạng thái Backend

| Hạng mục | Trạng thái Backend | Phương án kỹ thuật Frontend |
|---|---|---|
| **Habit Tracker** (`habit_service.py`) | ☑ Hoàn tất (Việt Huy) — endpoint `/api/v1/habits/status` | Zero-Math: Hiển thị streak và mốc 7 ngày từ backend; không tự đếm chuỗi. Non-punitive: hiển thị thông điệp "Quay lại đường đua" khi `back_on_track_active = true`, không dùng màu đỏ. |
| **Báo cáo Tháng** (`GET /api/v1/reports/monthly`) | ☑ Hoàn tất (Việt Huy) — tham số `year: int`, `month: int` | Tolerant Reader Zod normalizer; hiển thị số ngày có nhật ký, cân nặng đầu/cuối, dinh dưỡng TB kèm `EstimatedBadge`, trạng thái `insufficient_data` khi thiếu dữ liệu; 3 dòng chú thích cố định. |
| **Xuất Ảnh PNG & In PDF** | Trình duyệt Client-side (ADR-W6-05) | **Không thêm thư viện**. Canvas thuần cho PNG (có chú thích ước tính trong ảnh); `@media print` cho PDF. Không lưu trữ ảnh/PDF, không gửi ra ngoài. |
| **Lưu nháp Offline & Đồng bộ** | Ngoại lệ có kiểm soát (ADR-W6-02/04) | Mã hóa AES-GCM với khóa non-extractable trong IndexedDB, TTL 7 ngày, xóa khi đăng xuất. **Không tự động ghi khi có mạng lại**; người dùng duyệt từng bản nháp trong `DraftReviewDialog` và bấm xác nhận. |
| **Rate Limiting (429)** | ⏳ Chưa bàn giao (`slowapi` - Minh Đức) | **Đón đầu qua ADR-W6-09**: Hàng đợi thân thiện, đếm ngược, backoff 2s → 4s (tối đa 3 lần), sau đó nút Thử lại thủ công. Không coi là lỗi cần vá ở FE. |
| **Privacy (Tải/xóa dữ liệu)** | ⏳ Chưa có endpoint (Minh Đức) | Ẩn P1 "Dữ liệu của tôi", ghi nhận OD-3. |

---

## 2. Baseline (build, test, bundle)

| Chỉ số | Baseline (Step 0) | Hiện tại | Chênh lệch / Đánh giá |
|---|---|---|---|
| **Tổng số test pass** | 657 tests (47 files) | *Cập nhật tại Step 9–10* | Mục tiêu ≥ 110 tests mới |
| **Test fail / flaky** | 0 fail | *Cập nhật* | Đạt tiêu chuẩn ổn định 3 lần liên tiếp |
| **Hàng rào an toàn** | 148 checks (Zero-Math) | *Cập nhật* | Bổ sung hàng rào an toàn offline & storage |
| **Initial JS Chunk** | 396.10 kB (gzip: 123.96 kB) | *Cập nhật* | Tối ưu code splitting |
| **LineChart Chunk** | 384.45 kB (gzip: 105.88 kB) | *Cập nhật* | Tách biệt trong chunk lười |
| **CSS Bundle** | 51.69 kB (gzip: 9.05 kB) | *Cập nhật* | Bổ sung CSS in |

---

## 3. Contract Map (Habit, Monthly Report, Offline & 429)

| Nhóm API | Endpoint thực tế | Method | Request Schema | Response Normalizer / Zod | Xử lý suy giảm / Thiếu dữ liệu |
|---|---|---|---|---|---|
| **Habit Tracker** | `/api/v1/habits/status` | GET | Không tham số (HttpOnly JWT Cookie) | `habitStatusSchema` (streak, 7-day challenge, back_on_track, disclaimer) | Rỗng/lỗi: hiển thị skeleton/lỗi thân thiện kèm nút Thử lại. Không tự đếm chuỗi. |
| **Báo cáo Tháng** | `/api/v1/reports/monthly` | GET | `year: int`, `month: int` (1-12), `days: int` (mặc định 30) | `monthlyReportSchema` (logging_summary, weight_summary, nutrition_summary, strengths, days, summary) | `insufficient_data`: hiển thị "Chưa đủ dữ liệu để tổng kết tháng này". Thiếu cân nặng -> "chưa có". |
| **Ghi bữa ăn** | `/api/v1/meals/log` | POST | `MealLogRequest` (`meal_type`, `items`, `is_confirmed`, `notes`, ...) | `MealLogResponse` | Chưa có `client_request_id` -> đồng bộ offline bắt buộc người dùng duyệt và bấm xác nhận từng bản; hỗ trợ kiểm tra bữa hôm nay qua `/api/v1/meals/today`. |
| **Kiểm tra bữa hôm nay** | `/api/v1/meals/today` | GET | Không tham số | Danh sách bữa ăn hôm nay | Dùng để đối chiếu chống trùng khi gửi lại bản nháp offline. |
| **Rate Limit** | Mọi endpoint | * | Header / HTTP 429 | `ConnectivityProvider` interceptor | Đếm ngược thân thiện; tự thử tối đa 3 lần; sau đó nút bấm Thử lại. |

---

## 4. Assumption Register (AS-1 → AS-11)

| Mã | Giả định | Trạng thái | Đánh giá & Cách giải quyết |
|---|---|:---:|---|
| **AS-1** | Endpoint thói quen tồn tại | ✔ Xác thực | `/api/v1/habits/status` trả về `streak`, `seven_day_challenge`, `back_on_track`. |
| **AS-2** | Chuỗi ngày, huy hiệu do Backend tính | ✔ Xác thực | Zero-Math: Backend tính toán trong `habit_service.py`. Frontend không tự đếm. |
| **AS-3** | Tham số truy vấn `month` báo cáo | ✔ Xác thực | Backend nhận `year` & `month` số nguyên. `utils/month.ts` bóc tách `YYYY-MM`. |
| **AS-4** | Trường báo cáo tháng đầy đủ | ✔ Xác thực | `generate_monthly_report` cung cấp đầy đủ các nhóm chỉ số và chú thích. |
| **AS-5** | Cờ thiếu dữ liệu báo cáo | ✔ Xác thực | `trend_direction = "insufficient_data"` khi `records_count = 0`. |
| **AS-6** | Idempotency ghi bữa ăn (`client_request_id`) | ✖ Chưa có (OD-1) | Không tự đồng bộ khi online. Chỉ gửi sau khi người dùng xác nhận từng bản. |
| **AS-7** | Header `Retry-After` khi bị 429 | ✖ Chưa có (OD-2) | Áp dụng ADR-W6-09: Hàng đợi thân thiện, backoff 2s → 4s, tối đa 3 lần. |
| **AS-8** | Mã lỗi AI phân biệt được | ✔ Xác thực | Cờ `is_fallback: true` và HTTP lỗi giúp Frontend nhận diện để chuyển nhập tay. |
| **AS-9** | Privacy endpoint (tải/xóa dữ liệu) | ✖ Chưa có (OD-3) | Ẩn P1 "Dữ liệu của tôi", ghi nhận OD-3. |
| **AS-10** | Múi giờ Backend chuẩn UTC+7 | ✔ Xác thực | Backend dùng `VN_TIMEZONE` (UTC+7). `utils/month.ts` tuân thủ giờ địa phương. |
| **AS-11** | Giao diện không dữ liệu giả / không tự tính toán | ✔ Xác thực | Kiểm toán [HabitCalendar.tsx](file:///d:/assistant-nutrisnap/src/frontend/src/components/HabitCalendar.tsx) & [MonthlyReportView.tsx](file:///d:/assistant-nutrisnap/src/frontend/src/pages/MonthlyReportView.tsx) đạt chuẩn Zero-Math. |
