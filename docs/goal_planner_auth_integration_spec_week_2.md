# KẾ HOẠCH & ĐẶC TẢ KỸ THUẬT TUẦN 2: LUỒNG AUTH + SMART GOAL PLANNER & KIỂM TRA DỮ LIỆU MÓN ĂN

> **Dự án:** NutriSnap - Virtual AI Nutrition Assistant  
> **Cặp phụ trách:** Cặp 1 - Nguyễn Hoàng Việt Huy (25127060) & Nguyễn Trần Minh Đức (25127300)  
> **Mục tiêu:** Hoàn thiện luồng đăng ký/đăng nhập bảo mật (`HttpOnly Cookie JWT`) kết hợp lưu mục tiêu Smart Goal Planner (`BMR`, `TDEE`, `Macro`); kiểm tra nạp 500 món ăn vào `food_references`.  
> **Đầu ra bàn giao (Deliverables):** Luồng Auth + Goal khớp nối hoàn chỉnh + Bộ kiểm thử tự động `PASSED 100%`.  
> **Nhánh Git thực thi:** `w2/pair1-auth-goal-integration`

---

## 1. CÂU LỆNH PROMPT ĐỂ DÁN TRỰC TIẾP VÀO ANTIGRAVITY IDE

Bạn chỉ cần lưu file này vào `docs/w2_goal_service_spec.md`, mở khung **Chat của Antigravity IDE** và dán nguyên văn câu lệnh dưới đây:

```text
@README.md @.antigravityrules @src/backend/models/schema.py @src/backend/services/validators.py @scripts/seed_food_references.py @docs/w2_goal_service_spec.md

Hãy đọc kỹ toàn bộ đặc tả kỹ thuật trong file @docs/w2_goal_service_spec.md và thực hiện tuần tự, tự động kiểm tra để KHÔNG MẮC BẤT KỲ LỖI NÀO:
1. Cài đặt các gói thư viện cần thiết (bcrypt, python-jose[cryptography], fastapi, uvicorn, httpx, pytest, ruff). Lưu ý: Sử dụng trực tiếp thư viện `bcrypt` thay vì `passlib` để tương thích 100% với Python 3.13/3.14+.
2. Tạo module kết nối CSDL `src/backend/models/database.py` (bật bắt buộc `PRAGMA foreign_keys = ON`).
3. Lập trình `src/backend/services/goal_service.py` (tính BMR theo Mifflin-St Jeor, TDEE, phân bổ Macro, rào chắn sàn calo an toàn 1200/1500 kcal và lưu vào bảng `goals`, `weight_logs`).
4. Lập trình `src/backend/services/auth_service.py` (băm mật khẩu bcrypt, cấp phát JWT qua `HttpOnly, SameSite=Lax Cookie`, dependency `get_current_user` và hàm transaction đăng ký kết hợp khởi tạo mục tiêu `register_with_initial_goal`).
5. Lập trình router `src/backend/routers/auth_goal_router.py` và `src/backend/main.py` nối toàn bộ luồng Auth + Goal + Kiểm tra dữ liệu món ăn.
6. Tạo và chạy bộ kiểm thử tự động `tests/unit/test_w2_auth_goal_flow.py`. Tự động chạy `pytest` và `ruff check`, nếu có bất kỳ lỗi nào phải tự sửa ngay cho đến khi đạt 100% PASSED.
```

---

## 2. QUY TẮC CHỐNG LỖI TUYỆT ĐỐI CHO ANTIGRAVITY AGENT (ZERO-ERROR GUARDRAILS)

Để quá trình thực thi trên máy không xảy ra bất kỳ lỗi runtime hay lỗi thư viện nào, Antigravity bắt buộc tuân thủ 4 quy tắc kỹ thuật sau:

1. **Tương thích Python 3.13 / 3.14+ (Không dùng `passlib` cũ):**
   * Trên Python 3.13+, module `crypt` đã bị gỡ bỏ khiến `passlib` bị lỗi khi gọi backend `bcrypt`.
   * **Giải pháp bắt buộc:** Sử dụng trực tiếp thư viện `bcrypt` chuẩn (`bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')` và `bcrypt.checkpw(...)`).
2. **Ràng buộc khóa ngoại SQLite (`PRAGMA foreign_keys = ON`):**
   * Mọi kết nối SQLite (cả file `nutrisnap.db` và SQLite in-memory khi chạy `pytest`) đều phải gắn listener kích hoạt `PRAGMA foreign_keys = ON;`.
3. **Zero-Trust JWT qua `HttpOnly Cookie`:**
   * Khi đăng ký hoặc đăng nhập, token JWT được gắn vào `response.set_cookie(key="access_token", value=token, httponly=True, samesite="lax", secure=False, path="/")`.
   * Các endpoint lưu mục tiêu (`goals`) và cân nặng (`weight_logs`) bắt buộc lấy `authenticated_user_id` từ dependency `get_current_user` đọc qua Cookie, tuyệt đối không nhận `user_id` từ request body.
