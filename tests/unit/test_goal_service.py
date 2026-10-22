"""tests/unit/test_goal_service.py
Bộ kiểm thử tự động cho module Smart Goal Planner (goal_service.py).
Kiểm tra đầy đủ 6 kịch bản theo đặc tả kỹ thuật Tuần 2:
1. test_calculate_bmr_mifflin_st_jeor
2. test_calculate_tdee_multipliers
3. test_unsafe_weekly_pace_rejected
4. test_minimum_calorie_safety_floor
5. test_macro_gram_calculation
6. test_save_goal_and_weight_log_isolation
"""

import pytest
from sqlmodel import Session, SQLModel, select

from src.backend.database import create_db_engine
from src.backend.models.schema import Goal, User, WeightLog
from src.backend.services.goal_service import (
    GoalPlanInput,
    calculate_bmr,
    calculate_macro_split,
    calculate_target_calories,
    calculate_tdee,
    save_or_update_user_goal,
)


@pytest.fixture(name="db_session")
def db_session_fixture():
    """Tạo CSDL SQLite in-memory với PRAGMA foreign_keys = ON để kiểm thử."""
    test_engine = create_db_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(test_engine)

    with Session(test_engine) as session:
        yield session

    SQLModel.metadata.drop_all(test_engine)


def test_calculate_bmr_mifflin_st_jeor():
    """1. Kiểm tra tính đúng BMR theo Mifflin-St Jeor cho cả Nam và Nữ cùng các ràng buộc biên."""
    # Nam: 70kg, 170cm, 22 tuổi -> BMR = 10*70 + 6.25*170 - 5*22 + 5 = 700 + 1062.5 - 110 + 5 = 1657.5 kcal
    bmr_male = calculate_bmr(weight_kg=70.0, height_cm=170.0, age=22, gender="male")
    assert bmr_male == 1657.5

    # Nữ: 55kg, 160cm, 25 tuổi -> BMR = 10*55 + 6.25*160 - 5*25 - 161 = 550 + 1000 - 125 - 161 = 1264.0 kcal
    bmr_female = calculate_bmr(weight_kg=55.0, height_cm=160.0, age=25, gender="female")
    assert bmr_female == 1264.0

    # Ràng buộc kiểm tra đầu vào (30 <= W <= 250, 100 <= H <= 250, 10 <= A <= 100)
    with pytest.raises(ValueError, match="Cân nặng"):
        calculate_bmr(weight_kg=25.0, height_cm=170.0, age=25, gender="male")

    with pytest.raises(ValueError, match="Cân nặng"):
        calculate_bmr(weight_kg=260.0, height_cm=170.0, age=25, gender="male")

    with pytest.raises(ValueError, match="Chiều cao"):
        calculate_bmr(weight_kg=60.0, height_cm=90.0, age=25, gender="female")

    with pytest.raises(ValueError, match="Chiều cao"):
        calculate_bmr(weight_kg=60.0, height_cm=260.0, age=25, gender="female")

    with pytest.raises(ValueError, match="Độ tuổi"):
        calculate_bmr(weight_kg=60.0, height_cm=165.0, age=9, gender="male")

    with pytest.raises(ValueError, match="Độ tuổi"):
        calculate_bmr(weight_kg=60.0, height_cm=165.0, age=105, gender="female")

    with pytest.raises(ValueError, match="Giới tính"):
        calculate_bmr(weight_kg=60.0, height_cm=165.0, age=25, gender="invalid_gender")


def test_calculate_tdee_multipliers():
    """2. Kiểm tra nhân đúng hệ số vận động PAL chuẩn."""
    bmr = 1600.0

    assert calculate_tdee(bmr, "sedentary") == 1920.0  # 1600 * 1.2
    assert calculate_tdee(bmr, "light") == 2200.0  # 1600 * 1.375
    assert calculate_tdee(bmr, "moderate") == 2480.0  # 1600 * 1.55
    assert calculate_tdee(bmr, "active") == 2760.0  # 1600 * 1.725
    assert calculate_tdee(bmr, "very_active") == 3040.0  # 1600 * 1.9

    with pytest.raises(ValueError, match="Mức độ vận động"):
        calculate_tdee(bmr, "unknown_level")


