"""
src/backend/schemas/user.py
Mô hình Pydantic Schema công khai cho đối tượng người dùng (UserPublic).
Tuyệt đối không chứa trường hashed_password hay password_hash để bảo vệ dữ liệu nhạy cảm.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserPublic(BaseModel):
    """Thông tin công khai của người dùng an toàn trả về client."""

    id: int = Field(..., description="Định danh duy nhất của người dùng")
    email: EmailStr = Field(..., description="Địa chỉ email người dùng")
    full_name: str | None = Field(default=None, description="Họ và tên người dùng")
    is_active: bool = Field(default=True, description="Trạng thái kích hoạt tài khoản")
    created_at: datetime = Field(..., description="Thời điểm tạo tài khoản")

    model_config = ConfigDict(from_attributes=True)
