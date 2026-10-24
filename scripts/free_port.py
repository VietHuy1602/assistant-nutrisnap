"""
scripts/free_port.py
Công cụ dòng lệnh giải phóng cổng mạng khi gặp lỗi xung đột tiến trình hoặc [WinError 10013].

Cách sử dụng:
    python scripts/free_port.py              # Tự động giải phóng cả cổng 8000 và 5173
    python scripts/free_port.py --port 8000  # Giải phóng riêng cổng 8000
    python scripts/free_port.py --port 5173  # Giải phóng riêng cổng 5173
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Đảm bảo in tiếng Việt không bị lỗi charmap trên Windows console
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Thêm root dự án vào sys.path để import port_utils
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.backend.services.port_utils import (  # noqa: E402
    ensure_port_available,
    find_pids_on_port,
    is_port_in_use,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Giải phóng cổng mạng bị chiếm dụng (khắc phục lỗi WinError 10013)."
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Cổng cụ thể cần giải phóng (nếu không truyền, mặc định kiểm tra cả 8000 và 5173)",
    )
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Địa chỉ host (mặc định: 127.0.0.1)",
    )

    args = parser.parse_args()

    ports_to_check = [args.port] if args.port is not None else [8000, 5173]

    print("🔍 Đang kiểm tra trạng thái các cổng mạng...")
    for port in ports_to_check:
        in_use = is_port_in_use(port, host=args.host)
        if in_use:
            pids = find_pids_on_port(port)
            print(f"⚠️ Cổng {port} đang bị chiếm bởi PID: {pids}. Đang tiến hành giải phóng...")
            success = ensure_port_available(port, host=args.host, auto_kill=True)
            if success:
                print(f"✅ Cổng {port} đã được giải phóng thành công!")
            else:
                print(f"❌ Không thể giải phóng cổng {port}.")
        else:
            print(f"✅ Cổng {port} đang hoàn toàn trống và sẵn sàng sử dụng.")


if __name__ == "__main__":
    main()
