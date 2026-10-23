# ĐẶC TẢ KỸ THUẬT TUẦN 6: HABIT TRACKER SERVICE & MONTHLY REPORT API
> **Dự án:** NutriSnap — Virtual AI Nutrition Assistant  
> **Cặp phụ trách:** Cặp 1 (Data Core, Security & Governance) — Nguyễn Hoàng Việt Huy (25127060)  
> **Đầu ra bàn giao (Deliverables):**  
> 1. `src/backend/services/habit_service.py` — Chuỗi ngày Streak, Thử thách 7 ngày & Chế độ "Quay lại đường đua" không phạt lỗi (`Service Habit Tracker`).  
> 2. `src/backend/routers/report_router.py` — Endpoint `GET /api/v1/reports/monthly` tổng hợp số ngày ghi nhật ký, biến động cân nặng và điểm mạnh trong tháng (`API Báo cáo Tháng`).  
> 3. `tests/unit/test_w6_habit_and_monthly_report.py` — Bộ kiểm thử tự động Tuần 6 & kiểm thử hồi quy toàn hệ thống (W1 -> W6).

---

## 1. NGUYÊN TẮC KIẾN TRÚC & RÀO CHẮN AN TOÀN BẮT BUỘC

1. **Zero-Trust Data Isolation:**
   - Mọi truy vấn vào bảng `meals`, `meal_items`, `weight_logs`, `goals` bắt buộc lọc theo `WHERE user_id = authenticated_user_id` lấy từ phiên đăng nhập (`HttpOnly JWT Cookie`).
   - Tuyệt đối không cho phép người dùng A xem báo cáo tháng hoặc chuỗi thói quen của người dùng B.
2. **Deterministic Calculation (0% Hallucination):**
   - Toàn bộ số liệu chuỗi ngày liên tiếp (`streak`), tiến độ thử thách 7 ngày, biến động cân nặng (thực tế & làm mịn EMA) và điểm mạnh trong tháng đều được tính bằng thuật toán tất định tại Backend.
3. **Chế độ "Quay lại đường đua" Không Phạt Lỗi (Non-Punitive Back-on-Track Mode):**
   - Khi người dùng bỏ lỡ 1 ngày ghi nhật ký hoặc có ngày ăn vượt mục tiêu calo (`daily_calories > tdee_calories`), hệ thống **tuyệt đối không cắt giảm hạn mức calo của ngày tiếp theo để phạt bù** (`calorie_penalty_applied = False`, giữ nguyên `next_day_target_calories = tdee_calories`).
   - Thay vì cảnh báo tiêu cực, hệ thống trả về trạng thái khích lệ `"back_on_track"` cùng gợi ý hành động nhỏ tích cực.

---

## 2. CHI TIẾT KỸ THUẬT CÁC MODULE CẦN LẬP TRÌNH

### 2.1. Module 1: `src/backend/services/habit_service.py` (Service Habit Tracker)

Lập trình đầy đủ các hàm nghiệp vụ sau:

#### A. Hàm `calculate_user_streak(session: Session, authenticated_user_id: int, reference_date: date | None = None) -> dict`
- Truy vấn danh sách các ngày duy nhất (`distinct date(logged_at)`) mà `user_id == authenticated_user_id` có ít nhất 1 bữa ăn trong bảng `meals` (sắp xếp tăng dần).
- Tính toán:
  - `current_streak` (int): Số ngày liên tiếp tính đến `reference_date` (hoặc `reference_date - 1 ngày` nếu hôm nay chưa kịp ghi bữa ăn nhưng hôm qua đã ghi).
  - `longest_streak` (int): Chuỗi ngày ghi nhật ký liên tiếp dài nhất từ trước đến nay của người dùng.
  - `total_logged_days` (int): Tổng số ngày đã ghi nhật ký.
  - `logged_dates_last_7_days` (list[str]): Danh sách các ngày (định dạng `YYYY-MM-DD`) đã ghi trong 7 ngày gần nhất để hiển thị lên lịch `HabitCalendar.tsx`.

#### B. Hàm `get_seven_day_challenge_status(session: Session, authenticated_user_id: int, reference_date: date | None = None) -> dict`
- Kiểm tra cửa sổ 7 ngày gần nhất (`[reference_date - 6 days, reference_date]`):
  - `window_start`: Ngày bắt đầu cửa sổ 7 ngày (`YYYY-MM-DD`).
  - `window_end`: Ngày kết thúc (`YYYY-MM-DD`).
  - `completed_days` (int): Số ngày có ghi nhật ký bữa ăn trong 7 ngày qua ($0 \le \text{completed\_days} \le 7$).
  - `target_days` (int): Mặc định là `7`.
  - `progress_pct` (float): $\text{round}\left(\frac{\text{completed\_days}}{7} \times 100, 1\right)$.
  - `is_completed` (bool): `True` nếu `completed_days == 7`.
  - `badge_name` (str):
    - Nếu `completed_days == 7`: `"Chiến binh 7 Ngày Bền Bỉ"`
    - Nếu `completed_days >= 5`: `"Người Đồng Hành Đều Đặn"`
    - Nếu `completed_days >= 3`: `"Khởi Đầu Vững Chắc"`
    - Ngược lại: `"Hành Trình Mới"`

