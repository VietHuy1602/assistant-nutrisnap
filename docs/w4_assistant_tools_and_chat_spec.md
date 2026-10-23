# KẾ HOẠCH & ĐẶC TẢ KỸ THUẬT TUẦN 4: 4 HÀM THỰC THI TOOL CALLING & SERVICE LƯU TRỮ HỘI THOẠI BẢO MẬT

> **Dự án:** NutriSnap - Virtual AI Nutrition Assistant  
> **Cặp phụ trách:** Cặp 1 - Nguyễn Hoàng Việt Huy (25127060) & Nguyễn Trần Minh Đức (25127300)  
> **Nhiệm vụ Tuần 4 của Việt Huy:**  
> 1. Lập trình `src/backend/services/assistant_tools.py` chứa 4 hàm thực thi: `exec_get_daily_nutrition`, `exec_log_meal`, `exec_recommend_meals`, `exec_get_progress_summary` (**4 Hàm thực thi Tool Calling**).  
> 2. Viết dịch vụ lưu và đọc lịch sử tin nhắn từ 2 bảng `chat_sessions` và `chat_messages` theo đúng `user_id` (**Service Lưu trữ Hội thoại**).  
> **Nhánh Git thực thi:** `w4/viethuy-assistant-tools-and-chat`

---

## 1. CÂU LỆNH PROMPT ĐỂ DÁN TRỰC TIẾP VÀO ANTIGRAVITY IDE

Bạn lưu tệp này vào `docs/w4_assistant_tools_and_chat_spec.md`, mở khung **Chat của Antigravity IDE** và dán nguyên văn câu lệnh dưới đây:

```text
@README.md @.antigravityrules @src/backend/models/schema.py @src/backend/models/database.py @src/backend/services/auth_service.py @src/backend/services/goal_service.py @src/backend/services/nutrition_service.py @docs/w4_assistant_tools_and_chat_spec.md

Hãy đọc kỹ toàn bộ đặc tả kỹ thuật Tuần 4 trong file @docs/w4_assistant_tools_and_chat_spec.md và thực hiện tuần tự, tự động chạy kiểm thử để KHÔNG MẮC BẤT KỲ LỖI NÀO:
1. Lập trình `src/backend/services/assistant_tools.py` bao gồm:
   - 4 hàm thực thi Backend cho Tool Calling nhận trực tiếp `authenticated_user_id` từ tầng bảo mật: `exec_get_daily_nutrition`, `exec_log_meal` (bắt buộc kiểm tra xác nhận 2 bước `is_confirmed`), `exec_recommend_meals` (lọc món ăn Việt Nam theo calo còn lại & ngân sách VNĐ), và `exec_get_progress_summary` (tổng hợp lịch sử cân nặng kèm làm mịn xu hướng EMA và chuỗi ngày ghi nhật ký).
   - Bộ điều phối thực thi công cụ an toàn `dispatch_tool_call` tự động tước bỏ mọi tham số `user_id` ngoại lai từ LLM và ép sử dụng `authenticated_user_id`.
   - Dịch vụ quản lý và lưu trữ hội thoại trên 2 bảng `chat_sessions` và `chat_messages` (`create_or_get_chat_session`, `save_chat_message`, `get_chat_history`, `list_user_chat_sessions`, `delete_user_chat_session`) có kiểm tra quyền sở hữu `WHERE user_id == authenticated_user_id` nghiêm ngặt.
2. Tạo file `src/backend/services/chat_service.py` re-export các hàm hội thoại để tương thích với mọi module của Cặp 2 và Cặp 3.
3. Lập trình router `src/backend/routers/assistant_router.py` cung cấp các endpoints cho khung chat và xác nhận thẻ hành động (`POST /api/v1/assistant/chat`, `POST /api/v1/assistant/tools/execute`, `GET /api/v1/assistant/sessions`, `GET /api/v1/assistant/sessions/{session_id}/messages`), sau đó đăng ký vào `src/backend/main.py`.
4. Tạo bộ kiểm thử tự động `tests/unit/test_w4_assistant_tools_and_chat.py` gồm 10 kịch bản kiểm thử toàn diện (bao gồm kiểm thử chống giả mạo `user_id` giữa User A và User B). Tự động chạy `pytest -v` và `ruff check`, nếu có bất kỳ lỗi nào phải tự sửa ngay cho đến khi đạt 100% PASSED.
```

