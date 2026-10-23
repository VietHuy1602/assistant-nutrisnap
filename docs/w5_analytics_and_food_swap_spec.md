# KẾ HOẠCH & ĐẶC TẢ KỸ THUẬT TUẦN 5: PHÂN TÍCH HÀNH VI ĂN UỐNG, FOOD SWAP SIMULATOR & XU HƯỚNG CÂN NẶNG EMA
> **Dự án:** NutriSnap - Virtual AI Nutrition Assistant  
> **Cặp phụ trách:** Cặp 1 - Nguyễn Hoàng Việt Huy (25127060) & Nguyễn Trần Minh Đức (25127300)  
> **Nhiệm vụ Tuần 5 của Việt Huy (và Pair Session 5 Cặp 1):**
> 1. **Hàm Phân tích Hành vi (`analyze_user_patterns`):** Lập trình trong `src/backend/services/analytics_service.py` phân tích nhật ký 7–14 ngày để phát hiện mẫu thói quen (*bỏ bữa sáng*, *thiếu đạm*, *ăn khuya*), chỉ đưa ra nhận xét khi có đủ từ $5$ ngày dữ liệu trở lên.
> 2. **Backend Service Food Swap (`simulate_food_swap`):** Viết hàm truy vấn tìm các món ăn thay thế cùng nhóm trong bảng `food_references` để tính chính xác mức chênh lệch calo ước tính, đạm và chi phí VNĐ.
> 3. **Pair Session 5 (`weight_trend.py`):** Xây dựng thuật toán làm mịn xu hướng cân nặng EMA ($\text{EMA}_t = 0.1 \times W_t + 0.9 \times \text{EMA}_{t-1}$) và khóa an toàn hạn mức calo hàng ngày (không tự động cắt giảm calo ngày hôm sau khi ăn vượt mục tiêu).  
> **Nhánh Git thực thi:** `feat/w5-pair1-analytics-and-food-swap`

---

## 1. CÂU LỆNH PROMPT ĐỂ DÁN TRỰC TIẾP VÀO ANTIGRAVITY IDE

Bạn lưu tệp này vào `docs/w5_analytics_and_food_swap_spec.md`, mở khung **Chat của Antigravity IDE** và dán nguyên văn câu lệnh dưới đây:

```text
@README.md @.antigravityrules @src/backend/models/schema.py @src/backend/models/database.py @src/backend/services/auth_service.py @src/backend/services/goal_service.py @src/backend/services/nutrition_service.py @docs/w5_analytics_and_food_swap_spec.md

Hãy đọc kỹ toàn bộ đặc tả kỹ thuật Tuần 5 trong file @docs/w5_analytics_and_food_swap_spec.md và thực hiện tuần tự, tự động chạy kiểm thử để KHÔNG MẮC BẤT KỲ LỖI NÀO:
1. Lập trình `src/backend/services/analytics_service.py` bao gồm:
   - Hàm `analyze_user_patterns(session, authenticated_user_id, days_range=14)` tổng hợp dữ liệu bữa ăn 7–14 ngày, kiểm tra điều kiện tối thiểu 5 ngày có nhật ký (`logged_days_count >= 5`), và phát hiện 3 mẫu hành vi: bỏ bữa sáng (`skipping_breakfast`), thiếu đạm (`low_protein`), và ăn khuya sau 21:00 (`late_night_eating`) với lời khuyên trung lập, không phán xét.
   - Hàm `simulate_food_swap(session, current_food_id, current_food_name, portion_gram, swap_goal, max_budget_vnd, limit)` phân nhóm món ăn và truy vấn bảng `food_references` để tìm món thay thế, tính toán đại số chính xác độ chênh lệch Calo (`delta_calories`), Đạm (`delta_protein_g`), Carbs, Fat và Chi phí (`delta_price_vnd`).
2. Lập trình `src/backend/services/weight_trend.py` thực hiện thuật toán trung bình động hàm mũ EMA (`calculate_ema_weight_trend`) và hàm đảm bảo giữ nguyên hạn mức calo mục tiêu an toàn (`verify_safe_calorie_target_stability`).
3. Lập trình router `src/backend/routers/analytics_router.py` cung cấp các endpoints: `GET /api/v1/analytics/patterns`, `POST /api/v1/analytics/food-swap`, `GET /api/v1/analytics/weight-trend` (bắt buộc xác thực `current_user` từ HttpOnly Cookie JWT), và đăng ký vào `src/backend/main.py`.
4. Tạo bộ kiểm thử tự động `tests/unit/test_w5_analytics_and_food_swap.py` gồm 10 kịch bản kiểm thử toàn diện. Tự động chạy `pytest -v` và `ruff check`, nếu có bất kỳ lỗi nào phải tự sửa ngay cho đến khi đạt 100% PASSED.
```

