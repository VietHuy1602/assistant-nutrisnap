# KẾ HOẠCH & ĐẶC TẢ KỸ THUẬT TUẦN 2: MODULE GOAL PLANNER BACKEND
> **Dự án:** NutriSnap - Virtual AI Nutrition Assistant  
> **Thành viên thực hiện:** Nguyễn Hoàng Việt Huy (MSSV: 25127060) - *Leader & Data Core (Cặp 1)*  
> **Mục tiêu đầu ra (Deliverable):** Hoàn thiện `src/backend/services/goal_service.py` và bộ kiểm thử `tests/unit/test_goal_service.py`  
> **Nhánh Git thực thi:** `w2/viethuy-goal-planner`

---

## 1. HƯỚNG DẪN SỬ DỤNG FILE NÀY VỚI ANTIGRAVITY IDE

Bạn chỉ cần lưu nội dung này vào tệp `docs/w2_goal_service_spec.md` trong dự án, sau đó mở khung **Chat của Antigravity IDE** và dán câu lệnh kích hoạt (Prompt) dưới đây:

```text
@README.md @.antigravityrules @src/backend/models/schema.py @src/backend/services/validators.py @docs/w2_goal_service_spec.md

Hãy đọc toàn bộ đặc tả kỹ thuật trong file @docs/w2_goal_service_spec.md và thực hiện tuần tự từ Bước 2 đến Bước 5:
1. Lập trình hoàn chỉnh module `src/backend/services/goal_service.py` (tính BMR theo Mifflin-St Jeor, TDEE, phân bổ calo/macro thích ứng có rào chắn y khoa và lưu vào bảng `goals`, `weight_logs`).
2. Viết bộ unit test đầy đủ tại `tests/unit/test_goal_service.py`.
3. Chạy lệnh kiểm tra `pytest` và `ruff`, sau đó cập nhật 1 dòng vào `docs/ai_use_log.md`.
```

---

## 2. CÁC BƯỚC THỰC THI CHI TIẾT DÀNH CHO AI AGENT (STEP-BY-STEP SOP)

### Bước 1: Đồng bộ Git & Tạo nhánh làm việc Tuần 2
Trước khi sinh mã nguồn, chạy các lệnh sau trên Terminal tích hợp để đảm bảo đứng đúng nhánh cá nhân:

```bash
git checkout main
git pull origin main
git checkout -b w2/viethuy-goal-planner
```

---

### Bước 2: Lập trình Module `src/backend/services/goal_service.py`

AI Agent cần tạo tệp `src/backend/services/goal_service.py` kế thừa các model từ `src/backend/models/schema.py` (`Goal`, `WeightLog`) và hàm kiểm tra từ `src/backend/services/validators.py` (`validate_goal_pace`). Module bắt buộc tuân thủ các công thức toán học tất định sau:

#### 2.1. Công thức tính BMR (Mifflin-St Jeor Chuẩn)
Nhận đầu vào gồm: cân nặng hiện tại $W$ ($\text{kg}$), chiều cao $H$ ($\text{cm}$), tuổi $A$ (năm) và giới tính (`"male"` hoặc `"female"`):
- **Đối với Nam (`male`):**
  $$\text{BMR} = 10 \times W + 6.25 \times H - 5 \times A + 5$$
- **Đối với Nữ (`female`):**
  $$\text{BMR} = 10 \times W + 6.25 \times H - 5 \times A - 161$$

*(Ràng buộc kiểm tra đầu vào: $30 \le W \le 250\text{ kg}$, $100 \le H \le 250\text{ cm}$, $10 \le A \le 100\text{ tuổi}$. Nếu nằm ngoài khoảng này phải ném ngoại lệ `ValueError` rõ ràng).*

#### 2.2. Công thức tính TDEE (Total Daily Energy Expenditure)
Nhân chỉ số $\text{BMR}$ với hệ số vận động (`activity_level`) tương ứng:
- `"sedentary"` (Ít vận động, làm việc văn phòng): $1.2$
- `"light"` (Tập nhẹ $1\text{--}3\text{ buổi/tuần}$): $1.375$
- `"moderate"` (Tập vừa phải $3\text{--}5\text{ buổi/tuần}$): $1.55$
- `"active"` (Vận động nhiều $6\text{--}7\text{ buổi/tuần}$): $1.725$
- `"very_active"` (Vận động cường độ rất cao): $1.9$

$$\text{TDEE} = \text{round}(\text{BMR} \times \text{Multiplier}, 2)$$