---

## 2. QUY TẮC CHỐNG LỖI TUYỆT ĐỐI CHO ANTIGRAVITY AGENT (ZERO-ERROR GUARDRAILS)

1. **Nguyên tắc Zero-Trust Tool Calling (Cấm tin tưởng `user_id` từ LLM):**
   - Cả 4 hàm `exec_get_daily_nutrition`, `exec_log_meal`, `exec_recommend_meals`, `exec_get_progress_summary` đều phải nhận `authenticated_user_id: int` từ tầng xác thực JWT của Backend.
   - Hàm `dispatch_tool_call(session, authenticated_user_id, tool_name, tool_args)` bắt buộc xóa bỏ khóa `"user_id"` hoặc `"authenticated_user_id"` nếu `tool_args` từ LLM cố tình truyền vào (`tool_args.pop("user_id", None)`), và luôn truyền `authenticated_user_id` thật của phiên đăng nhập.
2. **Xác nhận 2 bước (`Two-step Confirmation`) cho `exec_log_meal`:**
   - Khi `is_confirmed == False` (mặc định khi LLM vừa bóc tách món ăn từ câu chat): Chỉ tính nháp calo/macro từ bảng `food_references` và trả về `status = "pending_confirmation"`, `requires_confirmation = True`, `meal_id = None`. Tuyệt đối không ghi vào bảng `meals` và `meal_items`.
   - Chỉ khi người dùng bấm nút xác nhận trên thẻ UI (`is_confirmed == True`), hàm mới ghi vào CSDL và trả về `status = "logged"` kèm `meal_id`.
3. **Cô lập dữ liệu Hội thoại 2 cấp (`chat_sessions` $\rightarrow$ `chat_messages`):**
   - Bảng `chat_messages` không có cột `user_id` trực tiếp mà liên kết qua `session_id` tới bảng `chat_sessions`.
   - Do đó, trước mọi thao tác đọc (`get_chat_history`) hoặc ghi (`save_chat_message`) trên `chat_messages`, Backend bắt buộc kiểm tra bảng cha `chat_sessions` với điều kiện:
     $$\text{chat\_sessions.id} = \text{session\_id} \quad \land \quad \text{chat\_sessions.user\_id} = \text{authenticated\_user\_id}$$
   - Nếu không khớp hoặc phiên chat thuộc về tài khoản khác, lập tức ném lỗi `PermissionError("Không có quyền truy cập phiên hội thoại này")`.
4. **Tư vấn Trung lập & Nhãn Ước tính:**
   - Mọi kết quả trả về từ 4 công cụ đều phải đính kèm trường `disclaimer`: *"Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế chỉ định y khoa."*
   - Không tự động cắt giảm hạn mức calo của ngày hôm sau nếu người dùng ăn vượt mục tiêu.

---

## 3. ĐẶC TẢ CHI TIẾT CÁC TỆP MÃ NGUỒN CẦN XÂY DỰNG

### Bước 1: Chuẩn bị Nhánh Git

Mở Terminal tại thư mục gốc dự án và chạy:

```bash
git checkout main
git pull origin main
git checkout -b w4/viethuy-assistant-tools-and-chat
```

---

### Bước 2: Lập trình 4 Hàm Thực thi Tool Calling & Dịch vụ Hội thoại (`src/backend/services/assistant_tools.py`)

