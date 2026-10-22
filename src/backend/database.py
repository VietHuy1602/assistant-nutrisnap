"""
src/backend/database.py
Alias tương thích ngược cho src/backend/models/database.py.
Quản lý kết nối Cơ sở dữ liệu SQLite tập trung với PRAGMA foreign_keys = ON.
"""

from src.backend.models.database import (
    DATABASE_URL,
    DB_PATH,
    ROOT_DIR,
    SQL_ECHO,
    create_db_engine,
    engine,
    get_session,
    init_db,
)

__all__ = [
    "ROOT_DIR",
    "DB_PATH",
    "DATABASE_URL",
    "SQL_ECHO",
    "create_db_engine",
    "engine",
    "init_db",
    "get_session",
]
