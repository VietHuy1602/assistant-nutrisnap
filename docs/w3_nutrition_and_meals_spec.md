# KẾ HOẠCH & ĐẶC TẢ KỸ THUẬT TUẦN 3: DETERMINISTIC NUTRITION ENGINE, API NHẬT KÝ & DASHBOARD DEMO

> **Dự án:** NutriSnap - Virtual AI Nutrition Assistant  
> **Cặp phụ trách:** Cặp 1 - Nguyễn Hoàng Việt Huy (25127060) & Nguyễn Trần Minh Đức (25127300)  
> **Nhiệm vụ Tuần 3 của Việt Huy:**  
> 1. Lập trình `src/backend/services/nutrition_service.py`: Tính chính xác calo/macro từ số gam và bảng `food_references` bằng công thức đại số (**Deterministic Nutrition Engine**).  
> 2. Viết API `POST /api/v1/meals/log` (lưu bữa ăn) và `GET /api/v1/meals/daily-dashboard`; viết script nạp dữ liệu mẫu cho 3 tài khoản demo (**API Nhật ký & Dashboard**).  
> **Nhánh Git thực thi:** `w3/viethuy-nutrition-and-dashboard`

---

## 1. CÂU LỆNH PROMPT ĐỂ DÁN TRỰC TIẾP VÀO ANTIGRAVITY IDE

Bạn lưu tệp này vào `docs/w3_nutrition_and_meals_spec.md`, mở khung **Chat của Antigravity IDE** và dán nguyên văn câu lệnh dưới đây:

```text
@README.md @.antigravityrules @src/backend/models/schema.py @src/backend/models/database.py @src/backend/services/validators.py @src/backend/services/auth_service.py @src/backend/services/goal_service.py @docs/w3_nutrition_and_meals_spec.md

Hãy đọc kỹ toàn bộ đặc tả kỹ thuật trong file @docs/w3_nutrition_and_meals_spec.md và thực hiện tuần tự, tự động kiểm thử để KHÔNG MẮC BẤT KỲ LỖI NÀO:
1. Lập trình `src/backend/services/nutrition_service.py` thực hiện Deterministic Nutrition Engine: tra cứu món ăn từ bảng `food_references` (theo `food_id` hoặc khớp tên `food_name`), kiểm tra khối lượng hợp lệ qua `validate_portion_gram`, hỗ trợ hệ số trừ hao thức ăn thừa (`eaten_ratio`) và tính chính xác calo, protein, carbs, fat, chi phí ước tính bằng công thức đại số cố định.
2. Lập trình hàm lưu bữa ăn có kiểm tra xác nhận 2 bước (`is_confirmed`) và hàm tổng hợp dữ liệu tiến trình ngày (`get_daily_dashboard_data`) trong `src/backend/services/nutrition_service.py`.
3. Lập trình router `src/backend/routers/meal_router.py` cung cấp 2 endpoints: `POST /api/v1/meals/log` và `GET /api/v1/meals/daily-dashboard` (bắt buộc xác thực `current_user` từ HttpOnly Cookie JWT), sau đó gắn router vào `src/backend/main.py`.
4. Lập trình script `scripts/seed_demo_accounts.py` nạp sẵn 3 tài khoản demo (`student_user`, `office_user`, `gym_user`) kèm mục tiêu Goal, 7 ngày lịch sử cân nặng và 7 ngày nhật ký bữa ăn (bao gồm cả ngày hôm nay để Dashboard hiển thị ngay khi demo PoC).
5. Tạo bộ kiểm thử tự động `tests/unit/test_w3_nutrition_and_meals.py` gồm 8 kịch bản kiểm thử toàn diện. Tự động chạy `python scripts/seed_demo_accounts.py`, `pytest` và `ruff check`, nếu có bất kỳ lỗi nào phải tự sửa ngay cho đến khi đạt 100% PASSED.
```

---

## 2. QUY TẮC CHỐNG LỖI TUYỆT ĐỐI CHO ANTIGRAVITY AGENT (ZERO-ERROR GUARDRAILS)

1. **100% Tính toán Đại số Tất định (Zero Hallucination Math):**
   * Tuyệt đối không gọi LLM trong `nutrition_service.py`. Mọi con số calo, protein, carbs, fat đều phải được tính từ các cột `calories_per_100g`, `protein_per_100g`, `carbs_per_100g`, `fat_per_100g` của bảng `food_references` trong SQLite.