Tạo tệp `src/backend/services/assistant_tools.py` cài đặt đầy đủ 3 nhóm chức năng sau:

#### 2.1. Nhóm 1 — 4 Hàm Thực thi Công cụ Cốt lõi (Backend Tool Executors)

##### (1) Hàm `exec_get_daily_nutrition`
```python
def exec_get_daily_nutrition(
    session: Session,
    authenticated_user_id: int,
    date_str: Optional[Union[str, date]] = None,
) -> dict:
```
- **Xử lý tham số ngày (`date_str`):**
  - Nếu `date_str` là `None`, `""`, `"today"`, hoặc `"hom_nay"` $\rightarrow$ dùng `date.today()`.
  - Nếu `date_str` là `"yesterday"` hoặc `"hom_qua"` $\rightarrow$ dùng `date.today() - timedelta(days=1)`.
  - Nếu `date_str` là chuỗi định dạng `"YYYY-MM-DD"` $\rightarrow$ phân tích bằng `date.fromisoformat(date_str)`. Nếu sai định dạng, ném `ValueError`.
- **Logic thực thi:**
  - Tái sử dụng hàm `get_daily_dashboard_data(session, authenticated_user_id, target_date)` từ `src/backend/services/nutrition_service.py`.
  - Trả về dictionary có cấu trúc chuẩn cho AI Orchestrator và Frontend:
    - `tool_name`: `"get_daily_nutrition"`
    - `user_id`: `authenticated_user_id`
    - `date`: chuỗi ISO `"YYYY-MM-DD"`
    - `targets`: `{"calories": ..., "protein_g": ..., "carbs_g": ..., "fat_g": ..., "daily_budget_vnd": ...}`
    - `consumed`: `{"calories": ..., "protein_g": ..., "carbs_g": ..., "fat_g": ..., "budget_vnd": ...}`
    - `remaining`: `{"calories": ..., "protein_g": ..., "carbs_g": ..., "fat_g": ..., "budget_vnd": ...}`
    - `meals_count`: tổng số bữa đã ghi nhận trong ngày
    - `meals`: danh sách các bữa ăn trong ngày
    - `disclaimer`: `"Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo."`

##### (2) Hàm `exec_log_meal`
```python
def exec_log_meal(
    session: Session,
    authenticated_user_id: int,
    meal_type: str,
    items_list: List[dict],
    is_confirmed: bool = False,
    image_path: Optional[str] = None,
    logged_at: Optional[datetime] = None,
) -> dict:
```
- **Chuẩn hóa loại bữa ăn (`meal_type`):**
  - Hỗ trợ ánh xạ linh hoạt cả tiếng Việt và tiếng Anh từ LLM sang 4 nhãn chuẩn của DB:
    - `"breakfast"`, `"sang"`, `"sáng"`, `"bữa sáng"` $\rightarrow$ `"Sáng"`
    - `"lunch"`, `"trua"`, `"trưa"`, `"bữa trưa"` $\rightarrow$ `"Trưa"`
    - `"dinner"`, `"toi"`, `"tối"`, `"bữa tối"` $\rightarrow$ `"Tối"`
    - `"snack"`, `"phu"`, `"phụ"`, `"bữa phụ"` $\rightarrow$ `"Phụ"`
- **Chuẩn hóa danh sách món (`items_list`):**
  - Mỗi phần tử trong `items_list` có thể chứa `food_id` hoặc `food_name` (hoặc khóa `"name"`), `estimated_gram` (hoặc khóa `"grams"`, `"gram"`, mặc định $100.0\text{g}$ nếu không truyền), và `eaten_ratio` (mặc định $1.0$).
  - Chuyển đổi thành danh sách `List[MealItemInput]` và gọi `log_user_meal(session, authenticated_user_id, MealLogRequest(...))` từ `nutrition_service.py`.
