"""
src/backend/core/config.py
Quản lý cấu hình bảo mật và biến môi trường thông qua pydantic-settings.
Thực thi chính sách Fail-fast: ứng dụng không thể khởi động nếu thiếu JWT_SECRET_KEY
hoặc JWT_SECRET_KEY có độ dài nhỏ hơn 32 ký tự.
"""

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Cấu hình bảo mật và dịch vụ cho NutriSnap."""

    # JWT_SECRET_KEY bắt buộc, fail-fast nếu thiếu hoặc < 32 ký tự, không hard-code mặc định
    JWT_SECRET_KEY: str = Field(
        ...,
        validation_alias=AliasChoices("JWT_SECRET_KEY", "SECRET_KEY"),
        description="Khóa bảo mật JWT bí mật tối thiểu 32 ký tự",
    )
    JWT_ALGORITHM: str = "HS256"
    # Mặc định 7 ngày (10080 phút) theo kiến trúc Tuần 2; sẽ giảm xuống 15-30 phút khi triển khai Refresh Token ở tuần sau
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080
    JWT_ISSUER: str = "nutrisnap-api"
    BCRYPT_ROUNDS: int = 12

    AUTH_COOKIE_NAME: str = "access_token"
    AUTH_COOKIE_SECURE: bool = False
    AUTH_COOKIE_SAMESITE: str = "lax"

    # Thời gian sống mặc định (TTL) cho hành động chờ xác nhận (PendingAction)
    PENDING_ACTION_TTL_MINUTES: int = 10

    # Cấu hình CSDL và môi trường
    DATABASE_URL: str = "sqlite:///./nutrisnap.db"
    APP_ENV: str = "development"
    DEBUG: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        """Kiểm định tính hợp lệ của JWT_SECRET_KEY theo chuẩn bảo mật."""
        if not v or len(v.strip()) < 32:
            raise ValueError(
                "LỖI BẢO MẬT: Biến môi trường 'JWT_SECRET_KEY' chưa được thiết lập hoặc ngắn hơn 32 ký tự. "
                "Vui lòng tạo khóa an toàn (ví dụ: openssl rand -hex 32) và thiết lập trong .env"
            )
        return v.strip()

    @property
    def SECRET_KEY(self) -> str:
        return self.JWT_SECRET_KEY



# Hàm factory lấy settings mới
def get_settings(**kwargs) -> Settings:
    return Settings(**kwargs)


# Khởi tạo instance toàn cục
settings: Settings = Settings()