2. **Bảo mật Zero-Trust & Cô lập Dữ liệu:**
   * Cả 2 API `POST /api/v1/meals/log` và `GET /api/v1/meals/daily-dashboard` bắt buộc lấy `authenticated_user_id = current_user.id` từ dependency `Depends(get_current_user)`. Tuyệt đối không nhận `user_id` từ request body hay query params.
3. **Luồng Xác nhận 2 Bước (`Two-step Confirmation Flow`):**
   * Khi gọi `POST /api/v1/meals/log` với `is_confirmed = False`: Hệ thống chỉ tính toán và trả về bản xem trước (`status = "pending_confirmation"`), tuyệt đối chưa ghi vào bảng `meals` và `meal_items`.
   * Khi gọi với `is_confirmed = True`: Hệ thống thực hiện ghi nguyên tử (atomic transaction) vào bảng `meals` và `meal_items`, trả về `status = "logged"` kèm `meal_id`.
4. **Tính Lũy đẳng (Idempotency) khi Nạp Tài khoản Demo:**
   * Script `scripts/seed_demo_accounts.py` phải kiểm tra nếu 3 tài khoản demo đã tồn tại thì làm mới (xóa dữ liệu cũ của 3 tài khoản này rồi nạp lại) để có thể chạy lại nhiều lần trước buổi báo cáo PoC mà không bị lỗi `UNIQUE constraint failed`.

---

## 3. ĐẶC TẢ CHI TIẾT CÁC TỆP MÃ NGUỒN CẦN XÂY DỰNG

### Bước 1: Chuẩn bị Nhánh Git
Mở Terminal tại thư mục gốc dự án và chạy:
```bash
git checkout main
git pull origin main
git checkout -b w3/viethuy-nutrition-and-dashboard
```

---

### Bước 2: Lập trình Deterministic Nutrition Engine (`src/backend/services/nutrition_service.py`)

Tạo tệp `src/backend/services/nutrition_service.py` với đầy đủ các schemas Pydantic và các hàm dịch vụ sau:

#### 2.1. Các Schemas Đầu vào / Đầu ra (Pydantic Models)
* `MealItemInput`:
  * `food_id: Optional[int] = None`
  * `food_name: Optional[str] = None`
  * `estimated_gram: float` (khối lượng ước tính của món trên đĩa, đơn vị gam)
  * `eaten_ratio: float = Field(default=1.0, gt=0.0, le=1.0)` (tỷ lệ ăn thực tế để trừ hao thức ăn thừa, mặc định $1.0$ tương ứng $100\%$, nếu ăn một nửa là $0.5$)
* `CalculatedMealItem`:
  * `food_id: int`
  * `food_name: str`
  * `estimated_gram: float`
  * `eaten_ratio: float`
  * `effective_gram: float`
  * `calories: float`
  * `protein_g: float`
  * `carbs_g: float`
  * `fat_g: float`
  * `estimated_price_vnd: int`
* `NutritionCalculationResult`:
  * `items: List[CalculatedMealItem]`
  * `total_weight_g: float`
  * `total_calories: float`
  * `total_protein_g: float`
  * `total_carbs_g: float`
  * `total_fat_g: float`
  * `total_estimated_price_vnd: int`
  * `disclaimer: str = "Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo."`
* `MealLogRequest`:
  * `meal_type: str` (chỉ nhận một trong 4 giá trị: `"Sáng"`, `"Trưa"`, `"Tối"`, `"Phụ"`)
  * `items: List[MealItemInput]` (tối thiểu 1 món)
  * `image_path: Optional[str] = None`
  * `logged_at: Optional[datetime] = None`
  * `is_confirmed: bool = False`
* `MealLogResponse`:
  * `status: str` (`"pending_confirmation"` hoặc `"logged"`)
  * `meal_id: Optional[int] = None`
  * `meal_type: str`
  * `logged_at: datetime`
  * `nutrition: NutritionCalculationResult`
  * `disclaimer: str`

#### 2.2. Hàm Tìm kiếm & Ánh xạ Thực phẩm (`resolve_food_reference`)
Hàm `resolve_food_reference(session: Session, food_id: Optional[int] = None, food_name: Optional[str] = None) -> FoodReference`:
1. Nếu có `food_id`, truy vấn trực tiếp `session.get(FoodReference, food_id)`. Nếu tìm thấy thì trả về ngay.
2. Nếu có `food_name`:
   * Chuẩn hóa chuỗi (`food_name.strip()`).
   * Bước 2a: Tìm khớp chính xác không phân biệt hoa thường (`func.lower(FoodReference.food_name) == food_name.lower()`).
   * Bước 2b: Nếu chưa thấy, tìm khớp chuỗi con (`FoodReference.food_name.ilike(f"%{food_name}%")`).
   * Bước 2c: Nếu vẫn chưa thấy, dùng `difflib.get_close_matches` so khớp với danh sách tên món trong `food_references` (ngưỡng `cutoff=0.6`).