- **Kết quả trả về:**
  - Nếu `is_confirmed is False`: trả về `status = "pending_confirmation"`, `requires_confirmation = True`, `meal_id = None`, `action_card` chứa thông tin xem trước món ăn, khối lượng, calo ước tính để hiển thị Thẻ Xác nhận Thao tác (Action Confirmation Card) trên khung chat.
  - Nếu `is_confirmed is True`: ghi vào bảng `meals` và `meal_items`, trả về `status = "logged"`, `requires_confirmation = False`, `meal_id = response.meal_id` và thông tin dinh dưỡng đã lưu.

##### (3) Hàm `exec_recommend_meals`
```python
def exec_recommend_meals(
    session: Session,
    authenticated_user_id: int,
    remaining_calories: Optional[float] = None,
    budget_vnd: Optional[int] = None,
    meal_portion_gram: float = 250.0,
    limit: int = 5,
) -> dict:
```
- **Tự động suy luận hạn mức nếu thiếu tham số:**
  - Nếu `remaining_calories is None` hoặc `budget_vnd is None`, gọi `get_daily_dashboard_data(session, authenticated_user_id)` để lấy calo còn lại và ngân sách còn lại trong ngày của chính người dùng đó.
  - Nếu calo còn lại trong ngày $\le 150\text{ kcal}$ (người dùng đã ăn gần đủ hoặc vượt mục tiêu), đặt ngưỡng gợi ý bữa ăn nhẹ cân bằng `effective_max_calo = 300.0` và đính kèm lời nhắn trung lập `gentle_note = "Hôm nay bạn đã nạp gần đủ năng lượng mục tiêu. Dưới đây là các món nhẹ nhàng, giàu đạm và chất xơ."` (tuyệt đối không khuyên nhịn ăn).
  - Nếu `budget_vnd` truyền vào $\le 0$, dùng ngân sách mặc định $50,000\text{ VNĐ}$.
- **Truy vấn & Xếp hạng món ăn từ `food_references`:**
  - Với khẩu phần tiêu chuẩn `portion_factor = meal_portion_gram / 100.0` (mặc định $250\text{g}$ cho một phần ăn, hoặc tính theo đơn vị chuẩn $100\text{g}$ nếu món ăn đậm đặc năng lượng):
  - Lọc các món ăn Việt Nam trong bảng `food_references` (bỏ qua các nguyên liệu thô có đuôi `"(USDA)"` hoặc dầu ăn thuần túy khi gợi ý món ăn hoàn chỉnh) thỏa mãn:
    $$\text{Dish\_Calo} \le \text{effective\_max\_calo} \quad \land \quad \text{Dish\_Price} \le \text{effective\_budget\_vnd}$$
  - Sắp xếp ưu tiên các món có hàm lượng đạm cao (`protein_per_100g` giảm dần) và năng lượng cân bằng.
  - Trả về danh sách `recommendations` (tối đa `limit` món) gồm: `food_id`, `food_name`, `suggested_gram`, `estimated_calories`, `protein_g`, `carbs_g`, `fat_g`, `avg_price_vnd`, cùng `disclaimer`.

##### (4) Hàm `exec_get_progress_summary`
```python
def exec_get_progress_summary(
    session: Session,
    authenticated_user_id: int,
    days_range: int = 7,
) -> dict:
```
- **Kiểm tra khoảng ngày (`days_range`):**
  - Giới hạn `days_range` trong khoảng $1 \le \text{days\_range} \le 90$ (nếu truyền ngoài khoảng thì chuẩn hóa hoặc ném `ValueError` khi $\le 0$).
  - Ngày bắt đầu: `start_date = date.today() - timedelta(days=days_range - 1)`.