---

## 2. QUY TẮC CHỐNG LỖI TUYỆT ĐỐI CHO ANTIGRAVITY AGENT (ZERO-ERROR GUARDRAILS)

1. **Rào chắn tối thiểu 5 ngày dữ liệu (`Minimum 5-Day Data Rule`):**
   - Trong `analyze_user_patterns`, hệ thống phải đếm số ngày duy nhất có ghi nhận bữa ăn (`logged_days_count`) trong khoảng `days_range`.
   - Nếu $\text{logged\_days\_count} < 5$: Trả về `status = "insufficient_data"`, `is_sufficient_data = False`, `patterns = []`, kèm thông báo trung lập: *"Cần tối thiểu 5 ngày ghi nhận nhật ký ăn uống để hệ thống phân tích mẫu thói quen chính xác."* Tuyệt đối không kết luận vội vàng khi mới có 1–4 ngày dữ liệu.
2. **Nguyên tắc Không Phán xét & Không Cắt giảm Calo Cực đoan:**
   - Mọi nhận xét hành vi đều dùng văn phong hỗ trợ nhẹ nhàng (ví dụ: gợi ý bổ sung trứng/ức gà/đậu hũ khi thiếu đạm, hoặc chuẩn bị bữa sáng gọn nhẹ).
   - Nếu người dùng có ngày ăn vượt mục tiêu $\text{TDEE}$, hạn mức calo mục tiêu của ngày tiếp theo (`locked_daily_target_calories`) vẫn giữ nguyên 100% theo `Goal`, tuyệt đối không tự động trừ bù calo vào ngày hôm sau.
3. **Tính toán Đại số Tất định trong Food Swap Simulator:**
   - Mọi phép tính chênh lệch năng lượng ($\Delta \text{Calo}$), đạm ($\Delta \text{Protein}$) và chi phí ($\Delta \text{Price}$) giữa món hiện tại và món thay thế đều phải tính bằng công thức đại số từ bảng `food_references` trên cùng khối lượng tham chiếu hoặc khẩu phần chuẩn.
4. **Bảo mật Zero-Trust (`WHERE user_id == current_jwt_user.id`):**
   - Các hàm `analyze_user_patterns` và `calculate_ema_weight_trend` bắt buộc nhận `authenticated_user_id` từ tầng xác thực Cookie JWT và chỉ truy vấn dữ liệu của đúng tài khoản đó.

---

## 3. ĐẶC TẢ CHI TIẾT CÁC TỆP MÃ NGUỒN CẦN XÂY DỰNG

### Bước 1: Chuẩn bị Nhánh Git
Mở Terminal tại thư mục gốc dự án và chạy:
```bash
git checkout main
git pull origin main
git checkout -b feat/w5-pair1-analytics-and-food-swap
```

---

### Bước 2: Lập trình Module Phân tích Hành vi & Food Swap (`src/backend/services/analytics_service.py`)

Tạo tệp `src/backend/services/analytics_service.py` cài đặt đầy đủ 2 chức năng cốt lõi sau:

#### 2.1. Chức năng 1 — Hàm Phân tích Mẫu Hành vi 7–14 ngày (`analyze_user_patterns`)

```python
def analyze_user_patterns(
    session: Session,
    authenticated_user_id: int,
    days_range: int = 14,
    reference_date: Optional[date] = None,
) -> dict:
```

1. **Kiểm tra tham số đầu vào:**
   - Chuẩn hóa `days_range`: hỗ trợ linh hoạt khoảng $7 \le \text{days\_range} \le 30$ (nếu truyền $< 7$ hoặc $> 30$ thì ném `ValueError("days_range phải nằm trong khoảng từ 7 đến 30 ngày")`).
   - Ngày kết thúc `end_date = reference_date or date.today()` và ngày bắt đầu `start_date = end_date - timedelta(days=days_range - 1)`.