4. **Tính nguyên tử (Atomic Transaction) khi Đăng ký kèm Mục tiêu:**
   * Khi người dùng đăng ký tài khoản mới kèm thông số mục tiêu (Smart Goal Planner), nếu thông số mục tiêu vi phạm an toàn y khoa (ví dụ tốc độ giảm cân $> 1.0\text{ kg/tuần}$), hệ thống phải `rollback` toàn bộ để không tạo ra tài khoản rác chưa có mục tiêu.

---

## 3. ĐẶC TẢ CHI TIẾT CÁC TỆP MÃ NGUỒN CẦN XÂY DỰNG

### Bước 1: Chuẩn bị nhánh Git & Thư viện

Chạy trên Terminal:
```bash
git checkout main
git pull origin main
git checkout -b w2/pair1-auth-goal-integration
pip install bcrypt "python-jose[cryptography]" fastapi uvicorn httpx pytest ruff sqlmodel pandas pydantic
```
Cập nhật thêm `bcrypt`, `python-jose[cryptography]`, `httpx` vào `requirements.txt`.

---

### Bước 2: Module Kết nối CSDL (`src/backend/models/database.py`)

Tạo tệp `src/backend/models/database.py`:
* Khai báo `DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nutrisnap.db")`.
* Gắn sự kiện `@event.listens_for(Engine, "connect")` thực thi `PRAGMA foreign_keys=ON;` cho mọi kết nối SQLite.
* Cung cấp hàm `init_db()` gọi `SQLModel.metadata.create_all(engine)` và generator `get_session()` dùng cho FastAPI `Depends(get_session)`.

---

### Bước 3: Module Smart Goal Planner (`src/backend/services/goal_service.py`)

Tạo tệp `src/backend/services/goal_service.py` thực hiện các tính toán đại số tất định và thao tác CSDL:

#### 3.1. Công thức tính BMR (Mifflin-St Jeor)
Đầu vào: cân nặng hiện tại $W$ ($\text{kg}$), chiều cao $H$ ($\text{cm}$), tuổi $A$ (năm), giới tính `gender` (`"male"` hoặc `"female"`).
* Kiểm tra điều kiện biên: $30 \le W \le 250\text{ kg}$, $100 \le H \le 250\text{ cm}$, $10 \le A \le 100\text{ tuổi}$. Nếu sai ném `ValueError`.
* Công thức:
  * Nam (`"male"`):
    $$\text{BMR} = 10 \times W + 6.25 \times H - 5 \times A + 5$$
  * Nữ (`"female"`):
    $$\text{BMR} = 10 \times W + 6.25 \times H - 5 \times A - 161$$

#### 3.2. Công thức tính TDEE (Total Daily Energy Expenditure)
Nhân $\text{BMR}$ với hệ số vận động `activity_level`:
* `"sedentary"`: $1.2$
* `"light"`: $1.375$
* `"moderate"`: $1.55$
* `"active"`: $1.725$
* `"very_active"`: $1.9$
$$\text{TDEE} = \text{round}(\text{BMR} \times \text{Multiplier}, 2)$$

#### 3.3. Tính Calo Mục tiêu Hàng ngày & Rào chắn Y khoa
1. **Kiểm tra tốc độ thay đổi cân nặng (`weekly_pace_kg`):**
   * Sử dụng hàm `validate_goal_pace(weekly_pace_kg, goal_type)` trong `src/backend/services/validators.py`.
   * Nếu `"maintain"`: ép `weekly_pace_kg = 0.0`.
   * Nếu `"lose_weight"` hoặc `"gain_muscle"` mà không hợp lệ thì ném `ValueError`.
2. **Tính mức điều chỉnh năng lượng hàng ngày:**
   $$\Delta \text{Calo} = \text{weekly\_pace\_kg} \times 1100$$
   * `"lose_weight"`: $\text{Target\_Calo} = \text{TDEE} - \Delta \text{Calo}$
   * `"gain_muscle"`: $\text{Target\_Calo} = \text{TDEE} + \Delta \text{Calo}$
   * `"maintain"`: $\text{Target\_Calo} = \text{TDEE}$
3. **Ngưỡng sàn an toàn (Safety Floor):**
   * Nữ (`"female"`): tối thiểu $1200.0\text{ kcal/ngày}$.
   * Nam (`"male"`): tối thiểu $1500.0\text{ kcal/ngày}$.
   * Nếu $\text{Target\_Calo}$ thấp hơn ngưỡng sàn, gán $\text{Target\_Calo}$ bằng ngưỡng sàn và đặt cờ `is_safety_floor_applied = True`.

