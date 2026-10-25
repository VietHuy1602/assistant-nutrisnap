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

| Chỉ số | Baseline (Step 0) | Hiện tại (Step 10) | Chênh lệch / Đánh giá |
|---|---|---|---|
| **Tổng số test pass** | 657 tests (47 files) | **771 tests** (58 files) | **+114 tests mới** (Vượt mục tiêu ≥ 110 tests) |
| **Test fail / flaky** | 0 fail | **0 fail / 0 flaky** | Đạt tiêu chuẩn ổn định 3 lần liên tiếp (100% pass) |
| **Hàng rào an toàn** | 148 checks (Zero-Math) | **158 checks** (148 Zero-Math + 10 Safety Guard) | 100% Xanh: quét cấm thư viện ngoài, storage, màu đỏ, rò rỉ log |
| **Initial JS Chunk** | 396.10 kB (gzip: 123.96 kB) | **411.34 kB** (gzip: 128.39 kB) | +15.24 kB do appBus, ConnectivityProvider, Navbar 6 mục, crypto/autosave |
| **LineChart Chunk** | 384.45 kB (gzip: 105.88 kB) | **384.45 kB** (gzip: 105.88 kB) | Tách biệt trong lazy chunk, không bị bundle vào initial |
| **CSS Bundle** | 51.69 kB (gzip: 9.05 kB) | **56.28 kB** (gzip: 9.73 kB) | +4.59 kB do bổ sung @media print và điều hướng 6 mục mobile |

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
| **AS-11** | Giao diện không dữ liệu giả / không tự tính toán | ✔ Xác thực | Kiểm toán HabitCalendar.tsx & MonthlyReportView.tsx đạt chuẩn Zero-Math. |

---

## 5. Kết quả Kiểm thử E2E (E1 → E20)

| Mã | Kịch bản kiểm thử | Kỳ vọng | Kết quả | Ghi chú kỹ thuật |
|---|---|---|:---:|---|
| **E1** | Mở `/habits` | Lưới tháng; chuỗi do backend | **Pass** | Xác minh tự động qua `HabitPageAndSync.test.tsx` |
| **E2** | Di chuyển bàn phím trên lưới habit | Ô focus chuẩn ARIA grid; Enter kích hoạt | **Pass** | Phím mũi tên 4 hướng, Home, End theo ARIA 1.2 |
| **E3** | Đổi tháng ← → trên Habit/Báo cáo | Giữ dữ liệu cũ; chặn vượt tháng tương lai | **Pass** | `useHabitMonth` / `useMonthlyReport` lưu giữ state cũ |
| **E4** | Mở `/reports` tháng đủ dữ liệu | Chỉ số từ backend; 3 chú thích cố định | **Pass** | `REPORT_NOTICES` hiển thị minh bạch 100% |
| **E5** | Tháng thiếu dữ liệu (`insufficient_data`) | Banner thân thiện "Chưa đủ dữ liệu" | **Pass** | Không hiển thị số 0 giả định hoặc biểu đồ rỗng |
| **E6** | Xuất ảnh PNG | Tải ảnh canvas x2 nét; có chú thích trong ảnh | **Pass** | `renderReportCanvas.ts` vẽ trực tiếp nền trắng |
| **E7** | In / Lưu PDF (Print Preview) | `@media print` ẩn Navbar/nút; A4 chuẩn | **Pass** | `print.css` tối ưu ngắt trang (`page-break-inside: avoid`) |
| **E8** | Điều hướng 6 phân hệ | Đúng route; `aria-current="page"` | **Pass** | Đồng bộ giữa Desktop Navbar và Mobile BottomNav |
| **E9** | Ghi bữa tại Chat -> Mở Habit/Báo cáo | Tự động làm mới dữ liệu chéo | **Pass** | `appBus` phát tán sự kiện `meal-logged` debounced 300ms |
| **E10** | Chụp ảnh/nhập món, ngắt kết nối mạng | Banner "Đã lưu nháp trên thiết bị" ≤ 1s | **Pass** | `useDraftAutosave` debounce 800ms lưu AES-GCM IndexedDB |
| **E11** | Tải lại trang khi đang offline | Bản nháp nguyên vẹn sau khi giải mã | **Pass** | `draftStore.getDrafts()` giải mã bằng khóa trong IndexedDB |
| **E12** | Có mạng lại khi có nháp tồn đọng | Hiện banner "Xem và lưu"; **không tự gửi** | **Pass** | S8/M6: Zero auto-sync. Chờ người dùng mở popup |
| **E13** | Xem và lưu -> Người dùng bấm "Lưu bản này" | Gửi API; lưu thành công; xóa nháp khỏi IDB | **Pass** | `DraftReviewDialog` gửi với cờ xác nhận rõ ràng |
| **E14** | Mạng timeout khi đang gửi bản nháp | Trạng thái "chưa rõ"; không tự retry | **Pass** | Khóa retry tự động; hiển thị nút đối chiếu Nhật ký |
| **E15** | Giả lập HTTP 429 Rate Limit | Đếm ngược thân thiện; tự thử ≤ 3 lần | **Pass** | `ConnectivityProvider` backoff 2s -> 4s, sau đó nút bấm |
| **E16** | Lỗi AI nhận diện (timeout/500) | Hiện nút "Nhập tay" cứu cánh; giữ nháp | **Pass** | Người dùng không bị mất dữ liệu đã nhập |
| **E17** | Đăng xuất tài khoản | Xóa sạch kho nháp IndexedDB (clearAll) | **Pass** | `draftStore.clearAll()` hủy toàn bộ khóa & bản nháp |
| **E18** | Tắt công tắc lưu nháp offline | Không lưu nháp mới; xác nhận xóa nháp cũ | **Pass** | `OfflineSettings` quản lý công tắc an toàn |
| **E19** | Giao diện Mobile (360px) | BottomNav 5 mục + nút Camera nổi | **Pass** | `pb-20 md:pb-0` không che khuất nội dung hoặc nút bấm |
| **E20** | Môi trường không hỗ trợ WebCrypto (HTTP LAN) | Báo "Kho nháp không khả dụng", cấm plain text | **Pass** | Không bao giờ lưu văn bản thô chưa mã hóa |