3. Nếu không tìm thấy món ăn hoặc cả `food_id` và `food_name` đều rỗng, ném `ValueError(f"Không tìm thấy món ăn trong CSDL tham chiếu: {food_name or food_id}")`.

#### 2.3. Công thức Đại số Tính Dinh dưỡng (`calculate_meal_nutrition`)
Hàm `calculate_meal_nutrition(session: Session, items: List[MealItemInput]) -> NutritionCalculationResult`:
1. Kiểm tra danh sách `items` không được rỗng (nếu rỗng ném `ValueError`).
2. Với từng phần tử $i$ trong `items`:
   * Tính khối lượng thực tế nạp vào sau khi trừ thức ăn thừa:
     $$G_i = \text{round}(\text{estimated\_gram}_i \times \text{eaten\_ratio}_i, 2)$$
   * Gọi `validate_portion_gram(G_i)` từ `src/backend/services/validators.py` (đảm bảo $0 < G_i \le 3000\text{g}$, nếu sai ném `ValueError`).
   * Tra cứu bản ghi `ref = resolve_food_reference(session, item.food_id, item.food_name)`.
   * Tính toán chính xác từng chỉ số dinh dưỡng trên khối lượng thực tế $G_i$:
     $$\text{Calo}_i = \text{round}\left(\frac{G_i}{100.0} \times \text{ref.calories\_per\_100g}, 2\right)$$
     $$\text{Protein}_i = \text{round}\left(\frac{G_i}{100.0} \times \text{ref.protein\_per\_100g}, 2\right)$$
     $$\text{Carbs}_i = \text{round}\left(\frac{G_i}{100.0} \times \text{ref.carbs\_per\_100g}, 2\right)$$
     $$\text{Fat}_i = \text{round}\left(\frac{G_i}{100.0} \times \text{ref.fat\_per\_100g}, 2\right)$$
     $$\text{Price}_i = \text{round}\left(\frac{G_i}{100.0} \times \text{ref.avg\_price\_vnd}\right)$$
3. Cộng tổng toàn bộ các món trong bữa ăn:
   $$\text{Total\_Calo} = \text{round}\left(\sum_{i=1}^{n} \text{Calo}_i, 2\right), \quad \text{Total\_Protein} = \text{round}\left(\sum_{i=1}^{n} \text{Protein}_i, 2\right)$$
   $$\text{Total\_Carbs} = \text{round}\left(\sum_{i=1}^{n} \text{Carbs}_i, 2\right), \quad \text{Total\_Fat} = \text{round}\left(\sum_{i=1}^{n} \text{Fat}_i, 2\right)$$
4. Trả về đối tượng `NutritionCalculationResult`.

#### 2.4. Hàm Ghi nhận Bữa ăn (`log_user_meal`)
Hàm `log_user_meal(session: Session, authenticated_user_id: int, req: MealLogRequest) -> MealLogResponse`:
1. Kiểm tra `req.meal_type` nằm trong `{"Sáng", "Trưa", "Tối", "Phụ"}`, nếu sai ném `ValueError`.
2. Gọi `nutrition_res = calculate_meal_nutrition(session, req.items)`.
3. Thời gian ghi nhận: `logged_time = req.logged_at or datetime.utcnow()`.
4. **Nếu `req.is_confirmed is False`:**
   * Không lưu vào CSDL.
   * Trả về `MealLogResponse(status="pending_confirmation", meal_id=None, meal_type=req.meal_type, logged_at=logged_time, nutrition=nutrition_res, disclaimer=nutrition_res.disclaimer)`.