def test_unsafe_weekly_pace_rejected():
    """3. Kiểm tra tốc độ thay đổi cân nặng không an toàn bị từ chối với ValueError."""
    # Giảm cân vượt mức an toàn (> 0.75kg hoặc 1.0kg/tuần, ví dụ 2.0kg/tuần)
    with pytest.raises(ValueError):
        calculate_target_calories(tdee=2000.0, goal_type="lose_weight", weekly_pace_kg=2.0)

    # Giảm cân tốc độ âm
    with pytest.raises(ValueError):
        calculate_target_calories(tdee=2000.0, goal_type="lose_weight", weekly_pace_kg=-0.5)

    # Tăng cơ tốc độ quá cao (> 0.5kg/tuần)
    with pytest.raises(ValueError):
        calculate_target_calories(tdee=2000.0, goal_type="gain_muscle", weekly_pace_kg=0.8)

    # Duy trì cân nặng nhưng tốc độ khác 0
    with pytest.raises(ValueError):
        calculate_target_calories(tdee=2000.0, goal_type="maintain", weekly_pace_kg=0.5)

    # Loại mục tiêu không xác định
    with pytest.raises(ValueError, match="Loại mục tiêu"):
        calculate_target_calories(tdee=2000.0, goal_type="unknown_goal", weekly_pace_kg=0.5)


def test_minimum_calorie_safety_floor():
    """4. Kiểm tra ngưỡng sàn an toàn y khoa: không dưới 1200 kcal (Nữ) hoặc 1500 kcal (Nam)."""
    # Nữ: TDEE = 1400 kcal, thâm hụt 550 kcal (0.5kg/tuần) -> 850 kcal < 1200 kcal -> ép về 1200 kcal
    target_female, is_floor_female = calculate_target_calories(
        tdee=1400.0,
        goal_type="lose_weight",
        weekly_pace_kg=0.5,
        gender="female",
    )
    assert target_female == 1200.0
    assert is_floor_female is True

    # Nam: TDEE = 1800 kcal, thâm hụt 550 kcal -> 1250 kcal < 1500 kcal -> ép về 1500 kcal
    target_male, is_floor_male = calculate_target_calories(
        tdee=1800.0,
        goal_type="lose_weight",
        weekly_pace_kg=0.5,
        gender="male",
    )
    assert target_male == 1500.0
    assert is_floor_male is True

    # Trường hợp bình thường trên ngưỡng sàn
    target_normal, is_floor_normal = calculate_target_calories(
        tdee=2500.0,
        goal_type="lose_weight",
        weekly_pace_kg=0.5,
        gender="male",
    )
    assert target_normal == 1950.0  # 2500 - 550
    assert is_floor_normal is False


def test_macro_gram_calculation():
    """5. Kiểm tra phân bổ số gam Protein, Carbs, Fat theo đúng tỷ lệ phần trăm."""
    target_calo = 2000.0

    # lose_weight: 30% Protein (150g), 40% Carbs (200g), 30% Fat (66.7g)
    macros_lose = calculate_macro_split(target_calo, "lose_weight")
    assert macros_lose["protein_g"] == 150.0
    assert macros_lose["carbs_g"] == 200.0
    assert macros_lose["fat_g"] == 66.7

    # maintain: 25% Protein (125g), 45% Carbs (225g), 30% Fat (66.7g)
    macros_maintain = calculate_macro_split(target_calo, "maintain")
    assert macros_maintain["protein_g"] == 125.0
    assert macros_maintain["carbs_g"] == 225.0
    assert macros_maintain["fat_g"] == 66.7

    # gain_muscle: 30% Protein (150g), 45% Carbs (225g), 25% Fat (55.6g)
    macros_gain = calculate_macro_split(target_calo, "gain_muscle")
    assert macros_gain["protein_g"] == 150.0
    assert macros_gain["carbs_g"] == 225.0
    assert macros_gain["fat_g"] == 55.6


