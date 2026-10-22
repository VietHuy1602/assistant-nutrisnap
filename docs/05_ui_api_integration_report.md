# BÁO CÁO TÍCH HỢP UI–API (AUTH & GOAL PLANNER) — NS-FE-W2-002
> **Dự án:** NutriSnap – Virtual AI Nutrition Assistant  
> **Học phần:** CSC10014 – Tư duy tính toán (Computational Thinking) | FIT - HCMUS  
> **Tài liệu tham chiếu:** `NS-FE-W2-002` (`docs/04_ui_api_integration_and_design_handoff_plan.md`)  
> **Nguyên tắc đo đạc:** Mọi ô đo đạc chỉ điền khi đã đo thật; chưa đo = `Pending`.

---

## 1. Tóm tắt & trạng thái Cặp 1 (Mode A/B)
- **Cặp 1 (Backend):** Được giả định **CHƯA HOÀN THÀNH** theo đúng tinh thần tài liệu `NS-FE-W2-002`.
- **Chế độ vận hành:** Chạy ở **Mode A** (Backend mock hiện tại / Unit test mock cô lập). Tuyệt đối không can thiệp hay sửa đổi bất kỳ tệp tin nào thuộc `src/backend/`.
- **Mục tiêu Track B:** Tích hợp UI–API, Contract Guard, tối ưu hóa độ mượt luồng người dùng (SAC-1..SAC-12), kiểm thử tự động toàn diện và chuẩn bị sẵn sàng cho Mode B khi Cặp 1 bàn giao.

---

## 2. Kết quả kiểm toán (A1–A11) & Remediation
*(Sẽ được điền chi tiết tại Step 1 — Kiểm toán chỉ-đọc)*

| # | Hạng mục kiểm toán | Kỳ vọng chuẩn `NS-FE-W2-001` | Kết quả thực tế | Trạng thái |
|---|---|---|---|---|
| A1 | Cơ chế phiên (Session Management) | HttpOnly Cookie + `withCredentials: true`; **không** dùng `localStorage`/`sessionStorage`/header `Authorization` | Pending | Pending |
| A2 | Cấu hình `apiClient` | `withCredentials: true`, timeout, request/response interceptors, chuẩn hóa lỗi `ApiError` | Pending | Pending |
| A3 | Trạng thái `AuthContext` | `loading/authenticated/unauthenticated`; bootstrap qua `/auth/me`; bắt sự kiện 401 | Pending | Pending |
| A4 | Điều hướng & Route Guards | `ProtectedRoute`, `PublicOnlyRoute`, `safeRedirect` ngăn chặn Open Redirect | Pending | Pending |
| A5 | Trang Đăng nhập (`LoginPage`) | Không giá trị mặc định; bắt lỗi chuẩn `detail` của FastAPI; link Đăng ký; banner hết hạn | Pending | Pending |
| A6 | Trang Đăng ký (`RegisterPage`) | Luồng `register → login → /goal-setup`; payload không gửi `confirmPassword` | Pending | Pending |
| A7 | Wizard Onboarding (`GoalPlannerWizard`) | 4 bước + kết quả; payload đúng 9 field, không `user_id`; hiển thị TDEE, Protein, Carbs, Fat | Pending | Pending |
| A8 | Nhãn minh bạch Y khoa | "Ước tính" + `DisclaimerBadge` + ghi chú nguyên văn pháp lý/y khoa của Wizard | Pending | Pending |
| A9 | Dọn dẹp mã nguồn | Xóa bỏ trang mồ côi `GoalPlannerPage.tsx`; không còn import mồ côi | Pending | Pending |
| A10 | Bộ kiểm thử tự động | Bao phủ đầy đủ schema validation, route guards, auth pages, wizard | Pending | Pending |
| A11 | Thanh điều hướng (Navbar / AppShell) | Tab "Mục tiêu" trỏ đúng về `/goal-setup` | Pending | Pending |

---

## 3. Baseline (Step 0): chunk JS/CSS, số test
Ghi nhận kết quả đo đạc thực tế tại Step 0 trên nhánh `feat/w2-pair2-ui-api-integration`:

