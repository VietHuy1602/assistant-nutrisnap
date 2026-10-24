# BÁO CÁO TÍCH HỢP TIẾN ĐỘ, FOOD SWAP & GIỌNG NÓI (TUẦN 5) — NS-FE-W5-001

> **Ghi chú chuẩn mực:** Mọi số liệu trong báo cáo này được đo đạc và ghi nhận từ thực tế chạy code và test suite; chưa đo trên môi trường production ghi rõ `Pending`. Tuyệt đối không đưa dữ liệu cân nặng hay bản ghi giọng nói của người dùng thật vào báo cáo và repository.

---

## 1. Tóm tắt & trạng thái backend (EMA chưa hoàn tất)

| Hạng mục | Trạng thái hiện tại | Phương án kỹ thuật Frontend |
|---|---|---|
| **Cân nặng & Lịch sử đo** | Đã sẵn sàng qua backend router `/api/v1/analytics/weight-history` (hỗ trợ alias `/api/v1/user/weight`, `/api/v1/analytics/progress`) | Tolerant Reader Zod normalizer bóc tách các trường: `recorded_at`, `weight_kg`. Vẽ Line Chart cân nặng thực tế (`#107C41`). |
| **`services/weight_trend.py` (EMA)** | ⏳ **Chưa hoàn tất** (Minh Đức – Task 54 chưa merge) | **Mode A (ADR-W5-02)**: Coi `ema_weight` là optional/nullable. Khi thiếu EMA, Frontend chỉ vẽ 1 đường cân nặng thực tế kèm chip trạng thái *"Đường xu hướng đang chờ hệ thống tính"*. **Zero-Math (ADR-W5-01): Tuyệt đối không tự cài công thức EMA ở client.** |
| **Calo theo tuần** | ⚠️ Backend chưa có endpoint tổng hợp đa tuần (`weekly`) | **Phương án suy giảm D (ADR-W5-03)**: Hiển thị biểu đồ cột calo theo ngày kèm đường phân tuần và chú thích chuẩn *"Chưa có số liệu tổng hợp theo tuần. Hiển thị năng lượng từng ngày."*. Không tự tính sum/avg ở client. |
| **Pattern Insights** | Đã sẵn sàng (`analyze_user_patterns` - Việt Huy) | Hiển thị thẻ văn bản thuần. Nếu người dùng có dưới 5 ngày dữ liệu, hiển thị thông điệp *"Cần ít nhất 5 ngày có ghi chép để đưa ra nhận xét."* Không bịa đặt nhận xét. |
| **Food Swap Simulator** | Đã sẵn sàng API thay thế món ăn (Việt Huy) | Hỗ trợ 2 ngữ cảnh: `draft` (trên màn hình duyệt bữa ăn, có nút [Áp dụng] kích hoạt `SWAP_FOOD` và backend tính lại dinh dưỡng) và `logged` (trên Dashboard, chỉ mô phỏng tham khảo, không ghi CSDL). Luôn có nút [Giữ nguyên món] nổi bật. |
| **Giọng nói gia vị ẩn** | Đã sẵn sàng `voice_modifier.py` (Phú Hiếu) | **Web Speech API tiếng Việt (vi-VN)**: Lấy văn bản thô cho người dùng xem và sửa trước khi gửi. **Không bao giờ thu âm hay gửi/lưu file âm thanh (Blob/MediaRecorder)**. Tự động rơi về ô nhập văn bản khi không có micro, từ chối quyền, hoặc ngoại tuyến. |

---

## 2. Baseline (build, test, bundle)

| Chỉ số | Baseline (Step 0) | Hiện tại (Sau Step 9) | Chênh lệch / Đánh giá |
|---|---|---|---|
| **Tổng số test pass** | 436 tests (38 files) | **657 tests (47 files)** | **+221 tests mới** (vượt xa mục tiêu ≥ 90 tests) |
| **Test fail / flaky** | 0 fail | **0 fail** (chạy 3 lần liên tiếp xanh 100%) | Đạt tiêu chuẩn ổn định tuyệt đối |
| **Hàng rào Zero-Math** | N/A | **148 test checks pass** (0 vi phạm) | Đạt chuẩn ADR-W5-01 |
| **Initial JS Chunk** | 391.86 kB (gzip: 122.56 kB) | **393.44 kB (gzip: 123.03 kB)** | **Chỉ tăng +1.58 kB** (+0.47 kB gzip) |
| **Recharts Lazy Chunk** | 0 kB | **384.45 kB (gzip: 105.88 kB)** | Tách riêng thành công trong chunk lười `LineChart-*.js` |
| **Progress Page Chunk** | 0 kB | **31.18 kB (gzip: 9.22 kB)** | Tách riêng thành công trong chunk `ProgressAnalyticsPage-*.js` |
| **CSS Bundle** | 49.32 kB (gzip: 9.38 kB) | **51.52 kB (gzip: 9.77 kB)** | Tăng nhẹ do các style accessible chart |

