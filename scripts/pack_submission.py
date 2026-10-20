"""
scripts/pack_submission.py
Script tự động đóng gói bài nộp / bản bàn giao sạch (Clean Submission Zip).
Giải quyết triệt để vấn đề file ZIP bị nặng (385MB) do vô tình chứa venv, node_modules, cache và db.

Cách dùng:
    python scripts/pack_submission.py
    python scripts/pack_submission.py --include-git
"""

import argparse
import sys
import zipfile
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).resolve().parent.parent

# Danh sách các thư mục và phần mở rộng tuyệt đối KHÔNG đưa vào ZIP
EXCLUDE_DIRS = {
    "venv",
    ".venv",
    "node_modules",
    "dist",
    "build",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    ".idea",
    ".vscode",
}

EXCLUDE_EXTS = {
    ".pyc",
    ".pyo",
    ".pyd",
    ".db",
    ".sqlite",
    ".sqlite3",
    ".log",
}

EXCLUDE_EXACT_FILES = {
    ".env",
    ".env.local",
    "nutrisnap.db",
}


def create_submission_zip(output_filename: str = "nutrisnap_week1_clean.zip", include_git: bool = False):
    output_path = ROOT_DIR / output_filename
    print("=" * 65)
    print(f"Bắt đầu đóng gói bản bàn giao sạch: {output_filename}")
    print(f"Thư mục nguồn: {ROOT_DIR}")
    print("=" * 65)

    count = 0
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for file_path in ROOT_DIR.rglob("*"):
            if not file_path.is_file():
                continue

            rel_path = file_path.relative_to(ROOT_DIR)
            parts = rel_path.parts

            # Kiểm tra nếu là file zip đầu ra
            if file_path == output_path:
                continue

            # Bỏ qua thư mục .git nếu không có cờ include_git
            if not include_git and parts[0] == ".git":
                continue

            # Bỏ qua các thư mục trong blacklist
            if any(part in EXCLUDE_DIRS for part in parts):
                continue

            # Bỏ qua các đuôi file rác/cache/db
            if file_path.suffix in EXCLUDE_EXTS:
                continue

            # Bỏ qua các file bí mật / db cụ thể
            if file_path.name in EXCLUDE_EXACT_FILES:
                continue

            # Ghi file vào ZIP
            zipf.write(file_path, arcname=str(rel_path))
            count += 1

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"\n✅ ĐÃ ĐÓNG GÓI THÀNH CÔNG: {count} tệp tin!")
    print(f"📦 Đường dẫn file: {output_path}")
    print(f"📊 Dung lượng ZIP: {size_mb:.2f} MB (đã dọn sạch 385MB rác/venv/db)")
    print("=" * 65)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Tạo file zip nộp bài sạch.")
    parser.add_argument(
        "--include-git",
        action="store_true",
        help="Đính kèm lịch sử .git nếu giảng viên yêu cầu kiểm tra commit history",
    )
    parser.add_argument(
        "--output",
        default="nutrisnap_week1_clean.zip",
        help="Tên file zip đầu ra",
    )
    args = parser.parse_args()
    create_submission_zip(args.output, args.include_git)
