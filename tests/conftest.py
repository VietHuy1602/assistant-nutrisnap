"""Pytest global configuration and fixtures."""

import os

# Đảm bảo môi trường kiểm thử có JWT_SECRET_KEY an toàn >= 32 ký tự trước khi import bất kỳ module nào
os.environ["JWT_SECRET_KEY"] = "test_nutrisnap_secure_jwt_secret_key_minimum_32_characters_for_pytest_runner_suite!"
os.environ.setdefault("APP_ENV", "testing")

from src.backend.models.database import engine, init_db

init_db(engine)
