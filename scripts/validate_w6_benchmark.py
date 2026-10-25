"""Read-only validation for W6 image manifest and 50-question chat benchmark."""
from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data/benchmark/benchmark_100_meals_unique_w6.csv"
IMAGE_DIR = ROOT / "data/benchmark/images"
QUESTIONS = ROOT / "data/benchmark/chat_eval_50.jsonl"


def main() -> int:
    errors: list[str] = []
    with MANIFEST.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        headers = reader.fieldnames or []
    ids = [r.get("sample_id", "").strip() for r in rows]
    names = [r.get("dish_name", "").strip().casefold() for r in rows]
    filenames = [r.get("image_filename", "").strip() for r in rows]
    hashes: dict[str, list[str]] = {}
    existing = readable = 0
    try:
        from PIL import Image
    except ImportError:
        Image = None

    for filename in filenames:
        if not filename:
            continue
        path = IMAGE_DIR / filename
        if not path.is_file():
            continue
        existing += 1
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        hashes.setdefault(digest, []).append(filename)
        if Image is not None:
            try:
                with Image.open(path) as image:
                    image.verify()
                readable += 1
            except Exception:
                errors.append(f"Ảnh không giải mã được: {filename}")
        else:
            readable = -1

    duplicate_groups = [v for v in hashes.values() if len(v) > 1]
    if len(rows) != 100:
        errors.append(f"Manifest cần 100 dòng, hiện có {len(rows)}")
    if len(set(ids)) != len(ids):
        errors.append("sample_id bị trùng")
    if len(set(names)) != len(names):
        errors.append("dish_name bị trùng sau chuẩn hóa chữ thường")
    if len(set(filenames)) != len(filenames):
        errors.append("image_filename bị trùng")
    required = {"sample_id", "image_filename", "dish_name", "collection_status"}
    if not required.issubset(set(headers)):
        errors.append(f"Thiếu cột bắt buộc: {sorted(required - set(headers))}")
    if duplicate_groups:
        errors.append(f"Có {len(duplicate_groups)} nhóm ảnh trùng hash")

    questions = []
    with QUESTIONS.open(encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            if line.strip():
                try:
                    questions.append(json.loads(line))
                except json.JSONDecodeError:
                    errors.append(f"JSONL lỗi ở dòng {line_no}")
    qids = [q.get("id") for q in questions]
    if len(questions) != 50:
        errors.append(f"Cần 50 câu hỏi chat, hiện có {len(questions)}")
    if len(set(qids)) != len(qids):
        errors.append("ID câu hỏi bị trùng")

    print("=== W6 Benchmark Validator (read-only) ===")
    print(f"Manifest rows: {len(rows)}; unique sample IDs: {len(set(ids))}; unique dish names: {len(set(names))}")
    print(f"Image files referenced: {len([x for x in filenames if x])}; files present: {existing}")
    print(f"Images decodable: {'không kiểm tra được (thiếu Pillow)' if readable == -1 else readable}")
    print(f"Unique image hashes: {len(hashes)}; duplicate hash groups: {len(duplicate_groups)}")
    print(f"Chat questions: {len(questions)}; unique question IDs: {len(set(qids))}")
    print(f"Ảnh còn thiếu so với 100 file: {max(0, 100-existing)}")
    if errors:
        print("\nCẦN XỬ LÝ:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Kiểm tra cấu trúc và tính duy nhất đạt; cần đánh giá riêng tính hợp lệ của nhãn/ground truth.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
