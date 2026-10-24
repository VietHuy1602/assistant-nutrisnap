"""
tests/unit/test_port_utils.py
Kiểm thử các hàm tiện ích kiểm tra và giải phóng cổng mạng trong src.backend.services.port_utils.
"""

import socket

from src.backend.services.port_utils import (
    ensure_port_available,
    find_pids_on_port,
    is_port_in_use,
    kill_pids,
)


def get_free_port() -> int:
    """Lấy một cổng ngẫu nhiên khả dụng trên hệ thống."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_is_port_in_use_when_free():
    free_port = get_free_port()
    assert is_port_in_use(free_port, "127.0.0.1") is False


def test_is_port_in_use_when_occupied():
    free_port = get_free_port()
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", free_port))
        s.listen(1)
        assert is_port_in_use(free_port, "127.0.0.1") is True


def test_ensure_port_available_when_free():
    free_port = get_free_port()
    assert ensure_port_available(free_port, "127.0.0.1", auto_kill=False) is True


def test_find_pids_on_port_returns_list():
    free_port = get_free_port()
    pids = find_pids_on_port(free_port)
    assert isinstance(pids, list)


def test_kill_pids_empty_list():
    assert kill_pids([]) is True
