"""
src/backend/services/port_utils.py
Tiện ích kiểm tra và giải phóng cổng mạng (Port Utilities).
Giải quyết triệt để lỗi [WinError 10013] (WSAEACCES: An attempt was made to access a socket in a way forbidden by its access permissions)
khi cổng 8000 bị chiếm dụng bởi tiến trình uvicorn/python chạy ngầm trước đó trên Windows.
"""

from __future__ import annotations

import logging
import os
import platform
import socket
import subprocess
import time

logger = logging.getLogger("nutrisnap.port_utils")


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """
    Kiểm tra xem một cổng có đang bị chiếm dụng hay không.
    Trả về True nếu cổng đang được sử dụng hoặc không thể bind.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        try:
            s.bind((host, port))
            return False
        except OSError:
            return True


def find_pids_on_port(port: int) -> list[int]:
    """
    Tìm danh sách PID của các tiến trình đang chiếm giữ một cổng TCP.
    Hỗ trợ cả Windows (netstat / PowerShell) và Linux/macOS (lsof).
    """
    current_pid = os.getpid()
    found_pids: set[int] = set()

    if platform.system() == "Windows":
        # Cách 1: Sử dụng netstat
        try:
            cmd = f'netstat -ano -p tcp | findstr ":{port} "'
            output = subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL)
            for line in output.strip().splitlines():
                parts = line.split()
                if len(parts) >= 5 and f":{port}" in parts[1]:
                    try:
                        pid = int(parts[-1])
                        if pid > 0 and pid != current_pid:
                            found_pids.add(pid)
                    except ValueError:
                        continue
        except Exception:
            pass

        # Cách 2: Nếu netstat không bắt được, dùng PowerShell Get-NetTCPConnection
        if not found_pids:
            try:
                ps_cmd = (
                    f"Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue "
                    "| Select-Object -ExpandProperty OwningProcess"
                )
                output = subprocess.check_output(
                    ["powershell", "-NoProfile", "-Command", ps_cmd],
                    text=True,
                    stderr=subprocess.DEVNULL,
                )
                for line in output.strip().splitlines():
                    val = line.strip()
                    if val.isdigit():
                        pid = int(val)
                        if pid > 0 and pid != current_pid:
                            found_pids.add(pid)
            except Exception:
                pass
    else:
        # Linux / macOS: Sử dụng lsof hoặc fuser
        try:
            output = subprocess.check_output(
                ["lsof", "-ti", f":{port}"],
                text=True,
                stderr=subprocess.DEVNULL,
            )
            for line in output.strip().splitlines():
                val = line.strip()
                if val.isdigit():
                    pid = int(val)
                    if pid > 0 and pid != current_pid:
                        found_pids.add(pid)
        except Exception:
            pass

    return sorted(found_pids)


def kill_pids(pids: list[int]) -> bool:
    """
    Buộc dừng các tiến trình theo danh sách PID.
    """
    if not pids:
        return True

    success = True
    for pid in pids:
        try:
            if platform.system() == "Windows":
                subprocess.run(
                    ["taskkill", "/F", "/PID", str(pid)],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            else:
                subprocess.run(
                    ["kill", "-9", str(pid)],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
        except Exception as e:
            logger.warning(f"Không thể dừng tiến trình PID {pid}: {e}")
            success = False

    return success


def ensure_port_available(
    port: int = 8000,
    host: str = "127.0.0.1",
    auto_kill: bool = True,
    max_wait_seconds: float = 3.0,
) -> bool:
    """
    Đảm bảo cổng đã sẵn sàng để ứng dụng lắng nghe.
    Nếu cổng bị chiếm dụng và auto_kill=True, hàm sẽ tìm và giải phóng tiến trình cũ,
    giúp người dùng không gặp lỗi [WinError 10013].
    """
    if not is_port_in_use(port, host):
        return True

    pids = find_pids_on_port(port)
    if not pids:
        # Cổng báo bận nhưng không tìm thấy PID (có thể do hệ thống vừa đóng hoặc đang giải phóng)
        time.sleep(0.5)
        return not is_port_in_use(port, host)

    if not auto_kill:
        print(f"⚠️ Cổng {port} ({host}) đang bị chiếm dụng bởi tiến trình PID: {pids}.")
        return False

    print(
        f"⚠️ Phát hiện cổng {port} đang bị chiếm dụng bởi tiến trình PID: {pids} "
        "(gây lỗi WinError 10013 trên Windows). Đang tự động giải phóng..."
    )
    kill_pids(pids)

    # Đợi cổng được giải phóng hoàn toàn
    start_time = time.time()
    while time.time() - start_time < max_wait_seconds:
        if not is_port_in_use(port, host):
            print(f"✅ Đã giải phóng thành công cổng {port}. Sẵn sàng khởi động!")
            return True
        time.sleep(0.3)

    still_in_use = is_port_in_use(port, host)
    if still_in_use:
        print(f"❌ Không thể giải phóng hoàn toàn cổng {port}. Hãy kiểm tra quyền hoặc khởi động lại terminal.")
        return False

    return True