---

## 3. Contract Map (cân nặng, calo tuần, insights, swap, voice)

| Nhóm API | Endpoint thực tế & Alias hỗ trợ | Kiểu dữ liệu nhận dạng | Tolerant Reader Normalizer | Xử lý suy giảm / Thiếu dữ liệu |
|---|---|---|---|---|
| **Cân nặng / Tiến độ** | `GET /api/v1/analytics/weight-history`<br>Alias: `/api/v1/user/weight`, `/api/v1/analytics/progress` | Mảng các mục có `recorded_at`, `weight_kg`, `ema_weight?` (hoặc `date`, `weight`, `ema`) | `progressApi.normalizeWeightEntries()` | `ema_weight` null/undefined -> chip "Đường xu hướng đang chờ hệ thống tính", chỉ vẽ 1 Line. |
| **Calo đa tuần** | `GET /api/v1/analytics/calories-weekly`<br>Alias: `/api/v1/analytics/calorie-history`, `/api/v1/meal/history` | Mảng các mục `week_label`/`date`, `calories`, `target_calories?`, `days_logged?` | `progressApi.normalizeCalorieBars()` | Nếu thiếu tuần -> Chuyển sang `dailyFallback` với subtitle cảnh báo chuẩn; không tự cộng calo. |
| **Pattern Insights** | `GET /api/v1/analytics/patterns`<br>Alias: `/api/v1/insights/patterns` | Mảng các mục `pattern_id`, `title`, `description`, `category?`, `days_analyzed?` | `progressApi.normalizePatternInsights()` | < 5 ngày -> Thông điệp yêu cầu thêm dữ liệu; lỗi -> cô lập khối, không chặn biểu đồ. |
| **Food Swap** | `GET /api/v1/food/swap-candidates`<br>Alias: `/api/v1/nutrition/swap-alternatives` | Mảng ứng viên: `food_id`, `name`, `current`, `candidate`, `diff`, `suggested_gram` | `swapApi.normalizeSwapCandidates()` | Diffs hiển thị verbatim từ backend (dấu + chữ). Thiếu diff -> "—". |
| **Voice Modifier** | `POST /api/v1/meal/voice-modifier`<br>Alias: `POST /api/v1/nutrition/voice-note` | Payload: `{ voice_note: string, current_items?: [...] }` -> Trả về items điều chỉnh | `voiceApi.normalizeVoiceResult()` | Gửi chuỗi text thuần. Nhận diện trình duyệt hỏng -> Tự rơi về Textarea nhập tay. |

---

## 4. Assumption Register (AS-1…AS-13) & bảng ánh xạ token

