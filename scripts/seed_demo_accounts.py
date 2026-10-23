"""
scripts/seed_demo_accounts.py
Nạp dữ liệu mẫu 30 ngày toàn diện cho 3 tài khoản Demo phục vụ Báo cáo Tháng & Thói quen Tuần 6:
1. student_user (Sinh viên duy trì cân nặng - 30 ngày kỷ lục streak, ăn sáng đều đặn, cân nặng ổn định)
2. office_user (Nhân viên văn phòng giảm mỡ - cân nặng giảm 70kg -> 68kg với xu hướng EMA decreasing, thói quen lành mạnh)
3. gym_user (Gymer tăng cơ - giàu đạm > 120g/ngày, cân nặng tăng 71kg -> 72kg, chế độ Back-on-track kích hoạt để test)

Tính lũy đẳng (Idempotent): Xóa sạch dữ liệu cũ của 3 tài khoản này trước khi nạp lại.
Đảm bảo ngày hôm nay có sẵn bữa Sáng + Trưa để Dashboard hiển thị tiến trình ngay lập tức.
"""

import sys
from datetime import UTC, datetime, time, timedelta
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Thêm thư mục gốc vào PYTHONPATH
root_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(root_dir))

from sqlmodel import Session, func, select

from src.backend.models.database import engine, init_db
from src.backend.models.schema import (
    FoodReference,
    User,
    WeightLog,
    get_vn_today,
    utc_now,
)
from src.backend.services.auth_service import hash_password
from src.backend.services.goal_service import GoalPlanInput, save_or_update_user_goal
from src.backend.services.nutrition_service import (
    MealItemInput,
    MealLogRequest,
    log_user_meal,
)

COMMON_PASSWORD = "NutriSnap123"

# ==============================================================================
# HỒ SƠ 3 TÀI KHOẢN DEMO TOÀN DIỆN (30 NGÀY DỮ LIỆU)
# ==============================================================================

DEMO_PROFILES = [
    {
        "username": "student_user",
        "email": "student@nutrisnap.vn",
        "gender": "female",
        "age": 20,
        "height_cm": 160.0,
        "current_weight_kg": 55.0,
        "target_weight_kg": 55.0,
        "goal_type": "maintain",
        "weekly_pace_kg": 0.0,
        "activity_level": "light",
        "daily_budget_vnd": 50000,
        "skip_days": [],  # 30/30 ngày đều ghi -> Chuỗi 30 ngày hoàn hảo
        "start_weight": 55.4,
        "end_weight": 55.0,
        "meals_pattern": {
            "Sáng": [
                {"food_name": "Bánh mì trứng ốp la", "estimated_gram": 150.0},
            ],
            "Trưa": [
                {"food_name": "Cơm tấm sườn nướng", "estimated_gram": 250.0},
                {"food_name": "Canh chua cá lóc", "estimated_gram": 150.0},
            ],
            "Tối": [
                {"food_name": "Bún thịt nướng", "estimated_gram": 250.0},
            ],
        },
    },
    {
        "username": "office_user",
        "email": "office@nutrisnap.vn",
        "gender": "female",
        "age": 28,
        "height_cm": 162.0,
        "current_weight_kg": 68.0,
        "target_weight_kg": 62.0,
        "goal_type": "lose_weight",
        "weekly_pace_kg": 0.5,
        "activity_level": "sedentary",
        "daily_budget_vnd": 80000,
        "skip_days": [14, 15, 22, 23],  # Bỏ lỡ 2 cuối tuần trước đó -> Streak hiện tại = 14 ngày
        "start_weight": 70.0,
        "end_weight": 68.0,  # Giảm 2kg rõ rệt -> Xu hướng EMA decreasing
        "meals_pattern": {
            "Sáng": [
                {"food_name": "Phở gà xé", "estimated_gram": 250.0},
            ],
            "Trưa": [
                {"food_name": "Cơm trắng", "estimated_gram": 120.0},
                {"food_name": "Thịt heo luộc", "estimated_gram": 120.0},
                {"food_name": "Bông cải xanh hấp", "estimated_gram": 150.0},
            ],
            "Phụ": [
                {"food_name": "Cà phê sữa đá", "estimated_gram": 100.0},
            ],
            "Tối": [
                {"food_name": "Salad xà lách dầu giấm", "estimated_gram": 200.0},
                {"food_name": "Ức gà áp chảo", "estimated_gram": 150.0},
            ],
        },
    },
    {
        "username": "gym_user",
        "email": "gymer@nutrisnap.vn",
        "gender": "male",
        "age": 23,
        "height_cm": 175.0,
        "current_weight_kg": 72.0,
        "target_weight_kg": 76.0,
        "goal_type": "gain_muscle",
        "weekly_pace_kg": 0.35,
        "activity_level": "active",
        "daily_budget_vnd": 100000,
        "skip_days": [3, 8, 16, 17, 25],  # Bỏ lỡ rải rác -> 5/7 ngày gần nhất
        "start_weight": 71.0,
        "end_weight": 72.0,  # Tăng cơ 1kg -> Xu hướng EMA increasing
        "meals_pattern": {
            "Sáng": [
                {"food_name": "Phở bò tái", "estimated_gram": 350.0},
                {"food_name": "Trứng gà ốp la (1 quả)", "estimated_gram": 100.0},
            ],
            "Trưa": [
                {"food_name": "Cơm trắng", "estimated_gram": 250.0},
                {"food_name": "Ức gà áp chảo", "estimated_gram": 200.0},
                {"food_name": "Rau muống xào tỏi", "estimated_gram": 150.0},
            ],
            "Tối": [
                {"food_name": "Bò xào hành tây", "estimated_gram": 200.0},
                {"food_name": "Khoai lang luộc", "estimated_gram": 200.0},
            ],
        },
    },
]

