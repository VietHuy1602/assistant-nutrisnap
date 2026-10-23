# NUTRISNAP — BÀN GIAO THIẾT KẾ & TÍCH HỢP UI–API (AUTH & GOAL PLANNER)
## Kế hoạch Pair Session 2 — Cặp 2 (Implementation Plan & Agent Brief)

| Thuộc tính | Giá trị |
|---|---|
| **Mã tài liệu** | `NS-FE-W2-002` · Phiên bản `1.0.0` · Trạng thái: **Ready for Implementation** |
| **Dự án / Môn học** | NutriSnap – Virtual AI Nutrition Assistant · CSC10014 – Tư duy tính toán (FIT – HCMUS) |
| **Hạng mục theo bảng phân công** | Tuần 2 · Cặp 2 · *Khôi Nguyên + Thành Đạt* · "Pair Session 2: Bàn giao thiết kế màn hình Đăng nhập & Goal Planner; kết nối giao diện React với API của Cặp 1" |
| **Đầu ra yêu cầu** | **UI Auth & Goal chạy mượt** |
| **Thời lượng buổi làm việc** | 2,5 giờ làm việc cặp (theo đặc tả PDF) + công việc cá nhân bổ trợ |
| **Design Owner** | Kiều Khôi Nguyên (25127107) |
| **Implementation Owner** | Lê Thành Đạt (25127293) |
| **Phụ thuộc phía Backend** | Cặp 1 — Minh Đức (Auth, `dòng 19–20`), Việt Huy (Goal service) — **giả định CHƯA hoàn thành** |
| **Tài liệu tiền đề** | `NS-FE-W2-001` (`docs/03_frontend_auth_goal_wizard_plan.md`) — kế hoạch Login/Register/Wizard |
| **Nhánh làm việc** | `feat/w2-pair2-ui-api-integration` (tách từ `main` mới nhất) |
| **Vị trí file** | `docs/04_ui_api_integration_and_design_handoff_plan.md` |