5. **Nếu `req.is_confirmed is True`:**
   * Tạo bản ghi `Meal(user_id=authenticated_user_id, meal_type=req.meal_type, image_path=req.image_path, logged_at=logged_time)`.
   * Thực hiện `session.add(meal)` và `session.flush()` để lấy `meal.id`.
   * Với mỗi món trong `nutrition_res.items`, tạo bản ghi `MealItem`:
     * `meal_id = meal.id`
     * `food_id = calc_item.food_id`
     * `estimated_gram = calc_item.effective_gram`
     * `estimated_calories = calc_item.calories`
   * Thực hiện `session.commit()` và `session.refresh(meal)`.
   * Trả về `MealLogResponse(status="logged", meal_id=meal.id, meal_type=meal.meal_type, logged_at=meal.logged_at, nutrition=nutrition_res, disclaimer=nutrition_res.disclaimer)`.

#### 2.5. Hàm Tổng hợp Dashboard Ngày (`get_daily_dashboard_data`)
Hàm `get_daily_dashboard_data(session: Session, authenticated_user_id: int, target_date: Optional[date] = None) -> dict`:
1. Ngày 조회: `query_date = target_date or date.today()`.
2. Lấy mục tiêu hiện tại của người dùng từ bảng `goals` (`WHERE Goal.user_id == authenticated_user_id`):
   * Nếu có `Goal`: lấy `target_calories = goal.tdee_calories`, `daily_budget_vnd = goal.daily_budget_vnd`.
   * Nếu người dùng chưa tạo `Goal`: dùng giá trị mặc định tham khảo `target_calories = 2000.0`, `daily_budget_vnd = 60000`.
   * Tính mục tiêu Macro tham chiếu theo ngày:
     $$\text{Target\_Protein} = \text{round}\left(\frac{\text{target\_calories} \times 0.30}{4}, 1\right), \quad \text{Target\_Carbs} = \text{round}\left(\frac{\text{target\_calories} \times 0.40}{4}, 1\right), \quad \text{Target\_Fat} = \text{round}\left(\frac{\text{target\_calories} \times 0.30}{9}, 1\right)$$
3. Truy vấn tất cả các bữa ăn trong bảng `meals` của `authenticated_user_id` có ngày thuộc `query_date` (từ `00:00:00` đến `23:59:59` của `query_date`), sắp xếp theo `logged_at` tăng dần.
4. Với mỗi bữa ăn, lấy danh sách `meal_items` kết hợp (`JOIN`) với bảng `food_references` để tính lại đầy đủ `calories`, `protein_g`, `carbs_g`, `fat_g` của từng món:
   $$\text{Protein}_{item} = \text{round}\left(\frac{\text{meal\_item.estimated\_gram}}{100.0} \times \text{ref.protein\_per\_100g}, 2\right)$$
   *(Tương tự cho `carbs_g`, `fat_g`, `estimated_price_vnd`)*.
5. Cộng tổng năng lượng và các chất đã nạp trong ngày (`consumed_calories`, `consumed_protein_g`, `consumed_carbs_g`, `consumed_fat_g`, `consumed_budget_vnd`) và tính phần còn lại:
   $$\text{Remaining\_Calories} = \text{round}(\text{target\_calories} - \text{consumed\_calories}, 2)$$
   $$\text{Remaining\_Protein} = \text{round}(\text{Target\_Protein} - \text{consumed\_protein\_g}, 1)$$
6. Trả về cấu trúc Dictionary/Pydantic rõ ràng gồm: `date`, `user_id`, `targets`, `consumed`, `remaining`, `meals_count`, `meals` (danh sách chi tiết từng bữa ăn Sáng/Trưa/Tối/Phụ và các món bên trong), cùng `disclaimer`.

---

### Bước 3: Lập trình Router Nhật ký & Dashboard (`src/backend/routers/meal_router.py` & `src/backend/main.py`)

1. Tạo tệp `src/backend/routers/meal_router.py`:
   * `POST /api/v1/meals/log`:
     * Nhận `req: MealLogRequest`, `current_user: User = Depends(get_current_user)`, `session: Session = Depends(get_session)`.
     * Gọi `log_user_meal(session, current_user.id, req)`. Bắt lỗi `ValueError` và chuyển thành `HTTPException(status_code=400, detail=str(e))`.
   * `GET /api/v1/meals/daily-dashboard`:
     * Nhận query param `target_date: Optional[date] = None`, `current_user: User = Depends(get_current_user)`, `session: Session = Depends(get_session)`.
     * Gọi `get_daily_dashboard_data(session, current_user.id, target_date)`.
2. Cập nhật `src/backend/main.py`:
   * Import `meal_router` từ `src.backend.routers.meal_router` và đăng ký `app.include_router(meal_router)`.

---

### Bước 4: Lập trình Script Nạp 3 Tài khoản Demo (`scripts/seed_demo_accounts.py`)

