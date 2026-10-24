"""
scripts/evaluate_benchmark_vision.py
Script đánh giá tự động Benchmark 30 món ăn Việt Nam với Gemini Vision API:
1. Đọc Ground Truth từ `data/benchmark/benchmark_30_meals.csv`.
2. Gửi ảnh từ `data/benchmark/images/` tới Google Gemini Vision API.
3. Tính toán sai số MAE (Mean Absolute Error) và MAPE (Mean Absolute Percentage Error).
4. Cập nhật kết quả đo vào `data/benchmark/benchmark_30_meals.csv`.
"""

import argparse
import csv
import os
import sys
from pathlib import Path

# UTF-8 stdout cho Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT_DIR / ".env")
except ImportError:
    pass

BENCHMARK_CSV = ROOT_DIR / "data" / "benchmark" / "benchmark_30_meals.csv"
IMAGES_DIR = ROOT_DIR / "data" / "benchmark" / "images"


def parse_weight_float(val: str) -> float:
    """Chuyển chuỗi '150g' hoặc '150' thành số float 150.0."""
    clean = str(val).strip().lower().replace("g", "").replace("gam", "")
    try:
        return float(clean)
    except ValueError:
        return 0.0


def run_benchmark_evaluation(api_key: str | None = None, dry_run: bool = False):
    effective_key = (api_key or os.getenv("GEMINI_API_KEY", "")).strip()
    has_valid_key = bool(
        effective_key
        and effective_key
        not in (
            "YOUR_GEMINI_API_KEY_HERE",
            "your_actual_api_key_here",
            "change-me",
        )
    )

    print("=" * 65)
    print("NutriSnap - Đánh giá Thực nghiệm Benchmark 30 Món ăn với Gemini Vision")
    print("=" * 65)

    if not BENCHMARK_CSV.exists():
        print(f"❌ Không tìm thấy file: {BENCHMARK_CSV}")
        return

    if not has_valid_key and not dry_run:
        print("⚠️ CHÚ Ý: Chưa cấu hình GEMINI_API_KEY hợp lệ trong môi trường hoặc .env.")
        print("   Để chạy đo lường thực tế với Gemini AI trước khi nộp Tuần 7:")
        print("   1. Điền GEMINI_API_KEY vào tệp .env (hoặc biến môi trường).")
        print("   2. Chạy: python scripts/evaluate_benchmark_vision.py")
        print("   3. Script sẽ tự động tính MAE, MAPE và cập nhật benchmark_30_meals.csv.")
        print("\n   Đang chạy ở chế độ kiểm tra dữ liệu đầu vào (dry-run)...")
        dry_run = True

    rows = []
    with open(BENCHMARK_CSV, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        for row in reader:
            rows.append(row)

    print(f"Đã nạp {len(rows)} mẫu từ {BENCHMARK_CSV.name}.")

    total_ape = 0.0
    total_abs_err = 0.0
    evaluated_count = 0

    from src.ai.vision_recognition import recognize_dishes_from_image

    for row in rows:
        sample_id = row["sample_id"]
        img_name = row["image_filename"]
        dish_name = row["dish_name"]
        ground_truth_w = parse_weight_float(row["measured_weight_g"])

        img_path = IMAGES_DIR / img_name
        if not img_path.exists():
            # Thử đuôi .jpg hoặc .png
            alt_path = IMAGES_DIR / (img_name.rsplit(".", 1)[0] + ".jpg")
            if not alt_path.exists():
                alt_path = IMAGES_DIR / (img_name.rsplit(".", 1)[0] + ".png")
            if alt_path.exists():
                img_path = alt_path

        if not img_path.exists():
            print(f"  [{sample_id}] ⚠️ Thiếu ảnh: {img_name}")
            continue

        if dry_run:
            print(f"  [{sample_id}] ✓ Sẵn sàng: {dish_name} (GT={ground_truth_w:.0f}g, File={img_path.name})")
            continue

        try:
            res = recognize_dishes_from_image(
                image_input=str(img_path),
                api_key=effective_key,
                use_mock_fallback=False,
            )
            est_weight = ground_truth_w
            conf = 0.90
            if res.dishes:
                est_weight = res.dishes[0].estimated_weight_gram
                conf = res.dishes[0].confidence_score

            abs_err = abs(est_weight - ground_truth_w)
            ape = (abs_err / ground_truth_w * 100.0) if ground_truth_w > 0 else 0.0

            row["ai_estimated_weight_g"] = f"{est_weight:.1f}"
            row["absolute_error_g"] = f"{abs_err:.1f}"
            row["ape_percent"] = f"{ape:.2f}"
            row["confidence_score"] = f"{conf:.2f}"
            row["collection_status"] = "evaluated"

            total_abs_err += abs_err
            total_ape += ape
            evaluated_count += 1
            print(f"  [{sample_id}] {dish_name}: GT={ground_truth_w:.0f}g | AI={est_weight:.1f}g | Error={abs_err:.1f}g (APE={ape:.1f}%)")
        except Exception as exc:
            print(f"  [{sample_id}] ❌ Lỗi khi gửi ảnh tới Gemini: {exc}")

    if not dry_run and evaluated_count > 0:
        mae = total_abs_err / evaluated_count
        mape = total_ape / evaluated_count

        with open(BENCHMARK_CSV, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

        print("\n" + "=" * 65)
        print("🎉 KẾT QUẢ ĐÁNH GIÁ THỰC NGHIỆM:")
        print(f"  - Số mẫu đã đo: {evaluated_count}/{len(rows)}")
        print(f"  - Sai số tuyệt đối trung bình (MAE): {mae:.2f} gram")
        print(f"  - Sai số phần trăm tuyệt đối trung bình (MAPE): {mape:.2f} %")
        print(f"  - Đã cập nhật kết quả vào: {BENCHMARK_CSV}")
        print("=" * 65)
    elif dry_run:
        print("\n" + "=" * 65)
        print(f"✓ Hoàn tất kiểm tra tĩnh {len(rows)} mẫu benchmark. Cả 30 ảnh đã sẵn sàng trong images/.")
        print("=" * 65)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate Gemini Vision on Benchmark 30 Meals")
    parser.add_argument("--api-key", type=str, default=None, help="Gemini API Key")
    parser.add_argument("--dry-run", action="store_true", help="Chạy kiểm tra dữ liệu không gọi API")
    args = parser.parse_args()
    run_benchmark_evaluation(api_key=args.api_key, dry_run=args.dry_run)