def test_save_goal_and_weight_log_isolation(db_session: Session):
    """6. Kiểm tra lưu mục tiêu vào CSDL:

    - Cô lập dữ liệu giữa user_id = 1 và user_id = 2 (Zero-Trust).
    - Tự động ghi nhận cân nặng vào weight_logs.
    - Cập nhật mục tiêu không ảnh hưởng tài khoản khác.
    """
    # Tạo 2 tài khoản mẫu hợp lệ để thỏa mãn ràng buộc khóa ngoại users.id
    user1 = User(id=1, username="user_one", email="one@nutrisnap.vn", password_hash="hash1")
    user2 = User(id=2, username="user_two", email="two@nutrisnap.vn", password_hash="hash2")
    db_session.add(user1)
    db_session.add(user2)
    db_session.commit()

    # 1. Lưu mục tiêu cho user 1
    plan1 = GoalPlanInput(
        gender="male",
        age=25,
        height_cm=175.0,
        current_weight_kg=75.0,
        target_weight_kg=70.0,
        activity_level="moderate",
        goal_type="lose_weight",
        weekly_pace_kg=0.5,
        daily_budget_vnd=65000,
    )
    res1 = save_or_update_user_goal(db_session, authenticated_user_id=1, plan_input=plan1)
    assert res1.user_id == 1
    assert res1.target_weight == 70.0
    assert "ước tính tham khảo" in res1.disclaimer

    # 2. Lưu mục tiêu cho user 2
    plan2 = GoalPlanInput(
        gender="female",
        age=23,
        height_cm=162.0,
        current_weight_kg=56.0,
        target_weight_kg=52.0,
        activity_level="light",
        goal_type="lose_weight",
        weekly_pace_kg=0.3,
        daily_budget_vnd=50000,
    )
    res2 = save_or_update_user_goal(db_session, authenticated_user_id=2, plan_input=plan2)
    assert res2.user_id == 2
    assert res2.target_weight == 52.0

    # 3. Kiểm tra tính độc lập và toàn vẹn trong CSDL
    goal1_db = db_session.exec(select(Goal).where(Goal.user_id == 1)).first()
    goal2_db = db_session.exec(select(Goal).where(Goal.user_id == 2)).first()
    assert goal1_db is not None
    assert goal2_db is not None
    assert goal1_db.target_weight == 70.0
    assert goal2_db.target_weight == 52.0

    # 4. Kiểm tra weight_logs được tạo đúng tài khoản
    weight1 = db_session.exec(select(WeightLog).where(WeightLog.user_id == 1)).all()
    weight2 = db_session.exec(select(WeightLog).where(WeightLog.user_id == 2)).all()
    assert len(weight1) == 1
    assert weight1[0].weight_kg == 75.0
    assert len(weight2) == 1
    assert weight2[0].weight_kg == 56.0

    # 5. Cập nhật mục tiêu user 1 không làm thay đổi dữ liệu của user 2
    plan1_updated = GoalPlanInput(
        gender="male",
        age=25,
        height_cm=175.0,
        current_weight_kg=74.0,
        target_weight_kg=68.0,
        activity_level="active",
        goal_type="lose_weight",
        weekly_pace_kg=0.5,
        daily_budget_vnd=70000,
    )
    save_or_update_user_goal(db_session, authenticated_user_id=1, plan_input=plan1_updated)

    goal2_db_after = db_session.exec(select(Goal).where(Goal.user_id == 2)).first()
    assert goal2_db_after.target_weight == 52.0
    assert goal2_db_after.daily_budget_vnd == 50000

    goal1_db_after = db_session.exec(select(Goal).where(Goal.user_id == 1)).first()
    assert goal1_db_after.target_weight == 68.0