#### 2.3. Tính Hạn mức Calo Mục tiêu Hàng ngày & Rào chắn An toàn Y khoa
1. **Kiểm tra tốc độ thay đổi cân nặng (`weekly_pace_kg`):**
   - Gọi hàm `validate_goal_pace(weekly_pace_kg, goal_type)` từ `src/backend/services/validators.py`.
   - Mục tiêu `"lose_weight"`: chỉ cho phép $0.25 \le \text{weekly\_pace\_kg} \le 1.0\text{ kg/tuần}$.
   - Mục tiêu `"gain_muscle"`: chỉ cho phép $0.1 \le \text{weekly\_pace\_kg} \le 0.5\text{ kg/tuần}$.
   - Mục tiêu `"maintain"`: $\text{weekly\_pace\_kg} = 0.0$.
2. **Quy đổi thâm hụt / thặng dư năng lượng mỗi ngày:**
   - Dựa trên quy ước $1\text{ kg}$ mô mỡ $\approx 7700\text{ kcal}$, lượng calo điều chỉnh mỗi ngày là:
     $$\Delta \text{Calo} = \frac{\text{weekly\_pace\_kg} \times 7700}{7} = \text{weekly\_pace\_kg} \times 1100$$
   - Nếu `goal_type == "lose_weight"`: $\text{Target\_Calo} = \text{TDEE} - \Delta \text{Calo}$
   - Nếu `goal_type == "gain_muscle"`: $\text{Target\_Calo} = \text{TDEE} + \Delta \text{Calo}$
   - Nếu `goal_type == "maintain"`: $\text{Target\_Calo} = \text{TDEE}$
3. **Rào chắn Ngưỡng Calo Tối thiểu (Safety Floor Guardrail):**
   - Để bảo vệ sức khỏe người dùng, không bao giờ cho phép $\text{Target\_Calo}$ thấp hơn ngưỡng an toàn tối thiểu:
     - Nữ (`female`): tối thiểu $1200\text{ kcal/ngày}$.
     - Nam (`male`): tối thiểu $1500\text{ kcal/ngày}$.
   - Nếu phép trừ cho kết quả thấp hơn ngưỡng này, tự động nâng $\text{Target\_Calo}$ bằng ngưỡng tối thiểu và gắn cờ cảnh báo `is_adjusted_to_safety_floor = True`.

#### 2.4. Phân bổ Dưỡng chất Đa lượng (Macro Split: Protein, Carbs, Fat)
Quy đổi từ $\text{Target\_Calo}$ sang số gam ($\text{g}$) dựa trên hệ số năng lượng chuẩn ($1\text{g Protein} = 4\text{ kcal}$, $1\text{g Carbs} = 4\text{ kcal}$, $1\text{g Fat} = 9\text{ kcal}$):
- **Giảm mỡ (`lose_weight`):** $30\%$ Protein, $40\%$ Carbs, $30\%$ Fat.
- **Duy trì (`maintain`):** $25\%$ Protein, $45\%$ Carbs, $30\%$ Fat.
- **Tăng cơ (`gain_muscle`):** $30\%$ Protein, $45\%$ Carbs, $25\%$ Fat.

$$\text{Protein (g)} = \text{round}\left(\frac{\text{Target\_Calo} \times R_{\text{protein}}}{4}, 1\right), \quad \text{Carbs (g)} = \text{round}\left(\frac{\text{Target\_Calo} \times R_{\text{carbs}}}{4}, 1\right), \quad \text{Fat (g)} = \text{round}\left(\frac{\text{Target\_Calo} \times R_{\text{fat}}}{9}, 1\right)$$

#### 2.5. Lưu trữ vào Cơ sở Dữ liệu có Kiểm soát Quyền (Zero-Trust Access Control)
Lập trình 2 hàm tương tác với SQLite (`Session`):
1. `save_or_update_user_goal(session: Session, authenticated_user_id: int, plan_input: GoalPlanInput) -> GoalPlanResponse`:
   - Luôn truy vấn bằng mệnh đề `select(Goal).where(Goal.user_id == authenticated_user_id)`.
   - Nếu người dùng đã có bản ghi trong bảng `goals`, cập nhật lại `target_weight`, `tdee_calories` (lưu hạn mức calo mục tiêu) và `daily_budget_vnd`. Nếu chưa có, tạo bản ghi mới.
   - Đồng thời tự động ghi nhận cân nặng khởi điểm vào bảng `weight_logs` của đúng `authenticated_user_id`.
   - Kết quả trả về bắt buộc đính kèm trường `disclaimer`: *"Số liệu BMR, TDEE và phân bổ dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế chỉ định y khoa."*
2. `log_user_weight(session: Session, authenticated_user_id: int, weight_kg: float, logged_date: Optional[date] = None) -> WeightLog`:
   - Kiểm tra $30 \le \text{weight\_kg} \le 250$.
   - Lưu hoặc cập nhật cân nặng trong ngày của đúng `authenticated_user_id` vào bảng `weight_logs`.