2. **Truy vấn mục tiêu và dữ liệu nhật ký:**
   - Lấy bản ghi `Goal` của `authenticated_user_id`:
     - Nếu có `Goal`: $\text{target\_calories} = \text{goal.tdee\_calories}$, $\text{target\_protein\_g} = \text{round}\left(\frac{\text{target\_calories} \times 0.30}{4.0}, 1\right)$.
     - Nếu chưa có `Goal`: dùng mặc định $\text{target\_calories} = 2000.0$, $\text{target\_protein\_g} = 150.0$.
   - Truy vấn toàn bộ các bản ghi `Meal` của `authenticated_user_id` trong khoảng từ `00:00:00` ngày `start_date` đến `23:59:59` ngày `end_date`, kèm `MealItem` và `FoodReference`.
3. **Tổng hợp chỉ số theo từng ngày có ghi nhật ký:**
   - Nhóm các bữa ăn theo ngày `meal_date = meal.logged_at.date()`.
   - Gọi $D = \text{logged\_days\_count}$ là số ngày duy nhất có ít nhất 1 bữa ăn được ghi nhận.
   - **Kiểm tra điều kiện đủ dữ liệu ($D \ge 5$):**
     - Nếu $D < 5$: Trả về ngay dictionary có `status = "insufficient_data"`, `is_sufficient_data = False`, `logged_days_count = D`, `minimum_required_days = 5`, `patterns = []`, `locked_daily_target_calories = target_calories`, cùng `disclaimer`.
4. **Phát hiện 3 Mẫu Thói quen Cốt lõi khi $D \ge 5$:**
   - **Mẫu 1: Hay bỏ bữa sáng (`skipping_breakfast`):**
     - Đếm số ngày trong $D$ ngày có ghi nhận bữa ăn mang nhãn `meal_type == "Sáng"` (gọi là $D_{\text{breakfast}}$).
     - Tỷ lệ ăn sáng:
       $$\text{Breakfast\_Rate} = \text{round}\left(\frac{D_{\text{breakfast}}}{D}, 2\right)$$
     - Nếu $\text{Breakfast\_Rate} < 0.50$ (tức là bỏ bữa sáng từ $> 50\%$ số ngày có ghi chép):
       - Thêm vào danh sách `patterns` phần tử:
         - `pattern_code`: `"skipping_breakfast"`
         - `title`: `"Thói quen bỏ bữa sáng"`
         - `severity`: `"gentle_reminder"`
         - `metrics`: `{"breakfast_days": D_breakfast, "logged_days": D, "breakfast_rate": Breakfast_Rate}`
         - `recommendation`: `"Bạn mới ghi nhận bữa sáng trong {D_breakfast}/{D} ngày gần đây. Một bữa sáng gọn nhẹ giàu đạm (như trứng ốp la, phở gà hoặc sữa chua Hy Lạp) sẽ giúp duy trì năng lượng ổn định suốt buổi sáng."`
   - **Mẫu 2: Thiếu hụt chất đạm (`low_protein`):**
     - Tính tổng lượng đạm (protein) nạp vào của mỗi ngày $d \in \{1, \dots, D\}$ từ bảng `meal_items` và `food_references`:
       $$\text{Protein}_{d} = \sum_{j \in \text{Meal}_d} \left(\frac{\text{estimated\_gram}_j}{100.0} \times \text{protein\_per\_100g}_j\right)$$
     - Tính lượng đạm trung bình mỗi ngày:
       $$\text{Avg\_Daily\_Protein} = \text{round}\left(\frac{\sum_{d=1}^{D} \text{Protein}_d}{D}, 1\right)$$
     - Nếu $\text{Avg\_Daily\_Protein} < 0.75 \times \text{target\_protein\_g}$:
       - Thêm vào danh sách `patterns` phần tử:
         - `pattern_code`: `"low_protein"`
         - `title`: `"Lượng đạm (Protein) trung bình chưa đạt mục tiêu"`
         - `severity`: `"nutrition_balance"`
         - `metrics`: `{"avg_daily_protein_g": Avg_Daily_Protein, "target_protein_g": target_protein_g}`
         - `recommendation`: `"Lượng đạm ước tính trung bình của bạn đạt khoảng {Avg_Daily_Protein}g/ngày (mục tiêu tham khảo {target_protein_g}g). Bạn có thể bổ sung thêm ức gà, cá, đậu hũ hoặc trứng vào bữa chính để bảo vệ cơ bắp tốt hơn."`
   - **Mẫu 3: Thói quen ăn khuya (`late_night_eating`):**
     - Đếm số ngày trong $D$ ngày có bữa ăn được ghi nhận vào khung giờ khuya (`meal.logged_at.hour >= 21`, tức từ 21:00 đêm trở đi, gọi là $D_{\text{late}}$).
     - Tỷ lệ ngày ăn khuya:
       $$\text{Late\_Night\_Rate} = \text{round}\left(\frac{D_{\text{late}}}{D}, 2\right)$$
     - Nếu $D_{\text{late}} \ge 3$ hoặc $\text{Late\_Night\_Rate} \ge 0.30$:
       - Thêm vào danh sách `patterns` phần tử:
         - `pattern_code`: `"late_night_eating"`
         - `title`: `"Thói quen ăn muộn sau 21:00"`
         - `severity`: `"habit_observation"`
         - `metrics`: `{"late_night_days": D_late, "logged_days": D, "late_night_rate": Late_Night_Rate}`
         - `recommendation`: `"Hệ thống ghi nhận bạn có {D_late} ngày dùng bữa sau 21:00. Nếu đói vào buổi tối, bạn có thể ưu tiên các món nhẹ dễ tiêu hóa như sữa hạt không đường, súp rau củ hoặc trái cây ít ngọt."`