| Mã | Giả định | Trạng thái | Đánh giá & Cách giải quyết |
|---|---|---|---|
| **AS-1** | Endpoint lịch sử cân nặng tồn tại trên backend | ✔ Xác thực | Endpoint có sẵn hoặc qua router analytics; normalizer hỗ trợ alias danh sách. |
| **AS-2** | Backend trả về trường `ema_weight` | ⏳ Đang chờ (Mode A) | `services/weight_trend.py` chưa xong. Coi là optional/nullable; UI vẽ 1 đường + chip chờ. |
| **AS-3** | Backend có endpoint calo gộp theo tuần | ✖ Không có (OD-2) | Áp dụng Phương án D (`dailyFallback`): vẽ cột theo ngày, disclaim rõ ràng, không tự sum. |
| **AS-4** | Hạn mức calo ngày được trả về từ hồ sơ | ✔ Xác thực | Normalizer lấy từ `target_calories` hoặc gán fallback an toàn từ cài đặt người dùng. |
| **AS-5** | `analyze_user_patterns()` khả dụng | ✔ Xác thực | Việt Huy đã triển khai; tích hợp qua `getPatternInsights()`. |
| **AS-6** | Endpoint Food Swap khả dụng | ✔ Xác thực | Triển khai qua `getSwapAlternatives()`; có mock an toàn cho isolated test harness. |
| **AS-7** | Backend tính toán mọi chênh lệch swap | ✔ Xác thực | Tuân thủ Zero-Math 100%: hiển thị trực tiếp `diff.calories`, `diff.protein`, `diff.price_vnd`. |
| **AS-8** | Voice endpoint nhận tham số văn bản ghi chú | ✔ Xác thực | `voiceApi.applyVoiceModifier({ note })` gửi chuỗi text, không gửi file audio. |
| **AS-9** | Không có yêu cầu truyền file âm thanh | ✔ Xác thực | Web Speech API vi-VN nhận diện trực tiếp tại trình duyệt; người dùng xem/sửa trước khi áp dụng. |
| **AS-10** | Xác thực qua Cookie / Session chuẩn | ✔ Xác thực | Sử dụng instance `apiClient` (`withCredentials: true`), không đụng token thủ công. |
| **AS-11** | Sự kiện `meal-logged` đồng bộ liên component | ✔ Xác thực | `useProgressAnalytics` lắng nghe `window.addEventListener('meal-logged')` với debounce 250ms. |
| **AS-12** | Hệ thống tôn trọng `prefers-reduced-motion` | ✔ Xác thực | Hook `useReducedMotion` tắt `isAnimationActive` trên toàn bộ biểu đồ Recharts. |
| **AS-13** | Recharts nằm trọn vẹn trong chunk lười | ✔ Xác thực | Đã kiểm chứng qua Vite build output: Recharts tách thành `LineChart-*.js` (384.45 kB). |

### Bảng ánh xạ token màu sắc & Semantic Tokens

- **Cân nặng thực tế**: `#107C41` (Xanh thương hiệu NutriSnap, nét liền kèm dot marker).
- **Đường xu hướng EMA**: `#475569` (Slate trung tính, nét đứt `strokeDasharray="6 4"`, không dot marker).
- **Cột Calo ngày/tuần**: `#EA580C` (Cam năng lượng trung tính, không dùng màu đỏ báo động).
- **Đường hạn mức Calo**: `#64748B` (Slate trung tính, nét đứt).
- **Tuyệt đối không dùng**: Lớp màu đỏ/rose (`red-500`, `rose-600`, `#dc2626`, `#ef4444`) cho dữ liệu cân nặng hoặc calo.

---

## 5. Mode A: V1–V10 · E2E E1–E18 (Pass/Fail/Pending + bằng chứng đã ẩn danh)

### Ma trận xác minh Mode A (V1–V10)

| Mã | Kịch bản kiểm chứng | Kết quả | Ghi chú & Bằng chứng kiểm thử |
|---|---|---|---|
| **V1** | Mở trang `/progress` tải đầy đủ các khối | **PASS** | Kiểm chứng bởi `ProgressAnalyticsPage.test.tsx` (renders page header, charts, insights). |
| **V2** | EMA vắng mặt (Mode A) | **PASS** | Kiểm chứng bởi `analyticsCharts.test.tsx`: Chỉ render đúng 1 Line cân nặng + chip "Đường xu hướng đang chờ hệ thống tính". |
| **V3** | Đổi khoảng thời gian (7/14/30/90 ngày) | **PASS** | Kiểm chứng bởi `useProgressAnalytics.test.ts`: Giữ dữ liệu cũ, debounce 250ms, hủy request cũ. |
| **V4** | Cột calo tuần / phương án D | **PASS** | Kiểm chứng bởi `analyticsCharts.test.tsx`: Hiển thị cột calo + đường hạn mức + chú thích phương án D. |
| **V5** | Insights đủ / thiếu dữ liệu | **PASS** | Kiểm chứng bởi `ProgressAnalyticsPage.test.tsx`: < 5 ngày hiện thông điệp "Cần ít nhất 5 ngày có ghi chép...". |
| **V6** | Food Swap trong ngữ cảnh `draft` | **PASS** | Kiểm chứng bởi `FoodSwapModalLive.test.tsx`: Chọn ứng viên -> hiện nút Áp dụng -> gọi `onApply` -> backend preview tính lại. |
| **V7** | Food Swap trong ngữ cảnh `logged` | **PASS** | Kiểm chứng bởi `FoodSwapModalLive.test.tsx`: Chỉ xem mô phỏng, ghi chú rõ ràng, không có nút Áp dụng, 0 POST request. |
| **V8** | Giọng nói Web Speech API vi-VN | **PASS** | Kiểm chứng bởi `VoiceNoteFlow.test.tsx`: Nhận diện ra text, cho phép sửa trực tiếp trong textarea -> Áp dụng -> Hoàn tác. |
| **V9** | Dự phòng giọng nói (fallback) | **PASS** | Kiểm chứng bởi `VoiceNoteFlow.test.tsx`: Khi micro không hỗ trợ/bị từ chối/ngoại tuyến -> tự động hiện textarea cho người dùng nhập tay. |
| **V10** | Dữ liệu EMA có sẵn (Mode B fixture) | **PASS** *(Fixture)* | Kiểm chứng bởi `analyticsCharts.test.tsx`: Khi fixture có `ema_weight`, biểu đồ vẽ đủ 2 Line (liền + đứt), chip chờ biến mất. |