Tạo tệp `scripts/seed_demo_accounts.py` để nạp sẵn dữ liệu 7 ngày (từ $6$ ngày trước đến đúng ngày hôm nay `date.today()`) cho 3 hồ sơ người dùng mẫu phục vụ demo PoC Tuần 3:

1. **Tự động kiểm tra tiền điều kiện:**
   * Gọi `init_db()` để đảm bảo 8 bảng đã tồn tại.
   * Kiểm tra bảng `food_references`, nếu số món $< 30$ thì tự động gọi hàm nạp từ `scripts/seed_food_references.py`.
2. **Thông số 3 tài khoản Demo chuẩn (mật khẩu chung: `"NutriSnap123"`):**
   * **Tài khoản 1 (`student_user` - Sinh viên):**
     * Email: `"student@nutrisnap.vn"` | Giới tính: Nữ, 20 tuổi, cao $160\text{cm}$, nặng $55.0\text{kg}$, mục tiêu `"maintain"` ($55.0\text{kg}$), vận động `"light"`, ngân sách $50,000\text{ VNĐ/ngày}$.
     * Bữa ăn mẫu hàng ngày: Sáng (`"Bánh mì trứng ốp la"` - $150\text{g}$), Trưa (`"Cơm tấm sườn nướng"` - $250\text{g}$, `"Canh chua cá lóc"` - $150\text{g}$), Tối (`"Bún thịt nướng"` - $250\text{g}$).
   * **Tài khoản 2 (`office_user` - Nhân viên văn phòng giảm mỡ):**
     * Email: `"office@nutrisnap.vn"` | Giới tính: Nữ, 28 tuổi, cao $162\text{cm}$, nặng $68.0\text{kg}$, mục tiêu `"lose_weight"` (mục tiêu $62.0\text{kg}$, tốc độ $0.5\text{kg/tuần}$), vận động `"sedentary"`, ngân sách $80,000\text{ VNĐ/ngày}$.
     * Bữa ăn mẫu hàng ngày: Sáng (`"Phở gà xé"` - $250\text{g}$), Trưa (`"Cơm trắng"` - $120\text{g}$, `"Thịt heo luộc"` - $120\text{g}$, `"Bông cải xanh hấp"` - $150\text{g}$), Phụ (`"Cà phê sữa đá"` - $100\text{g}$), Tối (`"Salad xà lách dầu giấm"` - $200\text{g}$, `"Ức gà áp chảo"` - $150\text{g}$).
   * **Tài khoản 3 (`gym_user` - Gymer tăng cơ giàu đạm):**
     * Email: `"gymer@nutrisnap.vn"` | Giới tính: Nam, 23 tuổi, cao $175\text{cm}$, nặng $72.0\text{kg}$, mục tiêu `"gain_muscle"` (mục tiêu $76.0\text{kg}$, tốc độ $0.35\text{kg/tuần}$), vận động `"active"`, ngân sách $100,000\text{ VNĐ/ngày}$.
     * Bữa ăn mẫu hàng ngày: Sáng (`"Phở bò tái"` - $350\text{g}$, `"Trứng gà ốp la (1 quả)"` - $100\text{g}$), Trưa (`"Cơm trắng"` - $250\text{g}$, `"Ức gà áp chảo"` - $200\text{g}$, `"Rau muống xào tỏi"` - $150\text{g}$), Tối (`"Bò xào hành tây"` - $200\text{g}$, `"Khoai lang luộc"` - $200\text{g}$).
3. **Nạp lịch sử 7 ngày (`day_offset` từ $6$ về $0$):**
   * Tạo đủ 7 bản ghi `weight_logs` cho mỗi tài khoản với biến động cân nặng thực tế theo xu hướng mục tiêu.
   * Tạo các bữa ăn `meals` và `meal_items` cho cả 7 ngày (đặc biệt ngày hôm nay `date.today()` có sẵn bữa Sáng và bữa Trưa để khi mở Dashboard lên demo thấy ngay vòng tròn tiến trình Calo đã nạp và phần Calo còn lại cho bữa Tối).

---

## 4. KỊCH BẢN TỰ KIỂM TRA TOÀN DIỆN (`tests/unit/test_w3_nutrition_and_meals.py`)

Antigravity phải tạo tệp `tests/unit/test_w3_nutrition_and_meals.py` bao gồm đầy đủ 8 bài kiểm thử tự động:

