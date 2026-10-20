import sqlite3
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Thêm thư mục gốc vào path để import được models
root_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(root_dir))

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import SQLModel, create_engine

# Import 8 bảng CSDL

DATABASE_URL = "sqlite:///./nutrisnap.db"

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
    print("Đang khởi tạo cơ sở dữ liệu nutrisnap.db với 8 bảng chuẩn...")
    print("=" * 60)
    SQLModel.metadata.create_all(engine)
    print("\n✅ THÀNH CÔNG: Đã tạo 8 bảng CSDL và kích hoạt khóa ngoại PRAGMA!")

if __name__ == "__main__":
    init_db()