5. **Tổng hợp kết quả trả về:**
   - Trả về đầy đủ: `status = "analyzed"`, `is_sufficient_data = True`, `user_id = authenticated_user_id`, `days_range`, `logged_days_count = D`, `summary_metrics` (`avg_daily_calories`, `avg_daily_protein_g`, `breakfast_days_count`, `late_night_days_count`), `patterns`, `locked_daily_target_calories = target_calories` (khẳng định không cắt giảm calo cực đoan), và `disclaimer`.

---

#### 2.2. Chức năng 2 — Backend Service Food Swap Simulator (`simulate_food_swap`)

1. **Hàm phân loại nhóm thực phẩm (`classify_food_category(food_name: str) -> str`):**
   Để khi đổi món trên giao diện Food Swap Simulator, hệ thống ưu tiên gợi ý các món **cùng nhóm ẩm thực** (ví dụ: đổi đồ uống có đường sang đồ uống ít calo, đổi món nước nhiều mỡ sang món nước thanh đạm, đổi món cơm nhiều calo sang món cơm/tinh bột cân bằng):
   - `"beverage"`: tên món chứa các từ khóa `["nước ngọt", "coca", "pepsi", "trà", "cà phê", "sinh tố", "nước ép", "sữa", "bia", "nước mía", "nước dừa", "matcha", "ca cao"]`.
   - `"noodle_soup"`: tên món chứa `["phở", "bún", "hủ tiếu", "miến", "bánh canh", "mì", "nui", "hoành thánh", "cháo", "súp"]`.
   - `"rice_dish"`: tên món chứa `["cơm", "xôi"]`.
   - `"snack_bakery"`: tên món chứa `["bánh mì", "bánh bao", "bánh cuốn", "bánh xèo", "bánh tráng", "gỏi cuốn", "khoai", "bắp", "chè", "bánh ngọt", "bánh flan", "kem"]`.
   - `"vegetable_side"`: tên món chứa `["rau", "salad", "canh", "bông cải", "dưa", "cà chua", "đậu bắp", "mướp", "bầu", "bí"]`.
   - `"protein_dish"`: các món đạm và món mặn còn lại (`"gà"`, `"bò"`, `"heo"`, `"cá"`, `"tôm"`, `"trứng"`, `"đậu hũ"`, ...).

