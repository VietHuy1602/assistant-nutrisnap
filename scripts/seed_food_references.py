import sqlite3
import pandas as pd
from pathlib import Path

# Đường dẫn đến thư mục gốc của dự án
root_dir = Path(__file__).resolve().parent.parent
csv_path = root_dir / "data" / "vn_foods.csv"
db_path = root_dir / "nutrisnap.db"

def seed_foods():
    print("=" * 60)
    print("Bắt đầu nạp dữ liệu món ăn từ data/vn_foods.csv vào CSDL...")
    print("=" * 60)

    # 1. Kiểm tra file CSV và file DB
    if not csv_path.exists():
        print(f"❌ Lỗi: Không tìm thấy file {csv_path}")
        return
    if not db_path.exists():
        print(f"❌ Lỗi: Không tìm thấy cơ sở dữ liệu {db_path}. Hãy chạy init_db.py trước!")
        return

    # 2. Đọc 500 món ăn từ file CSV
    df = pd.read_csv(csv_path, encoding="utf-8-sig")
    print(f"Đã đọc thành công {len(df)} món ăn từ file CSV.")

    # 3. Kết nối CSDL SQLite và nạp dữ liệu
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Xóa dữ liệu cũ trong bảng để tránh bị nhân bản khi chạy lại
    cursor.execute("DELETE FROM food_references;")
    
    # Nạp 500 dòng mới vào bảng food_references
    df.to_sql("food_references", conn, if_exists="append", index=False)
    conn.commit()

    # 4. Kiểm tra số lượng thực tế trong CSDL
    total_rows = cursor.execute("SELECT COUNT(*) FROM food_references;").fetchone()[0]
    sample_items = cursor.execute("SELECT id, food_name, calories_per_100g, avg_price_vnd FROM food_references LIMIT 3;").fetchall()
    
    conn.close()

    print(f"\n✅ THÀNH CÔNG: Đã nạp chính xác {total_rows} món ăn vào bảng 'food_references'!")
    print("Mẫu dữ liệu trong CSDL:")
    for item in sample_items:
        print(f" - ID: {item[0]} | Món: {item[1]} | Calo: {item[2]} kcal/100g | Giá: {item[3]:,} VNĐ")

if __name__ == "__main__":
    seed_foods()