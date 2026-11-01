"""
scripts/create_admin.py
Cấp quyền quản trị viên (is_admin=True) cho một tài khoản, hoặc tạo mới tài khoản admin nếu chưa có.

Cách dùng:
    python scripts/create_admin.py <username_hoặc_email>                 # cấp quyền cho tài khoản đã đăng ký
    python scripts/create_admin.py <username> --email a@b.com --password "MatKhauManh123"   # tạo mới
    python scripts/create_admin.py <username_hoặc_email> --revoke        # gỡ quyền

Dùng được với SQLite (máy cá nhân) và PostgreSQL (Neon) – lấy kết nối từ biến DATABASE_URL.
"""

import argparse
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.append(str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, or_, select  # noqa: E402

from src.backend.models.database import engine, init_db  # noqa: E402
from src.backend.models.schema import User  # noqa: E402
from src.backend.services.auth_service import hash_password  # noqa: E402


def make_admin(identifier: str, email: str | None = None, password: str | None = None, revoke: bool = False) -> int:
    init_db()
    with Session(engine) as session:
        user = session.exec(
            select(User).where(or_(User.username == identifier, User.email == identifier.lower()))
        ).first()
        if user is None:
            if revoke:
                print(f"❌ Không tìm thấy tài khoản '{identifier}'.")
                return 1
            if not email or not password:
                print(f"❌ Chưa có tài khoản '{identifier}'. Đăng ký trong app trước, hoặc truyền --email và --password để tạo mới.")
                return 1
            if len(password) < 8:
                print("❌ Mật khẩu admin phải có ít nhất 8 ký tự.")
                return 1
            user = User(username=identifier, email=email.lower(), password_hash=hash_password(password))
            print(f"Tạo mới tài khoản admin '{identifier}'.")
        user.is_admin = not revoke
        user.is_active = True if not revoke else user.is_active
        session.add(user)
        session.commit()
        print(f"✅ {'Đã gỡ' if revoke else 'Đã cấp'} quyền quản trị cho '{user.username}' ({user.email}).")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Cấp/gỡ quyền quản trị NutriSnap")
    parser.add_argument("identifier", help="Tên đăng nhập hoặc email")
    parser.add_argument("--email", help="Email khi tạo tài khoản mới")
    parser.add_argument("--password", help="Mật khẩu khi tạo tài khoản mới (>= 8 ký tự)")
    parser.add_argument("--revoke", action="store_true", help="Gỡ quyền quản trị")
    args = parser.parse_args()
    return make_admin(args.identifier, args.email, args.password, args.revoke)


if __name__ == "__main__":
    sys.exit(main())
