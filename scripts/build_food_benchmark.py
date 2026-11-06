"""
scripts/build_food_benchmark.py
Tạo bộ benchmark ảnh món ăn THẬT (ảnh chụp ngoài đời) cho các món trong data/vn_foods.csv.

Nguồn: Wikimedia Commons (ảnh có giấy phép tự do CC/Public Domain). Mỗi món tải tối đa N ảnh thu nhỏ (cạnh dài 800px).
Kết quả:
  data/benchmark/real/images/<mã>.jpg
  data/benchmark/real/manifest.csv   (sample_id, dish_name, image_file, source_page, license, author)

Lưu ý: kết quả tìm kiếm có thể không đúng món (Commons gắn nhãn tự do). Hãy chạy
`python scripts/review_food_benchmark.py` để xem lưới ảnh và xoá ảnh sai nhãn trước khi đo độ chính xác.

Cách dùng:
  python scripts/build_food_benchmark.py --per-dish 2          # toàn bộ danh mục
  python scripts/build_food_benchmark.py --per-dish 3 --limit 100
"""

import argparse
import csv
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "benchmark" / "real"
API = "https://commons.wikimedia.org/w/api.php"
UA = "NutriSnapBenchmark/1.0 (student project; contact via repository)"

# Bỏ đồ uống/món quá chung chung khó có ảnh đúng
SKIP_PREFIX = ("nuoc ", "tra ", "ca phe", "sinh to", "sua ", "bac xiu", "cacao")


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower()).replace("đ", "d")
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def _get(params: dict) -> dict:
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def search_images(query: str, n: int) -> list[dict]:
    data = _get({
        "action": "query", "generator": "search", "gsrsearch": f"filetype:bitmap {query}", "gsrnamespace": 6,
        "gsrlimit": n * 4, "prop": "imageinfo", "iiprop": "url|extmetadata|mime", "iiurlwidth": 800,
    })
    pages = sorted((data.get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    out = []
    for p in pages:
        info = (p.get("imageinfo") or [{}])[0]
        if info.get("mime") not in ("image/jpeg", "image/png") or not info.get("thumburl"):
            continue
        meta = info.get("extmetadata", {})
        title = p.get("title", "")
        # Tên file phải chứa tên món (không dấu) để giảm ảnh sai nhãn
        if not all(w in _norm(title) for w in _norm(query).split()[:2]):
            continue
        out.append({
            "thumb": info["thumburl"],
            "page": info.get("descriptionurl", ""),
            "license": re.sub("<[^>]+>", "", meta.get("LicenseShortName", {}).get("value", "")),
            "author": re.sub("<[^>]+>", "", meta.get("Artist", {}).get("value", ""))[:80],
        })
        if len(out) >= n:
            break
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-dish", type=int, default=2)
    ap.add_argument("--limit", type=int, default=0, help="Chỉ lấy N món đầu (0 = tất cả)")
    args = ap.parse_args()

    dishes = [r["food_name"].strip() for r in csv.DictReader(open(ROOT / "data" / "vn_foods.csv", encoding="utf-8-sig"))]
    dishes = [d for d in dishes if not _norm(d).startswith(SKIP_PREFIX)]
    if args.limit:
        dishes = dishes[: args.limit]
    (OUT / "images").mkdir(parents=True, exist_ok=True)
    manifest = OUT / "manifest.csv"
    done = set()
    if manifest.exists():
        done = {r["image_file"] for r in csv.DictReader(open(manifest, encoding="utf-8"))}
    new_file = not manifest.exists()
    with open(manifest, "a", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        if new_file:
            w.writerow(["sample_id", "dish_name", "image_file", "source_page", "license", "author"])
        for i, dish in enumerate(dishes, 1):
            query = re.sub(r"\(.*?\)", "", dish).strip()
            try:
                hits = search_images(query, args.per_dish)
            except Exception as exc:
                print(f"[{i}/{len(dishes)}] {dish}: lỗi tìm kiếm {exc}")
                continue
            for k, h in enumerate(hits, 1):
                sid = f"R{i:03d}_{k}"
                fname = f"{sid}.jpg"
                if fname in done:
                    continue
                try:
                    req = urllib.request.Request(h["thumb"], headers={"User-Agent": UA})
                    with urllib.request.urlopen(req, timeout=60) as r:
                        (OUT / "images" / fname).write_bytes(r.read())
                    w.writerow([sid, dish, fname, h["page"], h["license"], h["author"]])
                except Exception as exc:
                    print(f"  bỏ ảnh lỗi {h['thumb']}: {exc}")
                time.sleep(0.5)
            print(f"[{i}/{len(dishes)}] {dish}: {len(hits)} ảnh", flush=True)
            time.sleep(0.5)
    return 0


if __name__ == "__main__":
    sys.exit(main())
