"""
src/backend/schemas/auth.py
Các mô hình Pydantic Schema cho luồng Đăng ký, Đăng nhập và Token (Phần 2 / Phase 1).
"""

import re

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    """Yêu cầu đăng ký tài khoản người dùng mới."""

    email: EmailStr = Field(..., description="Địa chỉ email hợp lệ của người dùng")
    password: str = Field(..., description="Mật khẩu bảo mật")
    full_name: str | None = Field(default=None, max_length=100, description="Họ và tên người dùng")

    model_config = ConfigDict(extra="ignore")

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Kiểm định độ mạnh mật khẩu: 8–72 bytes, có chữ hoa, chữ thường và chữ số."""
        encoded = v.encode("utf-8")
        if len(encoded) < 8 or len(encoded) > 72:
            raise ValueError("Mật khẩu phải có độ dài từ 8 đến 72 bytes")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Mật khẩu phải chứa ít nhất một chữ cái in hoa")
        if not re.search(r"[a-z]", v):
            raise ValueError("Mật khẩu phải chứa ít nhất một chữ cái in thường")
        if not re.search(r"\d", v):
            raise ValueError("Mật khẩu phải chứa ít nhất một chữ số")
        return v


class LoginRequest(BaseModel):
    """Yêu cầu đăng nhập xác thực tài khoản."""

    email: EmailStr = Field(..., description="Email đã đăng ký")
    password: str = Field(..., description="Mật khẩu người dùng")

    model_config = ConfigDict(extra="ignore")


class TokenResponse(BaseModel):
    """Phản hồi cấp phát JWT Access Token thành công."""

    access_token: str = Field(..., description="JWT Access Token")
    token_type: str = Field(default="bearer", description="Loại token")
    expires_in: int = Field(..., description="Thời gian sống của token tính bằng giây")

    model_config = ConfigDict(extra="ignore")