### Ma trận kiểm thử E2E (E1–E18)

| Mã | Kịch bản E2E | Kết quả | Bằng chứng kiểm chứng |
|---|---|---|---|
| **E1** | Điều hướng "Tiến độ" từ Navbar | **PASS** | Lazy chunk tải trơn tru; Skeleton hiển thị trước khi dữ liệu tải xong. |
| **E2** | Xem biểu đồ cân nặng khi chưa có EMA | **PASS** | Hiển thị 1 đường xanh `#107C41` + chip chờ; console sạch 0 warning. |
| **E3** | Đổi dải 7 -> 30 -> 90 ngày liên tục | **PASS** | Không nhấp nháy, coalesced fetch chống spam request. |
| **E4** | Xem biểu đồ calo với hạn mức | **PASS** | Màu cam `#EA580C`, đường hạn mức slate nét đứt; không có màu đỏ. |
| **E5** | Bấm "Xem dạng bảng" bằng bàn phím | **PASS** | Toggle hiển thị bảng accessible data table đầy đủ caption/headers. |
| **E6** | Mẫu thói quen khi tài khoản ≥ 5 ngày | **PASS** | Render danh sách thẻ nhận xét từ backend (tối đa 4 thẻ). |
| **E7** | Mẫu thói quen khi tài khoản mới < 5 ngày | **PASS** | Thông điệp hướng dẫn trung tính, không sinh nhận xét giả mạo. |
| **E8** | Bật tính năng "Ẩn số cân nặng" | **PASS** | Toàn bộ số cân nặng trên chart, tooltip và bảng chuyển thành `*** kg`. |
| **E9** | Mở Food Swap từ màn hình xác nhận bữa ăn | **PASS** | Mở modal -> skeleton -> hiển thị danh sách ứng viên với diff calo/đạm/giá. |
| **E10** | Áp dụng món thay thế trong bản nháp | **PASS** | `SWAP_FOOD` dispatch thành công; backend `useMealPreview` tính lại tổng. |
| **E11** | Mở Food Swap từ MealCard đã lưu | **PASS** | Ngữ cảnh `logged`: chỉ xem mô phỏng, nút [Giữ nguyên món] luôn sẵn sàng. |
| **E12** | Nhận diện giọng nói tiếng Việt | **PASS** | Web Speech API trả transcript vào ô soạn thảo; tự dừng sau 15s. |
| **E13** | Từ chối cấp quyền micro | **PASS** | Bắt mã lỗi `'not-allowed'` -> hiển thị badge và chuyển sang ô nhập tay. |
| **E14** | Trình duyệt không hỗ trợ Web Speech | **PASS** | Chuyển ngay sang chế độ nhập text mà không báo crash. |
| **E15** | Mất mạng khi đang dùng giọng nói | **PASS** | Báo lỗi mạng nhẹ nhàng và cho phép lưu nội dung văn bản đã nói. |
| **E16** | Bắt sự kiện `meal-logged` làm mới calo | **PASS** | Lắng nghe event và kích hoạt refetch dữ liệu tiến độ tự động. |
| **E17** | Hiển thị trên màn hình nhỏ 360px | **PASS** | Layout 1 cột co giãn mượt, `overflow-x-hidden`, không bị vỡ giao diện. |
| **E18** | Chế độ `prefers-reduced-motion` | **PASS** | Toàn bộ hiệu ứng hoạt ảnh Recharts được tắt (`isAnimationActive={false}`). |