---

### Bước 3: Lập trình Bộ Kiểm thử Tự động `tests/unit/test_goal_service.py`

Tạo tệp `tests/unit/test_goal_service.py` sử dụng `pytest` và SQLite in-memory (`sqlite:///:memory:`) với cờ `PRAGMA foreign_keys = ON` để kiểm tra đủ 6 kịch bản:
1. `test_calculate_bmr_mifflin_st_jeor`: Kiểm tra tính đúng $\text{BMR}$ cho cả Nam và Nữ (ví dụ: Nam $70\text{ kg}$, $170\text{ cm}$, $22\text{ tuổi}$ $\rightarrow \text{BMR} = 10 \times 70 + 6.25 \times 170 - 5 \times 22 + 5 = 1657.5\text{ kcal}$).
2. `test_calculate_tdee_multipliers`: Kiểm tra nhân đúng hệ số vận động.
3. `test_unsafe_weekly_pace_rejected`: Kiểm tra tốc độ giảm cân vượt quá $1.0\text{ kg/tuần}$ (ví dụ $2.0\text{ kg/tuần}$) bị chặn và báo lỗi `ValueError`.
4. `test_minimum_calorie_safety_floor`: Kiểm tra khi mức thâm hụt làm calo xuống dưới $1200\text{ kcal}$ (Nữ) hoặc $1500\text{ kcal}$ (Nam), hệ thống tự động giữ ở ngưỡng sàn an toàn.
5. `test_macro_gram_calculation`: Kiểm tra số gam Protein, Carbs, Fat được tính đúng theo tỷ lệ phần trăm.
6. `test_save_goal_and_weight_log_isolation`: Kiểm tra lưu mục tiêu vào DB cho `user_id = 1` không làm ảnh hưởng đến dữ liệu của `user_id = 2`.

---

### Bước 4: Chạy Kiểm thử Xác minh & Cập nhật Nhật ký AI

Sau khi Antigravity tạo xong 2 file trên, thực thi các lệnh kiểm tra trên Terminal:

```bash
# 1. Kiểm tra định dạng chuẩn PEP8 với Ruff
ruff check src/backend/services/goal_service.py tests/unit/test_goal_service.py

# 2. Chạy bộ kiểm thử tự động pytest
pytest tests/unit/test_goal_service.py -v
```

Khi toàn bộ 6 bài test báo xanh (`6 passed`), yêu cầu Antigravity thêm 1 dòng vào bảng trong `docs/ai_use_log.md`:
- **Tuần / Người dùng:** `W2 - Nguyễn Hoàng Việt Huy`
- **Công cụ AI:** `Antigravity AI Coding Agent`
- **Nội dung yêu cầu:** `"Lập trình module goal_service.py tính BMR (Mifflin-St Jeor), TDEE, phân bổ macro và lưu trữ vào bảng goals, weight_logs"`
- **Phần giữ lại & Chỉnh sửa:** `"Giữ cấu trúc hàm tính đại số và Pydantic models; kiểm tra khóa cứng authenticated_user_id và ngưỡng sàn calo an toàn 1200/1500 kcal"`
- **Cách thức kiểm thử:** `"Chạy pytest tests/unit/test_goal_service.py đạt 6/6 PASSED"`

---

### Bước 5: Đẩy Code lên GitHub & Tạo Pull Request

Sau khi mọi kiểm thử đã hoàn tất, chạy chuỗi lệnh Git sau trên Terminal để đẩy nhánh lên GitHub:

```bash
# 1. Kiểm tra trạng thái file (Đảm bảo không dính file .env hay nutrisnap.db)
git status

# 2. Thêm các file thuộc nhiệm vụ Tuần 2
git add src/backend/services/goal_service.py tests/unit/test_goal_service.py docs/w2_goal_service_spec.md docs/ai_use_log.md

# 3. Commit theo chuẩn Conventional Commits
git commit -m "feat(goal): implement BMR, TDEE, macro planner service and unit tests"

# 4. Đẩy nhánh lên GitHub
git push -u origin w2/viethuy-goal-planner
```

**Hoàn tất trên giao diện GitHub:**
1. Mở trang GitHub của repo `VietHuy1602/assistant-nutrisnap`, bấm nút **`Compare & pull request`**.
2. Đặt tiêu đề PR: `[W2][Pair 1] Nguyễn Hoàng Việt Huy - Hoàn thiện Module Smart Goal Planner Backend (BMR/TDEE/Macro)`.
3. Duyệt, bấm **`Merge pull request`** vào nhánh `main` và bấm **`Delete branch`** để dọn sạch nhánh phụ.