- **Tổng hợp lịch sử cân nặng & Tính EMA từ bảng `weight_logs`:**
  - Truy vấn các bản ghi `WeightLog` của `authenticated_user_id` từ `start_date` đến `date.today()`, sắp xếp theo `logged_date ASC, id ASC`.
  - Nếu có dữ liệu cân nặng, áp dụng công thức làm mịn Trung bình động hàm mũ (EMA) để lọc nhiễu nước ngắn hạn:
    $$\text{EMA}_t = \text{round}(0.1 \times W_t + 0.9 \times \text{EMA}_{t-1}, 2)$$
    với $\text{EMA}_0 = W_0$.
  - Tính `start_weight_kg`, `latest_weight_kg`, `weight_change_kg = round(latest_weight_kg - start_weight_kg, 2)`, và `latest_ema_weight_kg`.
- **Tổng hợp chuỗi ngày duy trì nhật ký từ bảng `meals` & `meal_items`:**
  - Truy vấn các bữa ăn của `authenticated_user_id` trong khoảng `start_date` $\rightarrow$ `date.today()`.
  - Đếm số ngày duy nhất có ghi nhận bữa ăn (`logged_days_count`), tổng số bữa ăn (`total_meals_logged`), và lượng calo trung bình mỗi ngày có ghi chép (`avg_daily_calories`).
  - Trả về báo cáo tiến độ trung lập, khích lệ, kèm `disclaimer`.

---

#### 2.2. Nhóm 2 — Bộ Điều phối Công cụ Zero-Trust (`dispatch_tool_call`)

```python
def dispatch_tool_call(
    session: Session,
    authenticated_user_id: int,
    tool_name: str,
    tool_args: Optional[dict] = None,
) -> dict:
```
- Sao chép `safe_args = dict(tool_args or {})`.
- **Lớp khóa bảo mật Zero-Trust:** Xóa mọi tham số định danh giả mạo nếu có:
  ```python
  safe_args.pop("user_id", None)
  safe_args.pop("authenticated_user_id", None)
  ```
- Định tuyến chính xác tới 1 trong 4 hàm (`get_daily_nutrition`, `log_meal`, `recommend_meals`, `get_progress_summary`) với `authenticated_user_id` được truyền cứng từ phiên JWT. Nếu `tool_name` không thuộc 4 công cụ trên, ném `ValueError(f"Công cụ không hợp lệ: {tool_name}")`.

---

#### 2.3. Nhóm 3 — Dịch vụ Lưu trữ và Đọc Lịch sử Hội thoại (`chat_sessions` & `chat_messages`)

Lập trình các hàm quản lý hội thoại ngay trong `src/backend/services/assistant_tools.py` (và re-export tại `src/backend/services/chat_service.py`):

1. `create_or_get_chat_session(session: Session, authenticated_user_id: int, session_id: Optional[int] = None) -> ChatSession`:
   - Nếu `session_id is not None`:
     - Truy vấn `chat_session = session.get(ChatSession, session_id)`.
     - Nếu không tồn tại $\rightarrow$ ném `ValueError("Không tìm thấy phiên hội thoại")`.
     - Nếu `chat_session.user_id != authenticated_user_id` $\rightarrow$ ném `PermissionError("Cảnh báo bảo mật: Không có quyền truy cập phiên hội thoại của người dùng khác")`.
     - Trả về `chat_session`.
   - Nếu `session_id is None`:
     - Tạo mới `ChatSession(user_id=authenticated_user_id)`, `session.add()`, `session.commit()`, `session.refresh()` và trả về.

2. `save_chat_message(session: Session, authenticated_user_id: int, session_id: int, sender_role: str, content: str, tool_name: Optional[str] = None) -> ChatMessage`:
   - Gọi `create_or_get_chat_session(session, authenticated_user_id, session_id)` để xác minh quyền sở hữu phiên chat trước khi ghi.
   - Kiểm tra `sender_role` bắt buộc thuộc `{"user", "assistant", "tool"}` (nếu sai ném `ValueError`).
   - Kiểm tra `content` không được rỗng.
   - Tạo bản ghi `ChatMessage(session_id=session_id, sender_role=sender_role, content=content.strip(), tool_name=tool_name)`, lưu vào CSDL và trả về.