2. **Hàm mô phỏng đổi món (`simulate_food_swap`):**
```python
def simulate_food_swap(
    session: Session,
    current_food_id: Optional[int] = None,
    current_food_name: Optional[str] = None,
    portion_gram: float = 250.0,
    swap_goal: str = "reduce_calories",
    max_budget_vnd: Optional[int] = None,
    same_category_only: bool = True,
    limit: int = 5,
) -> dict:
```
   - **Bước 1 (Xác thực đầu vào):**
     - Kiểm tra `portion_gram` qua `validate_portion_gram(portion_gram)` ($0 < \text{portion\_gram} \le 3000\text{g}$).
     - Kiểm tra `swap_goal` thuộc `{"reduce_calories", "high_protein", "balanced_saver"}` (nếu sai ném `ValueError`).
     - Tìm món ăn gốc `source_ref = resolve_food_reference(session, current_food_id, current_food_name)`.
   - **Bước 2 (Tính chỉ số dinh dưỡng và chi phí của món gốc trên `portion_gram`):**
     $$\text{Factor} = \frac{\text{portion\_gram}}{100.0}$$
     $$\text{Calo}_{\text{src}} = \text{round}(\text{Factor} \times \text{source\_ref.calories\_per\_100g}, 2)$$
     $$\text{Protein}_{\text{src}} = \text{round}(\text{Factor} \times \text{source\_ref.protein\_per\_100g}, 2)$$
     $$\text{Carbs}_{\text{src}} = \text{round}(\text{Factor} \times \text{source\_ref.carbs\_per\_100g}, 2)$$
     $$\text{Fat}_{\text{src}} = \text{round}(\text{Factor} \times \text{source\_ref.fat\_per\_100g}, 2)$$
     $$\text{Price}_{\text{src}} = \text{round}(\text{Factor} \times \text{source\_ref.avg\_price\_vnd})$$
   - **Bước 3 (Truy vấn và lọc danh sách món thay thế từ `food_references`):**
     - Xác định nhóm của món gốc: `source_category = classify_food_category(source_ref.food_name)`.
     - Lấy các món trong `food_references` (khác `source_ref.id`, ưu tiên các món ăn Việt Nam hoàn chỉnh không có hậu tố `"(USDA)"` trừ khi món gốc cũng là nguyên liệu `"(USDA)"`).
     - Nếu `same_category_only is True`: ưu tiên lọc các ứng viên có `classify_food_category(cand.food_name) == source_category` (nếu số ứng viên cùng nhóm $< \text{limit}$ thì mới bổ sung thêm từ nhóm lành mạnh khác).
     - Áp dụng bộ lọc theo `swap_goal`:
       - Nếu `"reduce_calories"`: chọn các món có $\text{cand.calories\_per\_100g} < \text{source\_ref.calories\_per\_100g}$. Sắp xếp theo lượng calo tiết kiệm được nhiều nhất và giàu đạm.
       - Nếu `"high_protein"`: chọn các món có $\text{cand.protein\_per\_100g} > \text{source\_ref.protein\_per\_100g}$. Sắp xếp theo `protein_per_100g` giảm dần.
       - Nếu `"balanced_saver"`: chọn các món có $\text{cand.avg\_price\_vnd} \le \text{source\_ref.avg\_price\_vnd}$ và $\text{cand.calories\_per\_100g} \le \text{source\_ref.calories\_per\_100g}$.
     - Nếu có truyền `max_budget_vnd`: lọc $\text{Price}_{\text{alt}} \le \text{max\_budget\_vnd}$.
   - **Bước 4 (Tính toán Đại số Chênh lệch $\Delta$ cho từng phương án thay thế):**
     Với mỗi món thay thế $k$, tính dinh dưỡng trên cùng `portion_gram` và tính độ chênh lệch so với món gốc ($\Delta = \text{Alternative} - \text{Source}$):
     $$\Delta \text{Calo}_k = \text{round}(\text{Calo}_{\text{alt}, k} - \text{Calo}_{\text{src}}, 2), \quad \text{Calories\_Saved}_k = \text{round}(\text{Calo}_{\text{src}} - \text{Calo}_{\text{alt}, k}, 2)$$
     $$\Delta \text{Protein}_k = \text{round}(\text{Protein}_{\text{alt}, k} - \text{Protein}_{\text{src}}, 2)$$
     $$\Delta \text{Carbs}_k = \text{round}(\text{Carbs}_{\text{alt}, k} - \text{Carbs}_{\text{src}}, 2)$$
     $$\Delta \text{Fat}_k = \text{round}(\text{Fat}_{\text{alt}, k} - \text{Fat}_{\text{src}}, 2)$$
     $$\Delta \text{Price}_k = \text{Price}_{\text{alt}, k} - \text{Price}_{\text{src}}$$
   - **Bước 5 (Trả về kết quả):**
     Trả về dictionary chứa `source_food`, `swap_goal`, `portion_gram`, `alternatives` (danh sách tối đa `limit` món kèm đầy đủ chỉ số và khối `comparison_delta`), `non_restrictive_note` (*"Gợi ý thay thế mang tính tham khảo linh hoạt, bạn vẫn có thể thưởng thức món ăn yêu thích với khẩu phần hợp lý"*), và `disclaimer`.