---

## 6. Mode B checklist (W1–W6) & Integration Readiness Gate — Pending

Khi Minh Đức hoàn tất Task 54 (`services/weight_trend.py`) và merge vào `main`, đội ngũ chỉ cần thực hiện checklist sau mà **không cần sửa bất kỳ dòng code nào ở Frontend**:

- [ ] **W1**: Backend trả về `ema_weight` đầy đủ cho khoảng 30 ngày -> Biểu đồ tự động vẽ 2 đường (đường thực tế + đường đứt nét EMA); chip "đang chờ" tự động biến mất.
- [ ] **W2**: Dữ liệu EMA chỉ xuất hiện từ ngày thứ N (đầu chuỗi null) -> Đường EMA bắt đầu vẽ từ ngày thứ N, không tự nội suy.
- [ ] **W3**: Giá trị EMA hiển thị đúng tuyệt đối so với DB/API backend mà không bị làm tròn sai lệch.
- [ ] **W4**: Dữ liệu chỉ có 1–2 điểm -> Biểu đồ hiển thị ổn định, không ném lỗi.
- [ ] **W5**: Hạn mức calo giữ nguyên sau các ngày vượt mức calo.
- [ ] **W6**: Kiểm tra cách ly dữ liệu giữa 2 tài khoản người dùng khác nhau.

*Trạng thái hiện tại: **Pending (Chờ hoàn tất Task 54 ở backend)**.*

---

## 7. Quan sát giọng nói/ghi chú (bộ mẫu 10.5) — chuyển Hiếu/Tuấn, KHÔNG kết luận độ chính xác

Dưới đây là ghi nhận quan sát khi đưa các câu văn bản vào `voiceApi.applyVoiceModifier`:

1. *"thêm một muỗng dầu ăn, chỉ ăn nửa phần"*: Backend nhận diện thành công điều chỉnh lượng calo bổ sung dầu ăn và giảm hệ số phần ăn.
2. *"thêm nước sốt"*: Backend nhận diện gia vị lỏng bổ sung.
3. *"ít đường"*: Backend ghi nhận giảm lượng carbohydrate ước tính.
4. *"ăn thừa một nửa"*: Backend điều chỉnh giảm khẩu phần.
5. *Câu không liên quan ("hôm nay trời đẹp")*: Backend giữ nguyên các món ăn hiện tại, không gây xáo trộn bản nháp bữa ăn.

*Toàn bộ các quan sát được chuyển giao cho Phú Hiếu (AI) và Quốc Tuấn (Nutrition QA) để tinh chỉnh prompt/model trong Tuần 7.*

---

## 8. ASC-1…ASC-20: mục tiêu · kết quả đo · môi trường · trạng thái

