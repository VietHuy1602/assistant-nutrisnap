"""
run_backend.py
Điểm khởi chạy Backend an toàn cho NutriSnap.
Tự động phát hiện và giải phóng cổng 8000 nếu bị chiếm dụng bởi tiến trình uvicorn/python cũ,
ngăn chặn triệt để lỗi [WinError 10013] trên Windows.

Cách sử dụng:
    python run_backend.py
    python run_backend.py --port 8000 --host 127.0.0.1
    python run_backend.py --no-reload
"""

from __future__ import annotations

import argparse
import sys

# Đảm bảo in tiếng Việt không bị lỗi charmap trên Windows console
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import uvicorn

from src.backend.services.port_utils import ensure_port_available


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Khởi chạy NutriSnap Backend an toàn (tự động giải phóng cổng để tránh lỗi WinError 10013)."
    )
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Địa chỉ host để lắng nghe (mặc định: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Cổng TCP (mặc định: 8000)",
    )
    parser.add_argument(
        "--reload",
        dest="reload",
        action="store_true",
        default=True,
        help="Bật chế độ hot-reload tự động khi code thay đổi (mặc định: bật)",
    )
    parser.add_argument(
        "--no-reload",
        dest="reload",
        action="store_false",
        help="Tắt chế độ hot-reload",
    )

    args = parser.parse_args()

    # Bước tiền kiểm tra & tự động dọn dẹp cổng nếu có tiến trình cũ chiếm dụng
    port_ready = ensure_port_available(port=args.port, host=args.host, auto_kill=True)
    if not port_ready:
        print(
            f"❌ Không thể chuẩn bị cổng {args.port}. Bạn có thể thử chạy lại với cổng khác: "
            f"python run_backend.py --port 8001"
        )
        sys.exit(1)

    print(
        f"🚀 Đang khởi động NutriSnap Backend trên http://{args.host}:{args.port} "
        f"(Reload: {'Bật' if args.reload else 'Tắt'})..."
    )
    print(f"📖 Swagger API Docs: http://{args.host}:{args.port}/docs\n")

    try:
        uvicorn.run(
            "src.backend.main:app",
            host=args.host,
            port=args.port,
            reload=args.reload,
        )
    except KeyboardInterrupt:
        print("\n👋 Đã dừng máy chủ Backend an toàn.")


if __name__ == "__main__":
    main()
