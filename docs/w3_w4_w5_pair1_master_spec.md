# ĐẶC TẢ KỸ THUẬT TỔNG HỢP TUẦN 3, 4, 5 (PAIR SESSION 3, 4, 5) & KIỂM THỬ TOÀN HỆ THỐNG
> **Dự án:** NutriSnap — Virtual AI Nutrition Assistant  
> **Cặp phụ trách:** Cặp 1 (Data Core, Security & Governance) — Nguyễn Hoàng Việt Huy (25127060) & Nguyễn Trần Minh Đức (25127300)  
> **Phạm vi bàn giao:**  
> - **W3 (Pair Session 3 - Mốc PoC):** Hoàn thiện tính dinh dưỡng tất định, lưu nhật ký bữa ăn; tổng hợp Báo cáo PoC & Slide (`Hồ sơ PoC & DB sẵn sàng`).  
> - **W4 (Pair Session 4):** Lập trình 4 hàm Backend thực thi cho Tool Calling, bảo mật `tool_security.py` và dịch vụ lưu trữ lịch sử hội thoại theo tài khoản (`Backend Tool Services chốt`).  
> - **W5 (Pair Session 5):** Xây dựng thuật toán phân tích tiến độ cân nặng EMA, phát hiện mẫu hành vi ăn uống 7–14 ngày và Food Swap Simulator (`Module Analytics & EMA chốt`).  

---

## 1. MỤC TIÊU KIẾN TRÚC & NGUYÊN TẮC BẮT BUỘC

1. **Zero-Trust Data Isolation:** Mọi hàm dịch vụ và truy vấn trên 6 bảng người dùng (`goals`, `weight_logs`, `meals`, `meal_items`, `chat_sessions`, `chat_messages`) bắt buộc lọc theo `user_id` được trích xuất từ phiên đăng nhập hợp lệ (`HttpOnly JWT Cookie`), tuyệt đối không tin tưởng `user_id` truyền từ tham số LLM.
2. **Deterministic Math (0% Hallucination):** Toàn bộ phép tính calo, macro, BMR/TDEE, trung bình động hàm mũ EMA và chênh lệch Food Swap đều thực hiện bằng công thức đại số cố định tại Backend.
3. **Two-Step Confirmation (`is_confirmed`):** Mọi thao tác ghi nhật ký bữa ăn từ Camera hoặc AI Tool Calling khi `is_confirmed=False` chỉ trả về bản nháp (`pending_confirmation`), không ghi xuống CSDL cho đến khi `is_confirmed=True`.
4. **Ràng buộc khóa ngoại SQLite:** Luôn đảm bảo `PRAGMA foreign_keys = ON` trên mọi kết nối SQLite.

---

## 2. CHI TIẾT TRIỂN KHAI TỪNG TUẦN CỦA CẶP 1 (VIỆT HUY & MINH ĐỨC)

### 2.1. TUẦN 3 — Pair Session 3 (Mốc PoC): Dinh dưỡng Tất định, Nhật ký Bữa ăn & Hồ sơ PoC
1. **Kiểm tra & Hoàn thiện `src/backend/services/nutrition_service.py`:**
   - Hàm `calculate_item_nutrition(session, food_id, estimated_gram, eaten_ratio=1.0)`:
     $$\text{Effective Gram} = \text{estimated\_gram} \times \text{eaten\_ratio}$$
     $$\text{Nutrient} = \text{round}\left(\frac{\text{Effective Gram}}{100.0} \times \text{Nutrient\_per\_100g}, 2\right)$$
   - Hàm `log_user_meal(session, authenticated_user_id, meal_type, items, is_confirmed=False, image_path=None)`:
     - Nếu `is_confirmed=False`: Tính toán tổng calo/macro và trả về trạng thái `"pending_confirmation"`, không lưu vào bảng `meals`/`meal_items`.
     - Nếu `is_confirmed=True`: Lưu bản ghi vào `meals` và `meal_items`, trả về trạng thái `"logged"`.
   - Hàm `get_daily_dashboard_summary(session, authenticated_user_id, target_date)`: Tổng hợp calo/macro đã nạp so với mục tiêu trong bảng `goals` kèm danh sách bữa ăn trong ngày.