1. `test_01_deterministic_algebraic_calculation`: Kiểm tra hàm `calculate_meal_nutrition` với `"Cơm trắng"` ($200\text{g}$) và `"Ức gà áp chảo"` ($150\text{g}$). Xác minh kết quả khớp tuyệt đối phép tính đại số:
   $$\text{Calo} = \frac{200}{100}\times 130 + \frac{150}{100}\times 165 = 260 + 247.5 = 507.5\text{ kcal}$$
2. `test_02_leftover_deduction_eaten_ratio`: Kiểm tra tính năng trừ hao thức ăn thừa khi người dùng chỉ ăn một nửa (`eaten_ratio = 0.5`) trên $200\text{g}$ `"Cơm tấm sườn nướng"` ($\text{effective\_gram} = 100\text{g}$, $\text{calo} = 245.0\text{ kcal}$).
3. `test_03_fuzzy_food_matching_and_invalid_gram`: Kiểm tra tìm kiếm món bằng tên gần đúng (ví dụ `"cơm tấm sườn"` hoặc `"phở bò tái"`) ánh xạ đúng vào bảng `food_references`, và kiểm tra khối lượng âm ($-50\text{g}$) hoặc vượt ngưỡng ($5000\text{g}$) bị chặn bởi `ValueError`.
4. `test_04_meal_log_two_step_pending_confirmation`: Gọi `POST /api/v1/meals/log` với `is_confirmed = False`. Xác minh API trả về `status == "pending_confirmation"`, `meal_id is None`, có đầy đủ bảng tính calo xem trước và số bản ghi trong bảng `meals` vẫn bằng $0$.
5. `test_05_meal_log_confirmed_persists_to_db`: Gọi `POST /api/v1/meals/log` với `is_confirmed = True`. Xác minh API trả về `status == "logged"`, `meal_id` hợp lệ, và các bản ghi được lưu chính xác vào bảng `meals` cùng `meal_items`.
6. `test_06_daily_dashboard_aggregation`: Sau khi log 2 bữa ăn (Sáng và Trưa), gọi `GET /api/v1/meals/daily-dashboard`. Xác minh tổng calo đã nạp (`consumed.calories`), tổng đạm (`consumed.protein_g`) và số calo còn lại (`remaining.calories = target - consumed`) khớp chính xác 100%.
7. `test_07_zero_trust_meal_and_dashboard_isolation`: Tạo 2 người dùng User A và User B. User A log bữa ăn của mình; khi User B gọi `GET /api/v1/meals/daily-dashboard`, xác minh User B chỉ thấy dữ liệu của User B ($0\text{ kcal}$), tuyệt đối không thấy bữa ăn của User A.
8. `test_08_seed_demo_accounts_idempotent`: Thực thi hàm `seed_demo_data()` 2 lần liên tiếp. Xác minh cả 3 tài khoản (`student_user`, `office_user`, `gym_user`) đều đăng nhập thành công, có hồ sơ `Goal`, có lịch sử `weight_logs` và gọi `GET /api/v1/meals/daily-dashboard` trả về dữ liệu bữa ăn mẫu ngay lập tức.

---

## 5. VÒNG LẶP TỰ CHẠY KIỂM TRA & BÀN GIAO GIT

Antigravity tự động chạy tuần tự các lệnh sau trên Terminal tích hợp và chỉ dừng lại khi đạt 100% tiêu chuẩn:

```bash
# Bước 1: Khởi tạo CSDL, nạp 500 món ăn Việt Nam và nạp 3 tài khoản Demo
python scripts/init_db.py
python scripts/seed_food_references.py
python scripts/seed_demo_accounts.py

# Bước 2: Chạy bộ kiểm thử tự động Tuần 3
pytest tests/unit/test_w3_nutrition_and_meals.py -v

# Bước 3: Chạy kiểm thử toàn bộ dự án (Tuần 1 + Tuần 2 + Tuần 3) và kiểm tra Ruff
pytest -v
ruff check src/ tests/ scripts/
```

Sau khi toàn bộ bài test đều báo **`PASSED`** và `ruff check` báo **`All checks passed!`**, cập nhật thêm 1 dòng vào `docs/ai_use_log.md` rồi chạy lệnh đẩy lên GitHub:

```bash
git status
git add src/ scripts/ tests/ docs/
git commit -m "feat(w3-pair1): implement deterministic nutrition engine, meal logging & daily dashboard APIs with demo seed"
git push -u origin w3/viethuy-nutrition-and-dashboard
```