---

## 6. Ma trận Xác minh Mode A & Chuẩn bị Mode B

### 6.1. Ma trận Xác minh Mode A (Hiện tại)
| Mã | Kịch bản kiểm chứng | Trạng thái | Minh chứng kỹ thuật |
|---|---|:---:|---|
| **V1** | Habit & Báo cáo hiển thị dữ liệu thật | **Pass** | Nối trực tiếp endpoint backend; không math tại client |
| **V2** | Đổi tháng báo cáo & giữ trạng thái | **Pass** | `utils/month.ts` tuân thủ UTC+7; không lệch ngày |
| **V3** | Xuất PNG & In không thư viện ngoài | **Pass** | Canvas HTML5 thuần 2x & CSS `@media print` |
| **V4** | Offline -> Lưu nháp -> Online -> Duyệt | **Pass** | Khóa AES-GCM non-extractable; duyệt thủ công |
| **V5** | Chống trùng lặp bản ghi offline | **Pass** | Hướng dẫn đối chiếu `/api/v1/meals/today` trước khi lưu |
| **V6** | Phản hồi Rate Limiting 429 | **Pass** | Mocked và Interceptor sẵn sàng đón đầu slowapi |
| **V7** | Nhận diện lỗi AI & Fallback nhập tay | **Pass** | Thoát hiểm nhập tay trong `MealCaptureFlow.tsx` |
| **V8** | Reset kho nháp và cache khi đăng xuất | **Pass** | `clearAll()` gọi tại `handleLogout` |
| **V9** | Privacy API (tải/xóa dữ liệu cá nhân) | **N/A** | Backend chưa có endpoint; tạm ẩn P1 theo kế hoạch |
| **V10** | Hàng rào bảo mật không rò rỉ dữ liệu | **Pass** | 10 bài test quét mã nguồn trong `safety.guard.test.ts` |

### 6.2. Sẵn sàng cho Mode B (Khi Backend bàn giao Rate Limiting & Privacy)
- [x] Giao diện đón nhận mã 429 và header `Retry-After` đã hoàn thiện.
- [x] Logic backoff tự động (tối đa 3 lần) đã kiểm thử xong.
- [x] Khi Backend triển khai `slowapi` và endpoint Privacy, chỉ cần bật cờ mà không cần tái cấu trúc Frontend.

---

## 7. Đo đạc Kỹ thuật (Bundle Size & Lighthouse)

