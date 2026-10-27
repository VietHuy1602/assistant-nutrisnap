"""
tests/unit/test_w6_rate_limit.py
Bộ kiểm thử đơn vị chuyên sâu cho hệ thống Rate Limiting nâng cao (Tuần 6 - README_06):
1. test_01_exceeding_rate_limit_returns_429_with_contract: Trả về HTTP 429, Retry-After dạng số nguyên, body tiếng Việt chuẩn hợp đồng.
2. test_02_reset_rate_limiter_restores_access: reset_rate_limiter() xóa bộ đếm, phục hồi truy cập tức thì.
3. test_03_per_user_rate_limiting_isolated: User A chạm limit không gây ảnh hưởng đến quota của User B.
4. test_04_forged_x_forwarded_for_without_trusted_proxies_fails: Không tin X-Forwarded-For khi TRUSTED_PROXIES tắt.
5. test_05_trusted_proxies_honors_forwarded_ip: TRUSTED_PROXIES bật cho phép định danh IP thật sau reverse proxy.
6. test_06_invalid_jwt_falls_back_to_ip: Token giả mạo/hết hạn an toàn fallback về IP, không ném ngoại lệ 500.
7. test_07_login_rate_limiting_protects_brute_force: Endpoint /auth/login giới hạn 10 req/phút/IP chống tấn công dò mật khẩu.
8. test_08_no_double_counting_on_annotated_endpoints: Endpoint có annotation riêng không bị middleware GET đếm trùng.
9. test_09_429_does_not_leak_internals: Phản hồi 429 không rò rỉ IP, user_id, stack trace hay khóa nội bộ.
10. test_10_security_headers_present_on_429: Security Headers (nosniff, DENY, ...) luôn hiện diện trên phản hồi 429.
11. test_11_health_check_exempt_from_rate_limits: /health và /api/v1/health miễn trừ hoàn toàn khỏi rate limiting.
12. test_12_fail_open_on_storage_error: Chính sách Fail-Open khi storage lỗi không làm gián đoạn người dùng.
13. test_13_food_swap_rate_limiting_blocks_at_threshold: Endpoint /analytics/food-swap giới hạn 20 req/phút/user trả về 429 và Retry-After.
14. test_14_calorie_stability_rate_limiting_blocks_at_threshold: Endpoint /analytics/calorie-stability giới hạn 20 req/phút/user trả về 429 và Retry-After.
15. test_15_auth_logout_rate_limiting_blocks_at_threshold: Endpoint /auth/logout giới hạn 30 req/phút/IP trả về 429 và Retry-After.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from src.backend.core.config import settings
from src.backend.main import app
from src.backend.services.api_security import (
    _global_rate_limiter,
    get_rate_limit_key,
    reset_rate_limiter,
)
from src.backend.services.auth_service import create_access_token


@pytest.fixture
def client():
    return TestClient(app)


def test_01_exceeding_rate_limit_returns_429_with_contract(client: TestClient):
    """Xác minh phản hồi 429 chuẩn hợp đồng: header Retry-After là số nguyên giây, body có detail tiếng Việt."""
    reset_rate_limiter()

    # foods/search có giới hạn 30 req/phút theo IP
    for _ in range(30):
        res = client.get("/api/v1/foods/search?q=phở")
        assert res.status_code == 200

    res_blocked = client.get("/api/v1/foods/search?q=phở")
    assert res_blocked.status_code == 429
    assert "Retry-After" in res_blocked.headers
    retry_after = res_blocked.headers["Retry-After"]
    assert retry_after.isdigit()
    assert int(retry_after) >= 1

    detail = res_blocked.json().get("detail", "")
    assert "Quá nhiều yêu cầu" in detail
    assert "Vui lòng thử lại sau ít phút" in detail


def test_02_reset_rate_limiter_restores_access(client: TestClient):
    """Xác minh reset_rate_limiter() xóa bộ nhớ đếm, cho phép request thành công trở lại ngay lập tức."""
    reset_rate_limiter()

    # Gây nghẽn endpoint foods/search
    for _ in range(30):
        client.get("/api/v1/foods/search?q=phở")
    blocked = client.get("/api/v1/foods/search?q=phở")
    assert blocked.status_code == 429

    # Reset limiter
    reset_rate_limiter()

    # Request kế tiếp thành công ngay lập tức
    res_retry = client.get("/api/v1/foods/search?q=phở")
    assert res_retry.status_code == 200


def test_03_per_user_rate_limiting_isolated(client: TestClient):
    """Xác minh bộ đếm cô lập theo user:<id>: User A vượt ngưỡng không làm ảnh hưởng đến User B."""
    reset_rate_limiter()

    # 1. Kiểm tra đơn vị: get_rate_limit_key trả về chính xác 'user:<id>' dựa trên JWT
    token_user_a = str(create_access_token(subject="881"))
    token_user_b = str(create_access_token(subject="882"))

    # Giới hạn default GET là 120/phút/user hoặc gọi check_rate_limit với scope riêng
    scope_test = "user_isolation_scope"
    from starlette.requests import Request

    scope_data_a = {"type": "http", "method": "GET", "path": "/", "headers": [(b"cookie", f"{settings.AUTH_COOKIE_NAME}={token_user_a}".encode())]}
    req_a = Request(scope_data_a)
    scope_data_b = {"type": "http", "method": "GET", "path": "/", "headers": [(b"cookie", f"{settings.AUTH_COOKIE_NAME}={token_user_b}".encode())]}
    req_b = Request(scope_data_b)

    assert get_rate_limit_key(req_a) == "user:881"
    assert get_rate_limit_key(req_b) == "user:882"

    # Gửi 5 request cho User A với limit = 5
    for _ in range(5):
        _global_rate_limiter.check_rate_limit(req_a, scope=scope_test, max_requests=5, window_seconds=60)

    # Request thứ 6 của User A bị chặn 429
    with pytest.raises(Exception) as exc_info:
        _global_rate_limiter.check_rate_limit(req_a, scope=scope_test, max_requests=5, window_seconds=60)
    assert getattr(exc_info.value, "status_code", None) == 429

    # User B hoàn toàn độc lập, vẫn thực hiện thành công
    _global_rate_limiter.check_rate_limit(req_b, scope=scope_test, max_requests=5, window_seconds=60)


def test_04_forged_x_forwarded_for_without_trusted_proxies_fails(client: TestClient):
    """Xác minh không tin cậy X-Forwarded-For khi TRUSTED_PROXIES tắt: kẻ tấn công không thể bypass IP rate limit."""
    reset_rate_limiter()
    original_trusted = list(settings.TRUSTED_PROXIES)
    settings.TRUSTED_PROXIES = []

    try:
        # Gửi 30 request từ cùng client với header X-Forwarded-For giả mạo IP khác nhau
        for i in range(30):
            res = client.get(
                "/api/v1/foods/search?q=phở",
                headers={"X-Forwarded-For": f"198.51.100.{i}"},
            )
            assert res.status_code == 200

        # Request thứ 31 với header IP giả khác vẫn bị chặn vì client_host thật (testclient) đã hết quota
        blocked = client.get(
            "/api/v1/foods/search?q=phở",
            headers={"X-Forwarded-For": "198.51.100.99"},
        )
        assert blocked.status_code == 429
    finally:
        settings.TRUSTED_PROXIES = original_trusted


def test_05_trusted_proxies_honors_forwarded_ip(client: TestClient):
    """Xác minh khi TRUSTED_PROXIES được cấu hình tường minh, IP client từ X-Forwarded-For được phân giải chính xác."""
    reset_rate_limiter()
    original_trusted = list(settings.TRUSTED_PROXIES)
    # TestClient của starlette có client.host là 'testclient'
    settings.TRUSTED_PROXIES = ["testclient"]

    try:
        # Client gửi từ Proxy tin cậy với IP gốc 203.0.113.195
        for _ in range(30):
            res = client.get(
                "/api/v1/foods/search?q=cơm",
                headers={"X-Forwarded-For": "203.0.113.195, 10.0.0.1"},
            )
            assert res.status_code == 200

        # IP 203.0.113.195 bị chặn
        blocked_ip1 = client.get(
            "/api/v1/foods/search?q=cơm",
            headers={"X-Forwarded-For": "203.0.113.195, 10.0.0.1"},
        )
        assert blocked_ip1.status_code == 429

        # Khách hàng khác có IP 203.0.113.200 đi qua cùng proxy vẫn truy cập bình thường
        res_ip2 = client.get(
            "/api/v1/foods/search?q=cơm",
            headers={"X-Forwarded-For": "203.0.113.200, 10.0.0.1"},
        )
        assert res_ip2.status_code == 200
    finally:
        settings.TRUSTED_PROXIES = original_trusted


def test_06_invalid_jwt_falls_back_to_ip(client: TestClient):
    """Xác minh token JWT không hợp lệ (sai chữ ký, giả mạo, hết hạn) an toàn fallback về IP, không ném lỗi 500."""
    reset_rate_limiter()

    # Tạo client mang cookie giả mạo
    fake_client = TestClient(app, cookies={settings.AUTH_COOKIE_NAME: "malformed.jwt.token.here"})

    # Yêu cầu vẫn được xử lý an toàn theo IP
    res = fake_client.get("/api/v1/foods/search?q=trứng")
    assert res.status_code == 200


def test_07_login_rate_limiting_protects_brute_force(client: TestClient):
    """Xác minh endpoint /auth/login bị giới hạn 10 req/phút/IP để phòng chống brute-force mật khẩu."""
    reset_rate_limiter()

    for _ in range(10):
        res = client.post(
            "/api/v1/auth/login",
            json={"username_or_email": "wrong_user", "password": "wrong_password"},
        )
        # Các lần thử sai mật khẩu trả về 401 Unauthorized
        assert res.status_code == 401

    # Lần thử thứ 11 bị chặn ngay lập tức với 429
    res_blocked = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "wrong_user", "password": "wrong_password"},
    )
    assert res_blocked.status_code == 429
    assert "Retry-After" in res_blocked.headers


def test_08_no_double_counting_on_annotated_endpoints(client: TestClient):
    """Xác minh endpoint có annotation riêng (như foods/search 30/phút) không bị middleware GET đếm trùng 2 lần."""
    reset_rate_limiter()

    # Thực hiện chính xác 30 request
    for _ in range(30):
        res = client.get("/api/v1/foods/search?q=rau")
        assert res.status_code == 200

    # Lần thứ 31 mới bị chặn (chứng minh mỗi request chỉ trừ 1 token)
    blocked = client.get("/api/v1/foods/search?q=rau")
    assert blocked.status_code == 429


def test_09_429_does_not_leak_internals(client: TestClient):
    """Xác minh phản hồi 429 không rò rỉ IP, user_id, stack trace hay khóa nội bộ của hệ thống."""
    reset_rate_limiter()

    for _ in range(30):
        client.get("/api/v1/foods/search?q=cá")
    blocked = client.get("/api/v1/foods/search?q=cá")
    assert blocked.status_code == 429

    body_keys = list(blocked.json().keys())
    assert body_keys == ["detail"]
    detail = blocked.json()["detail"]
    assert "testclient" not in detail
    assert "127.0.0.1" not in detail
    assert "Traceback" not in detail
    assert "redis" not in detail.lower()
    assert "memory://" not in detail


def test_10_security_headers_present_on_429(client: TestClient):
    """Xác minh toàn bộ các HTTP Security Headers bắt buộc đều xuất hiện trên phản hồi 429."""
    reset_rate_limiter()

    for _ in range(30):
        client.get("/api/v1/foods/search?q=bò")
    blocked = client.get("/api/v1/foods/search?q=bò")
    assert blocked.status_code == 429

    assert blocked.headers.get("X-Content-Type-Options") == "nosniff"
    assert blocked.headers.get("X-Frame-Options") == "DENY"
    assert blocked.headers.get("X-XSS-Protection") == "1; mode=block"
    assert blocked.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


def test_11_health_check_exempt_from_rate_limits(client: TestClient):
    """Xác minh các endpoint kiểm tra sức khỏe (/health, /api/v1/health) được miễn trừ hoàn toàn khỏi rate limit."""
    reset_rate_limiter()

    # Gửi 130 requests liên tiếp (vượt xa ngưỡng default GET 120 req/phút)
    for _ in range(130):
        res1 = client.get("/health")
        assert res1.status_code == 200

        res2 = client.get("/api/v1/health")
        assert res2.status_code == 200


def test_12_fail_open_on_storage_error(client: TestClient):
    """Xác minh chính sách Fail-Open: Khi storage của limiter gặp ngoại lệ, request vẫn được thông qua an toàn."""
    reset_rate_limiter()

    with patch.object(_global_rate_limiter._limiter.limiter, "hit", side_effect=RuntimeError("Storage connection failed")):
        # Mặc định RATE_LIMIT_FAIL_OPEN = True
        assert settings.RATE_LIMIT_FAIL_OPEN is True

        # Khi storage lỗi, check_rate_limit không ném lỗi 429/500 mà fail-open cho qua
        res = client.get("/api/v1/foods/search?q=nước")
        assert res.status_code == 200


def test_13_food_swap_rate_limiting_blocks_at_threshold(client: TestClient):
    """Xác minh POST /analytics/food-swap áp dụng DATA_MUTATION_RATE_LIMIT (20 req/phút/user), trả về 429 và Retry-After."""
    reset_rate_limiter()
    token = str(create_access_token(subject="901"))
    client.cookies.set(settings.AUTH_COOKIE_NAME, token)

    payload = {
        "current_food_name": "Phở bò",
        "portion_gram": 100.0,
        "swap_goal": "reduce_calories",
    }

    # 20 request đầu tiên không bị 429
    for _ in range(20):
        res = client.post("/api/v1/analytics/food-swap", json=payload)
        assert res.status_code != 429

    # Request thứ 21 vượt ngưỡng bị chặn 429
    blocked = client.post("/api/v1/analytics/food-swap", json=payload)
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers
    assert blocked.headers["Retry-After"].isdigit()
    assert int(blocked.headers["Retry-After"]) >= 1


def test_14_calorie_stability_rate_limiting_blocks_at_threshold(client: TestClient):
    """Xác minh POST /analytics/calorie-stability áp dụng DATA_MUTATION_RATE_LIMIT (20 req/phút/user), trả về 429 và Retry-After."""
    reset_rate_limiter()
    token = str(create_access_token(subject="902"))
    client.cookies.set(settings.AUTH_COOKIE_NAME, token)

    payload = {"yesterday_consumed_calories": 1800.0}

    # 20 request đầu tiên không bị 429
    for _ in range(20):
        res = client.post("/api/v1/analytics/calorie-stability", json=payload)
        assert res.status_code != 429

    # Request thứ 21 vượt ngưỡng bị chặn 429
    blocked = client.post("/api/v1/analytics/calorie-stability", json=payload)
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers
    assert blocked.headers["Retry-After"].isdigit()
    assert int(blocked.headers["Retry-After"]) >= 1


def test_15_auth_logout_rate_limiting_blocks_at_threshold(client: TestClient):
    """Xác minh POST /auth/logout áp dụng AUTH_LOGOUT_RATE_LIMIT (30 req/phút/IP), giữ CSRF, trả về 429 và Retry-After."""
    reset_rate_limiter()

    # 30 request đầu tiên thành công với CSRF header hợp lệ
    for _ in range(30):
        res = client.post(
            "/api/v1/auth/logout",
            headers={"Origin": "http://localhost:5173"},
        )
        assert res.status_code == 200

    # Request thứ 31 vượt ngưỡng bị chặn 429
    blocked = client.post(
        "/api/v1/auth/logout",
        headers={"Origin": "http://localhost:5173"},
    )
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers
    assert blocked.headers["Retry-After"].isdigit()
    assert int(blocked.headers["Retry-After"]) >= 1

