"""
tests/unit/test_db_cascade.py
Kiểm thử tự động hành vi ràng buộc khóa ngoại (Foreign Keys) và ON DELETE CASCADE.
Sử dụng engine kết nối tập trung từ src/backend/database.py.
"""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, select

from src.backend.database import create_db_engine
from src.backend.models.schema import (
    ChatMessage,
    ChatSession,
    FoodReference,
    Goal,
    Meal,
    MealItem,
    User,
    WeightLog,
)


@pytest.fixture(name="db_session")
def db_session_fixture():
    """Tạo cơ sở dữ liệu SQLite in-memory sử dụng create_db_engine tập trung."""
    test_engine = create_db_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(test_engine)

    with Session(test_engine) as session:
        yield session

    SQLModel.metadata.drop_all(test_engine)


def test_foreign_key_constraint_blocks_orphaned_records(db_session: Session):
    """Kiểm tra SQLite ngăn chặn việc chèn bản ghi có user_id không tồn tại."""
    invalid_goal = Goal(
        user_id=9999,  # Không tồn tại trong bảng users
        target_weight=65.0,
        tdee_calories=2000.0,
        daily_budget_vnd=50000,
    )
    db_session.add(invalid_goal)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_cascade_delete_user_cleans_all_child_records(db_session: Session):
    """
    Kiểm tra cơ chế ON DELETE CASCADE:
    Khi xóa User, tất cả các bản ghi liên kết ở 7 bảng phụ thuộc phải tự động biến mất.
    """
    now = datetime.now(UTC)

    # 1. Tạo User
    user = User(
        username="huy_test",
        email="huy@test.com",
        password_hash="hashed_pw_123",
        created_at=now,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    user_id = user.id

    # 2. Tạo món ăn tham chiếu (food_reference)
    food = FoodReference(
        food_name="Phở gà",
        calories_per_100g=120.0,
        protein_per_100g=10.0,
        carbs_per_100g=15.0,
        fat_per_100g=3.0,
        avg_price_vnd=40000,
    )
    db_session.add(food)
    db_session.commit()
    db_session.refresh(food)

    # 3. Tạo dữ liệu con gắn với user_id (Bao gồm bảng Goal đầy đủ chỉ số mới)
    goal = Goal(
        user_id=user_id,
        gender="male",
        age=22,
        height_cm=175.0,
        current_weight_kg=72.0,
        target_weight=68.0,
        activity_level="moderate",
        goal_type="lose_weight",
        weekly_pace_kg=0.5,
        bmr_calories=1710.0,
        tdee_calories=2200.0,
        target_calories=1650.0,
        target_protein_g=120.0,
        target_carbs_g=180.0,
        target_fat_g=45.0,
        daily_budget_vnd=60000,
    )
    weight_log = WeightLog(
        user_id=user_id,
        weight_kg=72.0,
        logged_date=date.today(),
    )
    meal = Meal(
        user_id=user_id,
        meal_type="lunch",
        logged_at=now,
    )
    chat_session = ChatSession(
        user_id=user_id,
        started_at=now,
    )
    db_session.add_all([goal, weight_log, meal, chat_session])
    db_session.commit()
    db_session.refresh(meal)
    db_session.refresh(chat_session)
    meal_id = meal.id
    session_id = chat_session.id

    # 4. Tạo dữ liệu con cấp 2 (meal_items thuộc meal, chat_messages thuộc chat_session)
    meal_item = MealItem(
        meal_id=meal_id,
        food_id=food.id,
        estimated_gram=350.0,
        estimated_calories=420.0,
    )
    chat_message = ChatMessage(
        session_id=session_id,
        sender_role="user",
        content="Trưa nay tôi ăn 1 bát phở gà",
        created_at=now,
    )
    db_session.add_all([meal_item, chat_message])
    db_session.commit()

    # Xác nhận các bản ghi đã tồn tại trong CSDL
    assert db_session.exec(select(Goal).where(Goal.user_id == user_id)).first() is not None
    assert db_session.exec(select(WeightLog).where(WeightLog.user_id == user_id)).first() is not None
    assert db_session.exec(select(Meal).where(Meal.user_id == user_id)).first() is not None
    assert db_session.exec(select(MealItem).where(MealItem.meal_id == meal_id)).first() is not None
    assert db_session.exec(select(ChatSession).where(ChatSession.user_id == user_id)).first() is not None
    assert db_session.exec(select(ChatMessage).where(ChatMessage.session_id == session_id)).first() is not None

    # 5. XÓA USER CHA
    db_session.delete(user)
    db_session.commit()

    # 6. KIỂM TRA CASCADE: Toàn bộ dữ liệu con trực tiếp và gián tiếp phải bị xóa sạch
    assert db_session.exec(select(Goal).where(Goal.user_id == user_id)).first() is None
    assert db_session.exec(select(WeightLog).where(WeightLog.user_id == user_id)).first() is None
    assert db_session.exec(select(Meal).where(Meal.user_id == user_id)).first() is None
    assert db_session.exec(select(MealItem).where(MealItem.meal_id == meal_id)).first() is None
    assert db_session.exec(select(ChatSession).where(ChatSession.user_id == user_id)).first() is None
    assert db_session.exec(select(ChatMessage).where(ChatMessage.session_id == session_id)).first() is None

    # Bảng danh mục thực phẩm độc lập không bị ảnh hưởng
    assert db_session.exec(select(FoodReference).where(FoodReference.id == food.id)).first() is not None
