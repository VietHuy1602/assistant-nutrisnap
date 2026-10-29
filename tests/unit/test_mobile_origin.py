"""Exercise the real middleware without starting the database lifespan."""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from src.backend.core.config import settings
from src.backend.main import app
from src.backend.services.auth_guard import verify_csrf_protection


@pytest.mark.parametrize("origin", ["https://localhost", "https://untrusted.example"])
def test_mobile_preflight(origin):
    response = TestClient(app).options(
        "/api/v1/auth/me",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "content-type,x-requested-with,x-request-id",
        },
    )
    allowed = origin == "https://localhost" and settings.APP_ENV == "development"
    assert response.status_code == (200 if allowed else 400)
    assert response.headers.get("access-control-allow-origin") == (origin if allowed else None)
    if allowed:
        assert response.headers["access-control-allow-credentials"] == "true"


@pytest.mark.parametrize("origin", ["https://localhost", "https://localhost.evil.example"])
def test_mobile_csrf_origin(origin):
    request = Request({"type": "http", "method": "POST", "path": "/api/v1/auth/login", "headers": []})
    if origin == "https://localhost" and settings.APP_ENV == "development":
        verify_csrf_protection(request, origin=origin, referer=None)
    else:
        with pytest.raises(HTTPException) as exc:
            verify_csrf_protection(request, origin=origin, referer=None)
        assert exc.value.status_code == 403
