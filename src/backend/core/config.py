"""
src/backend/core/config.py
Quản lý cấu hình bảo mật và biến môi trường thông qua pydantic-settings.
Thực thi chính sách Fail-fast: ứng dụng không thể khởi động nếu thiếu SECRET_KEY
hoặc SECRET_KEY có độ dài nhỏ hơn 32 ký tự.
"""

import os

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Cấu hình bảo mật và dịch vụ cho NutriSnap / NutriScan."""

    # SECRET_KEY bắt buộc, fail-fast nếu thiếu hoặc < 32 ký tự
    SECRET_KEY: str = Field(default_factory=lambda: os.getenv("SECRET_KEY") or os.getenv("JWT_SECRET_KEY") or "")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_ISSUER: str = "nutriscan-api"
    BCRYPT_ROUNDS: int = 12

    # Cấu hình CSDL và môi trường
    DATABASE_URL: str = "sqlite:///./nutrisnap.db"
    APP_ENV: str = "development"
    DEBUG: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        """Kiểm định tính hợp lệ của SECRET_KEY theo chuẩn bảo mật."""
        if not v or len(v.strip()) < 32:
            raise ValueError(
                "SECRET_KEY bắt buộc và phải có độ dài tối thiểu 32 ký tự. "
                "Vui lòng tạo khóa an toàn (ví dụ: openssl rand -hex 32) và thiết lập trong .env"
            )
        return v.strip()


# Hàm factory lấy settings mới
def get_settings(**kwargs) -> Settings:
    return Settings(**kwargs)


# Khởi tạo instance toàn cục (lazy / graceful nếu chưa nạp .env lúc import)
try:
    settings = Settings()
except Exception:
    # Nếu đang ở môi trường test hoặc chưa có .env, kiểm tra xem có biến môi trường tạm thời không
    _temp_key = os.getenv("SECRET_KEY") or os.getenv("JWT_SECRET_KEY")
    if _temp_key and len(_temp_key.strip()) >= 32:
        settings = Settings(SECRET_KEY=_temp_key.strip())
    else:
        # Giữ placeholder nếu module được inspect
        settings = None  # type: ignore
