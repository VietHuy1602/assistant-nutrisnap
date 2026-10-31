"""Pytest global configuration and fixtures."""

import os

# Đảm bảo môi trường kiểm thử có JWT_SECRET_KEY an toàn >= 32 ký tự trước khi import bất kỳ module nào
os.environ["JWT_SECRET_KEY"] = "test_nutrisnap_secure_jwt_secret_key_minimum_32_characters_for_pytest_runner_suite!"
os.environ.setdefault("APP_ENV", "testing")
os.environ.setdefault("DATABASE_URL", "sqlite:///nutrisnap.db")

import pytest
from sqlmodel import Session, select

import src.ai.config  # noqa: F401  (nạp .env trước, để phần dưới có thể ghi đè)

# Bộ test chạy tất định, không gọi Gemini thật dù máy dev có GEMINI_API_KEY trong .env.
# Muốn chạy cả test gọi API thật: đặt NUTRISNAP_LIVE_LLM_TESTS=1.
if os.getenv("NUTRISNAP_LIVE_LLM_TESTS") != "1":
    os.environ["GEMINI_API_KEY"] = ""
    os.environ.pop("GOOGLE_API_KEY", None)

from src.backend.models.database import engine, init_db
from src.backend.models.schema import FoodReference


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Khởi tạo CSDL kiểm thử và nạp dữ liệu tham chiếu cùng tài khoản demo cho toàn bộ test suite."""
    init_db()
    with Session(engine) as session:
        count = len(session.exec(select(FoodReference)).all())
        if count < 30:
            from scripts.seed_food_references import seed_foods

            seed_foods()
    from scripts.seed_demo_accounts import seed_demo_data

    seed_demo_data()


@pytest.fixture(autouse=True)
def reset_rate_limit_before_test():
    """Tự động reset bộ đếm rate limiter trước và sau mỗi test case để tránh nghẽn IP TestClient."""
    from src.backend.services.api_security import reset_rate_limiter

    reset_rate_limiter()
    yield
    reset_rate_limiter()




@pytest.fixture(autouse=True)
def clear_vision_cache():
    """Mỗi test nhận diện ảnh bắt đầu với bộ nhớ đệm kết quả Vision trống."""
    from src.ai.vision_recognition import _VISION_CACHE

    _VISION_CACHE.clear()
    yield
    _VISION_CACHE.clear()