#### 3.4. Phân bổ Macro (Protein, Carbs, Fat) theo gam
* Tỷ lệ năng lượng `(protein_ratio, carbs_ratio, fat_ratio)`:
  * `"lose_weight"`: $(0.30, 0.40, 0.30)$
  * `"maintain"`: $(0.25, 0.45, 0.30)$
  * `"gain_muscle"`: $(0.30, 0.45, 0.25)$
* Quy đổi ra số gam ($1\text{g Protein} = 4\text{ kcal}$, $1\text{g Carbs} = 4\text{ kcal}$, $1\text{g Fat} = 9\text{ kcal}$):
  $$\text{Protein (g)} = \text{round}\left(\frac{\text{Target\_Calo} \times R_P}{4}, 1\right), \quad \text{Carbs (g)} = \text{round}\left(\frac{\text{Target\_Calo} \times R_C}{4}, 1\right), \quad \text{Fat (g)} = \text{round}\left(\frac{\text{Target\_Calo} \times R_F}{9}, 1\right)$$

#### 3.5. Các hàm lưu CSDL trong `goal_service.py`
* `upsert_user_goal(session: Session, authenticated_user_id: int, goal_input: GoalCreateInput) -> GoalReadOutput`:
  * Tính toán đầy đủ `bmr`, `tdee`, `target_calories`, `protein_g`, `carbs_g`, `fat_g`.
  * Lưu hoặc cập nhật bản ghi trong bảng `goals` của `authenticated_user_id` (lưu `target_weight`, `tdee_calories = target_calories`, `daily_budget_vnd`).
  * Tự động ghi nhận cân nặng hiện tại (`current_weight_kg`) vào bảng `weight_logs` cho `authenticated_user_id`.
  * Luôn trả kèm câu khuyến cáo `disclaimer`: *"Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế chỉ định y khoa."*
* `log_daily_weight(session: Session, authenticated_user_id: int, weight_kg: float, logged_date: Optional[date] = None) -> WeightLog`:
  * Kiểm tra $30 \le \text{weight\_kg} \le 250$, lưu bản ghi cân nặng vào `weight_logs` của đúng `authenticated_user_id`.

---

### Bước 4: Module Xác thực & Khớp nối Đăng ký + Mục tiêu (`src/backend/services/auth_service.py`)

Tạo tệp `src/backend/services/auth_service.py`:
1. **Băm và kiểm tra mật khẩu bằng `bcrypt`:**
   * `hash_password(password: str) -> str`: Kiểm tra `validate_password(password)`, sau đó băm bằng `bcrypt.hashpw`.
   * `verify_password(plain_password: str, password_hash: str) -> bool`: Kiểm tra bằng `bcrypt.checkpw`.
2. **Quản lý JWT Token & Cookie:**
   * `create_access_token(user_id: int, username: str) -> str`: Ký JWT bằng `HS256` chứa payload `{"sub": str(user_id), "username": username, "exp": ...}`.
   * `set_auth_cookie(response: Response, token: str)`: Thiết lập cookie `access_token` với `httponly=True, samesite="lax", path="/"`.
   * `get_current_user(request: Request, session: Session = Depends(get_session)) -> User`: Đọc token từ `request.cookies.get("access_token")`, giải mã lấy `user_id` và truy vấn bảng `users`. Nếu thiếu hoặc sai token, ném `HTTPException(status_code=401)`.
3. **Hàm khớp nối Đăng ký + Khởi tạo Smart Goal Planner (`register_user_with_goal`):**
   * Nhận thông tin tài khoản (`username`, `email`, `password`) và thông số mục tiêu tùy chọn (`goal_input: Optional[GoalCreateInput]`).
   * Kiểm tra `validate_email`, `validate_password` và kiểm tra trùng `username` / `email` trong bảng `users`.
   * Tạo bản ghi `User`, thực hiện `session.flush()` để lấy `new_user.id`.
   * Nếu có `goal_input`, gọi ngay logic tính toán và tạo bản ghi `Goal` + `WeightLog` khởi điểm trong cùng một transaction. Nếu `goal_input` không hợp lệ, rollback toàn bộ.

---

### Bước 5: Khớp nối API Router & Kiểm tra Dữ liệu Thực phẩm (`src/backend/routers/auth_goal_router.py` & `src/backend/main.py`)

