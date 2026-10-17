from datetime import datetime, date
from typing import Optional
from sqlmodel import SQLModel, Field


# 1. Bảng Người dùng
class User(SQLModel, table=True):
    __tablename__ = "users"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True, nullable=False)
    email: str = Field(unique=True, index=True, nullable=False)
    password_hash: str = Field(nullable=False)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


# 2. Bảng Mục tiêu cá nhân (Khóa ngoại -> users.id)
class Goal(SQLModel, table=True):
    __tablename__ = "goals"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True, nullable=False)
    target_weight: float = Field(nullable=False)
    tdee_calories: float = Field(nullable=False)
    daily_budget_vnd: int = Field(default=60000, nullable=False)


# 3. Bảng Tham chiếu Dinh dưỡng Thực phẩm
class FoodReference(SQLModel, table=True):
    __tablename__ = "food_references"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    food_name: str = Field(index=True, nullable=False)
    calories_per_100g: float = Field(nullable=False)
    protein_per_100g: float = Field(nullable=False)
    carbs_per_100g: float = Field(nullable=False)
    fat_per_100g: float = Field(nullable=False)
    avg_price_vnd: int = Field(default=0, nullable=False)


# 4. Bảng Nhật ký Cân nặng (Khóa ngoại -> users.id)
class WeightLog(SQLModel, table=True):
    __tablename__ = "weight_logs"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True, nullable=False)
    weight_kg: float = Field(nullable=False)
    logged_date: date = Field(default_factory=date.today, nullable=False)


# 5. Bảng Bữa ăn (Khóa ngoại -> users.id)
class Meal(SQLModel, table=True):
    __tablename__ = "meals"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True, nullable=False)
    meal_type: str = Field(nullable=False)  # Sáng, Trưa, Tối, Phụ
    image_path: Optional[str] = Field(default=None)
    logged_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


# 6. Bảng Chi tiết Món ăn (Khóa ngoại -> meals.id & food_references.id)
class MealItem(SQLModel, table=True):
    __tablename__ = "meal_items"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    meal_id: int = Field(foreign_key="meals.id", index=True, nullable=False)
    food_id: int = Field(foreign_key="food_references.id", index=True, nullable=False)
    estimated_gram: float = Field(nullable=False)
    estimated_calories: float = Field(nullable=False)


# 7. Bảng Phiên Hội thoại Trợ lý Ảo (Khóa ngoại -> users.id)
class ChatSession(SQLModel, table=True):
    __tablename__ = "chat_sessions"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True, nullable=False)
    started_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


# 8. Bảng Tin nhắn Chi tiết (Khóa ngoại -> chat_sessions.id)
class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_messages"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="chat_sessions.id", index=True, nullable=False)
    sender_role: str = Field(nullable=False)  # user / assistant
    content: str = Field(nullable=False)
    tool_name: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)