3. `get_chat_history(session: Session, authenticated_user_id: int, session_id: int, limit: int = 10) -> List[ChatMessage]`:
   - Gọi `create_or_get_chat_session(session, authenticated_user_id, session_id)` để xác thực `chat_session.user_id == authenticated_user_id`.
   - Truy vấn các tin nhắn thuộc `session_id`, lấy `limit` tin nhắn gần nhất nhưng trả về theo thứ tự thời gian tăng dần (`created_at ASC, id ASC`) để AI Orchestrator và giao diện Chat hiển thị đúng mạch hội thoại.

4. `list_user_chat_sessions(session: Session, authenticated_user_id: int) -> List[ChatSession]`:
   - Truy vấn `select(ChatSession).where(ChatSession.user_id == authenticated_user_id).order_by(ChatSession.started_at.desc(), ChatSession.id.desc())`.

---

### Bước 3: Lập trình Router Trợ lý Ảo (`src/backend/routers/assistant_router.py` & `src/backend/main.py`)

1. Tạo tệp `src/backend/routers/assistant_router.py` với tiền tố `/api/v1/assistant`:
   - `GET /api/v1/assistant/sessions`: Trả về danh sách các phiên chat của `current_user`.
   - `GET /api/v1/assistant/sessions/{session_id}/messages`: Trả về lịch sử tin nhắn của `session_id` (nếu truy cập `session_id` của người khác thì trả về `HTTP 403 Forbidden`).
   - `POST /api/v1/assistant/tools/execute`: Cho phép thực thi trực tiếp công cụ đã xác thực (ví dụ khi người dùng bấm nút `[Xác nhận lưu]` trên thẻ Action Confirmation Card với `is_confirmed = True`).
   - `POST /api/v1/assistant/chat`:
     - Nhận `session_id: Optional[int] = None`, `message: str`, `tool_call: Optional[dict] = None`.
     - Tự động lấy `verified_user_id = current_user.id` từ `Depends(get_current_user)`.
     - Khởi tạo hoặc lấy `ChatSession` của `verified_user_id`.
     - Lưu tin nhắn của người dùng (`sender_role="user"`) vào `chat_messages`.
     - Nếu có yêu cầu gọi công cụ (hoặc tự động nhận diện ý định cơ bản khi test offline như hỏi calo hôm nay, gợi ý món ăn, xem tiến độ, ghi bữa ăn), thực thi qua `dispatch_tool_call(session, verified_user_id, ...)`, lưu phản hồi của trợ lý (`sender_role="assistant"`, `tool_name=...`) vào `chat_messages` và trả về kết quả kèm `session_id`, `reply`, `tool_result`, `pending_confirmation`.

2. Cập nhật `src/backend/main.py`:
   - Đăng ký `app.include_router(assistant_router)`.

---

## 4. KỊCH BẢN TỰ KIỂM TRA TOÀN DIỆN (`tests/unit/test_w4_assistant_tools_and_chat.py`)

Antigravity phải tạo tệp `tests/unit/test_w4_assistant_tools_and_chat.py` bao gồm đầy đủ 10 bài kiểm thử tự động:

