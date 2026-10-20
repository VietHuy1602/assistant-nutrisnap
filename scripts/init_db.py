import os
import sqlite3
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Xác định vị trí thư mục gốc và file CSDL tuyệt đối
root_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(root_dir))

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import SQLModel, create_engine

# Import schema để đăng ký toàn bộ 8 bảng vào SQLModel.metadata
import src.backend.models.schema  # noqa: F401

# Đường dẫn database tuyệt đối, tránh tạo nhầm tệp khi chạy từ thư mục khác
DB_PATH = root_dir / "nutrisnap.db"
DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{DB_PATH.as_posix()}"

# Kích hoạt cờ PRAGMA foreign_keys = ON bắt buộc cho SQLite
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()

engine = create_engine(DATABASE_URL, echo=True)

def init_db():
    print("=" * 60)
    print(f"Đang khởi tạo cơ sở dữ liệu tại: {DB_PATH.as_posix()}")
    print("Kích hoạt 8 bảng chuẩn có ON DELETE CASCADE và PRAGMA foreign_keys=ON...")
    print("=" * 60)
    SQLModel.metadata.create_all(engine)
    print("\n✅ THÀNH CÔNG: Đã tạo 8 bảng CSDL và kích hoạt khóa ngoại PRAGMA!")

if __name__ == "__main__":
    init_db()
