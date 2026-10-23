"""
scripts/benchmark_w3_latency.py
Script đo độ trễ (latency benchmarking) thực tế cho 5 chặng theo kế hoạch W3 PoC:
1. Đăng nhập (login)
2. Nhận diện ảnh món ăn (food_recognition)
3. Lưu bữa ăn xác nhận (save_meal)
4. Tải dữ liệu Dashboard (dashboard)
5. Toàn luồng tuần tự từ đầu đến cuối (e2e_pipeline)

Tuân thủ:
- Đo lường thời gian thực tế bằng time.perf_counter()
- 1 lượt warm-up không tính vào thống kê
- 25 lượt đo chính thức mỗi chặng (N=25 >= 20)
- Xuất dữ liệu chi tiết ra data/benchmark/w3_latency_results.csv
- Không giả mạo số liệu; ghi rõ môi trường mock AI hay real AI
"""

import base64
import csv
import math
import os
import sys
import time
from pathlib import Path

# Thêm đường dẫn gốc dự án vào sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Đảm bảo cấu hình biến môi trường an toàn trước khi nạp app
os.environ.setdefault(
    "JWT_SECRET_KEY",
    "benchmark_nutrisnap_jwt_secret_key_minimum_32_characters_for_test_runs!",
)
os.environ.setdefault("APP_ENV", "testing")

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.backend.main import app
from src.backend.models.database import engine, init_db
from src.backend.models.schema import FoodReference

# Đảm bảo CSDL được khởi tạo và nạp dữ liệu tham chiếu
init_db()
with Session(engine) as db_session:
    count = len(db_session.exec(select(FoodReference)).all())
    if count < 30:
        from scripts.seed_food_references import seed_foods

        seed_foods()

# Đảm bảo tài khoản demo tồn tại
from scripts.seed_demo_accounts import seed_demo_data

seed_demo_data()

# Dữ liệu ảnh JPEG mẫu hợp lệ
SAMPLE_JPEG_BYTES = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00"
    b"\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19"
    b"\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9"
    b"=\x82\xc200\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f"
    b"\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02"
    b"\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"
)
IMAGE_BASE64 = base64.b64encode(SAMPLE_JPEG_BYTES).decode("utf-8")
IMAGE_SIZE_BYTES = len(SAMPLE_JPEG_BYTES)

ENV_NAME = "local-windows-sqlite-mockai"
N_RUNS = 25
CSV_PATH = Path("data/benchmark/w3_latency_results.csv")
CSV_PATH.parent.mkdir(parents=True, exist_ok=True)