1. `test_01_exec_get_daily_nutrition_accuracy`: Kiểm tra `exec_get_daily_nutrition` trả về đúng tổng calo đã nạp, macro và phần calo còn lại khớp 100% với mục tiêu `Goal` và các bữa đã ăn trong ngày.
2. `test_02_exec_log_meal_unconfirmed_preview_only`: Gọi `exec_log_meal` với `is_confirmed=False`. Xác minh hàm trả về `status == "pending_confirmation"`, `requires_confirmation is True`, tính đúng calo xem trước của `"Phở bò tái"` và **không ghi** bất kỳ dòng nào vào bảng `meals`.
3. `test_03_exec_log_meal_confirmed_persists_db`: Gọi `exec_log_meal` với `is_confirmed=True`. Xác minh hàm trả về `status == "logged"`, tạo `meal_id` hợp lệ và lưu chính xác vào bảng `meals`, `meal_items`.
4. `test_04_exec_recommend_meals_within_calo_and_budget`: Gọi `exec_recommend_meals(session, user_id, remaining_calories=500, budget_vnd=40000)`. Xác minh tất cả các món Việt được gợi ý đều có calo $\le 500\text{ kcal}$ và giá tiền $\le 40,000\text{ VNĐ}$.
5. `test_05_exec_get_progress_summary_ema_and_streak`: Ghi nhận 5 ngày cân nặng và bữa ăn, gọi `exec_get_progress_summary(session, user_id, days_range=7)`. Xác minh `logged_days_count == 5` và giá trị cân nặng EMA khớp công thức $\text{EMA}_t = 0.1 \times W_t + 0.9 \times \text{EMA}_{t-1}$.
6. `test_06_zero_trust_dispatcher_strips_forged_user_id`: Giả lập LLM bị prompt injection truyền `tool_args={"user_id": 9999, "date_str": "today"}` vào `dispatch_tool_call` khi đang đăng nhập ở `authenticated_user_id = user_a.id`. Xác minh hệ thống phớt lờ `9999` và chỉ trả về dữ liệu của `user_a.id`.
7. `test_07_chat_session_and_message_persistence`: Kiểm tra tạo phiên chat mới, lưu 3 tin nhắn (`user`, `tool`, `assistant`) và đọc lại qua `get_chat_history` đúng thứ tự thời gian và đúng `tool_name`.
8. `test_08_chat_history_limit_context_window`: Lưu 15 tin nhắn liên tiếp vào 1 phiên chat, gọi `get_chat_history(..., limit=10)`. Xác minh hàm trả về đúng 10 tin nhắn gần nhất theo thứ tự từ cũ đến mới.
9. `test_09_cross_user_chat_isolation_blocked`: Tạo 2 tài khoản User A và User B. User A tạo `session_a`. Khi User B cố tình gọi `get_chat_history` hoặc `save_chat_message` vào `session_a.id`, hệ thống lập tức chặn bằng `PermissionError` (và trả về `HTTP 403` qua API).
10. `test_10_assistant_router_end_to_end_chat_and_confirm`: Kiểm tra luồng API `POST /api/v1/assistant/chat` $\rightarrow$ nhận thẻ `pending_confirmation` $\rightarrow$ gọi `POST /api/v1/assistant/tools/execute` với `is_confirmed=True` $\rightarrow$ kiểm tra `GET /api/v1/assistant/sessions/{id}/messages` đã lưu đầy đủ lịch sử hội thoại.

---

## 5. VÒNG LẶP TỰ CHẠY KIỂM TRA & BÀN GIAO GIT

Antigravity tự động chạy tuần tự các lệnh sau trên Terminal tích hợp và chỉ dừng lại khi đạt 100% tiêu chuẩn:

```bash
# Bước 1: Chạy bộ kiểm thử tự động Tuần 4
pytest tests/unit/test_w4_assistant_tools_and_chat.py -v

# Bước 2: Chạy kiểm thử toàn bộ dự án (Tuần 1 + Tuần 2 + Tuần 3 + Tuần 4) và kiểm tra Ruff
pytest -v
ruff check src/ tests/ scripts/
```

Sau khi toàn bộ bài test đều báo **`PASSED`** và `ruff check` báo **`All checks passed!`**, cập nhật thêm 1 dòng vào `docs/ai_use_log.md` rồi chạy lệnh đẩy lên GitHub:

```bash
git status
git add src/ tests/ docs/
git commit -m "feat(w4-pair1): implement 4 zero-trust assistant tools and chat history persistence service"
git push -u origin w4/viethuy-assistant-tools-and-chat
```