#### C. Hàm `evaluate_back_on_track_mode(session: Session, authenticated_user_id: int, reference_date: date | None = None) -> dict`
- Lấy mục tiêu `tdee_calories` từ bảng `goals` (mặc định `2000.0` nếu chưa thiết lập).
- Kiểm tra nhật ký 3 ngày gần nhất tính đến `reference_date`:
  - Phát hiện xem người dùng có vừa trải qua ngày gián đoạn (quên ghi nhật ký hôm qua sau chuỗi ngày có ghi) hoặc ngày ăn vượt hạn mức calo (`daily_calories > tdee_calories * 1.15`) hay không.
- Trả về cấu trúc chuẩn:
  ```python
  {
      "back_on_track_active": bool,          # True nếu vừa có ngày gián đoạn hoặc ăn vượt mức
      "trigger_reason": str,                 # "missed_day" | "over_target_calories" | "on_track"
      "calorie_penalty_applied": False,      # LUÔN LUÔN LÀ FALSE (Tuyệt đối không phạt cắt calo)
      "next_day_target_calories": float,     # Giữ nguyên bằng đúng tdee_calories
      "encouragement_message": str,          # Lời nhắn ấm áp, không phán xét
      "suggested_micro_action": str          # Gợi ý bước nhỏ dễ thực hiện (VD: "Ghi nhận 1 bữa ăn lành mạnh hôm nay")
  }
####D. Hàm `generate_monthly_report(session: Session, authenticated_user_id: int, year: int | None = None, month: int | None = None, days: int = 30, reference_date: date | None = None) -> dict`
1. **Tổng hợp nhật ký (`logging_summary`):**
   - `start_date`, `end_date`, `period_days`
   - `total_logged_days`: Số ngày có ghi nhật ký bữa ăn trong kỳ.
   - `total_meals_logged`: Tổng số bữa ăn ghi trong kỳ.
   - `consistency_rate_pct`: $\text{round}\left(\frac{\text{total\_logged\_days}}{\text{period\_days}} \times 100, 1\right)$.
2. **Biến động cân nặng (`weight_summary`):**
   - Truy vấn bảng `weight_logs` của `authenticated_user_id` trong kỳ (sắp xếp theo `logged_date` tăng dần).
   - Nếu có dữ liệu cân nặng:
     - `start_weight_kg`: Cân nặng bản ghi đầu kỳ.
     - `end_weight_kg`: Cân nặng bản ghi cuối kỳ.
     - `raw_weight_change_kg`: $\text{round}(\text{end\_weight\_kg} - \text{start\_weight\_kg}, 2)$.
     - Sử dụng `calculate_ema_series` từ `src/backend/services/weight_trend.py` ($\alpha = 0.1$) để tính `ema_start_kg`, `ema_end_kg`, `ema_weight_change_kg` và `trend_direction` (`"decreasing"`, `"increasing"`, `"stable"`).
   - Nếu chưa có bản ghi cân nặng: Trả về các giá trị `None` và `trend_direction = "insufficient_data"`.
3. **Dinh dưỡng trung bình ngày (`nutrition_summary`):**
   - Tính trung bình trên các ngày có ghi nhật ký: `avg_daily_calories`, `avg_protein_g`, `avg_carbs_g`, `avg_fat_g` so với `target_tdee_calories` từ bảng `goals`.
4. **Điểm mạnh trong tháng (`strengths` — `list[dict]` hoặc `list[str]`):**
   - Đánh giá tất định để trích xuất danh sách điểm mạnh tích cực của người dùng:
     - Nếu `total_logged_days >= 5` hoặc `consistency_rate_pct >= 50`:  
       `"Duy trì thói quen ghi nhật ký ẩm thực đáng khen ngợi ({total_logged_days} ngày)."`
     - Nếu `longest_streak >= 3`:  
       `"Thiết lập chuỗi {longest_streak} ngày liên tiếp đồng hành cùng NutriSnap."`
     - Nếu tỷ lệ bữa sáng $\ge 60\%$ số ngày ghi:  
       `"Giữ vững thói quen ăn sáng đều đặn giúp ổn định năng lượng."`
     - Nếu `avg_protein_g` đạt $\ge 80\%$ mục tiêu đạm:  
       `"Cung cấp nguồn Protein tốt hỗ trợ duy trì cơ bắp."`
     - Nếu `avg_daily_calories` nằm trong khoảng $\pm 15\%$ so với `target_tdee_calories`:  
       `"Kiểm soát tổng năng lượng nạp vào sát với mục tiêu cá nhân."`
       - **Fallback khích lệ:** Nếu người dùng mới bắt đầu (chưa đạt các mốc trên), luôn trả về ít nhất 1 điểm mạnh khởi đầu:  
       `"Đã chủ động bắt đầu hành trình theo dõi dinh dưỡng và lắng nghe cơ thể cùng NutriSnap."`
---
### 2.2. Module 2: Lập trình Router `src/backend/routers/report_router.py` và gắn vào `src/backend/main.py`
- **Endpoint 1:** `GET /api/v1/reports/monthly`
  - Query params tùy chọn: `year: int | None = None`, `month: int | None = None`, `days: int = Query(default=30, ge=7, le=90)`.
  - Xác thực người dùng qua dependency `get_current_user` (`HttpOnly JWT Cookie`).
  - Trả về JSON chứa `logging_summary`, `weight_summary`, `nutrition_summary`, `habit_summary`, `strengths` và `disclaimer`.
- **Endpoint 2:** `GET /api/v1/habits/status`
  - Trả về kết quả của `get_habit_tracker_summary` cho người dùng hiện tại (phục vụ component `HabitCalendar.tsx` trên Frontend).
---
## 3. BỘ KIỂM THỬ TỰ ĐỘNG TUẦN 6 (`tests/unit/test_w6_habit_and_monthly_report.py`)
Viết đầy đủ tối thiểu 9 bài kiểm thử (unit + integration tests) trong `tests/unit/test_w6_habit_and_monthly_report.py`:
1. `test_streak_calculation_consecutive_and_gap_days`: Kiểm tra tính chính xác `current_streak` và `longest_streak` khi người dùng ghi liên tiếp 5 ngày, nghỉ 2 ngày, rồi ghi tiếp 3 ngày (`current_streak == 3`, `longest_streak == 5`).
2. `test_seven_day_challenge_progress_and_badges`: Kiểm tra tiến độ thử thách 7 ngày (`completed_days`, `progress_pct`, `is_completed=True` khi đủ 7/7 ngày và tên huy hiệu tương ứng).
3. `test_back_on_track_mode_no_calorie_penalty`: Kiểm tra khi người dùng ăn vượt TDEE hoặc bỏ lỡ 1 ngày, chế độ `back_on_track_active` bật `True` nhưng `calorie_penalty_applied` bắt buộc bằng `False` và `next_day_target_calories` giữ nguyên bằng `tdee_calories`.
4. `test_monthly_report_logging_and_nutrition_aggregation`: Tạo dữ liệu bữa ăn trong tháng, kiểm tra `total_logged_days`, `total_meals_logged`, `consistency_rate_pct` và `avg_daily_calories` tính đúng.
5. `test_monthly_report_weight_fluctuation_and_ema`: Tạo chuỗi `weight_logs` đầu tháng đến cuối tháng (ví dụ từ 72.0kg xuống 70.2kg), kiểm tra `start_weight_kg`, `end_weight_kg`, `raw_weight_change_kg == -1.8` và biến động EMA.
6. `test_monthly_report_strengths_extraction`: Kiểm tra danh sách `strengths` tự động nhận diện đúng điểm mạnh (chuỗi ngày streak, bữa sáng, kiểm soát calo) và luôn có ít nhất 1 điểm mạnh khi tài khoản mới.
7. `test_api_get_monthly_report_endpoint`: Dùng `TestClient` gọi `GET /api/v1/reports/monthly` với phiên đăng nhập hợp lệ, kiểm tra HTTP 200 và đầy đủ cấu trúc JSON.
8. `test_api_get_habits_status_endpoint`: Dùng `TestClient` gọi `GET /api/v1/habits/status`, kiểm tra HTTP 200 và dữ liệu `seven_day_challenge`.
9. `test_zero_trust_data_isolation_monthly_report`: Kiểm tra User B gọi `GET /api/v1/reports/monthly` tuyệt đối không nhìn thấy số ngày ghi nhật ký hay cân nặng của User A.
---
## 4. QUY TRÌNH TỰ KIỂM THỬ TOÀN HỆ THỐNG (W1 -> W6)
Sau khi lập trình xong:
1. Chạy `pytest tests/unit/test_w6_habit_and_monthly_report.py -v` đảm bảo 100% PASSED.
2. Chạy toàn bộ test toàn dự án `pytest -v` (bao gồm tất cả các bài test từ Tuần 1 đến Tuần 6) để đảm bảo không làm hỏng bất kỳ tính năng nào đã có.
3. Chạy `ruff check src/ tests/ scripts/` để đảm bảo code sạch lỗi lint.