1. Tạo `src/backend/routers/auth_goal_router.py` cung cấp các endpoints:
   * `POST /api/v1/auth/register`: Đăng ký tài khoản mới (hỗ trợ gửi kèm `goal_input` để hoàn tất Onboarding trong 1 bước hoặc đăng ký cơ bản), tự động gắn `HttpOnly Cookie JWT` vào response.
   * `POST /api/v1/auth/login`: Đăng nhập, kiểm tra mật khẩu và gắn `HttpOnly Cookie JWT`.
   * `POST /api/v1/goals/plan`: Cập nhật hoặc thiết lập mục tiêu Smart Goal Planner cho người dùng đang đăng nhập (`current_user: User = Depends(get_current_user)`).
   * `GET /api/v1/goals/me`: Xem mục tiêu hiện tại và cân nặng mới nhất của tài khoản đang đăng nhập.
   * `POST /api/v1/user/weight`: Ghi nhận cân nặng hàng ngày vào `weight_logs`.
   * `GET /api/v1/foods/verify`: Kiểm tra số lượng món ăn trong bảng `food_references` và trả về mẫu món ăn Việt Nam để xác nhận dữ liệu thực phẩm đã sẵn sàng.
2. Tạo `src/backend/main.py`:
   * Khởi tạo `FastAPI(title="NutriSnap Virtual AI Assistant API")`, cấu hình `CORSMiddleware(allow_credentials=True, ...)`, gắn `auth_goal_router` và endpoint `GET /api/v1/ping`.

---

## 4. KỊCH BẢN TỰ KIỂM TRA KHÔNG LỖI (`tests/unit/test_w2_auth_goal_flow.py`)

Antigravity phải tạo tệp `tests/unit/test_w2_auth_goal_flow.py` bao gồm đầy đủ 8 bài kiểm thử tự động từ đơn vị (unit) đến tích hợp luồng (integration):

1. `test_01_food_references_seeded_500_items`: Kiểm tra tệp `data/vn_foods.csv` tồn tại đủ $500$ món và nạp thành công vào bảng `food_references`, truy vấn thử món `"Phở bò tái"` trả về đúng calo/macro.
2. `test_02_bmr_and_tdee_mifflin_st_jeor`: Kiểm tra công thức tính $\text{BMR}$ và $\text{TDEE}$ cho cả Nam và Nữ khớp tuyệt đối với công thức toán học.
3. `test_03_medical_safety_guardrails`: Kiểm tra tốc độ giảm cân $> 1.0\text{ kg/tuần}$ bị chặn và kiểm tra ngưỡng sàn calo tối thiểu ($1200\text{ kcal}$ cho Nữ, $1500\text{ kcal}$ cho Nam).
4. `test_04_register_with_smart_goal_onboarding`: Kiểm tra API `POST /api/v1/auth/register` gửi kèm hồ sơ mục tiêu: tạo thành công `User`, lưu đúng `Goal`, ghi nhận `WeightLog` đầu tiên và phản hồi có header `Set-Cookie: access_token=...; HttpOnly; SameSite=lax`.
5. `test_05_login_and_cookie_session`: Kiểm tra `POST /api/v1/auth/login` trả về `HttpOnly Cookie` và dùng cookie đó gọi `GET /api/v1/goals/me` thành công.
6. `test_06_update_goal_and_log_weight_authenticated`: Kiểm tra người dùng đã đăng nhập gọi `POST /api/v1/goals/plan` và `POST /api/v1/user/weight` cập nhật đúng vào CSDL.
7. `test_07_zero_trust_data_isolation`: Đăng nhập tài khoản User A và User B, xác minh User A tuyệt đối không thể đọc hoặc ghi đè mục tiêu hay cân nặng của User B.
8. `test_08_atomic_rollback_on_invalid_goal`: Khi gọi đăng ký kèm mục tiêu có `weekly_pace_kg = 3.0` (vi phạm an toàn y khoa), hệ thống trả về lỗi `400/422` và không lưu tài khoản lỗi vào bảng `users`.

---

## 5. VÒNG LẶP TỰ CHẠY KIỂM TRA & BÀN GIAO GIT

Antigravity tự động chạy tuần tự các lệnh sau trên Terminal tích hợp và chỉ dừng lại khi đạt 100% tiêu chuẩn:

```bash
# Bước 1: Đảm bảo CSDL cục bộ đã được tạo và nạp đủ 500 món ăn
python scripts/init_db.py
python scripts/seed_food_references.py

# Bước 2: Chạy bộ kiểm thử tự động tuần 2
pytest tests/unit/test_w2_auth_goal_flow.py -v

# Bước 3: Kiểm tra toàn bộ các bài test trong dự án và chuẩn PEP8 với Ruff
pytest -v
ruff check src/ tests/
```

Sau khi toàn bộ bài test đều báo **`PASSED`** và `ruff check` báo **`All checks passed!`**, cập nhật 1 dòng vào `docs/ai_use_log.md` rồi chạy lệnh đẩy lên GitHub:

```bash
git status
git add src/ tests/ docs/ requirements.txt
git commit -m "feat(w2-pair1): integrate auth httponly cookie with smart goal planner and verify 500 foods"
git push -u origin w2/pair1-auth-goal-integration
```