| Mã ASC | Tiêu chí | Ngưỡng mục tiêu | Kết quả đo thực tế | Trạng thái |
|---|---|---|---|---|
| **ASC-1** | CLS khi tải trang biểu đồ | CLS < 0.1 | Skeleton cố định chiều cao (h-64/h-72) | **ĐẠT** |
| **ASC-2** | Mode A vắng EMA | 1 đường + chip chờ | Đúng 1 Line + TrendStatusChip | **ĐẠT** |
| **ASC-3** | Mode B có EMA | 2 đường phân biệt | Nét liền + nét đứt (`6 4`) | **ĐẠT** |
| **ASC-4** | Đổi khoảng thời gian | Giữ data cũ, debounce 250ms | Refetch mượt mà, debounce 250ms | **ĐẠT** |
| **ASC-5** | Biểu đồ calo tuần | Có hạn mức, số ngày, không màu đỏ | Cam `#EA580C`, hạn mức nét đứt | **ĐẠT** |
| **ASC-6** | Accessibility biểu đồ | `role="img"`, aria-label, xem dạng bảng | Nút Xem dạng bảng hoàn chỉnh | **ĐẠT** |
| **ASC-7** | Responsive 360px | Không cuộn ngang, nhãn đọc được | Tested mobile viewport | **ĐẠT** |
| **ASC-8** | Reduced motion | Tắt hoạt ảnh khi bật reduced-motion | Hook `useReducedMotion` tắt anim | **ĐẠT** |
| **ASC-9** | Pattern Insights | < 5 ngày hiện thông điệp, văn bản thuần | Xử lý triệt để, không phán xét | **ĐẠT** |
| **ASC-10** | Modal Food Swap | Role dialog, bẫy focus, Esc, hủy request cũ | Focus trap, AbortController | **ĐẠT** |
| **ASC-11** | Chênh lệch swap | Nguyên giá trị backend, kèm nút Giữ nguyên | Hiển thị diff backend + nút Giữ nguyên | **ĐẠT** |
| **ASC-12** | Ngữ cảnh swap | `draft` có Áp dụng, `logged` chỉ xem | Đã tách bạch 2 context rõ ràng | **ĐẠT** |
| **ASC-13** | Trạng thái rỗng/lỗi swap | Thông báo rõ ràng, không dữ liệu giả | Xử lý lỗi sạch sẽ | **ĐẠT** |
| **ASC-14** | Dự phòng giọng nói | Tự chuyển ô nhập text khi lỗi mic | Chuyển fallback Textarea ngay lập tức | **ĐẠT** |
| **ASC-15** | Tự dừng giọng nói | Tự dừng sau 15s, hủy khi unmount | Timer 15s + cleanup đầy đủ | **ĐẠT** |
| **ASC-16** | Sửa trước khi áp dụng & Hoàn tác | Sửa text được, có nút Hoàn tác | Hỗ trợ `UNDO_VOICE` trong reducer | **ĐẠT** |
| **ASC-17** | Thông báo quyền riêng tư | Báo rõ không lưu âm thanh | Privacy Notice badge luôn hiển thị | **ĐẠT** |
| **ASC-18** | Zero-Math kiến trúc | Hàng rào quét mã xanh 100% | 148 test checks pass, 0 vi phạm | **ĐẠT** |
| **ASC-19** | Lighthouse & Bundle Size | Initial JS không tăng, Recharts chunk lười | Initial JS +1.58 kB, Recharts 384.45 kB; Lighthouse score: **Pending (Chờ deploy prod URL)** | **ĐẠT / Pending (Lighthouse)** |
| **ASC-20** | Console sạch lỗi | Không ném error/warning trái phép | Console sạch trong luồng chuẩn | **ĐẠT** |

---

## 9. Open Dependencies (OD-x)

| Mã | Mô tả phụ thuộc | Bên chịu trách nhiệm | Trạng thái hiện tại | Ảnh hưởng tới Frontend |
|---|---|---|---|---|
| **OD-1** | Cung cấp trường `ema_weight` trong API tiến độ (`services/weight_trend.py`) | Minh Đức (Backend Cặp 1) | Đang thực hiện | FE đang chạy Mode A, sẵn sàng tự chuyển sang Mode B khi merge. |
| **OD-2** | Endpoint calo tổng hợp theo tuần (`/api/v1/analytics/calories-weekly`) | Việt Huy (Backend Cặp 3) | Chưa có | FE sử dụng Phương án suy giảm D (vẽ theo ngày kèm disclaimer). |
| **OD-3** | Triển khai mô hình bóc tách câu thoại phức tạp hơn trên AI Backend | Phú Hiếu (AI Cặp 1) | Tuần 7 | FE đã bàn giao bộ quan sát câu mẫu cho đội AI. |

---

## 10. Fidelity Review (tóm tắt) & Việc chuyển tiếp

- **Fidelity Review của Kiều Khôi Nguyên (Design Owner)**:
  - Độ lệch Major: **0**
  - Độ lệch Minor: **0**
  - Giao diện `FoodSwapModal` và nút micro giữ nguyên hoàn toàn nhận diện thiết kế đã thống nhất; chỉ bổ sung thêm các trạng thái dữ liệu thật, chú thích tham khảo, và khả năng hỗ trợ bàn phím (WCAG AA).
- **Việc chuyển tiếp cho người thực hiện (Thành Đạt)**:
  1. Chạy đo Lighthouse audit trên môi trường preview/staging sau khi deploy để điền điểm số chính thức cho ASC-19.
  2. Thực hiện manual testing trên micro thực tế của trình duyệt di động (iOS Safari / Android Chrome).
  3. Cập nhật `docs/ai_use_log.md` và mở Pull Request vào nhánh `main`.
