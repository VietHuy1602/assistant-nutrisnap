"""
tests/integration/test_preferences_api.py
Bộ câu hỏi khi tạo tài khoản: lưu, tổng hợp hồ sơ (không gọi AI trong test), và thực đơn tuân theo hồ sơ.
"""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from tests.integration.test_meal_plan_api import ORIGIN, _login, client_fixture, db_fixture  # noqa: F401

ANSWERS = {"age_group": "B", "activity": "C", "goal": "A", "pace": "B", "diet": "A", "taste": "A", "protein": "A",
           "allergies": "Dị ứng tôm cua, không ăn được đồ cay", "cooking": "A", "meals": "A", "daily_budget_vnd": 80000}


@pytest.fixture(autouse=True)
def no_ai(monkeypatch):
    monkeypatch.setattr("src.backend.services.preference_service._ai_profile", lambda p: None)
    monkeypatch.setattr("src.backend.routers.preference_router.refresh_ai_summary", lambda uid: None)


def _ids(plan):
    return [i["food_name"] for d in plan["plan"] for m in d["meals"] for i in m["items"]]


def test_save_and_read_preferences(client: TestClient, db: Session):
    _login(client, db)
    assert client.get("/api/v1/preferences").json() == {"preferences": None}
    res = client.put("/api/v1/preferences", json=ANSWERS, headers=ORIGIN)
    assert res.status_code == 200
    p = res.json()["preferences"]
    assert p["summary_source"] == "rule" and "tôm cua" in p["summary"]
    assert "hai_san" in p["avoid_groups"] and "cay" in p["avoid_keywords"]
    assert client.get("/api/v1/preferences").json()["preferences"]["daily_budget_vnd"] == 80000
    assert client.put("/api/v1/preferences", json={**ANSWERS, "diet": "E"}, headers=ORIGIN).status_code == 422


def test_meal_plan_follows_preferences(client: TestClient, db: Session):
    _login(client, db)
    client.put("/api/v1/preferences", json=ANSWERS, headers=ORIGIN)
    plan = client.post("/api/v1/meal-plan/generate", json={"days": 2}, headers=ORIGIN).json()
    assert not any("Tôm" in n for n in _ids(plan))
    assert all({m["meal_type"] for m in d["meals"]} == {"breakfast", "lunch", "dinner"} for d in plan["plan"])  # 3 bữa, không ăn vặt
    assert plan["daily_budget_vnd"] == 80000


def test_vegetarian_has_no_meat(client: TestClient, db: Session):
    _login(client, db)
    client.put("/api/v1/preferences", json={**ANSWERS, "diet": "D", "protein": "D", "allergies": "", "meals": "C"}, headers=ORIGIN)
    plan = client.post("/api/v1/meal-plan/generate", json={"days": 1}, headers=ORIGIN).json()
    proteins = [i["food_name"] for m in plan["plan"][0]["meals"] for i in m["items"] if i["role"] == "protein"]
    assert proteins and all(n.startswith("Đậu hũ") or "trứng" in n.lower() for n in proteins)
    assert {m["meal_type"] for m in plan["plan"][0]["meals"]} == {"lunch", "dinner"}


def test_daily_budget_caps_whole_day_cost(client: TestClient, db: Session):
    from sqlmodel import select

    from src.backend.models.schema import FoodReference

    pricey = {"Bò xào cần tây", "Tôm hấp", "Bún bò Huế", "Canh chua cá lóc", "Sữa chua không đường"}
    for f in db.exec(select(FoodReference)).all():
        f.avg_price_vnd = 200000 if f.food_name in pricey else 8000
        db.add(f)
    db.commit()
    _login(client, db)
    client.put("/api/v1/preferences", json={**ANSWERS, "allergies": "", "daily_budget_vnd": 200000}, headers=ORIGIN)
    for _ in range(3):
        plan = client.post("/api/v1/meal-plan/generate", json={"days": 2}, headers=ORIGIN).json()
        for day in plan["plan"]:
            assert day["totals"]["price_vnd"] <= 200000  # ngân sách tính cho cả ngày, không phải từng bữa
            assert abs(day["totals"]["calories"] - plan["target_calories"]) < plan["target_calories"] * 0.25


def test_needs_analysis_combines_survey_and_goal(client: TestClient, db: Session, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    _login(client, db)
    assert client.get("/api/v1/preferences/analysis").json() == {"analysis": None}
    assert client.post("/api/v1/preferences/analysis", headers=ORIGIN).status_code == 409  # chưa làm khảo sát
    client.put("/api/v1/preferences", json=ANSWERS, headers=ORIGIN)
    res = client.post("/api/v1/preferences/analysis", headers=ORIGIN)
    assert res.status_code == 200
    a = res.json()["analysis"]
    assert a["source"] == "rule" and a["target_calories"] == 1800
    assert "1800 kcal" in a["headline"]
    assert any("tôm cua" in c for c in a["cautions"])  # luôn nhắc dị ứng
    assert client.get("/api/v1/preferences/analysis").json()["analysis"]["headline"] == a["headline"]
