"""
scripts/bootstrap_server.py
Chuẩn bị CSDL mỗi lần server deploy khởi động (Render). An toàn khi chạy lặp lại:
1. Tạo bảng/cột còn thiếu.
2. Đồng bộ ~500 món Việt (UPSERT, không xoá dữ liệu người dùng).
3. Nạp USDA nếu bảng usda_foods đang trống và có file zip trong data/usda.
4. Tạo 3 tài khoản demo nếu chưa có (đặt SEED_DEMO_ACCOUNTS=false để bỏ qua).
5. Tạo/cấp quyền admin nếu đặt ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD.
"""

import os
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(ROOT))

from sqlmodel import Session, func, select  # noqa: E402

from src.backend.models.database import engine, init_db  # noqa: E402
from src.backend.models.schema import UsdaFood, User  # noqa: E402


def run(script: str) -> None:
    # Ép UTF-8 để script con in được tiếng Việt trên console Windows (cp1252)
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    result = subprocess.run([sys.executable, str(ROOT / "scripts" / script)], cwd=ROOT, env=env)
    if result.returncode != 0:
        print(f"⚠️ {script} kết thúc với mã {result.returncode} (bỏ qua, server vẫn khởi động).")


def main() -> None:
    init_db()
    run("seed_food_references.py")

    with Session(engine) as session:
        usda_count = session.exec(select(func.count(UsdaFood.fdc_id))).one()
        has_demo = session.exec(select(User.id).where(User.username == "gym_user")).first() is not None

    if usda_count == 0:
        run("import_usda.py")
    else:
        print(f"USDA đã có {usda_count} mục – bỏ qua.")

    if os.getenv("SEED_DEMO_ACCOUNTS", "true").lower() in ("1", "true", "yes") and not has_demo:
        run("seed_demo_accounts.py")
    else:
        print("Tài khoản demo đã có hoặc đã tắt – bỏ qua.")

    admin_user = os.getenv("ADMIN_USERNAME")
    if admin_user:
        from scripts.create_admin import make_admin

        make_admin(admin_user, os.getenv("ADMIN_EMAIL"), os.getenv("ADMIN_PASSWORD"))


if __name__ == "__main__":
    main()