- **Môi trường đo:** Node.js v20+, Vite v5.4.21, Vitest v2.1.9, Windows 11.
- **Kích thước Bundle ban đầu (`npm run build`):**
  - `dist/index.html`: `0.86 kB` (gzip: `0.49 kB`)
  - `dist/assets/index-CYQjT1pH.css`: `26.83 kB` (gzip: `5.49 kB`)
  - `dist/assets/index-Cnp8kKOu.js`: `378.16 kB` (gzip: **114.59 kB**)  *(Mốc baseline so sánh cho SAC-10)*
  - Thời gian build: `24.95s`
- **Kết quả kiểm thử ban đầu (`npm test`):**
  - Số file test: **10 passed / 10 total**
  - Số lượng test cases: **68 passed / 68 total (0 failed)**
  - Thời gian thực thi: `15.33s`

---

## 4. Bảng ánh xạ design token (7.3) & Design Delta
*(Do Khôi Nguyên và Thành Đạt xác nhận từ Track A — Thiết kế Figma)*

| Token | Giá trị hiện có trong mã | Giá trị Figma | Khớp? | Hành động xử lý |
|---|---|---|---|---|
| Primary | `#107C41` (`nutri-primary`) | Pending | Pending | — |
| Primary hover | `#0B522B` (`nutri-dark`) | Pending | Pending | — |
| Background | `#F8FAFC` (`nutri-surface`) | Pending | Pending | — |
| Card | `#FFFFFF`, `shadow-sm` | Pending | Pending | — |
| Text chính / phụ | `slate-900` / `slate-500` | Pending | Pending | — |
| Calo | `orange` `#EA580C` | Pending | Pending | — |
| Protein | `blue` `#2563EB` | Pending | Pending | — |
| Carbs | `amber` `#D97706` | Pending | Pending | — |
| Fat | `purple` `#7C3AED` | Pending | Pending | — |
| Lỗi / Thành công / Cảnh báo | `red` / `emerald` / `amber` | Pending | Pending | — |
| Typography | Inter (300/400/500/600/700) | Pending | Pending | — |
| Bo góc card / input / button | `rounded-2xl` / `rounded-xl` / `rounded-xl` | Pending | Pending | — |
| Khoảng cách cơ sở | Bội số 4 px (spacing system) | Pending | Pending | — |

---

## 5. Ma trận xác minh Mode A (V1–V14) — Pass/Fail/N/A-mock + bằng chứng
*(Chạy và xác minh trong Step 8)*

| # | Kịch bản kiểm chứng | Kỳ vọng chuẩn | Kiểm được trên Mock? | Kết quả Mode A | Bằng chứng / Ghi chú |
|---|---|---|---|---|---|
| V1 | Mở `/` khi chưa có cookie phiên | `GET /auth/me` trả về 401 → điều hướng `/login` | Có | Pending | |
| V2 | Đăng nhập tài khoản bất kỳ | `Set-Cookie: access_token` HttpOnly; LocalStorage rỗng; vào `/` hoặc `/goal-setup` | Có | Pending | |
| V3 | Tải lại trang (F5) sau khi đăng nhập | Giữ phiên hợp lệ, **tuyệt đối không nháy Login** (SAC-1) | Có | Pending | |
| V4 | Đăng ký tài khoản hợp lệ | Luồng `register` → tự động `login` → `/goal-setup` | Có | Pending | |
| V5 | Wizard tính & lưu mục tiêu | Hiển thị TDEE, Protein, Carbs, Fat + "Ước tính" + disclaimer | Có | Pending | |
| V6 | Kiểm tra payload `POST /goals` | Đúng 9 trường, **không** `user_id`, **không** header `Authorization` | Có | Pending | |
| V7 | Tắt Backend hoặc mất mạng rồi tải lại trang | Hiển thị màn hình mất kết nối + nút Thử lại (SAC-3, SAC-4) | Có | Pending | |
| V8 | Xóa cookie thủ công khi đang thao tác | Nhận 401 → về `/login` kèm banner thông báo phiên hết hạn | Có | Pending | |
| V9 | Đăng xuất người dùng | Xóa cookie phiên → chuyển hướng `/login` | Có | Pending | |
| V10 | Đăng nhập sai mật khẩu (401) | Hiển thị thông điệp lỗi thân thiện chuẩn | Không (B1) | N/A-mock | Backend mock chấp nhận mọi tài khoản; kiểm chứng qua unit test |
| V11 | Đăng ký tài khoản đã tồn tại (409) | Hiển thị lỗi form hoặc field trùng lặp | Không | N/A-mock | Kiểm chứng qua unit test |
| V12 | Lưu mục tiêu rồi đọc lại từ database | Dữ liệu mục tiêu khớp chính xác | Không (B4) | N/A-mock | Mock backend không lưu DB; kiểm chứng qua unit test |
| V13 | Hai tài khoản không thấy dữ liệu của nhau | Cô lập dữ liệu Zero-Trust (IDOR mitigation) | Không (B2, B4) | N/A-mock | Mock backend luôn trả id=1; kiểm chứng qua unit test |
| V14 | Cookie giả mạo gửi lên server | Bị từ chối với mã 401 | Không (B2) | N/A-mock | Lỗ hổng B2 của mock backend; kiểm chứng qua unit test |