---

### Bước 3: Lập trình Module Xu hướng Cân nặng EMA & Ổn định Calo (`src/backend/services/weight_trend.py`)

Tạo tệp `src/backend/services/weight_trend.py` phục vụ Pair Session 5 của Cặp 1:

1. `calculate_ema_weight_trend(session: Session, authenticated_user_id: int, days_range: int = 14, alpha: float = 0.1) -> dict`:
   - Kiểm tra $0 < \alpha \le 1.0$ (mặc định $\alpha = 0.1$ theo đúng công thức đặc tả PDF Trang 10).
   - Truy vấn lịch sử `WeightLog` của `authenticated_user_id` trong `days_range` ngày gần nhất, sắp xếp theo `logged_date ASC, id ASC`.
   - Tính chuỗi điểm dữ liệu `trend_points`:
     - Tại ngày đầu tiên ($t = 0$): $\text{EMA}_0 = \text{round}(W_0, 2)$.
     - Tại các ngày tiếp theo ($t \ge 1$):
       $$\text{EMA}_t = \text{round}(\alpha \times W_t + (1 - \alpha) \times \text{EMA}_{t-1}, 2)$$
   - Trả về danh sách `series` (mỗi điểm gồm `date`, `raw_weight_kg`, `ema_weight_kg`), `start_weight_kg`, `latest_weight_kg`, `latest_ema_kg`, `raw_change_kg`, `ema_change_kg`, và `disclaimer`.
2. `verify_safe_calorie_target_stability(session: Session, authenticated_user_id: int, yesterday_consumed_calories: float) -> dict`:
   - Lấy mục tiêu `target_calories` từ bảng `goals` của `authenticated_user_id`.
   - Dù `yesterday_consumed_calories > target_calories` (ví dụ ăn vượt $500\text{ kcal}$ hoặc $1000\text{ kcal}$ vào hôm qua), hàm vẫn trả về `today_target_calories == target_calories`, `penalty_applied = 0.0`, `is_target_locked = True`, kèm thông điệp khích lệ trung lập.

---

### Bước 4: Lập trình Router Phân tích & Đổi món (`src/backend/routers/analytics_router.py` & `src/backend/main.py`)

1. Tạo tệp `src/backend/routers/analytics_router.py` với tiền tố `/api/v1/analytics`:
   - `GET /api/v1/analytics/patterns`:
     - Query param: `days_range: int = 14`.
     - Xác thực `current_user: User = Depends(get_current_user)`.
     - Gọi `analyze_user_patterns(session, current_user.id, days_range=days_range)`.
   - `POST /api/v1/analytics/food-swap`:
     - Body (`FoodSwapRequest`): `current_food_id: Optional[int] = None`, `current_food_name: Optional[str] = None`, `portion_gram: float = 250.0`, `swap_goal: str = "reduce_calories"`, `max_budget_vnd: Optional[int] = None`, `same_category_only: bool = True`, `limit: int = 5`.
     - Xác thực `current_user: User = Depends(get_current_user)`.
     - Gọi `simulate_food_swap(...)`.
   - `GET /api/v1/analytics/weight-trend`:
     - Query param: `days_range: int = 14`.
     - Xác thực `current_user: User = Depends(get_current_user)`.
     - Gọi `calculate_ema_weight_trend(session, current_user.id, days_range=days_range)`.
2. Cập nhật `src/backend/main.py`:
   - Import và đăng ký `app.include_router(analytics_router)`.

---

## 4. KỊCH BẢN TỰ KIỂM TRA TOÀN DIỆN (`tests/unit/test_w5_analytics_and_food_swap.py`)

Antigravity phải tạo tệp `tests/unit/test_w5_analytics_and_food_swap.py` bao gồm đầy đủ 10 bài kiểm thử tự động:

