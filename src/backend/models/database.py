"""
src/backend/models/database.py
Quản lý kết nối Cơ sở dữ liệu SQLite tập trung cho toàn bộ ứng dụng NutriSnap.

Đặc tính:
1. Đường dẫn tuyệt đối chuẩn xác: Cố định vị trí nutrisnap.db tại thư mục gốc dự án.
2. Quản lý PRAGMA foreign_keys = ON tập trung: Bật bắt buộc foreign_keys qua event listener connect.
3. Cấu hình linh hoạt: echo=False mặc định để tránh spam terminal log.
"""

import logging
import os
import sqlite3
from collections.abc import Generator
from pathlib import Path
from typing import Any

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session, SQLModel, create_engine

logger = logging.getLogger(__name__)

# Đường dẫn gốc tuyệt đối của dự án (4 cấp thư mục: database.py -> models -> backend -> src -> ROOT)
ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
DB_PATH = ROOT_DIR / "nutrisnap.db"
DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{DB_PATH.as_posix()}"


def create_db_engine(
    url: str = DATABASE_URL,
    echo: bool = False,
    connect_args: dict[str, Any] | None = None,
    **kwargs: Any,
) -> Engine:
    """Tạo engine kết nối CSDL và kích hoạt khóa ngoại PRAGMA foreign_keys=ON duy nhất một lần."""
    if connect_args is None:
        connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}

    engine = create_engine(url, echo=echo, connect_args=connect_args, **kwargs)

    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            if isinstance(dbapi_connection, sqlite3.Connection):
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA foreign_keys=ON;")
                cursor.close()

    return engine


# Engine mặc định cho toàn bộ Backend
SQL_ECHO = os.getenv("SQL_ECHO", "false").lower() in ("true", "1", "yes")
engine = create_db_engine(DATABASE_URL, echo=SQL_ECHO)


def init_db(target_engine: Engine | None = None) -> None:
    """Khởi tạo toàn bộ 8 bảng CSDL theo SQLModel metadata."""
    eng = target_engine or engine
    # Import schema để SQLModel.metadata nhận diện đủ 8 bảng
    import src.backend.models.schema  # noqa: F401

    SQLModel.metadata.create_all(eng)

    # Tự động đồng bộ các cột mới nếu bảng users đã tồn tại từ trước (SQLite migration)
    with eng.connect() as conn:
        try:
            result = conn.exec_driver_sql("PRAGMA table_info(users)")
            existing_cols = {row[1] for row in result.fetchall()}
            if existing_cols:
                if "full_name" not in existing_cols:
                    conn.exec_driver_sql("ALTER TABLE users ADD COLUMN full_name VARCHAR(100)")
                    logger.warning("Đã tự động bổ sung cột 'full_name' vào bảng 'users'.")
                if "is_active" not in existing_cols:
                    conn.exec_driver_sql("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1 NOT NULL")
                    logger.warning("Đã tự động bổ sung cột 'is_active' vào bảng 'users'.")
            conn.commit()
        except SQLAlchemyError as exc:
            logger.warning("Không thể tự động cập nhật schema bảng users: %s", exc)


# Tự động đồng bộ schema CSDL khi module được nạp
init_db(engine)


def get_session() -> Generator[Session, None, None]:
    """Dependency cung cấp Session CSDL cho FastAPI endpoints."""
    with Session(engine) as session:
        yield session


from src.backend.models.schema import PendingAction  # noqa: E402, F401

