# BÁO CÁO TÍCH HỢP CHAT UI & ĐỒNG BỘ DASHBOARD (TUẦN 4) — NS-FE-W4-001
> Số liệu chỉ điền khi đã đo thật; chưa đo = `Pending`. Không đưa nội dung hội thoại thật vào báo cáo.

## 1. Tóm tắt & trạng thái backend (a)(b)
- **Hạng mục:** Tích hợp Assistant Chat UI, Thẻ Hành động Tương tác (Action Confirmation Card), kết nối `POST /api/v1/assistant/chat`, và tự động làm mới vòng calo Dashboard.
- **Chủ sở hữu triển khai:** Lê Thành Đạt (25127293) & Kiều Khôi Nguyên (25127107) - Cặp 2.
- **Trạng thái backend phụ thuộc:**
  - **(a) Bảo mật JWT cho Tool (`tool_security.py`):** Đã có bộ lọc `sanitize_llm_tool_arguments` tước bỏ `user_id` và xác minh phiên `verify_session_ownership`. Phía Frontend áp dụng Zero-Trust: không gửi `user_id` trong body hay request params.
  - **(b) Trạng thái chờ xác nhận lưu trong CSDL:** Chưa tạo bảng lưu trữ riêng cho action card pending trong SQLite. Frontend áp dụng nguyên tắc Tolerant Reader + Zod, thẻ lịch sử ở trạng thái `readonly`, và xác nhận bằng chiến lược S2 (`POST /api/v1/meals/log` với `is_confirmed=true`).

## 2. Baseline (build, test, bundle)
- **Môi trường đo:** Windows 11, Node.js v20+, npm v10+, Python 3.13.2 (uvicorn 0.30+).
- **Frontend Build (`npm run build`):**
  - Trạng thái: **PASS** (0 lỗi, tsc strict pass).
  - Thời gian build: 10.07s.
  - Kích thước Bundle ban đầu:
    - `dist/index.html`: 0.86 kB (gzip: 0.49 kB)
    - `dist/assets/index-BU9AbzR2.css`: 47.28 kB (gzip: 8.31 kB)
    - `dist/assets/index-CudKR7jv.js`: 356.96 kB (gzip: 112.44 kB) - Main chunk
    - `dist/assets/MonthlyReportView-BPCxHJOk.js`: 395.54 kB (gzip: 109.95 kB)
    - `dist/assets/MealCaptureFlow-CA4vtGJt.js`: 51.91 kB (gzip: 13.43 kB)
    - `dist/assets/GoalPlannerWizard-B0UJByOr.js`: 38.31 kB (gzip: 9.10 kB)
    - `dist/assets/BasicDashboard-C1ucnU_F.js`: 20.83 kB (gzip: 5.69 kB)
- **Frontend Test Suite (`npm test -- --run`):**
  - Trạng thái: **316 passed / 1 failed** (Tổng cộng 317 tests trong 29 test files).
  - Ghi chú về 1 test fail: `MonthlyReportRoute.test.tsx` (thuộc phân hệ W6 vừa merge từ PR #39, đang thiếu mock backend report API trong test runner). Không ảnh hưởng đến phân hệ chat W4.

## 3. Contract Map (assistant, lịch sử, xác nhận, meals/log)
*Pending — Sẽ được cập nhật chi tiết ở Step 1.*

## 4. Assumption Register (AS-1…AS-13) & bảng ánh xạ token
*Pending — Sẽ được cập nhật chi tiết ở Step 1.*

## 5. Mode A: V1–V10 · E2E E1–E16 (Pass/Fail/Pending + bằng chứng đã ẩn danh)
*Pending — Sẽ thực hiện và đo đạc ở Step 10.*

## 6. Mode B checklist (W1–W7) & Integration Readiness Gate — Pending
*Pending (chờ hoàn tất module (a) và (b) ở backend Cặp 1).*

## 7. Quan sát hành vi LLM (bộ câu hỏi 10.5) — chuyển Tuấn/Hiếu, KHÔNG kết luận độ chính xác
*Pending.*

## 8. CSC-1…CSC-20: mục tiêu · kết quả đo · môi trường · trạng thái
*Pending.*

## 9. Open Dependencies (OD-x)
| ID | Phụ thuộc | Chủ sở hữu | Cần gì | Tác động lên Frontend | Giải pháp tạm | Trạng thái |
|---|---|---|---|---|---|---|
| OD-1 | Bảo mật JWT cho Tool | Minh Đức | Ghi đè `user_id` từ JWT | Rủi ro IDOR nếu client tự ý truyền | FE không gửi `user_id`, kiểm soát chặt chẽ | Đang mở |
| OD-2 | Trạng thái chờ xác nhận lưu DB | Minh Đức / Việt Huy | `action_id`, `status`, `expires_at` lưu DB | Thẻ lịch sử chưa thể xác nhận lại | Dùng S2 (`/meals/log`), thẻ lịch sử `readonly` | Đang mở |
| OD-3 | Endpoint lịch sử chi tiết thẻ | Việt Huy | Lưu và trả cấu trúc thẻ trong tin nhắn | Lịch sử chat chỉ chứa văn bản thuần | Bắt đầu phiên hội thoại mới an toàn | Đang mở |
| OD-4 | Chuẩn hóa thẻ hành động | Phú Hiếu / Việt Huy | Cố định field JSON `action_card` | Có thể phát sinh alias | Dùng Tolerant Reader + Zod alias | Đang mở |

## 10. Fidelity Review (tóm tắt) & Việc chuyển tiếp
*Pending review từ Design Owner (Kiều Khôi Nguyên).*