### Mục lục
0. [Hướng dẫn sử dụng với Antigravity IDE (Agent Brief)](#0-hướng-dẫn-sử-dụng-với-antigravity-ide-agent-brief)
1. [Tóm tắt điều hành & Bối cảnh](#1-tóm-tắt-điều-hành--bối-cảnh)
2. [Chiến lược tích hợp khi Cặp 1 chưa hoàn thành (ADR)](#2-chiến-lược-tích-hợp-khi-cặp-1-chưa-hoàn-thành-adr)
3. [Phạm vi, Sản phẩm bàn giao & Phân vai (RACI)](#3-phạm-vi-sản-phẩm-bàn-giao--phân-vai-raci)
4. [Định nghĩa "Chạy mượt" — Smoothness Acceptance Criteria](#4-định-nghĩa-chạy-mượt--smoothness-acceptance-criteria-sac)
5. [Ràng buộc bắt buộc (Guardrails)](#5-ràng-buộc-bắt-buộc-guardrails)
6. [Lịch trình buổi Pair Session 2 (150 phút)](#6-lịch-trình-buổi-pair-session-2-150-phút)
7. [Track A — Bàn giao thiết kế (Design Handoff)](#7-track-a--bàn-giao-thiết-kế-design-handoff)
8. [Track B — Kế hoạch triển khai tích hợp (Step 0 → Step 10)](#8-track-b--kế-hoạch-triển-khai-tích-hợp-step-0--step-10)
9. [Ma trận xác minh tích hợp (Mode A / Mode B)](#9-ma-trận-xác-minh-tích-hợp-mode-a--mode-b)
10. [Quality Gates & Definition of Done](#10-quality-gates--definition-of-done)
11. [Quy trình Git, Commit Plan & mẫu Pull Request](#11-quy-trình-git-commit-plan--mẫu-pull-request)
12. [Nhật ký sử dụng AI (bắt buộc)](#12-nhật-ký-sử-dụng-ai-bắt-buộc)
13. [Rủi ro, Phụ thuộc & Giao thức xử lý blocker](#13-rủi-ro-phụ-thuộc--giao-thức-xử-lý-blocker)
14. [Phụ lục kỹ thuật](#14-phụ-lục-kỹ-thuật)

---

## 0. Hướng dẫn sử dụng với Antigravity IDE (Agent Brief)

**Thứ tự đọc bắt buộc đối với Agent** (không bỏ qua file nào):

1. `.antigravityrules` (luôn ưu tiên cao nhất)
2. File này (`docs/04_...`) và tài liệu tiền đề `docs/03_frontend_auth_goal_wizard_plan.md`
3. `docs/01_security_architecture.md` §2–§3 · `docs/02_api_contract_and_screen_flows.md` §1, §2.1, §2.2, §3, §4.1, §4.2
4. `src/backend/schemas/api_contract.py`, `src/backend/services/auth_guard.py`, `src/backend/main.py` (chỉ **đọc** để hiểu hành vi backend hiện tại)
5. Toàn bộ `src/frontend/src/` và `src/frontend/package.json`

**Phân biệt hai luồng công việc — rất quan trọng**

| Luồng | Người thực hiện | Nội dung |
|---|---|---|
| **Track A – Design Handoff** | **Con người** (Khôi Nguyên chủ trì, Thành Đạt tham gia) | Hoàn thiện Figma, đóng gói bàn giao, nghiệm thu độ khớp thiết kế. **Agent không chỉnh sửa Figma.** |
| **Track B – Integration** | **Agent (Antigravity)** dưới sự giám sát của Thành Đạt | Kiểm toán mã hiện có, khóa hợp đồng API, tăng độ bền kết nối, tối ưu độ mượt, kiểm thử, tài liệu, PR |

**Prompt khởi động gợi ý** (dán vào Antigravity):

```text
Bạn là Frontend Engineer của dự án NutriSnap. Hãy đọc .antigravityrules,
docs/03_frontend_auth_goal_wizard_plan.md và docs/04_ui_api_integration_and_design_handoff_plan.md.
Chỉ thực hiện TRACK B (mục 8), tuần tự Step 0 → Step 10.
Quy tắc:
- Step 1 là KIỂM TOÁN CHỈ-ĐỌC. Dừng lại và báo cáo kết quả kiểm toán trước khi sửa bất cứ file nào.
- Cặp 1 (Backend) được coi là CHƯA HOÀN THÀNH: chạy ở Mode A (backend mock hiện tại), tuyệt đối không sửa src/backend.
- Mỗi Step = 1 commit theo Commit Plan (mục 11.2); chạy Quality Gate (npm run build, npm test) trước khi sang Step kế.
- Không đọc/tạo/ghi .env hoặc .env.local; chỉ cập nhật .env.example.
- Không điền số liệu đo đạc (Lighthouse, thời gian, kết quả Mode B) nếu chưa thực sự đo; ghi "Pending".
- Gặp tình huống STOP & ASK (mục 8.12) thì DỪNG và báo cáo.
- Kết thúc: in báo cáo theo mẫu ở mục 8.11 và nhắc tôi cập nhật docs/ai_use_log.md.
```

> **Quy ước ngôn ngữ:** giao diện tiếng Việt; tên biến/hàm/file tiếng Anh; comment ngắn, giải thích *vì sao*.

---

## 1. Tóm tắt điều hành & Bối cảnh

### 1.1. Trạng thái bảng phân công (căn cứ ảnh chụp)

| Dòng | Hạng mục | Người | Trạng thái |
|---|---|---|---|
| 19 | `auth_service.py` — băm mật khẩu, cấp JWT | Minh Đức (Cặp 1) | ☐ **Chưa xong** |
| 20 | `POST /auth/register`, `POST /auth/login`, `get_current_user()` | Minh Đức (Cặp 1) | ☐ **Chưa xong** |
| **21** | **Pair Session 2: bàn giao thiết kế & kết nối UI–API** | **Khôi Nguyên + Thành Đạt** | ☐ **Hạng mục của tài liệu này** |
| 22 | Thiết kế chi tiết Smart Goal Planner, Camera, Plate Canvas trên Figma | Khôi Nguyên | ☑ Đã xong |
| 23 | `LoginPage.tsx`, `RegisterPage.tsx`, Axios Interceptor | Thành Đạt | ☑ Đã xong |
| 24 | `GoalPlannerWizard.tsx` | Thành Đạt | ☑ Đã xong (giả định) |

### 1.2. Bài toán
Task 21 là **điểm hội tụ** giữa ba nhánh công việc: thiết kế (dòng 22), giao diện (dòng 23–24) và API Backend (dòng 19–20). Vì dòng 19–20 chưa xong, buổi làm việc này phải đạt được hai điều đồng thời:

1. **Chứng minh UI đúng thiết kế và chạy mượt** ngay bây giờ — trên backend mock hiện có.
2. **Khóa chặt hợp đồng API** để khi Cặp 1 bàn giao, việc kết nối thật chỉ còn là *chạy checklist*, không phải *sửa Frontend*.

### 1.3. Hiện trạng Backend mà Frontend phải sống chung (đã rà soát `main.py`, `auth_guard.py`)

| # | Hành vi hiện tại (mock) | Hệ quả cho Frontend |
|---|---|---|
| B1 | `POST /auth/login` chấp nhận **mọi** tài khoản/mật khẩu, đặt cookie cố định | Không thể kiểm thử nhánh "sai mật khẩu → 401" trên mock |
| B2 | `get_current_user` chấp nhận **mọi** cookie dài ≥ 15 ký tự, luôn trả `id=1` | Không thể kiểm thử cô lập người dùng; **lỗ hổng bảo mật — Cặp 1 phải sửa** |
| B3 | `POST /auth/register` không lưu dữ liệu, **không đặt cookie** | Sau đăng ký phải gọi `login` (đã có trong `NS-FE-W2-001`) |
| B4 | `GET/POST /goals` trả dữ liệu cố định, không lưu | Không kiểm thử được "lưu rồi đọc lại" |
| B5 | Ví dụ response trong `docs/02` §4.1 **không có** `created_at`/`has_goal` ở một số endpoint, trong khi `UserPublicResponse` yêu cầu `created_at` | Frontend phải là **tolerant reader** (mục 2, ADR-T2) |
| B6 | `verify_csrf_protection` đã định nghĩa nhưng **chưa gắn** vào route nào | Không kiểm thử được phản hồi `403` |

> Các điểm B1–B4, B6 là **nợ của Cặp 1**, không phải lỗi Frontend. Ghi vào bảng "Open Dependencies" (mục 13.2), không tự sửa backend.

---

## 2. Chiến lược tích hợp khi Cặp 1 chưa hoàn thành (ADR)

### ADR-T1 — Hai chế độ vận hành: Mode A (hiện tại) và Mode B (Backend thật)

| | **Mode A — Backend mock** | **Mode B — Backend thật của Cặp 1** |
|---|---|---|
| Khi nào | **Bây giờ** (dòng 19–20 chưa xong) | Sau khi Cặp 1 đáp ứng *Integration Readiness Gate* (mục 9.3) |
| Mục tiêu | Chứng minh UI đúng thiết kế, mượt, xử lý lỗi đúng — bằng test tự động + mock | Xác nhận hợp đồng thật khớp UI — bằng checklist |
| Thay đổi mã Frontend khi chuyển Mode | **Không** (chỉ khởi động lại backend) | — |
| Kết quả | Báo cáo Mode A: **Pass / Fail** | Báo cáo Mode B: **Pass / Fail / Blocked** |

Nguyên tắc: **một bộ mã Frontend duy nhất** chạy được ở cả hai chế độ. Không rẽ nhánh `if (mock)` trong mã nguồn ứng dụng.

### ADR-T2 — Contract Guard: kiểm tra hợp đồng tại ranh giới mạng
Mọi response từ API đi qua một lớp kiểm tra (Zod) trước khi vào UI.
- **Tolerant Reader (Postel):** bỏ qua field thừa; trường *không được đảm bảo* bởi tài liệu (`created_at`, `has_goal` ở register) → `optional`/`default`. Trường *UI bắt buộc phải có* (`tdee_calories`, `target_protein_g`, `target_carbs_g`, `target_fat_g`, `user.id`, `user.username`) → bắt buộc.
- Sai lệch → ném `ContractError` với mã `CONTRACT_MISMATCH` và danh sách field sai; UI hiển thị thông điệp thân thiện, console (chỉ ở dev) in chi tiết.
- Chế độ qua `VITE_CONTRACT_MODE`: `warn` (log + vẫn trả dữ liệu — mặc định khi tích hợp) | `strict` (ném lỗi).
- **Lợi ích:** khi Cặp 1 bàn giao, mọi sai khác hợp đồng lộ ra ngay lập tức với thông báo rõ ràng, thay vì lỗi `undefined` khó truy vết.

### ADR-T3 — Cơ chế phiên: HttpOnly Cookie (tiếp nối ADR-001 của NS-FE-W2-001)
Bảng phân công dòng 23 vẫn ghi "lưu JWT vào localStorage" (đã tick hoàn thành). Điều này **mâu thuẫn** với PDF §3.2/§4.4, `docs/01_security_architecture.md` và `auth_guard.py` (chỉ đọc cookie). **Step 1 (kiểm toán)** phải xác định mã hiện tại đang dùng cơ chế nào; nếu còn `localStorage`/`Authorization` thì thực hiện **Remediation R1** (mục 8, Step 1) trước mọi việc khác.

### ADR-T4 — Phân biệt "không xác thực" với "không kết nối được"
Lỗi `401` từ `/auth/me` → chuyển `/login`. **Lỗi mạng/timeout/5xx** → **không** chuyển `/login` (sẽ làm người dùng tưởng bị đăng xuất); hiển thị màn hình "Không thể kết nối máy chủ" kèm nút **Thử lại**. Đây là yếu tố then chốt của cảm giác "mượt" khi Backend chưa ổn định.

### ADR-T5 — Thư viện bổ sung
**Không thêm thư viện mới** ngoài danh sách đã duyệt trong `NS-FE-W2-001` (react-hook-form, zod, @hookform/resolvers, vitest, jsdom, @testing-library/*). Không thêm MSW, Playwright, axios-retry, Lighthouse CLI. Nếu thấy cần → **STOP & ASK**.

### ADR-T6 — Kết quả đo đạc không được bịa
Theo tinh thần `docs/qa_evaluation_plan.md` (tách "Target" và "Measured"): mọi ngưỡng trong mục 4 là **mục tiêu**; ô kết quả chỉ được điền khi đã đo thật, ngược lại ghi `Pending`.

---

## 3. Phạm vi, Sản phẩm bàn giao & Phân vai (RACI)

### 3.1. Trong phạm vi
- **Track A:** hoàn thiện và bàn giao thiết kế Figma cho **Đăng nhập, Đăng ký, Goal Planner Wizard (4 bước + kết quả)**; nghiệm thu độ khớp UI–Figma.
- **Track B:** kiểm toán mã hiện có; Contract Guard; xử lý kết nối bền vững; tối ưu độ mượt; kiểm thử tích hợp; báo cáo tích hợp; PR.

### 3.2. Ngoài phạm vi
Sửa `src/backend/**` · Camera/MealCapture · Chat Drawer (giữ nguyên) · Dashboard · Docker · thay đổi cơ chế xác thực phía server · thêm tính năng mới ngoài Auth/Goal.

### 3.3. Phạm vi file được phép chỉnh sửa
```text
src/frontend/**                                   (trừ node_modules/, dist/)
docs/05_ui_api_integration_report.md              (NEW — báo cáo tích hợp)
docs/ai_use_log.md                                (chỉ thêm 1 dòng)
docs/04_ui_api_integration_and_design_handoff_plan.md  (chỉ cập nhật trạng thái)
```
Cấm: sửa `src/backend/**`, `src/ai/**`, `.antigravityrules`, `.gitignore`, `requirements.txt`; tạo thư mục theo tuần/cá nhân; commit ảnh chụp màn hình thô (đính kèm vào PR trên GitHub).

### 3.4. Sản phẩm bàn giao

| Mã | Sản phẩm | Chủ trì | Tiêu chí nghiệm thu rút gọn |
|---|---|---|---|
| **D1** | **Gói bàn giao thiết kế (Design Handoff Package)** | Khôi Nguyên | Đủ 8 mục checklist mục 7.2; có chữ ký nghiệm thu hai bên |
| **D2** | **Contract Guard** + hợp đồng kiểu tập trung | Thành Đạt (Agent) | Mọi response Auth/Goal đi qua Zod; test fixture khớp `docs/02` §4 |
| **D3** | **Kết nối bền vững** (bootstrap không nhấp nháy, màn hình mất kết nối, retry GET) | Thành Đạt (Agent) | SAC-1…SAC-6 đạt |
| **D4** | **Tối ưu độ mượt** (lazy route, chuyển bước, skeleton) | Thành Đạt (Agent) | SAC-7…SAC-12 đạt |
| **D5** | **Báo cáo tích hợp** `docs/05_ui_api_integration_report.md` | Cặp 2 | Đủ các mục; số liệu thật hoặc `Pending` |
| **D6** | **Nghiệm thu độ khớp thiết kế** | Khôi Nguyên | Bảng Fidelity Review không còn lệch mức *Major* |
| **D7** | **PR + AI-use log** | Thành Đạt | Có Approve của Khôi Nguyên |

### 3.5. Ma trận RACI

| Hoạt động | Khôi Nguyên | Thành Đạt | Agent | Cặp 1 |
|---|---|---|---|---|
| Hoàn thiện Figma Login/Register/Wizard | **A/R** | C | — | — |
| Đóng gói bàn giao thiết kế (D1) | **A/R** | C | — | — |
| Kiểm toán mã hiện có (Step 1) | I | **A** | **R** | — |
| Contract Guard, kết nối bền vững, tối ưu (Step 3–6) | C | **A** | **R** | — |
| Kiểm thử tự động (Step 7) | I | **A** | **R** | — |
| Chạy kiểm thử tích hợp & đo đạc (Step 8–9) | C | **A/R** | S | — |
| Fidelity Review & nghiệm thu thiết kế (D6) | **A/R** | C | — | — |
| Sửa lỗi hợp đồng Backend (B1–B6) | I | I | — | **A/R** |
| Review PR | **R** | **A** | — | — |

*(R = Responsible, A = Accountable, C = Consulted, I = Informed, S = Support)*

---

## 4. Định nghĩa "Chạy mượt" — Smoothness Acceptance Criteria (SAC)

"UI Auth & Goal chạy mượt" được nghiệm thu bằng 12 tiêu chí đo kiểm được. **Ngưỡng là mục tiêu; kết quả chỉ ghi sau khi đo thật.**

### 4.1. Độ ổn định luồng (không giật, không nhấp nháy)

| Mã | Tiêu chí | Cách kiểm |
|---|---|---|
| **SAC-1** | Tải lại trang khi **đã đăng nhập**: **không** thấy màn hình Login nhấp nháy (không FOUC) | Quay màn hình / throttle Network "Slow 3G" |
| **SAC-2** | Spinner chỉ hiện nếu thao tác > **150 ms** (tránh nháy) | Quan sát với Network nhanh |
| **SAC-3** | Backend tắt → ứng dụng hiện màn hình *mất kết nối + Thử lại*, **không** văng ra `/login` | Tắt uvicorn rồi tải lại |
| **SAC-4** | Bấm Thử lại khi Backend bật lại → vào đúng trang, không cần tải lại thủ công | Thủ công |
| **SAC-5** | Không có request `/auth/me` trùng lặp ngoài hành vi `StrictMode` ở dev | Tab Network |
| **SAC-6** | Không có lỗi/cảnh báo React hoặc console trong luồng chuẩn (login → wizard → kết quả) | Console |

### 4.2. Hiệu năng cảm nhận

| Mã | Tiêu chí (mục tiêu) | Cách kiểm |
|---|---|---|
| **SAC-7** | Lighthouse **mobile**, bản `build + preview`, `/login`: Performance **≥ 90**, Accessibility **≥ 95**, Best Practices **≥ 95** | Chrome DevTools → Lighthouse (người thực hiện) |
| **SAC-8** | **CLS < 0.1**, **INP < 200 ms** trên `/login` và Wizard | DevTools Performance / Lighthouse |
| **SAC-9** | Chuyển bước Wizard: phản hồi thị giác **< 150 ms**, animation 150–200 ms, tắt khi `prefers-reduced-motion` | Performance panel |
| **SAC-10** | Initial JS (gzip) **giảm ≥ 15 %** so với baseline đo ở Step 0 nhờ lazy route (nếu không đạt, ghi nguyên nhân) | Kết quả `npm run build` |
| **SAC-11** | Khu vực kết quả Wizard dùng **skeleton**, không nhảy bố cục khi dữ liệu về | Quan sát + CLS |
| **SAC-12** | Điền & gửi form hoàn toàn bằng bàn phím; double-submit bị chặn; không mất dữ liệu khi lỗi | Thủ công + test |

---

## 5. Ràng buộc bắt buộc (Guardrails)

### 5.1. MUST
- **M1.** Mọi request đi qua duy nhất `apiClient` (`withCredentials: true`). Không gọi `fetch`/`axios` trực tiếp trong component.
- **M2.** Trạng thái đăng nhập suy ra từ `GET /auth/me` (không từ storage hay biến cục bộ).
- **M3.** Mọi response Auth/Goal đi qua **Contract Guard** trước khi vào state/UI.
- **M4.** Số dinh dưỡng luôn kèm nhãn **"Ước tính"** + `DisclaimerBadge`; Wizard giữ nguyên văn: *"Đây là công cụ ước tính lộ trình tham khảo, không thay thế chỉ định y khoa."*
- **M5.** Màu/kiểu chữ/bo góc/bóng lấy từ **design token** (mapping từ Figma, mục 7.3), không dùng giá trị tùy ý rải rác trong component mới.
- **M6.** TypeScript `strict`; không `any`, `@ts-ignore`; `catch (e: unknown)`.
- **M7.** Mọi trạng thái UI đều được thiết kế & cài đặt: mặc định · focus · loading · lỗi field · lỗi form · thành công · mất kết nối · phiên hết hạn.
- **M8.** Điều hướng sau đăng nhập chỉ chấp nhận đường dẫn nội bộ (`safeRedirect`).

### 5.2. MUST NOT
- **N1.** `localStorage`/`sessionStorage`/`IndexedDB`/`document.cookie` cho token hay credential; header `Authorization` thủ công.
- **N2.** Sửa bất kỳ file nào trong `src/backend/` hoặc "vá" lỗi backend ở Frontend (ví dụ chặn token giả) — chỉ **báo cáo**.
- **N3.** Rẽ nhánh `if (mockBackend)` trong mã ứng dụng; hard-code tài khoản demo; log mật khẩu/payload nhạy cảm.
- **N4.** Tự tính BMR/TDEE/macro/BMI ở Frontend.
- **N5.** Làm yếu/xóa test để build xanh; điền số liệu đo chưa thực hiện.
- **N6.** Commit `.env`, `node_modules/`, `dist/`, ảnh chụp màn hình; push thẳng lên `main`.

---

## 6. Lịch trình buổi Pair Session 2 (150 phút)

| Thời gian | Nội dung | Khôi Nguyên | Thành Đạt (+ Agent) | Đầu ra |
|---|---|---|---|---|
| **0:00 – 0:15** | **Khởi động & thống nhất phạm vi** | Xác nhận danh sách frame cần bàn giao | Chạy Step 0; công bố trạng thái Mode A | Biên bản ngắn: phạm vi + giả định "Cặp 1 chưa xong" |
| **0:15 – 0:45** | **Bàn giao thiết kế (Track A)** | Trình bày Figma: frame, token, trạng thái, copy | Đặt câu hỏi, đối chiếu với mã hiện có (Step 1 chạy song song) | D1 bản nháp + danh sách *Design Delta* |
| **0:45 – 1:45** | **Tích hợp & tối ưu (Track B)** | Review trực tiếp UI khi Agent hoàn thành từng Step | Step 2 → Step 6 (Agent), kiểm tra từng commit | Contract Guard, kết nối bền vững, tối ưu |
| **1:45 – 2:15** | **Xác minh & nghiệm thu** | Fidelity Review ở 360/768/1280 px | Step 7 → Step 9: test, ma trận Mode A, đo đạc | D5, D6 bản nháp |
| **2:15 – 2:30** | **Chốt & bàn giao** | Ký nghiệm thu thiết kế | Step 10: PR, AI-log; cập nhật bảng Open Dependencies | D7, bảng phân công cập nhật |

> Nếu hết giờ mà chưa xong: **ưu tiên theo thứ tự** D1 → D3 (kết nối bền vững) → D2 → D6 → D4 → D5. Phần còn lại ghi vào mục "Việc chuyển tiếp" của báo cáo.

---

## 7. Track A — Bàn giao thiết kế (Design Handoff)

> **Đối tượng thực hiện: con người.** Agent chỉ *đọc* kết quả (nếu có Figma MCP hoặc bản xuất) để lập bảng token ở Step 2.

### 7.1. Danh mục frame bắt buộc

| Màn hình | Frame/biến thể cần có (Desktop 1280 + Mobile 360) |
|---|---|
| **Đăng nhập** | Mặc định · Focus · Lỗi field · Lỗi form (sai thông tin) · Đang tải · Phiên hết hạn · Mất kết nối |
| **Đăng ký** | Mặc định · Mật khẩu yếu (checklist quy tắc) · Lỗi trùng tài khoản · Đang tải · Thành công → chuyển Wizard |
| **Goal Wizard — Bước 1** Thông số cơ thể | Mặc định · Lỗi field · Thẻ mức vận động (4–5 lựa chọn) |
| **Goal Wizard — Bước 2** Mục tiêu | 3 biến thể `lose_weight` / `maintain` (ẩn ô cân nặng mục tiêu) / `gain_muscle` |
| **Goal Wizard — Bước 3** Kiểm tra an toàn | Slider tốc độ (khoảng an toàn theo mục tiêu) · Ngân sách (mặc định 60.000 VNĐ) |
| **Goal Wizard — Bước 4** Xác nhận | Tóm tắt + nút "Sửa" từng nhóm · Đang lưu · Lỗi lưu |
| **Goal Wizard — Kết quả** | Skeleton · Đã có dữ liệu (TDEE, BMR, Hạn mức, Protein, Carbs, Fat, Ngân sách) · Có cảnh báo bổ sung từ `disclaimer` |
| **Dùng chung** | Màn hình mất kết nối + Thử lại · Splash khi kiểm tra phiên · Banner thông báo (thành công/lỗi/thông tin) |

> **Khoảng trống đã biết:** wireframe ban đầu (PDF §3.1) chỉ có 4 màn hình (Đăng nhập, Goal Planner, Camera, Chat) — **chưa có frame Đăng ký** và **chưa có các trạng thái lỗi/mất kết nối**. Khôi Nguyên bổ sung trong buổi này.

### 7.2. Checklist Gói bàn giao (D1) — đủ 8 mục mới được ký

| # | Hạng mục | Mô tả | ☐ |
|---|---|---|---|
| 1 | **Liên kết Figma** | Link tới file, trang `Auth` & `Goal Planner`, quyền *Can view* cho cả nhóm | ☐ |
| 2 | **Frame đặt tên chuẩn** | Quy ước `Screen/State/Breakpoint`, ví dụ `Login/Error/360` | ☐ |
| 3 | **Design token** | Màu, kiểu chữ, khoảng cách, bo góc, bóng (xuất bảng — mục 7.3) | ☐ |
| 4 | **Thư viện component** | Button, Input, PasswordInput, Select, RadioCard, Slider, Stepper, Alert, Skeleton, Badge "Ước tính" — kèm trạng thái | ☐ |
| 5 | **Copy deck** | Toàn bộ chuỗi tiếng Việt (nhãn, placeholder, lỗi, trợ giúp) trong một bảng | ☐ |
| 6 | **Đặc tả tương tác** | Chuyển bước, validate khi nào (onTouched/onSubmit), focus sau lỗi, hành vi Enter/Esc | ☐ |
| 7 | **Ghi chú truy cập** | Thứ tự Tab, tương phản đạt AA, kích thước chạm ≥ 40 px, nhãn ARIA đặc biệt | ☐ |
| 8 | **Tài sản (assets)** | Icon (đã có Lucide → chỉ liệt kê tên), logo, ảnh minh họa (nếu có) dạng SVG | ☐ |

### 7.3. Bảng ánh xạ Design Token → Tailwind (Agent lập ở Step 2, Khôi Nguyên xác nhận)

Nguồn hiện có: `docs/02` §1.1 và `tailwind.config.js`. Cột "Figma" do Khôi Nguyên điền.

| Token | Giá trị hiện có trong mã | Giá trị Figma | Khớp? | Hành động |
|---|---|---|---|---|
| Primary | `#107C41` (`nutri-primary`) | ☐ | ☐ | — |
| Primary hover | `#0B522B` (`nutri-dark`) | ☐ | ☐ | — |
| Background | `#F8FAFC` (`nutri-surface`) | ☐ | ☐ | — |
| Card | `#FFFFFF`, `shadow-sm` | ☐ | ☐ | — |
| Text chính / phụ | `slate-900` / `slate-500` | ☐ | ☐ | — |
| Calo | `orange` `#EA580C` | ☐ | ☐ | — |
| Protein | `blue` `#2563EB` | ☐ | ☐ | — |
| Carbs | `amber` `#D97706` | ☐ | ☐ | — |
| Fat | `purple` `#7C3AED` | ☐ | ☐ | — |
| Lỗi / Thành công / Cảnh báo | `red` / `emerald` / `amber` | ☐ | ☐ | — |
| Font | Inter (300/400/500/600/700) | ☐ | ☐ | — |
| Bo góc thẻ / input / nút | `rounded-2xl` / `rounded-xl` / `rounded-xl` | ☐ | ☐ | — |
| Khoảng cách cơ sở | bội số 4 px | ☐ | ☐ | — |

**Quy tắc:** chỉ **thêm/chỉnh token** trong `tailwind.config.js` khi cột *Khớp?* = ☐ không khớp; mọi lệch phải được Khôi Nguyên xác nhận là *thiết kế đúng* (không phải lỗi thiết kế).

### 7.4. Fidelity Review (D6) — Khôi Nguyên thực hiện sau Step 6

So sánh UI thật với Figma ở **360 / 768 / 1280 px**, mỗi màn hình × trạng thái. Mức độ lệch:

| Mức | Định nghĩa | Xử lý |
|---|---|---|
| **Major** | Sai bố cục, sai/mất thành phần, sai màu thương hiệu, sai nội dung/copy, thiếu trạng thái, mất nhãn "Ước tính" | **Bắt buộc sửa** trước nghiệm thu |
| **Minor** | Lệch ≤ 4 px khoảng cách, lệch sắc độ nhỏ, khác biệt render font | Ghi nhận; sửa nếu còn thời gian |
| **Info** | Khác biệt do nền tảng (scrollbar, autofill) | Ghi nhận |

Mẫu bảng nằm ở Phụ lục 14.5. Kết quả đính kèm trong PR (ảnh chụp đặt cạnh nhau), **không commit ảnh** vào repo.

---

## 8. Track B — Kế hoạch triển khai tích hợp (Step 0 → Step 10)

> Mỗi Step = 1 commit. Tổng ước lượng: **~10 giờ làm việc**, trong đó phần cốt lõi trong buổi 2,5 giờ là Step 0–6 (Agent làm song song với Track A).

| Step | Nội dung | Ước lượng | Phụ thuộc |
|---|---|---|---|
| 0 | Chuẩn bị nhánh, chạy Mode A, đo **baseline** | 0,5 giờ | — |
| 1 | **Kiểm toán chỉ-đọc** + Remediation (nếu cần) | 1 giờ | 0 |
| 2 | Nhập token thiết kế & lập bảng ánh xạ | 0,5 giờ | Track A (7.3) |
| 3 | **Contract Guard** | 1,5 giờ | 1 |
| 4 | **Kết nối bền vững** (bootstrap, mất kết nối, retry) | 1,5 giờ | 3 |
| 5 | **Tối ưu độ mượt** (lazy route, chuyển bước, skeleton) | 1,5 giờ | 4 |
| 6 | **API Status (dev)** & cấu hình môi trường | 0,5 giờ | 3 |
| 7 | **Kiểm thử tự động** tích hợp | 1,5 giờ | 3–5 |
| 8 | **Xác minh tích hợp Mode A** + chuẩn bị Mode B | 1 giờ | 7 |
| 9 | **Đo đạc độ mượt** | 0,5 giờ | 5 |
| 10 | Báo cáo, AI-log, PR | 0,5 giờ | tất cả |

### Step 0 — Chuẩn bị & baseline
1. `git checkout main && git pull origin main && git checkout -b feat/w2-pair2-ui-api-integration`
2. Backend (từ **thư mục gốc repo**): `python -m uvicorn src.backend.main:app --reload --port 8000` → kiểm tra `http://localhost:8000/docs` và `GET /api/v1/health`.
3. Frontend: `cd src/frontend && npm install && npm run build && npm test`.
4. **Ghi baseline** vào `docs/05_ui_api_integration_report.md` §3: kích thước từng chunk JS/CSS (từ output `npm run build`), số test pass/fail. Đây là mốc so sánh cho SAC-10.
5. Tạo khung `docs/05_ui_api_integration_report.md` theo Phụ lục 14.4 (các ô đo đạc = `Pending`).

**Nghiệm thu:** nhánh đúng tên; build/test baseline được ghi lại **đúng như thực tế** (kể cả khi có lỗi).
> ⚠️ Dùng **`localhost` nhất quán** cho cả trang web và API (không trộn `127.0.0.1`), nếu không cookie bị coi cross-site.

### Step 1 — Kiểm toán chỉ-đọc & Remediation
**Chỉ đọc.** Không sửa file nào trong bước này, **trừ** khi cần Remediation R1 và sau khi báo cáo cho người dùng.

**1.1. Lệnh kiểm tra** (chạy từ thư mục gốc; PowerShell dùng `Select-String -Path src\frontend\src\* -Pattern ... -Recurse`)
```bash
grep -rnE "localStorage|sessionStorage|document\.cookie|Authorization" src/frontend/src
grep -rnE "Password123|thanhdat" src/frontend/src
grep -rnE "message\b.*response\.data|response\.data\.message" src/frontend/src
grep -rnE "console\.(log|debug)" src/frontend/src
ls src/frontend/src/{api,context,layouts,components,pages,schemas,utils,constants,__tests__} 2>&1
```

**1.2. Bảng kiểm toán** (điền vào báo cáo §2) — đối chiếu với `NS-FE-W2-001` §7.1:

| # | Hạng mục | Kỳ vọng | Kết quả |
|---|---|---|---|
| A1 | Cơ chế phiên | HttpOnly Cookie + `withCredentials`; **không** `localStorage`/`Authorization` | ☐ Đạt ☐ Lệch |
| A2 | `apiClient` | `withCredentials`, timeout, request/response interceptor, chuẩn hóa lỗi (`ApiError`) | ☐ |
| A3 | `AuthContext` | `loading/authenticated/unauthenticated`; bootstrap qua `/auth/me`; lắng nghe sự kiện 401 | ☐ |
| A4 | Route guard | `ProtectedRoute`, `PublicOnlyRoute`, `safeRedirect` | ☐ |
| A5 | `LoginPage` | Không giá trị mặc định; xử lý `detail` của FastAPI; link Đăng ký; banner phiên hết hạn | ☐ |
| A6 | `RegisterPage` | `register → login → /goal-setup`; không gửi `confirmPassword` | ☐ |
| A7 | `GoalPlannerWizard` | 4 bước + kết quả; payload đúng 9 field, không `user_id`; hiển thị **TDEE, Protein, Carbs, Fat** | ☐ |
| A8 | Nhãn minh bạch | "Ước tính" + `DisclaimerBadge` + ghi chú nguyên văn của Wizard | ☐ |
| A9 | Dọn dẹp | `GoalPlannerPage.tsx` đã xóa; không import mồ côi | ☐ |
| A10 | Test | Có test cho schema, guard, trang Auth, Wizard | ☐ |
| A11 | Tab "Mục tiêu"/điều hướng | Trỏ `/goal-setup` | ☐ |

**1.3. Quyết định sau kiểm toán**

| Kết quả | Hành động |
|---|---|
| Mọi mục Đạt | Sang Step 2 |
| **A1 Lệch** (còn `localStorage`/`Authorization`) | **Remediation R1** (dưới đây) — làm **trước** mọi Step khác |
| A2–A11 Lệch | Bổ sung theo đúng Step tương ứng trong `NS-FE-W2-001` (Step 2, 3, 4, 5, 6, 7, 8), gom thành commit `fix(frontend): close gaps from NS-FE-W2-001 audit` |

**Remediation R1 — Chuyển từ localStorage sang HttpOnly Cookie**
1. Xóa mọi đọc/ghi token ở `localStorage`/`sessionStorage`; xóa request interceptor gắn `Authorization`.
2. Giữ `withCredentials: true`; trạng thái đăng nhập lấy từ `GET /auth/me`.
3. Thêm test: spy `Storage.prototype.setItem` **không** được gọi trong luồng login/register; config request **không** có `Authorization`.
4. Ghi vào báo cáo §2: nguyên nhân (bảng phân công dòng 23 còn ghi localStorage) và bằng chứng sau sửa.

> **Dừng lại, báo cáo kết quả kiểm toán cho người dùng** trước khi tiếp tục Step 2.

### Step 2 — Nhập token thiết kế
*(Chỉ thực hiện khi Track A cung cấp bảng 7.3 đã điền; nếu chưa có, ghi `Pending` và **bỏ qua**, quay lại sau khi có.)*
1. Hoàn thiện bảng ánh xạ 7.3 trong báo cáo §4.
2. Với mỗi dòng **không khớp đã được Khôi Nguyên xác nhận**: cập nhật `tailwind.config.js` (`theme.extend`) bằng token ngữ nghĩa (`nutri.primary`, `radius.card`, …) thay vì giá trị tùy ý.
3. Thay các giá trị tùy ý (`bg-[#107C41]`, `rounded-[…]`) trong **file Auth/Goal** bằng token tương ứng. **Không** refactor Dashboard/Chat.
4. Không đổi giao diện ngoài những chênh lệch đã xác nhận.

**Nghiệm thu:** `npm run build` ✔; ảnh chụp trước/sau không có thay đổi ngoài ý muốn.

### Step 3 — Contract Guard (D2)
**File:** `api/contracts.ts` (Zod schemas), `api/parseResponse.ts`, cập nhật `api/authApi.ts`, `api/goalApi.ts`, `utils/apiError.ts` (thêm `ContractError`).

**Schemas** (xem Phụ lục 14.1): `userPublicSchema`, `authResponseSchema`, `goalResponseSchema`, `baseResponseSchema`.

**Quy tắc**
- Tolerant Reader: `created_at` optional; `has_goal` mặc định `false`; field thừa bị bỏ qua.
- Trường UI bắt buộc (mục ADR-T2) **không** được optional.
- `parseResponse(schema, data, ctx)`: hợp lệ → trả dữ liệu đã định kiểu; sai → theo `VITE_CONTRACT_MODE`: `warn` (log `console.warn` có tiền tố `[contract]`, **chỉ ở dev**, kèm danh sách field; trả dữ liệu gốc) hoặc `strict` (ném `ContractError('CONTRACT_MISMATCH', issues)`).
- UI hiển thị `ContractError` bằng thông điệp: *"Máy chủ trả về dữ liệu không đúng định dạng (mã CONTRACT_MISMATCH). Vui lòng thử lại hoặc liên hệ nhóm phát triển."* — **không** lộ chi tiết kỹ thuật cho người dùng cuối.
- Không log dữ liệu sức khỏe/PII trong thông báo `warn` (chỉ tên field + kiểu sai).

**Fixture:** `__tests__/fixtures/contracts.ts` — sao chép **nguyên văn** ví dụ JSON ở `docs/02` §4.1–§4.2 (cộng một biến thể thiếu `created_at`, một biến thể thiếu `has_goal`).

**Nghiệm thu:** test (≥ 8 ca): fixture hợp lệ; thiếu `created_at` vẫn qua; thiếu `tdee_calories` → lỗi; sai kiểu `target_protein_g` → lỗi; field thừa bị bỏ qua; chế độ `warn` vs `strict`; không lộ giá trị PII trong log.

### Step 4 — Kết nối bền vững (D3)
**Mục tiêu SAC-1 … SAC-6.**

1. **Trạng thái xác thực mở rộng:** `loading | authenticated | unauthenticated | unreachable`.
   - `/auth/me` → `401` ⇒ `unauthenticated`.
   - `/auth/me` → lỗi mạng/timeout/`5xx` ⇒ `unreachable` (**không** chuyển `/login`).
2. **`ConnectionErrorScreen`** (theo frame Figma "Mất kết nối"): tiêu đề, mô tả ngắn, nút **Thử lại**, trạng thái đang thử. Thử lại thành công → tự điều hướng đúng nơi (`has_goal` ? `/` : `/goal-setup`).
3. **Splash có trì hoãn:** màn hình chờ khi `loading` chỉ hiện sau **150 ms** (hook `useDelayedFlag(loading, 150)`), nền cùng màu trang để không nháy. Khi đã đăng nhập, tải lại trang **không** render `LoginPage` ở bất kỳ khung hình nào.
4. **Retry có kiểm soát cho GET idempotent** (`/auth/me`, `/goals`): tối đa **1 lần** thử lại khi lỗi mạng hoặc `502/503/504`, chờ 400 ms; **không** retry `POST`. Triển khai trong response interceptor bằng cờ trên `config` (không thêm thư viện).
5. **Hủy & chống trùng:** dùng `AbortController` cho effect bootstrap; gộp các lời gọi `/auth/me` đồng thời thành một Promise (in-flight dedupe).
6. **Làm mới sau khi phục hồi:** sự kiện `online` của trình duyệt khi đang `unreachable` → tự thử lại một lần.
7. **Mất kết nối khi đang ở Wizard:** giữ nguyên dữ liệu form; hiển thị banner lỗi cấp form với nút *Thử lại*; không chuyển trang.

**Nghiệm thu:** test (≥ 7 ca): `401` → unauthenticated; network → unreachable (không chuyển `/login`); Thử lại thành công; splash không hiện khi phản hồi < 150 ms; retry GET đúng 1 lần, POST không retry; dedupe `/auth/me`; sự kiện `online`.

### Step 5 — Tối ưu độ mượt (D4)
**Mục tiêu SAC-9 … SAC-12.**

1. **Lazy route:** `React.lazy` cho `RegisterPage`, `GoalPlannerWizard`, `DashboardPage` (giữ `LoginPage` eager vì là trang vào đầu). Bọc `Suspense` với fallback là splash (có trì hoãn 150 ms). Tên chunk dễ đọc.
2. **Prefetch có chủ đích:** khi người dùng rê chuột/focus vào liên kết "Đăng ký" hoặc sau khi `login` thành công, gọi `import()` trước cho chunk đích (`onMouseEnter`/`onFocus`).
3. **Chuyển bước Wizard:** chuyển nội dung bằng CSS transition 150–200 ms (opacity/translate, **không** animate `height`), tắt bằng `motion-reduce:`. Giữ chiều cao tối thiểu của vùng nội dung để tránh nhảy bố cục.
4. **Skeleton cho `GoalResultPanel`:** khối placeholder đúng kích thước 7 thẻ; thay thế mượt khi có dữ liệu (CLS ≈ 0).
5. **Giảm re-render:** `watch` chỉ các field cần (không `watch()` toàn form); `React.memo` cho thẻ kết quả/Stepper; callback ổn định (`useCallback`) ở nơi truyền xuống danh sách.
6. **Focus & cuộn:** đổi bước → đưa focus vào tiêu đề bước (`tabIndex={-1}`), cuộn lên đầu trong mobile; kết quả hiện → focus vào tiêu đề kết quả.
7. **Không chặn luồng:** nút gửi khóa + `aria-busy`; hiển thị trạng thái "Đang lưu…" chỉ sau 150 ms.
8. Ghi lại kích thước bundle **sau** tối ưu để đối chiếu baseline (SAC-10).

**Nghiệm thu:** `npm run build` ✔; số chunk > 1; initial JS nhỏ hơn baseline (ghi số thật); test: lazy route render đúng sau khi tải; chuyển bước giữ dữ liệu; skeleton → dữ liệu.

### Step 6 — API Status (chỉ môi trường dev) & cấu hình
1. `components/dev/ApiStatusBadge.tsx`: **chỉ render khi `import.meta.env.DEV`**; gọi `GET /health` định kỳ 15 s (và khi `online`), hiển thị `API: online ✓ / offline ✗ / contract-warn ⚠` ở góc dưới (cố định, nhỏ, không che nội dung, `aria-hidden`).
2. `.env.example` (frontend): thêm `VITE_CONTRACT_MODE=warn` với chú thích; khai báo trong `vite-env.d.ts`.
3. Bảo đảm `ApiStatusBadge` bị loại khỏi bản production (kiểm tra bằng `npm run build` rồi `grep` chuỗi nhận diện trong `dist/`).

**Nghiệm thu:** Backend tắt → badge `offline`; bật → `online`; production build không chứa badge.

### Step 7 — Kiểm thử tự động tích hợp
Bổ sung vào `src/__tests__/` (không xóa test cũ). **Tối thiểu 15 test mới, tổng test không giảm.**

| Nhóm | Ca bắt buộc |
|---|---|
| Contract Guard | Xem Step 3 (≥ 8 ca) |
| Bootstrap & kết nối | Xem Step 4 (≥ 7 ca) |
| Luồng đầu–cuối (mock `authApi`/`goalApi`) | login → `has_goal=false` → Wizard → lưu → kết quả có TDEE/Protein/Carbs/Fat · register → auto login → Wizard · 401 giữa phiên → `/login` + banner hết hạn |
| Thiết kế & nội dung | Wizard có ghi chú nguyên văn; mọi số dinh dưỡng có nhãn "Ước tính" |
| Bảo mật | Spy `Storage.prototype.setItem` không bị gọi; request config không có `Authorization`; payload `/goals` đúng 9 field, không `user_id` |

**Nghiệm thu:** `npm test` 0 fail; `npm run build` ✔.

### Step 8 — Xác minh tích hợp Mode A & chuẩn bị Mode B
1. Chạy **ma trận Mode A** (mục 9.1) cùng backend mock; điền kết quả **thật** vào báo cáo §5.
2. Chạy các lệnh `curl` kiểm tra hành vi cookie ở Phụ lục 14.2; ghi lại kết quả.
3. Với từng mục đánh dấu `N/A-mock`, ghi lý do (thuộc B1–B6).
4. Hoàn thiện **checklist Mode B** (mục 9.2) và **Integration Readiness Gate** (mục 9.3) trong báo cáo §6 — để Cặp 1/Thành Đạt chạy nhanh khi backend thật sẵn sàng.
5. Cập nhật bảng **Open Dependencies** (mục 13.2).

**Nghiệm thu:** mọi dòng ma trận có trạng thái rõ ràng (Pass/Fail/N/A-mock/Blocked), không để trống.

### Step 9 — Đo đạc độ mượt
*(Một phần cần con người; Agent chỉ làm phần tự động.)*
1. **Agent:** `npm run build`; ghi kích thước chunk sau tối ưu; tính % thay đổi so với baseline (SAC-10).
2. **Người thực hiện:** `npm run build && npm run preview`; Lighthouse (mobile) cho `/login` (SAC-7, SAC-8); kiểm SAC-1…SAC-6, SAC-9, SAC-11, SAC-12 theo cột "Cách kiểm".
3. Điền kết quả thật vào báo cáo §7; ô chưa đo = `Pending`.

### Step 10 — Báo cáo, AI-log, Pull Request
1. Hoàn thiện `docs/05_ui_api_integration_report.md`.
2. Thêm 1 dòng vào `docs/ai_use_log.md` (mục 12).
3. `git status`: không có `.env`, `node_modules/`, `dist/`, ảnh.
4. Push nhánh, mở PR theo mẫu 11.3; Khôi Nguyên review (thiết kế + mã).

### 8.11. Mẫu báo cáo cuối của Agent
```text
## Báo cáo hoàn thành — Pair Session 2 (Track B)
- Kết quả kiểm toán Step 1: <A1..A11: Đạt/Lệch> · Remediation R1: <có/không>
- Steps hoàn thành: <liệt kê> · Steps hoãn + lý do: <...>
- File mới / sửa / xóa: <danh sách>
- npm run build: <pass/fail> · npm test: <X passed / Y failed> (mới: <n>)
- Bundle: baseline <...> → sau tối ưu <...> (initial JS gzip, đo thật)
- Mode A: <số Pass / Fail / N/A-mock> · Mode B: Pending (chờ Cặp 1)
- Sai khác so với kế hoạch: <...>
- Phát hiện về Backend (B1–B6 + mới): <...>
- Việc cần người thực hiện: Lighthouse/Perf, Fidelity Review, cập nhật ai_use_log.md, mở PR
```

### 8.12. STOP & ASK — Agent phải dừng và hỏi khi
1. Kiểm toán cho thấy mã hiện có sai khác lớn so với `NS-FE-W2-001` (thiếu ≥ 4 hạng mục A2–A11).
2. Cần sửa `src/backend/**`, `.antigravityrules`, `.gitignore`, hoặc thêm thư viện ngoài ADR-T5.
3. Hợp đồng backend thật khác `docs/02` §4 theo cách không thể dung hòa bằng Tolerant Reader.
4. Phải làm yếu/xóa test để xanh; hoặc cần điền số đo chưa thực hiện.
5. Token thiết kế Figma mâu thuẫn `docs/02` §1.1 (cần quyết định của Khôi Nguyên).
6. Cookie không được lưu dù đã làm đúng Phụ lục 14.3.

---

## 9. Ma trận xác minh tích hợp (Mode A / Mode B)

### 9.1. Mode A — Backend mock hiện tại

| # | Kịch bản | Kỳ vọng | Kiểm được trên mock? |
|---|---|---|---|
| V1 | Mở `/` khi chưa có cookie | `GET /auth/me` → 401 → `/login` | ✔ |
| V2 | Đăng nhập bất kỳ | `Set-Cookie: access_token` **HttpOnly**; Local Storage rỗng; vào `/` hoặc `/goal-setup` | ✔ |
| V3 | Tải lại trang sau đăng nhập | Vẫn đăng nhập, **không nháy Login** (SAC-1) | ✔ |
| V4 | Đăng ký hợp lệ | `register` → `login` → `/goal-setup` | ✔ (register mock không đặt cookie, login tự động bù) |
| V5 | Wizard → lưu | Hiển thị TDEE, Protein, Carbs, Fat + "Ước tính" + disclaimer | ✔ (dữ liệu cố định/tính tạm) |
| V6 | Payload `POST /goals` | Đúng 9 field, **không** `user_id`, **không** `Authorization` | ✔ |
| V7 | Tắt backend → tải lại | Màn hình mất kết nối + Thử lại (SAC-3/4) | ✔ |
| V8 | Xóa cookie thủ công rồi thao tác | 401 → `/login` + banner hết hạn | ✔ |
| V9 | Đăng xuất | Cookie bị xóa → `/login` | ✔ |
| V10 | Sai mật khẩu → 401 | Thông điệp chung | ✖ `N/A-mock` (B1) — kiểm bằng unit test |
| V11 | Đăng ký trùng → 409 | Lỗi theo field/form | ✖ `N/A-mock` — kiểm bằng unit test |
| V12 | Lưu mục tiêu rồi đọc lại | Dữ liệu khớp | ✖ `N/A-mock` (B4) |
| V13 | Hai tài khoản không thấy dữ liệu nhau | Cô lập dữ liệu | ✖ `N/A-mock` (B2, B4) |
| V14 | Cookie giả mạo → 401 | Từ chối | ✖ **Sẽ FAIL trên mock** (B2) — báo Cặp 1 |

### 9.2. Mode B — Checklist khi Backend thật sẵn sàng (chạy lại toàn bộ V1–V14 và thêm)

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| W1 | `Set-Cookie` của login | `HttpOnly`, `Path=/`, `SameSite=Lax`, có `Max-Age`; `Secure` = false ở dev |
| W2 | CORS preflight | `Access-Control-Allow-Origin` = origin cụ thể (**không** `*`), `Access-Control-Allow-Credentials: true` |
| W3 | Sai mật khẩu | `401` + `detail` (chuỗi) |
| W4 | Đăng ký trùng | `409` (hoặc `400`) + `detail` |
| W5 | Mật khẩu yếu | `422` + `detail` dạng mảng, `loc` chứa `password` |
| W6 | Cookie giả mạo / hết hạn | `401` |
| W7 | `GET /goals` chưa có mục tiêu | Hợp đồng rõ ràng (404 hoặc `has_goal=false`) — **thống nhất với Cặp 1**; UI xử lý được cả hai |
| W8 | `POST /goals` → `GET /goals` | Dữ liệu được lưu và khớp |
| W9 | Cô lập người dùng (A tạo mục tiêu; B đăng nhập) | B **không** thấy dữ liệu của A |
| W10 | Origin lạ (nếu CSRF đã gắn) | `403` |
| W11 | Contract Guard | Chế độ `strict`: không phát sinh `CONTRACT_MISMATCH` trong luồng chuẩn |

### 9.3. Integration Readiness Gate — điều kiện coi Cặp 1 "đã sẵn sàng"
Tất cả phải đúng: (1) dòng 19–20 được Cặp 1 tick hoàn thành **và đã merge vào `main`**; (2) `get_current_user` giải mã JWT thật (token giả → 401); (3) login/register dùng CSDL thật; (4) `POST/GET /goals` lưu và đọc theo `user_id` từ JWT; (5) mã phản hồi lỗi theo bảng ở mục 14.1 của `NS-FE-W2-001` (§6.2).
Khi đạt: `git pull origin main`, khởi động lại backend, chạy 9.2, cập nhật báo cáo §6 — **không cần sửa Frontend**; mọi lệch hợp đồng được Contract Guard chỉ ra.

---

## 10. Quality Gates & Definition of Done

**Quality Gate theo Step:** `npm run build` (gồm `tsc` strict) = 0 lỗi; `npm test` = 0 fail.

**Definition of Done — toàn bộ phải ✔ trước khi xin review:**

- [ ] **D1** Gói bàn giao thiết kế đủ 8/8 mục, có xác nhận của Khôi Nguyên
- [ ] **D2** Mọi response Auth/Goal đi qua Contract Guard; fixture khớp `docs/02` §4
- [ ] **D3** SAC-1 … SAC-6 đạt (có bằng chứng: ghi chú/ảnh/quay màn hình đính kèm PR)
- [ ] **D4** SAC-9 … SAC-12 đạt; SAC-7, SAC-8 đã đo (hoặc ghi `Pending` kèm lý do)
- [ ] **D5** `docs/05_ui_api_integration_report.md` đầy đủ; **không có số liệu bịa**
- [ ] **D6** Fidelity Review: 0 lệch *Major*; các lệch *Minor* đã ghi nhận
- [ ] Ma trận Mode A: mọi dòng có trạng thái; V10–V14 ghi `N/A-mock` kèm lý do; Open Dependencies đã cập nhật
- [ ] **0** lần dùng `localStorage`/`sessionStorage`/`document.cookie`/`Authorization` trong mã ứng dụng (`grep` → rỗng, ngoại trừ test kiểm chứng *không dùng*)
- [ ] Không `any`, `@ts-ignore`; không `console.log` dữ liệu nhạy cảm; `ApiStatusBadge` không có trong bản production
- [ ] Không sửa `src/backend/**`; `git status` sạch (không `.env`, `node_modules/`, `dist/`, ảnh)
- [ ] Đã cập nhật `docs/ai_use_log.md`; **D7** PR có ≥ 1 Approve của Khôi Nguyên

---

## 11. Quy trình Git, Commit Plan & mẫu Pull Request

### 11.1. Quy tắc
Không commit/push trực tiếp `main`; mỗi thành viên có PR riêng; commit nhỏ, theo Conventional Commits (nhất quán lịch sử repo: tiếng Anh hoặc tiếng Việt không dấu).

### 11.2. Commit Plan (1 Step = 1 commit)

| # | Commit message |
|---|---|
| 1 | `docs(report): add integration report skeleton and record baseline` *(Step 0)* |
| 2 | `fix(frontend): remediate localStorage/Authorization usage (R1)` *(chỉ khi Step 1 phát hiện)* / `fix(frontend): close gaps from NS-FE-W2-001 audit` |
| 3 | `style(frontend): map Figma design tokens to tailwind theme for auth and goal screens` |
| 4 | `feat(frontend): add zod contract guard for auth and goal responses` |
| 5 | `feat(frontend): resilient bootstrap with unreachable state, retry and delayed splash` |
| 6 | `perf(frontend): lazy routes, wizard transitions, skeleton and render optimizations` |
| 7 | `chore(frontend): add dev-only api status badge and contract mode env` |
| 8 | `test(frontend): add contract, resilience and end-to-end flow tests` |
| 9 | `docs(report): record mode A verification matrix and mode B checklist` |
| 10 | `docs(report): add smoothness measurements and open dependencies` |
| 11 | `docs(ai-log): record pair session 2 AI usage` |

### 11.3. Mẫu Pull Request
```markdown
## Mô tả
Pair Session 2 (Cặp 2): bàn giao thiết kế Đăng nhập & Goal Planner; kết nối UI React với API Auth/Goal; đầu ra "UI Auth & Goal chạy mượt".

## Bối cảnh
Cặp 1 (dòng 19–20) chưa hoàn thành → chạy Mode A (backend mock). Frontend không rẽ nhánh theo backend; Contract Guard sẽ chỉ ra mọi sai lệch khi chuyển sang Mode B.

## Thay đổi chính
- Contract Guard (Zod) cho response Auth/Goal · Tolerant Reader
- Bootstrap bền vững: trạng thái `unreachable`, màn hình mất kết nối, retry GET, splash trì hoãn 150 ms
- Tối ưu độ mượt: lazy route, chuyển bước, skeleton
- ApiStatusBadge (chỉ dev) · token thiết kế theo Figma
- Báo cáo: docs/05_ui_api_integration_report.md

## Kết quả kiểm chứng (số liệu thật)
- build: <pass> · test: <X passed> (mới <n>)
- Initial JS gzip: <baseline> → <sau> (<±%>)
- Lighthouse /login (mobile): Perf <..> · A11y <..> · BP <..>  (hoặc "Pending")
- Mode A: <n Pass / n N/A-mock> · Mode B: Pending (chờ Cặp 1)

## Fidelity Review (đính kèm ảnh cạnh nhau 360/768/1280)
Major: 0 · Minor: <n> · Info: <n>

## Phát hiện về Backend (báo Cặp 1 — Minh Đức/Việt Huy)
B1 login chấp nhận mọi tài khoản · B2 token giả ≥ 15 ký tự được chấp nhận · B3 register không đặt cookie · B4 /goals không lưu · B6 CSRF chưa gắn · <mục mới nếu có>

## Checklist
- [ ] build 0 lỗi · [ ] test 0 fail · [ ] không dùng localStorage/Authorization
- [ ] không sửa src/backend · [ ] không có .env/node_modules/dist/ảnh
- [ ] đã cập nhật ai_use_log.md · [ ] số liệu đo là thật hoặc "Pending"

Reviewer: @<github-khoi-nguyen> (thiết kế + mã)
```

---

## 12. Nhật ký sử dụng AI (bắt buộc)

**Người thực hiện** (không phải Agent) kiểm tra và hoàn thiện dòng sau trong `docs/ai_use_log.md`:

| Tuần / Thành viên | Công cụ AI | Nội dung yêu cầu (Prompt tóm tắt) | Phần giữ lại & Phần đã chỉnh sửa thủ công | Cách thức kiểm thử xác minh (Verification) |
|---|---|---|---|---|
| **W2 – Thành Đạt (Pair Session 2)** | Antigravity AI | Kiểm toán mã Auth/Goal; xây Contract Guard (Zod), kết nối bền vững (unreachable/retry/splash), lazy route & skeleton, báo cáo tích hợp theo kế hoạch NS-FE-W2-002 | *(điền sau review: phần giữ nguyên; phần tự sửa — ví dụ ngưỡng retry, thông điệp lỗi, token thiết kế)* | `npm run build` 0 lỗi; `npm test` *(số)* ca pass; ma trận Mode A *(n Pass)*; DevTools: cookie HttpOnly, Local Storage rỗng, payload không có `user_id`; Fidelity Review *(Major = 0)* |

> Không điền số "pass"/điểm Lighthouse khi chưa chạy thật.

---

## 13. Rủi ro, Phụ thuộc & Giao thức xử lý blocker

### 13.1. Ma trận rủi ro

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Cặp 1 trễ hạn kéo dài | Cao | Cao | Mode A + Contract Guard + checklist Mode B; leo thang theo 13.3 |
| Mã dòng 23 vẫn dùng `localStorage` (do bảng phân công cũ) | Trung bình | Cao | Step 1 kiểm toán + Remediation R1 |
| Hợp đồng thật khác `docs/02` (đặt tên field, mã lỗi) | Trung bình | Trung bình | Tolerant Reader; thống nhất W7 với Cặp 1 sớm |
| Figma chưa đủ trạng thái lỗi/mất kết nối | Cao | Trung bình | Mục 7.1 yêu cầu bổ sung trong buổi; Agent dùng mặc định theo `docs/02` §1 nếu thiếu và đánh dấu "chờ xác nhận" |
| Lighthouse/INP phụ thuộc máy đo | Trung bình | Thấp | Ghi môi trường đo; chạy ≥ 3 lần lấy trung vị |
| Agent mở rộng phạm vi / thêm thư viện | Trung bình | Trung bình | Mục 3.3, ADR-T5, STOP & ASK |
| Diff nhiễu do CRLF/LF | Cao | Thấp | Giữ line ending của file cũ; không reformat hàng loạt |

### 13.2. Bảng Open Dependencies (điền trong báo cáo §8)

| ID | Phụ thuộc vào | Chủ sở hữu | Cần gì | Từ ngày | Tác động lên Frontend | Giải pháp tạm | Trạng thái |
|---|---|---|---|---|---|---|---|
| OD-1 | Auth thật (bảng phân công dòng 19–20) | Minh Đức | Băm mật khẩu, JWT, `get_current_user` giải mã thật | *(ngày)* | Không kiểm thử được 401/409/cô lập | Mode A + unit test | ☐ Mở |
| OD-2 | `goal_service` lưu & đọc theo `user_id` | Việt Huy | `POST/GET /goals` bền vững; hợp đồng "chưa có mục tiêu" | *(ngày)* | Không kiểm thử "lưu rồi đọc" | Mode A | ☐ Mở |
| OD-3 | Gắn CSRF dependency | Minh Đức | Áp `verify_csrf_protection` | *(ngày)* | Không kiểm thử 403 | N/A | ☐ Mở |
| OD-4 | Trả lại thông số hồ sơ trong `GoalResponse` | Việt Huy | `gender/age/height/...` để điền sẵn form | *(ngày)* | Wizard không điền sẵn được | Form trống | ☐ Đề xuất |

### 13.3. Giao thức leo thang
1. **Hằng ngày:** cập nhật trạng thái OD-x trong báo cáo.
2. **Sau 24 giờ không tiến triển:** nhắn trực tiếp chủ sở hữu (Minh Đức/Việt Huy) kèm bước tái hiện và liên kết tới ma trận 9.1.
3. **Sau 48 giờ hoặc sát mốc Tuần 3 (Demo PoC):** Thành Đạt báo trưởng nhóm; trưởng nhóm quyết định phân bổ lại (không tự ý sửa backend từ nhánh này — mọi thay đổi backend đi qua PR của Cặp 1).
4. **Mốc Tuần 3:** luồng cốt lõi *Đăng nhập → Chụp ảnh → …* bắt buộc chạy; nếu Auth thật chưa xong, demo bằng Mode A và nêu rõ giới hạn trong Báo cáo PoC (không trình bày mock như chức năng thật).

---

## 14. Phụ lục kỹ thuật

### 14.1. `api/contracts.ts` — khung tham chiếu (Tolerant Reader)
```ts
import { z } from 'zod';

export const userPublicSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string(),
  created_at: z.string().optional(), // docs/02 §4.1 không đảm bảo có trường này
});

export const authResponseSchema = z.object({
  success: z.boolean().default(true),
  message: z.string().default(''),
  has_goal: z.boolean().default(false),
  user: userPublicSchema,
});

export const goalResponseSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  target_weight: z.number(),
  bmr_calories: z.number(),
  tdee_calories: z.number(),        // UI bắt buộc
  target_calories: z.number(),
  target_protein_g: z.number(),     // UI bắt buộc
  target_carbs_g: z.number(),       // UI bắt buộc
  target_fat_g: z.number(),         // UI bắt buộc
  daily_budget_vnd: z.number(),
  disclaimer: z.string().default(''),
});

export const baseResponseSchema = z.object({
  success: z.boolean().default(true),
  message: z.string().default(''),
  disclaimer: z.string().default(''),
});
```
```ts
// api/parseResponse.ts — khung tham chiếu
import type { ZodTypeAny, z } from 'zod';
import { ContractError } from '../utils/apiError';

const MODE = import.meta.env.VITE_CONTRACT_MODE ?? 'warn';

export function parseResponse<S extends ZodTypeAny>(schema: S, data: unknown, ctx: string): z.infer<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.code}`); // KHÔNG đưa giá trị vào log
  if (import.meta.env.DEV) console.warn(`[contract] ${ctx}`, issues);
  if (MODE === 'strict') throw new ContractError('CONTRACT_MISMATCH', ctx, issues);
  return data as z.infer<S>; // chế độ warn: chấp nhận tạm thời để không chặn tích hợp
}
```

### 14.2. Lệnh kiểm tra hành vi cookie của Backend (Mode A/B)

**bash / Git Bash**
```bash
# 1) Đăng nhập, lưu cookie, xem cờ Set-Cookie
curl -i -c jar.txt -H "Content-Type: application/json" -H "Origin: http://localhost:5173" \
  -d '{"username_or_email":"demo","password":"Password123"}' http://localhost:8000/api/v1/auth/login
# Kỳ vọng dòng:  set-cookie: access_token=...; HttpOnly; Path=/; SameSite=lax; Max-Age=...

# 2) Gọi /auth/me với cookie hợp lệ và không có cookie
curl -i -b jar.txt http://localhost:8000/api/v1/auth/me      # 200
curl -i            http://localhost:8000/api/v1/auth/me      # 401

# 3) Cookie giả (Mode B kỳ vọng 401; mock hiện tại sẽ trả 200 → ghi nhận B2)
curl -i -H "Cookie: access_token=xxxxxxxxxxxxxxxxxxxx" http://localhost:8000/api/v1/auth/me

# 4) CORS preflight
curl -i -X OPTIONS -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" \
  http://localhost:8000/api/v1/auth/login
```
**PowerShell**
```powershell
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$r = Invoke-WebRequest -Uri http://localhost:8000/api/v1/auth/login -Method POST -WebSession $s `
     -ContentType 'application/json' -Headers @{Origin='http://localhost:5173'} `
     -Body '{"username_or_email":"demo","password":"Password123"}'
$r.Headers['Set-Cookie']
Invoke-WebRequest -Uri http://localhost:8000/api/v1/auth/me -WebSession $s | Select-Object StatusCode
```

### 14.3. Xử lý sự cố cookie

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Login `200` nhưng `/auth/me` trả `401` | Trộn `127.0.0.1` và `localhost` giữa web và API | Dùng cùng host `localhost` |
| Lỗi CORS khi gửi credentials | Origin không có trong `allow_origins` (`5173`, `3000`) | Báo Cặp 1; không sửa backend |
| Không thấy cookie trong DevTools | Request thiếu `withCredentials` / dùng `fetch` trực tiếp | Kiểm tra `apiClient` |
| `403 CSRF Protection` | Origin/Referer ngoài `ALLOWED_ORIGINS` | Như trên |
| Màn hình "mất kết nối" khi backend vẫn chạy | Sai `VITE_API_BASE_URL` / cổng khác 8000 | Kiểm tra `.env.example` → tạo `.env` cục bộ (không commit) |

### 14.4. Khung báo cáo `docs/05_ui_api_integration_report.md`

```markdown
# BÁO CÁO TÍCH HỢP UI–API (AUTH & GOAL PLANNER) — NS-FE-W2-002
> Mọi ô đo đạc chỉ điền khi đã đo thật; chưa đo = `Pending`.

## 1. Tóm tắt & trạng thái Cặp 1 (Mode A/B)
## 2. Kết quả kiểm toán (A1–A11) & Remediation
## 3. Baseline (Step 0): chunk JS/CSS, số test
## 4. Bảng ánh xạ design token (7.3) & Design Delta
## 5. Ma trận xác minh Mode A (V1–V14) — Pass/Fail/N/A-mock + bằng chứng
## 6. Checklist Mode B (W1–W11) & Integration Readiness Gate — Pending
## 7. Smoothness (SAC-1…SAC-12): mục tiêu · kết quả đo · môi trường đo · trạng thái
## 8. Open Dependencies (OD-x)
## 9. Fidelity Review (tóm tắt) & Việc chuyển tiếp
```

**Mẫu bảng SAC (§7)**
| Mã | Mục tiêu | Kết quả đo | Môi trường (máy/trình duyệt/mạng) | Trạng thái |
|---|---|---|---|---|
| SAC-7 | Perf ≥ 90 · A11y ≥ 95 · BP ≥ 95 | Pending | — | Pending |
| SAC-10 | Initial JS gzip −15 % so baseline | *(số đo thật)* | `npm run build` | Pending |

### 14.5. Mẫu bảng Fidelity Review (D6)

| Màn hình / Trạng thái | Breakpoint | Hạng mục lệch | Figma | Thực tế | Mức (Major/Minor/Info) | Hành động | Đã xử lý |
|---|---|---|---|---|---|---|---|
| Login / Mặc định | 360 | *(ví dụ: khoảng cách tiêu đề)* | 24 px | 20 px | Minor | Chỉnh `space-y-6` | ☐ |

### 14.6. Mẫu biên bản ký nghiệm thu thiết kế (cuối buổi)

| Hạng mục | Kết quả | Người xác nhận | Ngày |
|---|---|---|---|
| Gói bàn giao thiết kế đủ 8/8 | ☐ Đạt ☐ Chưa | Khôi Nguyên | |
| Fidelity Review: 0 lệch Major | ☐ Đạt ☐ Chưa | Khôi Nguyên | |
| UI Auth & Goal chạy mượt (SAC đạt/ghi nhận) | ☐ Đạt ☐ Chưa | Thành Đạt | |
| Open Dependencies đã bàn giao cho Cặp 1 | ☐ Đã gửi | Thành Đạt | |

### 14.7. Lệnh tham khảo nhanh
```bash
# Backend (từ thư mục gốc)
python -m uvicorn src.backend.main:app --reload --port 8000

# Frontend
cd src/frontend && npm install
npm run dev                         # http://localhost:5173
npm run build && npm test
npm run build && npm run preview    # đo Lighthouse trên bản production

# Kiểm tra vi phạm
grep -rnE "localStorage|sessionStorage|document\.cookie|Authorization" src/frontend/src
grep -rn "ApiStatusBadge" src/frontend/dist || echo "OK: không có trong bản production"
```

### 14.8. Tài liệu tham chiếu
- Đặc tả kỹ thuật & Cẩm nang thực thi (PDF): §3.2 (Tuần 2 – Cặp 2, Pair Session 2), §4.2, §4.4, §4.7
- `docs/01_security_architecture.md` · `docs/02_api_contract_and_screen_flows.md` · `docs/03_frontend_auth_goal_wizard_plan.md` · `docs/qa_evaluation_plan.md`
- `src/backend/schemas/api_contract.py` · `src/backend/services/auth_guard.py` · `src/backend/main.py`
- `.antigravityrules`

---
*Hết tài liệu NS-FE-W2-002 v1.0.0. Mọi thay đổi phạm vi phải được ghi lại bằng ADR mới và được Design Owner/Implementation Owner đồng ý trước khi triển khai.*
