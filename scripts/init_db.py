"""
scripts/init_db.py
Script khởi tạo cơ sở dữ liệu nutrisnap.db với 8 bảng chuẩn hóa.
Sử dụng cấu hình kết nối tập trung từ src/backend/database.py.
"""

import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Thêm thư mục gốc vào PYTHONPATH
root_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(root_dir))

from src.backend.database import DB_PATH, init_db


def main():
    print("=" * 60)
    print(f"Đang khởi tạo cơ sở dữ liệu tại: {DB_PATH.as_posix()}")
    print("Kích hoạt 8 bảng chuẩn có ON DELETE CASCADE và PRAGMA foreign_keys=ON...")
    print("=" * 60)
    init_db()
    print("\n✅ THÀNH CÔNG: Đã tạo 8 bảng CSDL và kích hoạt khóa ngoại PRAGMA!")


if __name__ == "__main__":
    main()
