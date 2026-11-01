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

from sqlalchemy import event, inspect
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session, SQLModel, create_engine

logger = logging.getLogger(__name__)

# Đường dẫn gốc tuyệt đối của dự án (4 cấp thư mục: database.py -> models -> backend -> src -> ROOT)
ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
DB_PATH = ROOT_DIR / "nutrisnap.db"


def normalize_database_url(url: str) -> str:
    """Neon/Supabase/Render cấp URL dạng postgres:// hoặc postgresql://; SQLAlchemy cần chỉ rõ driver psycopg 3."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


DATABASE_URL = normalize_database_url(os.getenv("DATABASE_URL") or f"sqlite:///{DB_PATH.as_posix()}")


def create_db_engine(
    url: str = DATABASE_URL,
    echo: bool = False,
    connect_args: dict[str, Any] | None = None,
    **kwargs: Any,
) -> Engine:
    """Tạo engine kết nối CSDL và kích hoạt khóa ngoại PRAGMA foreign_keys=ON duy nhất một lần."""
    if connect_args is None:
        connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}

    if not url.startswith("sqlite"):
        # Postgres miễn phí (Neon) tự ngắt kết nối khi rảnh: kiểm tra kết nối trước khi dùng
        kwargs.setdefault("pool_pre_ping", True)
        kwargs.setdefault("pool_recycle", 300)
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

    # Tự động bổ sung cột mới cho bảng đã tồn tại từ trước (chạy được trên cả SQLite và PostgreSQL)
    true_sql = "TRUE" if eng.dialect.name == "postgresql" else "1"
    false_sql = "FALSE" if eng.dialect.name == "postgresql" else "0"
    added_columns = {
        "users": [
            ("full_name", "VARCHAR(100)"),
            ("is_active", f"BOOLEAN DEFAULT {true_sql} NOT NULL"),
            ("is_admin", f"BOOLEAN DEFAULT {false_sql} NOT NULL"),
        ],
        "food_references": [
            ("default_serving_g", "FLOAT DEFAULT 100.0 NOT NULL"),
            ("serving_label", "VARCHAR(50) DEFAULT '100g' NOT NULL"),
        ],
    }
    try:
        inspector = inspect(eng)
        with eng.begin() as conn:
            for table, columns in added_columns.items():
                if not inspector.has_table(table):
                    continue
                existing_cols = {col["name"] for col in inspector.get_columns(table)}
                for name, ddl in columns:
                    if name not in existing_cols:
                        conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
                        logger.warning("Đã tự động bổ sung cột '%s' vào bảng '%s'.", name, table)
    except SQLAlchemyError as exc:
        logger.warning("Không thể tự động cập nhật schema bảng users/food_references: %s", exc)


# Tự động đồng bộ schema CSDL khi module được nạp
init_db(engine)


def get_session() -> Generator[Session, None, None]:
    """Dependency cung cấp Session CSDL cho FastAPI endpoints."""
    with Session(engine) as session:
        yield session


from src.backend.models.schema import PendingAction  # noqa: E402, F401

