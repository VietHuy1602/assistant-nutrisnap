"""Calo đã nạp mỗi ngày cho biểu đồ cân nặng trên Tổng quan."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session

from src.backend.models.schema import Meal, MealItem, get_vn_today
from tests.integration.test_meal_plan_api import _login, client_fixture, db_fixture  # noqa: F401


def test_daily_calories_groups_by_vietnam_day(client: TestClient, db: Session):
    u = _login(client, db)
    today = get_vn_today()
    vn = timezone(timedelta(hours=7))
    for day_offset, hour, kcal in ((0, 8, 400), (0, 19, 600), (2, 12, 700)):
        d = today - timedelta(days=day_offset)
        at = datetime(d.year, d.month, d.day, hour, tzinfo=vn).astimezone(timezone.utc)
        m = Meal(user_id=u.id, meal_type="lunch", logged_at=at)
        db.add(m); db.commit(); db.refresh(m)
        db.add(MealItem(meal_id=m.id, food_id=1, food_name="Cơm trắng", estimated_gram=100, estimated_calories=kcal))
        db.commit()
    res = client.get("/api/v1/analytics/daily-calories", params={"days": 7})
    assert res.status_code == 200
    pts = {p["date"]: p["calories"] for p in res.json()["points"]}
    assert len(pts) == 7
    assert pts[today.isoformat()] == 1000
    assert pts[(today - timedelta(days=2)).isoformat()] == 700
    assert pts[(today - timedelta(days=1)).isoformat()] == 0
