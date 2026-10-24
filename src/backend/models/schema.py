import uuid
from datetime import UTC, date, datetime, timedelta, timezone

from sqlmodel import Field, SQLModel

# Múi giờ chuẩn Việt Nam (UTC+7)
VN_TIMEZONE = timezone(timedelta(hours=7))


def utc_now() -> datetime:
    """Trả về thời gian UTC có thông tin múi giờ (timezone-aware) chuẩn hóa."""
    return datetime.now(UTC)


def get_vn_today() -> date:
    """Trả về ngày hiện tại theo giờ Việt Nam (UTC+7) để tránh lệch ngày vào sáng sớm."""
    return datetime.now(VN_TIMEZONE).date()


def get_vn_now() -> datetime:
    """Trả về thời gian hiện tại theo múi giờ Việt Nam (UTC+7)."""
    return datetime.now(VN_TIMEZONE)


# 1. Bảng Người dùng (Gốc)
class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(default="", index=True, nullable=False)
    email: str = Field(unique=True, index=True, nullable=False)
    password_hash: str = Field(nullable=False)
    full_name: str | None = Field(default=None, max_length=100, nullable=True)
    is_active: bool = Field(default=True, nullable=False)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)

    @property
    def hashed_password(self) -> str:
        """Alias tương thích ngược cho password_hash."""
        return self.password_hash

    @hashed_password.setter
    def hashed_password(self, value: str) -> None:
        self.password_hash = value



# 2. Bảng Mục tiêu cá nhân (Khóa ngoại -> users.id, ON DELETE CASCADE)
# Bổ sung đầy đủ các trường lưu trữ hồ sơ thể trạng và chỉ số Goal Planner
class Goal(SQLModel, table=True):
    __tablename__ = "goals"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        foreign_key="users.id",
        ondelete="CASCADE",
        index=True,
        nullable=False,
    )
    gender: str = Field(default="male", nullable=False)  # male / female / other
    age: int = Field(default=25, nullable=False)
    height_cm: float = Field(default=170.0, nullable=False)
    current_weight_kg: float = Field(default=65.0, nullable=False)
    target_weight: float = Field(nullable=False)
    activity_level: str = Field(default="moderate", nullable=False)  # sedentary, light, moderate, active, very_active
    goal_type: str = Field(default="maintain", nullable=False)  # lose_weight, maintain, gain_muscle
    weekly_pace_kg: float = Field(default=0.0, nullable=False)
    bmr_calories: float = Field(default=1600.0, nullable=False)
    tdee_calories: float = Field(nullable=False)
    target_calories: float = Field(default=2000.0, nullable=False)
    target_protein_g: float = Field(default=120.0, nullable=False)
    target_carbs_g: float = Field(default=200.0, nullable=False)
    target_fat_g: float = Field(default=50.0, nullable=False)
    daily_budget_vnd: int = Field(default=60000, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)


# 3. Bảng Tham chiếu Dinh dưỡng Thực phẩm (Độc lập, food_name UNIQUE để hỗ trợ Upsert)
class FoodReference(SQLModel, table=True):
    __tablename__ = "food_references"

    id: int | None = Field(default=None, primary_key=True)
    food_name: str = Field(index=True, unique=True, nullable=False)
    calories_per_100g: float = Field(nullable=False)
    protein_per_100g: float = Field(nullable=False)
    carbs_per_100g: float = Field(nullable=False)
    fat_per_100g: float = Field(nullable=False)
    avg_price_vnd: int = Field(default=0, nullable=False)


# 4. Bảng Nhật ký Cân nặng (Khóa ngoại -> users.id, ON DELETE CASCADE)
# Sử dụng ngày theo giờ Việt Nam (UTC+7)
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
    logged_date: date = Field(default_factory=get_vn_today, nullable=False)


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
    meal_type: str = Field(nullable=False)  # breakfast / lunch / dinner / snack
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


# 9. Bảng Hành động Chờ xác nhận (Two-Step Confirmation Flow - README_04)
class PendingAction(SQLModel, table=True):
    __tablename__ = "pending_actions"

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True,
        index=True,
    )
    user_id: int = Field(
        foreign_key="users.id",
        ondelete="CASCADE",
        index=True,
        nullable=False,
    )
    tool_name: str = Field(default="log_meal", nullable=False)
    payload: str = Field(nullable=False)  # JSON string chứa tham số đã validate
    status: str = Field(default="pending", index=True, nullable=False)  # pending | confirmed | cancelled | expired
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    expires_at: datetime = Field(nullable=False)
    resolved_at: datetime | None = Field(default=None, nullable=True)