MEAL_TIMES = {
    "Sáng": time(7, 30),
    "Trưa": time(12, 30),
    "Phụ": time(15, 30),
    "Tối": time(19, 0),
}


def ensure_prerequisites(session: Session) -> None:
    """Đảm bảo các bảng tồn tại và có tối thiểu 30 món trong food_references."""
    init_db()
    food_count = session.exec(select(func.count(FoodReference.id))).one()
    if food_count < 30:
        print(f"Bảng food_references chỉ có {food_count} món (< 30). Tự động nạp từ seed_food_references.py...")
        from scripts.seed_food_references import seed_foods

        seed_foods()


def clean_existing_demo_accounts(session: Session) -> None:
    """Xóa sạch dữ liệu cũ của 3 tài khoản demo để đảm bảo tính lũy đẳng (Idempotency)."""
    target_usernames = [p["username"] for p in DEMO_PROFILES]
    target_emails = [p["email"] for p in DEMO_PROFILES]

    existing_users = session.exec(
        select(User).where((User.username.in_(target_usernames)) | (User.email.in_(target_emails)))
    ).all()

    for user in existing_users:
        session.delete(user)

    session.commit()


def seed_demo_data() -> dict[str, int]:
    """Hàm chính thực hiện nạp 3 tài khoản Demo chuẩn và 30 ngày dữ liệu mẫu."""
    created_user_ids: dict[str, int] = {}
    today = get_vn_today()
    total_days = 30

    with Session(engine) as session:
        ensure_prerequisites(session)
        clean_existing_demo_accounts(session)

        hashed_pwd = hash_password(COMMON_PASSWORD)

        for profile in DEMO_PROFILES:
            username = profile["username"]
            email = profile["email"]
            print(f"--- Đang nạp tài khoản demo: {username} ({email}) [30 ngày] ---")

            # 1. Tạo tài khoản User
            user = User(
                username=username,
                email=email,
                password_hash=hashed_pwd,
                created_at=utc_now(),
            )
            session.add(user)
            session.flush()
            user_id = user.id
            created_user_ids[username] = user_id  # type: ignore

            # 2. Khởi tạo Mục tiêu dinh dưỡng (Goal)
            plan_input = GoalPlanInput(
                gender=profile["gender"],
                age=profile["age"],
                height_cm=profile["height_cm"],
                current_weight_kg=profile["current_weight_kg"],
                target_weight_kg=profile["target_weight_kg"],
                goal_type=profile["goal_type"],
                weekly_pace_kg=profile["weekly_pace_kg"],
                activity_level=profile["activity_level"],
                daily_budget_vnd=profile["daily_budget_vnd"],
            )
            save_or_update_user_goal(
                session=session,
                authenticated_user_id=user_id,  # type: ignore
                plan_input=plan_input,
            )

            # 3. Nạp 30 ngày lịch sử cân nặng và bữa ăn (day_offset từ 29 về 0)
            start_w = profile["start_weight"]
            end_w = profile["end_weight"]
            skip_days = set(profile.get("skip_days", []))

            for offset in range(total_days - 1, -1, -1):
                log_date = today - timedelta(days=offset)

                # Tuyến tính nội suy cân nặng từ start_w đến end_w kèm rung nhẹ +/- 0.1kg
                progress = (total_days - 1 - offset) / float(total_days - 1)
                base_w = start_w + progress * (end_w - start_w)
                jitter = 0.05 if (offset % 2 == 0) else -0.05
                weight_val = round(base_w + jitter, 1)

                # Ghi nhận nhật ký cân nặng hàng ngày (hoặc cách 2-3 ngày)
                w_log = WeightLog(
                    user_id=user_id,
                    weight_kg=weight_val,
                    logged_date=log_date,
                )
                session.add(w_log)

                # Kiểm tra nếu ngày này nằm trong danh sách skip_days (không ghi bữa ăn)
                if offset in skip_days:
                    continue

                # Riêng gym_user: hôm qua (offset == 1) nạp bữa tiệc thịnh soạn (ăn vượt TDEE) để test Back-on-track!
                is_yesterday_gym_feast = (username == "gym_user" and offset == 1)

                # Nạp các bữa ăn mẫu trong ngày
                for meal_type, items_spec in profile["meals_pattern"].items():
                    # Ngày hôm nay (offset == 0): chỉ nạp Sáng và Trưa (và Phụ nếu có), để lại Tối cho demo
                    if offset == 0 and meal_type == "Tối":
                        continue

                    meal_time = MEAL_TIMES.get(meal_type, time(12, 0))
                    logged_dt = datetime.combine(log_date, meal_time, tzinfo=UTC)

                    # Tăng khẩu phần ngày hôm qua của gym_user để calo > 3000 kcal
                    multiplier = 2.0 if is_yesterday_gym_feast else 1.0

                    items_input = [
                        MealItemInput(
                            food_name=item["food_name"],
                            estimated_gram=item["estimated_gram"] * multiplier,
                            eaten_ratio=1.0,
                        )
                        for item in items_spec
                    ]

                    req = MealLogRequest(
                        meal_type=meal_type,
                        items=items_input,
                        is_confirmed=True,
                        logged_at=logged_dt,
                    )
                    log_user_meal(session=session, authenticated_user_id=user_id, req=req)  # type: ignore

            session.commit()
            print(f"✅ Đã nạp thành công tài khoản {username} (ID={user_id}) với 30 ngày dữ liệu!")

    return created_user_ids


if __name__ == "__main__":
    print("=" * 60)
    print("Bắt đầu nạp 3 tài khoản demo phục vụ Báo cáo Tháng & Streak Tuần 6...")
    print("=" * 60)
    result = seed_demo_data()
    print("=" * 60)
    print(f"Hoàn tất nạp 3 tài khoản demo: {result}")
    print("=" * 60)
