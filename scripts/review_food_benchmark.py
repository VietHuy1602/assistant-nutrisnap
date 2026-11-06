"""
scripts/review_food_benchmark.py
Ghép ảnh benchmark thành các lưới (kèm mã ảnh + tên món) để soát nhãn bằng mắt, và xoá ảnh sai nhãn.

  python scripts/review_food_benchmark.py                 # tạo data/benchmark/real/review/sheet_XX.jpg
  python scripts/review_food_benchmark.py --drop R012_2 R040_1   # bỏ ảnh sai khỏi manifest
"""

import argparse
import csv
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BENCH = ROOT / "data" / "benchmark" / "real"
COLS, ROWS, W, H = 6, 4, 320, 260


def sheets() -> None:
    rows = list(csv.DictReader(open(BENCH / "manifest.csv", encoding="utf-8")))
    out = BENCH / "review"
    out.mkdir(exist_ok=True)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 15)
    except OSError:
        font = ImageFont.load_default()
    per = COLS * ROWS
    for s in range(0, len(rows), per):
        sheet = Image.new("RGB", (COLS * W, ROWS * H), "white")
        d = ImageDraw.Draw(sheet)
        for k, r in enumerate(rows[s : s + per]):
            x, y = (k % COLS) * W, (k // COLS) * H
            try:
                im = Image.open(BENCH / "images" / r["image_file"]).convert("RGB")
                im.thumbnail((W - 6, H - 40))
                sheet.paste(im, (x + 3, y + 3))
            except Exception:
                d.text((x + 10, y + 100), "không mở được", fill="red", font=font)
            d.rectangle([x, y + H - 36, x + W, y + H], fill="white")
            d.text((x + 4, y + H - 34), f"{r['sample_id']} {r['dish_name']}"[:38], fill="black", font=font)
        sheet.save(out / f"sheet_{s // per + 1:02d}.jpg", quality=80)
    print(f"{len(rows)} ảnh → {out}")


def relabel(pairs: list[str]) -> None:
    """--relabel R014_1="Bún thịt nướng" R004_2="Phở bò tái|Phở bò chín": tên đầu là nhãn, các tên sau là cũng-đúng."""
    path = BENCH / "manifest.csv"
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    fields = list(rows[0].keys()) + (["accept"] if "accept" not in rows[0] else [])
    new = dict(p.split("=", 1) for p in pairs)
    for r in rows:
        r.setdefault("accept", "")
        if r["sample_id"] in new:
            names = [n.strip() for n in new[r["sample_id"]].split("|") if n.strip()]
            r["dish_name"], r["accept"] = names[0], "|".join(names[1:])
    with open(path, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f"Đã sửa nhãn {len(new)} ảnh")


def drop(ids: list[str]) -> None:
    path = BENCH / "manifest.csv"
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    keep = [r for r in rows if r["sample_id"] not in set(ids)]
    with open(path, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(keep)
    for r in rows:
        if r["sample_id"] in set(ids):
            (BENCH / "images" / r["image_file"]).unlink(missing_ok=True)
    print(f"Đã bỏ {len(rows) - len(keep)} ảnh, còn {len(keep)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--drop", nargs="*")
    ap.add_argument("--relabel", nargs="*")
    a = ap.parse_args()
    if a.drop:
        drop(a.drop)
    if a.relabel:
        relabel(a.relabel)
    if not a.drop and not a.relabel:
        sheets()
