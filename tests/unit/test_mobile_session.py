"""Real auth endpoints and cookie jar, isolated from the application database.

HTTPX does not implement browser SameSite policy; Android WebView tests cover it.
Run with --noconftest to avoid the repository's global database seeding fixture.
"""
from http.cookies import SimpleCookie

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

from src.backend.core.config import settings, Settings
from src.backend.main import app
from src.backend.models.database import get_session
from src.backend.models.schema import User
from src.backend.services.auth_service import hash_password
from src.backend.services.api_security import reset_rate_limiter


@pytest.fixture
def client():
    if 'http://192.168.50.20' not in settings.mobile_dev_origins:
        pytest.skip('Requires APP_ENV=development and DEV_MOBILE_ORIGIN=http://192.168.50.20')
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(User(username='mobile_test', email='mobile@example.com',
                         password_hash=hash_password('MobileTest123!'), is_active=True))
        session.commit()

    def isolated_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = isolated_session
    reset_rate_limiter()
    # No lifespan: it would initialize the application's persistent database.
    client = TestClient(app, base_url='http://192.168.50.20:8000',
                        headers={'Origin': 'http://192.168.50.20'})
    try:
        yield client
    finally:
        client.close()
        app.dependency_overrides.pop(get_session, None)
        engine.dispose()


def test_login_me_refresh_and_logout(client):
    assert client.get('/api/v1/auth/me').status_code == 401
    response = client.post('/api/v1/auth/login', json={
        'username_or_email': 'mobile_test', 'password': 'MobileTest123!',
    })
    assert response.status_code == 200
    assert 'access_token' not in response.json()
    cookie = SimpleCookie(response.headers['set-cookie'])[settings.AUTH_COOKIE_NAME]
    assert cookie['httponly']
    assert cookie['path'] == '/'
    assert not cookie['domain']
    assert cookie['samesite'] == 'lax'
    assert not cookie['secure']
    assert int(cookie['max-age']) == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    for _ in range(2):
        me = client.get('/api/v1/auth/me')
        assert me.status_code == 200
        assert me.json()['user']['username'] == 'mobile_test'
    assert client.post('/api/v1/auth/logout').status_code == 200
    assert client.get('/api/v1/auth/me').status_code == 401


def test_failed_login_does_not_create_session(client):
    response = client.post('/api/v1/auth/login', json={
        'username_or_email': 'mobile_test', 'password': 'WrongPassword123!',
    })
    assert response.status_code == 401
    assert 'set-cookie' not in response.headers
    assert client.get('/api/v1/auth/me').status_code == 401


def test_mobile_cors_and_csrf(client):
    response = client.options('/api/v1/auth/login', headers={
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-requested-with,x-request-id',
    })
    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == 'http://192.168.50.20'
    assert response.headers['access-control-allow-credentials'] == 'true'
    response = client.post('/api/v1/auth/login', headers={'Origin': 'http://192.168.50.20.evil.example'},
                           json={'username_or_email': 'mobile_test', 'password': 'MobileTest123!'})
    assert response.status_code == 403


def test_production_ignores_mobile_development_origin():
    config = Settings(_env_file=None, JWT_SECRET_KEY='test-only-' * 8, APP_ENV='production',
                      DEV_MOBILE_ORIGIN='http://192.168.50.20',
                      AUTH_COOKIE_SECURE=True, AUTH_COOKIE_SAMESITE='none')
    assert config.mobile_dev_origins == []
    assert config.AUTH_COOKIE_SECURE is True
    assert config.AUTH_COOKIE_SAMESITE == 'none'


@pytest.mark.parametrize('origin', ['http://*', 'http://host/path', 'http://user:pass@host', 'http://host:8000'])
def test_reject_invalid_mobile_origin(origin):
    with pytest.raises(ValueError):
        Settings(_env_file=None, JWT_SECRET_KEY='test-only-' * 8, DEV_MOBILE_ORIGIN=origin)