def calculate_percentile(sorted_list: list[float], percentile: float) -> float:
    """Tính phân vị percentile theo chuẩn phần trăm vị trí."""
    if not sorted_list:
        return 0.0
    k = (len(sorted_list) - 1) * (percentile / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_list[int(k)]
    d0 = sorted_list[int(f)] * (c - k)
    d1 = sorted_list[int(c)] * (k - f)
    return d0 + d1


def run_benchmarks():
    client = TestClient(app)
    records = []
    run_counter = 0

    print("=== BẮT ĐẦU ĐO ĐỘ TRỄ THỰC TẾ (W3 LATENCY BENCHMARK) ===")
    print(f"Môi trường: {ENV_NAME}")
    print(f"Số lượt đo mỗi chặng: {N_RUNS} (kèm 1 warm-up không tính thống kê)")

    # -------------------------------------------------------------
    # 1. ĐO CHẶNG ĐĂNG NHẬP (LOGIN)
    # -------------------------------------------------------------
    print("\n[1/5] Đo chặng Đăng nhập (POST /api/v1/auth/login)...")
    login_payload = {"username_or_email": "student_user", "password": "NutriSnap123"}

    # Warm-up
    t0 = time.perf_counter()
    resp = client.post("/api/v1/auth/login", json=login_payload)
    t1 = time.perf_counter()
    warmup_ms = round((t1 - t0) * 1000, 2)
    records.append(
        {
            "run_id": "warmup_login",
            "stage": "login",
            "duration_ms": warmup_ms,
            "status": "success" if resp.status_code == 200 else f"failed_{resp.status_code}",
            "environment": ENV_NAME,
            "image_size_bytes": 0,
            "notes": "warmup_excluded_from_stats",
        }
    )

    login_latencies = []
    for _i in range(1, N_RUNS + 1):
        run_counter += 1
        t0 = time.perf_counter()
        resp = client.post("/api/v1/auth/login", json=login_payload)
        t1 = time.perf_counter()
        dur_ms = round((t1 - t0) * 1000, 2)
        status_str = "success" if resp.status_code == 200 else f"failed_{resp.status_code}"
        records.append(
            {
                "run_id": f"run_{run_counter:03d}",
                "stage": "login",
                "duration_ms": dur_ms,
                "status": status_str,
                "environment": ENV_NAME,
                "image_size_bytes": 0,
                "notes": "bcrypt_auth_httponly_cookie",
            }
        )
        if resp.status_code == 200:
            login_latencies.append(dur_ms)

    # -------------------------------------------------------------
    # 2. ĐO CHẶNG NHẬN DIỆN MÓN ĂN (FOOD RECOGNITION)
    # -------------------------------------------------------------
    print("\n[2/5] Đo chặng Nhận diện ảnh (POST /api/v1/ai/recognize-food)...")
    rec_payload = {"image_base64": IMAGE_BASE64, "meal_type": "lunch"}

    # Warm-up
    t0 = time.perf_counter()
    resp = client.post("/api/v1/ai/recognize-food", json=rec_payload)
    t1 = time.perf_counter()
    warmup_ms = round((t1 - t0) * 1000, 2)
    records.append(
        {
            "run_id": "warmup_recognition",
            "stage": "food_recognition",
            "duration_ms": warmup_ms,
            "status": "success" if resp.status_code == 200 else f"failed_{resp.status_code}",
            "environment": ENV_NAME,
            "image_size_bytes": IMAGE_SIZE_BYTES,
            "notes": "warmup_excluded_from_stats",
        }
    )

    recognition_latencies = []
    for _i in range(1, N_RUNS + 1):
        run_counter += 1
        t0 = time.perf_counter()
        resp = client.post("/api/v1/ai/recognize-food", json=rec_payload)
        t1 = time.perf_counter()
        dur_ms = round((t1 - t0) * 1000, 2)
        status_str = "success" if resp.status_code == 200 else f"failed_{resp.status_code}"
        records.append(
            {
                "run_id": f"run_{run_counter:03d}",
                "stage": "food_recognition",
                "duration_ms": dur_ms,
                "status": status_str,
                "environment": ENV_NAME,
                "image_size_bytes": IMAGE_SIZE_BYTES,
                "notes": "mock_fallback_zero_crash",
            }
        )
        if resp.status_code == 200:
            recognition_latencies.append(dur_ms)

    # -------------------------------------------------------------
    # 3. ĐO CHẶNG LƯU MÓN ĂN (SAVE MEAL)
    # -------------------------------------------------------------
    print("\n[3/5] Đo chặng Lưu món ăn (POST /api/v1/meals/log)...")
    # Đăng nhập sẵn để có session
    client.post("/api/v1/auth/login", json=login_payload)
    meal_payload = {
        "meal_type": "Trưa",
        "items": [{"food_name": "Phở bò tái", "estimated_gram": 350.0, "eaten_ratio": 1.0}],
        "is_confirmed": True,
        "notes": "Benchmark test run",
    }

    # Warm-up
    t0 = time.perf_counter()
    resp = client.post("/api/v1/meals/log", json=meal_payload)
    t1 = time.perf_counter()
    warmup_ms = round((t1 - t0) * 1000, 2)
    records.append(
        {
            "run_id": "warmup_save_meal",
            "stage": "save_meal",
            "duration_ms": warmup_ms,
            "status": "success" if resp.status_code == 201 else f"failed_{resp.status_code}",
            "environment": ENV_NAME,
            "image_size_bytes": 0,
            "notes": "warmup_excluded_from_stats",
        }
    )

    save_meal_latencies = []
    for _i in range(1, N_RUNS + 1):
        run_counter += 1
        t0 = time.perf_counter()
        resp = client.post("/api/v1/meals/log", json=meal_payload)
        t1 = time.perf_counter()
        dur_ms = round((t1 - t0) * 1000, 2)
        status_str = "success" if resp.status_code == 201 else f"failed_{resp.status_code}"
        records.append(
            {
                "run_id": f"run_{run_counter:03d}",
                "stage": "save_meal",
                "duration_ms": dur_ms,
                "status": status_str,
                "environment": ENV_NAME,
                "image_size_bytes": 0,
                "notes": "atomic_sqlite_write_deterministic_math",
            }
        )
        if resp.status_code == 201:
            save_meal_latencies.append(dur_ms)

    # -------------------------------------------------------------
    # 4. ĐO CHẶNG DASHBOARD (GET /api/v1/meals/daily-dashboard)
    # -------------------------------------------------------------
    print("\n[4/5] Đo chặng Dashboard (GET /api/v1/meals/daily-dashboard)...")

    # Warm-up
    t0 = time.perf_counter()
    resp = client.get("/api/v1/meals/daily-dashboard")
    t1 = time.perf_counter()
    warmup_ms = round((t1 - t0) * 1000, 2)
    records.append(
        {
            "run_id": "warmup_dashboard",
            "stage": "dashboard",
            "duration_ms": warmup_ms,
            "status": "success" if resp.status_code == 200 else f"failed_{resp.status_code}",
            "environment": ENV_NAME,
            "image_size_bytes": 0,
            "notes": "warmup_excluded_from_stats",
        }
    )

    dashboard_latencies = []
    for _i in range(1, N_RUNS + 1):
        run_counter += 1
        t0 = time.perf_counter()
        resp = client.get("/api/v1/meals/daily-dashboard")
        t1 = time.perf_counter()
        dur_ms = round((t1 - t0) * 1000, 2)
        status_str = "success" if resp.status_code == 200 else f"failed_{resp.status_code}"
        records.append(
            {
                "run_id": f"run_{run_counter:03d}",
                "stage": "dashboard",
                "duration_ms": dur_ms,
                "status": status_str,
                "environment": ENV_NAME,
                "image_size_bytes": 0,
                "notes": "daily_aggregation_calories_macros",
            }
        )
        if resp.status_code == 200:
            dashboard_latencies.append(dur_ms)

    # -------------------------------------------------------------
    # 5. ĐO TOÀN LUỒNG TUẦN TỰ (E2E PIPELINE)
    # -------------------------------------------------------------
    print("\n[5/5] Đo toàn luồng tuần tự E2E (Login -> Recognize -> Save -> Dashboard)...")

    # Warm-up
    t0 = time.perf_counter()
    w_client = TestClient(app)
    r_login = w_client.post("/api/v1/auth/login", json=login_payload)
    r_rec = w_client.post("/api/v1/ai/recognize-food", json=rec_payload)
    r_save = w_client.post("/api/v1/meals/log", json=meal_payload)
    r_dash = w_client.get("/api/v1/meals/daily-dashboard")
    t1 = time.perf_counter()
    warmup_ms = round((t1 - t0) * 1000, 2)
    warmup_success = (
        r_login.status_code == 200
        and r_rec.status_code == 200
        and r_save.status_code == 201
        and r_dash.status_code == 200
    )
    records.append({
        "run_id": "warmup_e2e",
        "stage": "e2e_pipeline",
        "duration_ms": warmup_ms,
        "status": "success" if warmup_success else "failed",
        "environment": ENV_NAME,
        "image_size_bytes": IMAGE_SIZE_BYTES,
        "notes": "warmup_excluded_from_stats",
    })

    e2e_latencies = []
    for _i in range(1, N_RUNS + 1):
        run_counter += 1
        pipe_client = TestClient(app)
        t0 = time.perf_counter()
        r1 = pipe_client.post("/api/v1/auth/login", json=login_payload)
        r2 = pipe_client.post("/api/v1/ai/recognize-food", json=rec_payload)
        r3 = pipe_client.post("/api/v1/meals/log", json=meal_payload)
        r4 = pipe_client.get("/api/v1/meals/daily-dashboard")
        t1 = time.perf_counter()
        dur_ms = round((t1 - t0) * 1000, 2)
        success = r1.status_code == 200 and r2.status_code == 200 and r3.status_code == 201 and r4.status_code == 200
        status_str = "success" if success else "failed"
        records.append(
            {
                "run_id": f"run_{run_counter:03d}",
                "stage": "e2e_pipeline",
                "duration_ms": dur_ms,
                "status": status_str,
                "environment": ENV_NAME,
                "image_size_bytes": IMAGE_SIZE_BYTES,
                "notes": "full_user_flow_machine_processing",
            }
        )
        if success:
            e2e_latencies.append(dur_ms)

    # -------------------------------------------------------------
    # GHI FILE CSV
    # -------------------------------------------------------------
    fieldnames = ["run_id", "stage", "duration_ms", "status", "environment", "image_size_bytes", "notes"]
    with open(CSV_PATH, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)

    print(f"\n Đã lưu toàn bộ {len(records)} lượt đo vào: {CSV_PATH.resolve()}")

    # -------------------------------------------------------------
    # TỔNG HỢP THỐNG KÊ CHI TIẾT
    # -------------------------------------------------------------
    stages_data = [
        ("1. Đăng nhập (login)", login_latencies),
        ("2. Nhận diện ảnh (food_rec)", recognition_latencies),
        ("3. Lưu món (save_meal)", save_meal_latencies),
        ("4. Dashboard (daily_dash)", dashboard_latencies),
        ("5. Toàn luồng E2E (pipeline)", e2e_latencies),
    ]

    print("\n" + "=" * 95)
    print(
        f"{'Chặng kiểm thử':<30} | {'N':<4} | {'Mean (ms)':<10} | {'P50 (ms)':<10} | {'P95 (ms)':<10} | {'Min (ms)':<9} | {'Max (ms)':<9} | {'Lỗi (%)':<8}"
    )
    print("-" * 95)

    stats_summary = {}
    for name, lat_list in stages_data:
        n = len(lat_list)
        if n > 0:
            sorted_lat = sorted(lat_list)
            mean_val = round(sum(sorted_lat) / n, 2)
            p50_val = round(calculate_percentile(sorted_lat, 50), 2)
            p95_val = round(calculate_percentile(sorted_lat, 95), 2)
            min_val = round(min(sorted_lat), 2)
            max_val = round(max(sorted_lat), 2)
            err_rate = round(((N_RUNS - n) / N_RUNS) * 100, 1)
        else:
            mean_val = p50_val = p95_val = min_val = max_val = 0.0
            err_rate = 100.0

        stats_summary[name] = {
            "n": n,
            "mean": mean_val,
            "p50": p50_val,
            "p95": p95_val,
            "min": min_val,
            "max": max_val,
            "err_rate": err_rate,
        }
        print(
            f"{name:<30} | {n:<4} | {mean_val:<10.2f} | {p50_val:<10.2f} | {p95_val:<10.2f} | {min_val:<9.2f} | {max_val:<9.2f} | {err_rate:<8.1f}%"
        )
    print("=" * 95)
    print("\n[!] LƯU Ý LIÊM CHÍNH HỌC THUẬT & MINH BẠCH SỐ LIỆU:")
    print(
        "    - Số liệu chặng nhận diện (food_rec) được đo đạc trên cơ chế Mock Fallback nội bộ (môi trường không có GEMINI_API_KEY)."
    )
    print("    - Độ trễ và tỉ lệ nhận diện thật trên 30 ảnh benchmark chưa được đo đạc bằng mô hình Vision AI thật.")
    print("    - Tuyệt đối không trình bày các số liệu này là kết quả của Vision AI thật (Google Gemini API).")
    return stats_summary


if __name__ == "__main__":
    run_benchmarks()
