"""
scripts/evaluate_food_benchmark.py
Đo độ chính xác nhận diện món ăn trên bộ benchmark ảnh thật (data/benchmark/real/manifest.csv).

Chỉ số:
  - exact: món đầu tiên trả về trùng ĐÚNG tên món trong danh mục
  - in_list: tên đúng xuất hiện trong danh sách món trả về
  - rejected: ảnh món ăn nhưng bị báo mờ / không phải món ăn / lỗi
Kết quả chi tiết: data/benchmark/real/results.csv

Cách dùng:  python scripts/evaluate_food_benchmark.py [--limit 50] [--sleep 3]
"""

import argparse
import csv
import sys
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
BENCH = ROOT / "data" / "benchmark" / "real"


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower()).replace("đ", "d")
    return " ".join("".join(c for c in s if unicodedata.category(c) != "Mn").split())


def main() -> int:
    from src.backend.services.food_recognition import recognize_food_pipeline

    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only", nargs="*", help="Chỉ chạy các sample_id này")
    ap.add_argument("--sleep", type=float, default=3.0, help="Nghỉ giữa các ảnh để không vượt hạn mức Gemini miễn phí")
    args = ap.parse_args()
    rows = list(csv.DictReader(open(BENCH / "manifest.csv", encoding="utf-8")))
    if args.only:
        rows = [r for r in rows if r["sample_id"] in set(args.only)]
    if args.limit:
        rows = rows[: args.limit]
    exact = in_list = rejected = 0
    out = []
    for i, r in enumerate(rows, 1):
        path = BENCH / "images" / r["image_file"]
        if not path.exists():
            continue
        t = time.time()
        try:
            res = recognize_food_pipeline(path.read_bytes(), use_mock_fallback=False)
            names = [it.food_name for it in res.detected_items]
            reason = res.reason or ""
        except Exception as exc:
            names, reason = [], f"error: {exc}"[:80]
        # Cột "accept" (tuỳ chọn): các tên khác cũng đúng với ảnh này, cách nhau bởi "|"
        # (ví dụ ảnh phở không phân biệt được tái/chín)
        truths = {_norm(r["dish_name"])} | {_norm(a) for a in (r.get("accept") or "").split("|") if a.strip()}
        e = bool(names) and _norm(names[0]) in truths
        l = any(_norm(n) in truths for n in names)
        exact += e; in_list += l; rejected += not names
        out.append([r["sample_id"], r["dish_name"], " | ".join(names), reason, int(e), int(l), round(time.time() - t, 1)])
        print(f"{'OK ' if e else ('~  ' if l else 'X  ')}{r['sample_id']} {r['dish_name']} -> {' | '.join(names) or reason}", flush=True)
        time.sleep(args.sleep)
    n = len(out) or 1
    with open(BENCH / ("results_only.csv" if args.only else "results.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["sample_id", "truth", "predicted", "reason", "exact", "in_list", "seconds"])
        w.writerows(out)
    print(f"\nẢnh: {len(out)} | Đúng tên món chính: {exact} ({exact / n:.1%}) | Có trong danh sách: {in_list} ({in_list / n:.1%}) | Bị từ chối: {rejected}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
