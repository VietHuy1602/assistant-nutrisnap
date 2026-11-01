"""
scripts/seed_food_references.py
Nạp dữ liệu dinh dưỡng 500 món ăn Việt Nam từ data/vn_foods.csv vào CSDL.
Sử dụng UPSERT (ON CONFLICT DO UPDATE), chạy được trên cả SQLite và PostgreSQL:
- Giữ nguyên toàn bộ ID đã cấp phát cho các món ăn cũ.
- Tuyệt đối KHÔNG xóa bảng (DELETE FROM) để tránh làm mồ côi (orphaned) các bản ghi meal_items đã liên kết.
- Với SQLite luôn kích hoạt PRAGMA foreign_keys = ON (qua engine dùng chung).
"""

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

from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.dialects.postgresql import insert as pg_insert  # noqa: E402
from sqlalchemy.dialects.sqlite import insert as sqlite_insert  # noqa: E402

from src.backend.models.database import engine, init_db  # noqa: E402
from src.backend.models.schema import FoodReference  # noqa: E402

csv_path = root_dir / "data" / "vn_foods.csv"


def seed_foods():
    print("=" * 60)
    print("Bắt đầu nạp/cập nhật dữ liệu món ăn từ data/vn_foods.csv vào CSDL...")
    print(f"Cơ sở dữ liệu đích: {engine.url.render_as_string(hide_password=True)}")
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

    # 3. UPSERT an toàn (Không làm mất ID và không làm mồ côi dữ liệu meal_items)
    records = [
        {
            "food_name": row["food_name"],
            "calories_per_100g": float(row["calories_per_100g"]),
            "protein_per_100g": float(row["protein_per_100g"]),
            "carbs_per_100g": float(row["carbs_per_100g"]),
            "fat_per_100g": float(row["fat_per_100g"]),
            "avg_price_vnd": int(row["avg_price_vnd"]),
            "default_serving_g": float(row.get("default_serving_g", 100.0)),
            "serving_label": str(row.get("serving_label", "100g")),
        }
        for _, row in df.iterrows()
    ]
    table = FoodReference.__table__
    insert = pg_insert if engine.dialect.name == "postgresql" else sqlite_insert
    stmt = insert(table).values(records)
    stmt = stmt.on_conflict_do_update(
        index_elements=[table.c.food_name],
        set_={name: stmt.excluded[name] for name in records[0] if name != "food_name"},
    )

    with engine.begin() as conn:
        conn.execute(stmt)
        # 4. Kiểm tra kết quả
        total_rows = conn.execute(select(func.count()).select_from(table)).scalar_one()
        sample_items = conn.execute(
            select(table.c.id, table.c.food_name, table.c.calories_per_100g, table.c.avg_price_vnd).limit(3)
        ).all()

    print(f"\n✅ THÀNH CÔNG: Đã đồng bộ an toàn {total_rows} món ăn vào bảng 'food_references'!")
    print("Mẫu dữ liệu trong CSDL:")
    for item in sample_items:
        print(f" - ID: {item[0]} | Món: {item[1]} | Calo: {item[2]} kcal/100g | Giá: {item[3]:,} VNĐ")


if __name__ == "__main__":
    seed_foods()