---

## 6. Checklist Mode B (W1–W11) & Integration Readiness Gate — Pending
*(Kích hoạt khi Cặp 1 bàn giao Backend thật)*

- **Integration Readiness Gate:**
  - [ ] 1. Dòng 19–20 được Cặp 1 hoàn thành và merge vào `main`.
  - [ ] 2. `get_current_user` giải mã JWT thật, từ chối token giả mạo (401).
  - [ ] 3. Đăng ký/đăng nhập kết nối CSDL SQLite thật với bcrypt băm mật khẩu.
  - [ ] 4. `POST/GET /goals` lưu và truy vấn theo `user_id` xác thực từ JWT.
  - [ ] 5. Chuẩn hóa mã phản hồi lỗi (400/401/409/422).

| # | Kịch bản kiểm tra Mode B | Tiêu chí kỳ vọng | Trạng thái |
|---|---|---|---|
| W1 | Thuộc tính `Set-Cookie` khi đăng nhập | `HttpOnly`, `Path=/`, `SameSite=Lax`, `Max-Age`, `Secure` | Pending |
| W2 | Cấu hình CORS Preflight | `allow_origins` khớp origin Frontend, `allow_credentials=True` | Pending |
| W3 | Đăng nhập sai mật khẩu | `401 Unauthorized` + chuỗi `detail` | Pending |
| W4 | Đăng ký tài khoản trùng lặp | `409 Conflict` (hoặc `400`) + `detail` | Pending |
| W5 | Mật khẩu không đủ mạnh | `422 Unprocessable Entity` + mảng `detail` chứa `loc` | Pending |
| W6 | Cookie phiên hết hạn hoặc không hợp lệ | `401 Unauthorized` | Pending |
| W7 | `GET /goals` khi người dùng mới chưa tạo mục tiêu | Trả về `has_goal=false` hoặc 404 có cấu trúc | Pending |
| W8 | Chu trình tạo và đọc lại mục tiêu (`POST` → `GET`) | Dữ liệu lưu trữ chính xác 100% | Pending |
| W9 | Cô lập dữ liệu đa người dùng (User Isolation) | Người dùng B không thấy dữ liệu mục tiêu của Người dùng A | Pending |
| W10 | Kiểm tra bảo vệ chống CSRF | Từ chối yêu cầu từ Origin không hợp lệ (`403 Forbidden`) | Pending |
| W11 | Kiểm tra tính tuân thủ Contract Guard | Chế độ `strict`: không phát sinh lỗi `CONTRACT_MISMATCH` | Pending |

---

## 7. Smoothness (SAC-1…SAC-12): mục tiêu · kết quả đo · môi trường đo · trạng thái