2. **Kiểm tra & Hoàn thiện `scripts/seed_demo_accounts.py`:**
   - Đảm bảo khởi tạo an toàn (idempotent) 3 tài khoản mẫu (`student_user`, `office_user`, `gym_user`) kèm mục tiêu `goals`, lịch sử cân nặng `weight_logs` và nhật ký bữa ăn `meals`/`meal_items`.
3. **Tạo Hồ sơ Báo cáo Khả thi PoC & Slide (`docs/03_poc_report_and_slides.md`):**
   - Tổng hợp kiến trúc PoC Tuần 1–3, bằng chứng CSDL 8 bảng bật `PRAGMA foreign_keys = ON`, kết quả nạp 500 món ăn Việt Nam (`vn_foods.csv`), cơ chế tính toán đại số chống ảo giác số học, quy trình xác nhận 2 bước và cấu trúc 8 Slide thuyết trình Mốc PoC.

---

### 2.2. TUẦN 4 — Pair Session 4: 4 Hàm Backend Tool Calling, Bảo mật Tool & Lưu trữ Hội thoại
1. **Kiểm tra & Hoàn thiện `src/backend/services/assistant_tools.py` và `src/backend/services/chat_service.py`:**
   - 4 hàm thực thi chuẩn:
     1. `exec_get_daily_nutrition(session, authenticated_user_id, target_date=None)`
     2. `exec_log_meal(session, authenticated_user_id, meal_type, items_list, is_confirmed=False)`
     3. `exec_recommend_meals(session, authenticated_user_id, remaining_calories=None, budget_vnd=None, limit=5)`
     4. `exec_get_progress_summary(session, authenticated_user_id, days_range=7)`
   - Quản lý lịch sử hội thoại theo tài khoản:
     - `get_or_create_chat_session(session, authenticated_user_id, session_id=None)`
     - `save_chat_message(session, authenticated_user_id, session_id, sender_role, content, tool_name=None)`
     - `get_chat_history(session, authenticated_user_id, session_id, limit=10)` — Bắt buộc kiểm tra `chat_session.user_id == authenticated_user_id`, nếu khác phải ném lỗi `PermissionError`.
2. **Lập trình Lớp Bảo vệ An toàn Công cụ `src/backend/services/tool_security.py` (Nhiệm vụ phối hợp Minh Đức):**
   - Hàm `sanitize_llm_tool_arguments(raw_args: dict) -> dict`: Tự động quét và loại bỏ mọi khóa nhạy cảm (`user_id`, `authenticated_user_id`, `account_id`, `owner_id`, `is_admin`) nếu LLM cố tình truyền vào do Prompt Injection.
   - Hàm `verify_session_ownership(session, session_id: int, authenticated_user_id: int) -> bool`: Kiểm tra quyền sở hữu phiên chat trước khi đọc/ghi.
   - Hàm `verify_meal_ownership(session, meal_id: int, authenticated_user_id: int) -> bool`: Kiểm tra quyền sở hữu bữa ăn trước khi sửa/xóa `meal_items`.
   - Tích hợp `sanitize_llm_tool_arguments` vào trong `dispatch_tool_call` của `assistant_tools.py`.

---

### 2.3. TUẦN 5 — Pair Session 5: Thuật toán Cân nặng EMA, Phân tích Hành vi & Food Swap
1. **Kiểm tra & Hoàn thiện `src/backend/services/weight_trend.py`:**
   - Hàm `calculate_ema_series(weights: list[float], alpha: float = 0.1) -> list[float]`:
     - Phần tử đầu tiên: $\text{EMA}_0 = W_0$
     - Từ phần tử thứ hai: $\text{EMA}_t = \text{round}(\alpha \times W_t + (1 - \alpha) \times \text{EMA}_{t-1}, 2)$
   - Hàm `get_user_weight_trend(session, authenticated_user_id, days: int = 14) -> dict`:
     - Truy vấn bảng `weight_logs` của đúng `authenticated_user_id`, tính chuỗi EMA, đánh giá xu hướng (`"decreasing"`, `"increasing"`, `"stable"`, hoặc `"insufficient_data"`) và giữ nguyên hạn mức calo mục tiêu (`calorie_penalty_applied: False`).