1. `test_01_analyze_patterns_insufficient_data_under_5_days`: Người dùng mới chỉ ghi nhật ký 3 ngày ($D = 3 < 5$). Xác minh `analyze_user_patterns` trả về `status == "insufficient_data"`, `is_sufficient_data is False` và `patterns == []`.
2. `test_02_detect_skipping_breakfast_pattern`: Người dùng ghi nhật ký 7 ngày nhưng chỉ ăn sáng 1 ngày ($\text{Breakfast\_Rate} = 1/7 \approx 0.14 < 0.50$). Xác minh hệ thống phát hiện đúng `"skipping_breakfast"` trong `patterns`.
3. `test_03_detect_low_protein_pattern`: Người dùng có mục tiêu đạm $135\text{g/ngày}$ nhưng trong 6 ngày liên tiếp chỉ ăn các món ít đạm (trung bình $< 60\text{g/ngày}$). Xác minh hệ thống phát hiện đúng `"low_protein"`.
4. `test_04_detect_late_night_eating_pattern`: Người dùng ghi nhận bữa ăn lúc `22:15` (sau 21:00) trong 4 trên 6 ngày có nhật ký. Xác minh hệ thống phát hiện đúng `"late_night_eating"`.
5. `test_05_food_swap_reduce_calories_beverage_and_rice`: Kiểm tra `simulate_food_swap` khi đổi `"Cơm tấm sườn bì chả"` ($250\text{g}$) hoặc `"Cà phê sữa đá"` sang món cùng nhóm theo mục tiêu `"reduce_calories"`. Xác minh mọi phương án gợi ý đều có `delta_calories < 0`, `calories_saved > 0` và phép trừ đại số khớp 100%.
6. `test_06_food_swap_high_protein_and_budget_filter`: Kiểm tra `simulate_food_swap` với `swap_goal="high_protein"` và `max_budget_vnd=45000`. Xác minh tất cả các món thay thế đều có `delta_protein_g > 0` và giá tiền ước tính $\le 45,000\text{ VNĐ}$.
7. `test_07_ema_weight_trend_mathematical_accuracy`: Nhập chuỗi 5 ngày cân nặng $[70.0, 71.0, 70.5, 69.8, 69.5]$ cho người dùng. Xác minh `calculate_ema_weight_trend` tính chính xác từng điểm theo công thức $\text{EMA}_t = \text{round}(0.1 \times W_t + 0.9 \times \text{EMA}_{t-1}, 2)$.
8. `test_08_non_punitive_calorie_target_stability`: Kiểm tra `verify_safe_calorie_target_stability` khi hôm qua ăn vượt $1000\text{ kcal}$ so với TDEE. Xác minh hạn mức calo hôm nay vẫn giữ nguyên, `penalty_applied == 0.0` và `is_target_locked is True`.
9. `test_09_analytics_and_food_swap_api_endpoints`: Kiểm tra gọi trực tiếp 3 endpoints `GET /api/v1/analytics/patterns`, `POST /api/v1/analytics/food-swap` và `GET /api/v1/analytics/weight-trend` qua `TestClient` kèm HttpOnly Cookie JWT trả về `HTTP 200 OK` và đúng cấu trúc JSON.
10. `test_10_zero_trust_analytics_user_isolation`: Tạo User A (có 7 ngày dữ liệu bỏ bữa sáng & ăn khuya) và User B (mới đăng ký, 0 ngày dữ liệu). Khi User B gọi `GET /api/v1/analytics/patterns` và `GET /api/v1/analytics/weight-trend`, xác minh User B chỉ nhận trạng thái `insufficient_data` của riêng mình, tuyệt đối không bị lộ dữ liệu của User A.

---

## 5. VÒNG LẶP TỰ CHẠY KIỂM TRA & BÀN GIAO GIT

Antigravity tự động chạy tuần tự các lệnh sau trên Terminal tích hợp và chỉ dừng lại khi đạt 100% tiêu chuẩn:

```bash
# Bước 1: Chạy bộ kiểm thử tự động Tuần 5
pytest tests/unit/test_w5_analytics_and_food_swap.py -v

# Bước 2: Chạy kiểm thử toàn bộ dự án (Tuần 1 -> Tuần 5) và kiểm tra chuẩn code với Ruff
pytest -v
ruff check src/ tests/ scripts/
```

Sau khi toàn bộ bài test đều báo **`PASSED`** và `ruff check` báo **`All checks passed!`**, cập nhật thêm 1 dòng vào `docs/ai_use_log.md` rồi chạy lệnh đẩy lên GitHub:

```bash
git status
git add src/ tests/ docs/
git commit -m "feat(w5-pair1): implement 7-14d habit pattern analytics, food swap simulator, and EMA weight trend"
git push -u origin feat/w5-pair1-analytics-and-food-swap
```