| Mã | Mục tiêu chất lượng ("Chạy mượt") | Kết quả đo thực tế | Môi trường đo kiểm | Trạng thái |
|---|---|---|---|---|
| **SAC-1** | Tải lại trang khi đã đăng nhập: **không** thấy màn hình Login nhấp nháy (không FOUC) | Pending | Chrome DevTools (Fast 3G / No Throttling) | Pending |
| **SAC-2** | Spinner/Splash chỉ hiển thị nếu tác vụ tải kéo dài > **150 ms** | Pending | Đo đạc hook `useDelayedFlag` | Pending |
| **SAC-3** | Backend tắt/mất mạng → hiển thị màn hình *Mất kết nối + Thử lại*, **không** văng ra `/login` | Pending | Kiểm thử trạng thái `unreachable` | Pending |
| **SAC-4** | Bấm "Thử lại" khi kết nối phục hồi → chuyển tiếp đúng trang mục tiêu tự động | Pending | Kiểm thử tương tác phục hồi | Pending |
| **SAC-5** | Không có request `/auth/me` trùng lặp (in-flight request deduplication) | Pending | DevTools Network Tab | Pending |
| **SAC-6** | Không phát sinh lỗi console hoặc React warning trong luồng chuẩn | Pending | DevTools Console | Pending |
| **SAC-7** | Lighthouse Mobile trên trang `/login` (`build + preview`): Perf ≥ 90, A11y ≥ 95, BP ≥ 95 | Pending | Chrome Lighthouse Mobile (Cần người đo) | Pending |
| **SAC-8** | Chỉ số Core Web Vitals: **CLS < 0.1**, **INP < 200 ms** trên `/login` và Wizard | Pending | DevTools Performance (Cần người đo) | Pending |
| **SAC-9** | Chuyển bước Wizard: phản hồi thị giác < 150 ms, transition 150–200 ms, tôn trọng `prefers-reduced-motion` | Pending | Đo animation CSS & state transition | Pending |
| **SAC-10** | Kích thước Initial JS (gzip) giảm **≥ 15%** so với baseline (114.59 kB) nhờ Route Code-Splitting | Pending | Kết quả `npm run build` sau Step 5 | Pending |
| **SAC-11** | Khu vực kết quả Wizard sử dụng **Skeleton loading**, không nhảy giật bố cục khi dữ liệu về | Pending | Layout Shift inspection | Pending |
| **SAC-12** | Form hỗ trợ 100% phím bấm (A11y keyboard), chặn double-submit, bảo toàn form state khi lỗi | Pending | Unit & Integration tests | Pending |

---

## 8. Open Dependencies (OD-x)

| ID | Phụ thuộc vào | Chủ sở hữu | Yêu cầu cần đáp ứng | Ngày phát hiện | Tác động lên Frontend | Hướng xử lý tạm thời | Trạng thái |
|---|---|---|---|---|---|---|---|
| **OD-1** | Backend Authentication hoàn chỉnh | Minh Đức (Cặp 1) | Mã hóa mật khẩu bcrypt, phát hành JWT thật, `get_current_user` giải mã thật | 23/10/2026 | Không test được kịch bản 401/409/cô lập đa người dùng trực tiếp trên live backend | Sử dụng Mode A và bộ kiểm thử giả lập Unit Tests | ☐ Đang mở (Open) |
| **OD-2** | Module Goal Service lưu trữ theo `user_id` | Việt Huy (Cặp 1) | `POST/GET /goals` lưu DB và phân tách theo `user_id`; xác định hợp đồng khi chưa có mục tiêu | 23/10/2026 | Chưa kiểm tra được kịch bản lưu và nạp lại mục tiêu thật | Sử dụng Mode A | ☐ Đang mở (Open) |
| **OD-3** | Kích hoạt middleware CSRF | Minh Đức (Cặp 1) | Áp dụng `verify_csrf_protection` trên các tuyến đường nhạy cảm | 23/10/2026 | Chưa kiểm thử được phản hồi 403 Forbidden | Đánh dấu N/A trên mock | ☐ Đang mở (Open) |
| **OD-4** | Trả lại thông số profile trong `GoalResponse` | Việt Huy (Cặp 1) | Bổ sung các trường `gender`, `age`, `height_cm` vào response để tự động điền form khi sửa mục tiêu | 23/10/2026 | Form Wizard phải nhập lại từ đầu nếu người dùng muốn cập nhật | Đề xuất bổ sung trong spec | ☐ Đề xuất (Proposed) |

---

## 9. Fidelity Review (tóm tắt) & Việc chuyển tiếp
- **Design Review (Khôi Nguyên):** Chờ hoàn thiện gói bàn giao thiết kế Figma Track A và thực hiện so sánh đối chiếu tại các mốc 360px, 768px, 1280px.
- **Việc chuyển tiếp:**
  - Hoàn thành Step 1 đến Step 10 của Track B.
  - Sau khi Cặp 1 hợp nhất mã backend vào nhánh chính, kích hoạt checklist Mode B để nghiệm thu kết nối hoàn chỉnh.
