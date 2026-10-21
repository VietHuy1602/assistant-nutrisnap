"""
scripts/seed_food_references.py
Nạp dữ liệu dinh dưỡng 500 món ăn Việt Nam từ data/vn_foods.csv vào CSDL.
Sử dụng kỹ thuật SQLite UPSERT (ON CONFLICT DO UPDATE):
- Giữ nguyên toàn bộ ID đã cấp phát cho các món ăn cũ.
- Tuyệt đối KHÔNG xóa bảng (DELETE FROM) để tránh làm mồ côi (orphaned) các bản ghi meal_items đã liên kết.
- Luôn kích hoạt PRAGMA foreign_keys = ON.
"""

import sqlite3
import sys
from pathlib import Path

import pandas as pd

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Thêm thư mục gốc vào PYTHONPATH
root_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(root_dir))

from src.backend.database import DB_PATH, init_db

csv_path = root_dir / "data" / "vn_foods.csv"


def seed_foods():
    print("=" * 60)
    print("Bắt đầu nạp/cập nhật dữ liệu món ăn từ data/vn_foods.csv vào CSDL...")
    print(f"Cơ sở dữ liệu đích: {DB_PATH.as_posix()}")
    print("=" * 60)

    # 1. Kiểm tra file CSV và tạo DB nếu chưa có
    if not csv_path.exists():
        print(f"❌ Lỗi: Không tìm thấy file {csv_path}")
        return

    # Đảm bảo bảng CSDL đã được tạo
    init_db()

    # 2. Đọc 500 món ăn từ file CSV
    df = pd.read_csv(csv_path, encoding="utf-8-sig")
    print(f"Đã đọc thành công {len(df)} món ăn từ file CSV.")

    # 3. Kết nối CSDL SQLite với PRAGMA foreign_keys = ON
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON;")

    # 4. Thực thi UPSERT an toàn (Không làm mất ID và không làm mồ côi dữ liệu meal_items)
    upsert_sql = """
    INSERT INTO food_references (
        food_name,
        calories_per_100g,
        protein_per_100g,
        carbs_per_100g,
        fat_per_100g,
        avg_price_vnd
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(food_name) DO UPDATE SET
        calories_per_100g = excluded.calories_per_100g,
        protein_per_100g = excluded.protein_per_100g,
        carbs_per_100g = excluded.carbs_per_100g,
        fat_per_100g = excluded.fat_per_100g,
        avg_price_vnd = excluded.avg_price_vnd;
    """

    records = [
        (
            row["food_name"],
            float(row["calories_per_100g"]),
            float(row["protein_per_100g"]),
            float(row["carbs_per_100g"]),
            float(row["fat_per_100g"]),
            int(row["avg_price_vnd"]),
        )
        for _, row in df.iterrows()
    ]

    cursor.executemany(upsert_sql, records)
    conn.commit()

    # 5. Kiểm tra kết quả
    total_rows = cursor.execute("SELECT COUNT(*) FROM food_references;").fetchone()[0]
    sample_items = cursor.execute(
        "SELECT id, food_name, calories_per_100g, avg_price_vnd FROM food_references LIMIT 3;"
    ).fetchall()

    conn.close()

    print(f"\n✅ THÀNH CÔNG: Đã đồng bộ an toàn {total_rows} món ăn vào bảng 'food_references'!")
    print("Mẫu dữ liệu trong CSDL:")
    for item in sample_items:
        print(f" - ID: {item[0]} | Món: {item[1]} | Calo: {item[2]} kcal/100g | Giá: {item[3]:,} VNĐ")


if __name__ == "__main__":
    seed_foods()
