"""Pytest global configuration and fixtures."""

import os

# Đảm bảo môi trường kiểm thử có JWT_SECRET_KEY an toàn >= 32 ký tự trước khi import bất kỳ module nào
os.environ["JWT_SECRET_KEY"] = "test_nutrisnap_secure_jwt_secret_key_minimum_32_characters_for_pytest_runner_suite!"
os.environ.setdefault("APP_ENV", "testing")
os.environ.setdefault("DATABASE_URL", "sqlite:///nutrisnap.db")

import pytest
from sqlmodel import Session, select

from src.backend.models.database import engine, init_db
from src.backend.models.schema import FoodReference


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Khởi tạo CSDL kiểm thử và nạp dữ liệu tham chiếu 500 món ăn cho toàn bộ test suite."""
    init_db()
    with Session(engine) as session:
        count = len(session.exec(select(FoodReference)).all())
        if count < 30:
            from scripts.seed_food_references import seed_foods

            seed_foods()