### 7.1. Phân bổ Bundle Size (Vite Build)
```text
dist/index.html                                  0.86 kB │ gzip:   0.49 kB
dist/assets/index-BqkQIqsn.css                  56.28 kB │ gzip:   9.73 kB
dist/assets/month-DUyH8BpR.js                    4.73 kB │ gzip:   1.87 kB
dist/assets/RegisterPage-C3svrhPM.js             6.82 kB │ gzip:   2.53 kB
dist/assets/MonthlyReportView-B02SctW8.js       11.23 kB │ gzip:   4.30 kB
dist/assets/HabitPage-B_bmb7Ct.js               16.30 kB │ gzip:   5.93 kB
dist/assets/MonthlyReportPage-C-fg6GEK.js       23.03 kB │ gzip:   7.88 kB
dist/assets/ProgressAnalyticsPage-BdzJHvhq.js   30.74 kB │ gzip:   9.12 kB
dist/assets/BasicDashboard-CVOGxbDs.js          32.23 kB │ gzip:   9.36 kB
dist/assets/GoalPlannerWizard-CUx6FY2Q.js       37.62 kB │ gzip:   8.94 kB
dist/assets/MealCaptureFlow-CBcEBe4S.js         64.42 kB │ gzip:  17.23 kB
dist/assets/LineChart-7LPl9CXM.js              384.45 kB │ gzip: 105.88 kB
dist/assets/index-Cn7WVHI1.js                  411.34 kB │ gzip: 128.39 kB
```

### 7.2. Điểm số Lighthouse
- **Môi trường đo:** Chrome DevTools Desktop & Mobile Simulation (Production Build).
- **Trạng thái:** `Pending` (Được ghi nhận để nhóm thực hiện đo thủ công trên thiết bị vật lý trước buổi nghiệm thu chính thức).

---

## 8. Báo cáo Tuân thủ Safety Charter (S1 → S14)

1. **S1 (Phạm vi cứng):** 100% tuân thủ. Chỉ chỉnh sửa trong `src/frontend/**` và `docs/**`. Không chạm vào `src/backend`, `src/ai`, `data`, `scripts`, `.env*`.
2. **S2 (Quyền hạn):** Không chạm vào bí mật môi trường hay token nhạy cảm.
3. **S3 (Không thư viện mới):** `git diff package.json`dependencies trống 100%. Không cài thêm html2canvas, jspdf, pdfmake hay serviceworker.
4. **S4 (Không che giấu lỗi):** 0 bài test bị skip, 0 `@ts-ignore`, 0 ép kiểu `as any` vô cớ.
5. **S5 (Zero-Math & Zero-Fake):** Không tính streak, không tính trung bình dinh dưỡng; 100% lấy từ backend.
6. **S6 (Bảo mật dữ liệu sức khỏe):** Không dùng `localStorage` cho bữa ăn/calo/token; bản nháp offline mã hóa AES-GCM non-extractable.
7. **S7 (Ngôn ngữ phi trừng phạt):** Không dùng màu đỏ (red/rose) hay ngôn từ trách móc khi người dùng lỡ thói quen; hiển thị "Quay lại đường đua".
8. **S8 (Zero Auto-Sync):** Khi có mạng lại, tuyệt đối không tự ý gửi POST lên CSDL; bắt buộc người dùng bấm xác nhận.
9. **S9 (Giới hạn tự động hóa):** Retry tối đa 3 lần với backoff 2s -> 4s.
10. **S10 - S14:** Thực thi tuần tự, commit đúng quy chuẩn, không vượt quyền thiết kế.

---

## 9. Đăng ký Phụ thuộc Mở (Open Dependencies OD-1 → OD-4)

| ID | Phụ thuộc | Chủ sở hữu | Tác động Frontend | Giải pháp tạm thời tại Frontend | Trạng thái |
|---|---|---|---|---|:---:|
| **OD-1** | Idempotency ghi bữa ăn (`client_request_id`) | Việt Huy (Backend) | Nguy cơ trùng lặp nếu mạng lag | Yêu cầu người dùng duyệt từng bản ghi; hướng dẫn kiểm tra Nhật ký hôm nay | Chờ Backend |
| **OD-2** | Header `Retry-After` khi bị 429 | Minh Đức (Backend) | Chưa có thời gian chờ chính xác từ server | Áp dụng backoff cố định 2s -> 4s (tối đa 3 lần) | Chờ Backend |
| **OD-3** | Privacy API (Tải / Xóa dữ liệu cá nhân) | Minh Đức (Backend) | Chưa có tính năng P1 | Tạm ẩn nút "Dữ liệu của tôi" khỏi giao diện người dùng | Chờ Backend |
| **OD-4** | Đầy đủ trường số liệu tháng | Việt Huy (Backend) | Có thể thiếu cân nặng đầu/cuối | Hiển thị "chưa có" minh bạch kèm trạng thái insufficient | Đã xử lý |