2. **Kiểm tra & Hoàn thiện `src/backend/services/analytics_service.py`:**
   - Hàm `analyze_user_patterns(session, authenticated_user_id, days: int = 14) -> dict`:
     - Chỉ đưa ra kết luận hành vi khi số ngày ghi nhật ký thực tế $\ge 5$ ngày (nếu $< 5$ ngày trả về `status="insufficient_data"`).
     - Phát hiện 3 mẫu thói quen: `skipping_breakfast` (bỏ bữa sáng $\ge 40\%$ số ngày), `low_protein` (đạm trung bình $< 80\%$ mục tiêu), `late_night_eating` ($\ge 2$ bữa ăn sau 21:00).
   - Hàm `simulate_food_swap(session, current_food_id, current_gram, target_food_id=None, target_gram=None, max_budget_vnd=None) -> dict`:
     - Tính chính xác chênh lệch `calories_diff`, `protein_diff_g`, `carbs_diff_g`, `fat_diff_g`, `price_diff_vnd` và gợi ý các món thay thế ít calo hơn hoặc giàu đạm hơn trong ngân sách từ bảng `food_references`.
3. **Đồng bộ hóa `src/backend/main.py`:**
   - Đảm bảo tất cả các router (`api_router`, `auth_goal_router`, `meal_router`, `assistant_router`, `analytics_router`) được gắn kết sạch sẽ, không trùng lặp đường dẫn và không còn xung đột.

---

## 3. KIỂM THỬ TOÀN HỆ THỐNG (END-TO-END & REGRESSION TEST W1 -> W5)

Tạo tệp kiểm thử tổng hợp **`tests/test_system_w1_to_w5.py`** kiểm tra toàn bộ luồng hệ thống từ Tuần 1 đến Tuần 5:
1. `test_w1_database_8_tables_and_500_foods`: Kiểm tra 8 bảng CSDL, cờ `PRAGMA foreign_keys = ON` và 500 món ăn trong `food_references`.
2. `test_w2_auth_and_smart_goal_planner`: Kiểm tra đăng ký, băm mật khẩu bcrypt, tính BMR/TDEE Mifflin-St Jeor và chặn tốc độ giảm cân $> 1.0\text{ kg/tuần}$.
3. `test_w3_deterministic_nutrition_and_two_step_meal_log`: Kiểm tra tính toán đại số calo/macro, trừ hao thức ăn thừa (`eaten_ratio`), chế độ xem trước (`is_confirmed=False`) và xác nhận lưu (`is_confirmed=True`).
4. `test_w3_poc_deliverables_and_demo_seed`: Kiểm tra sự tồn tại của `docs/03_poc_report_and_slides.md` và chạy thử hàm seed tài khoản demo.
5. `test_w4_assistant_4_tools_and_zero_trust_security`: Kiểm tra cả 4 công cụ (`exec_get_daily_nutrition`, `exec_log_meal`, `exec_recommend_meals`, `exec_get_progress_summary`) và xác minh `tool_security.py` chặn mọi nỗ lực truyền `user_id` giả mạo.
6. `test_w4_chat_session_isolation_idor_protection`: Kiểm tra User B không thể đọc hoặc ghi vào `chat_sessions` của User A.
7. `test_w5_weight_trend_ema_smoothing`: Kiểm tra công thức làm mịn EMA ($\alpha = 0.1$) lọc nhiễu cân nặng chính xác và không phạt cắt giảm calo.
8. `test_w5_behavior_patterns_and_food_swap`: Kiểm tra quy tắc tối thiểu 5 ngày dữ liệu của `analyze_user_patterns()` và độ chính xác số học của `simulate_food_swap()`.
9. `test_fastapi_app_routes_and_health`: Dùng `TestClient` kiểm tra ứng dụng FastAPI khởi chạy lành mạnh (`/api/v1/health`) và các endpoint chính hoạt động đồng bộ.

---

## 4. TIÊU CHÍ NGHIỆM THU (DEFINITION OF DONE)

- Chạy `pytest -v` (bao gồm `tests/test_system_w1_to_w5.py` và toàn bộ các bài test đơn vị từ W1 đến W5) đạt **100% PASSED**.
- Chạy `ruff check src/ tests/ scripts/` không có lỗi cú pháp hoặc xung đột import.