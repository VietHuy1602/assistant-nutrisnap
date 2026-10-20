from datetime import UTC, date, datetime

from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    """Trả về thời gian UTC có thông tin múi giờ (timezone-aware) chuẩn chuẩn hóa."""
    return datetime.now(UTC)


# 1. Bảng Người dùng (Gốc)
class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True, nullable=False)
    email: str = Field(unique=True, index=True, nullable=False)
    password_hash: str = Field(nullable=False)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)


# 2. Bảng Mục tiêu cá nhân (Khóa ngoại -> users.id, ON DELETE CASCADE)
class Goal(SQLModel, table=True):
    __tablename__ = "goals"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        foreign_key="users.id",
        ondelete="CASCADE",
        index=True,
        nullable=False,
    )
    target_weight: float = Field(nullable=False)
    tdee_calories: float = Field(nullable=False)
    daily_budget_vnd: int = Field(default=60000, nullable=False)


# 3. Bảng Tham chiếu Dinh dưỡng Thực phẩm (Độc lập)
class FoodReference(SQLModel, table=True):
    __tablename__ = "food_references"

    id: int | None = Field(default=None, primary_key=True)
    food_name: str = Field(index=True, nullable=False)
    calories_per_100g: float = Field(nullable=False)
    protein_per_100g: float = Field(nullable=False)
    carbs_per_100g: float = Field(nullable=False)
    fat_per_100g: float = Field(nullable=False)
    avg_price_vnd: int = Field(default=0, nullable=False)


# 4. Bảng Nhật ký Cân nặng (Khóa ngoại -> users.id, ON DELETE CASCADE)
class WeightLog(SQLModel, table=True):
    __tablename__ = "weight_logs"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        foreign_key="users.id",
        ondelete="CASCADE",
        index=True,
        nullable=False,
    )
    weight_kg: float = Field(nullable=False)
    logged_date: date = Field(default_factory=date.today, nullable=False)


# 5. Bảng Bữa ăn (Khóa ngoại -> users.id, ON DELETE CASCADE)
class Meal(SQLModel, table=True):
    __tablename__ = "meals"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        foreign_key="users.id",
        ondelete="CASCADE",
        index=True,
        nullable=False,
    )
    meal_type: str = Field(nullable=False)  # Sáng, Trưa, Tối, Phụ
    image_path: str | None = Field(default=None)
    logged_at: datetime = Field(default_factory=utc_now, nullable=False)


# 6. Bảng Chi tiết Món ăn (Khóa ngoại -> meals.id ON DELETE CASCADE & food_references.id ON DELETE RESTRICT)
class MealItem(SQLModel, table=True):
    __tablename__ = "meal_items"

    id: int | None = Field(default=None, primary_key=True)
    meal_id: int = Field(
        foreign_key="meals.id",
        ondelete="CASCADE",
        index=True,
        nullable=False,
    )
    food_id: int = Field(
        foreign_key="food_references.id",
        ondelete="RESTRICT",
        index=True,
        nullable=False,
    )
    estimated_gram: float = Field(nullable=False)
    estimated_calories: float = Field(nullable=False)


# 7. Bảng Phiên Hội thoại Trợ lý Ảo (Khóa ngoại -> users.id, ON DELETE CASCADE)
class ChatSession(SQLModel, table=True):
    __tablename__ = "chat_sessions"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        foreign_key="users.id",
        ondelete="CASCADE",
        index=True,
        nullable=False,
    )
    started_at: datetime = Field(default_factory=utc_now, nullable=False)


# 8. Bảng Tin nhắn Chi tiết (Khóa ngoại -> chat_sessions.id, ON DELETE CASCADE)
class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_messages"

    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(
        foreign_key="chat_sessions.id",
        ondelete="CASCADE",
        index=True,
        nullable=False,
    )
    sender_role: str = Field(nullable=False)  # user / assistant
    content: str = Field(nullable=False)
    tool_name: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
