"""
tests/integration/test_meal_plan_api.py
Thực đơn gợi ý: cấu trúc bữa Việt, đa dạng giữa các bữa/ngày, đổi món không thích, lưu thực đơn.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from src.backend.core.config import settings
from src.backend.main import app
from src.backend.models.database import get_session
from src.backend.models.schema import FoodDislike, FoodReference, Goal, MealPlan, User, utc_now
from src.backend.services.auth_service import create_access_token, hash_password

ORIGIN = {"Origin": "http://localhost:5173"}
FOODS = [
    ("Cơm trắng", 130, 2.7, 28, 0.3), ("Phở bò tái", 115, 8.5, 14, 2.8), ("Bún bò Huế", 135, 8, 15, 4), ("Bánh mì thịt nướng", 230, 10, 30, 8),
    ("Xôi gà", 180, 7, 30, 4), ("Cháo cá", 120, 7, 15, 3), ("Hủ tiếu mực", 120, 8, 16, 3),
    ("Ức gà luộc", 165, 31, 0, 3.6), ("Thịt heo luộc", 240, 27, 0, 14), ("Bò xào cần tây", 175, 20, 4, 9), ("Cá lóc kho tộ", 145, 20, 3, 6),
    ("Tôm hấp", 100, 21, 0, 1.5), ("Đậu hũ sốt cà chua", 110, 9, 6, 6), ("Cá basa hấp gừng", 120, 18, 1, 5),
    ("Rau muống xào tỏi", 85, 3, 8, 5), ("Bông cải xanh hấp", 35, 3, 7, 0.4), ("Rau cải luộc", 25, 2, 4, 0.3), ("Su su xào tỏi", 60, 1, 7, 3),
    ("Canh chua cá lóc", 65, 6, 6, 2), ("Canh bí đỏ", 45, 1.5, 9, 0.5), ("Canh rau ngót thịt băm", 50, 4, 4, 2),
    ("Sữa chua không đường", 60, 4, 5, 3), ("Khoai lang luộc", 86, 1.6, 20, 0.1), ("Sữa đậu nành không đường", 45, 3.5, 2, 2),
]


@pytest.fixture(name="db")
def db_fixture():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        for name, kcal, p, c, f in FOODS:
            s.add(FoodReference(food_name=name, calories_per_100g=kcal, protein_per_100g=p, carbs_per_100g=c, fat_per_100g=f, avg_price_vnd=30000))
        s.commit()
        yield s


@pytest.fixture(name="client")
def client_fixture(db: Session):
    def override():
        yield db

    from src.backend.api.deps import get_db

    app.dependency_overrides[get_session] = override
    app.dependency_overrides[get_db] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


def _login(client: TestClient, db: Session) -> User:
    u = User(username="plan_user", email="plan@example.com", password_hash=hash_password("ValidPassword123!"), created_at=utc_now())
    db.add(u); db.commit(); db.refresh(u)
    db.add(Goal(user_id=u.id, target_weight=60, tdee_calories=2100, target_calories=1800, target_protein_g=110, goal_type="lose_weight", daily_budget_vnd=0))
    db.commit()
    token, _ = create_access_token(subject=str(u.id), extra_claims={"username": u.username})
    client.cookies.set(settings.AUTH_COOKIE_NAME, token)
    return u


def test_generate_vietnamese_structure_and_variety(client: TestClient, db: Session):
    _login(client, db)
    res = client.post("/api/v1/meal-plan/generate", json={"days": 3}, headers=ORIGIN)
    assert res.status_code == 200
    plan = res.json()
    assert len(plan["plan"]) == 3
    breakfasts = []
    for day in plan["plan"]:
        meals = {m["meal_type"]: m for m in day["meals"]}
        assert set(meals) == {"breakfast", "lunch", "snack", "dinner"}
        breakfasts.append(meals["breakfast"]["items"][0]["food_name"])
        for key in ("lunch", "dinner"):
            roles = {i["role"] for i in meals[key]["items"]}
            assert "rice" in roles or "main" in roles  # cơm + món mặn, hoặc món một đĩa
        lunch_main = [i["food_name"] for i in meals["lunch"]["items"] if i["role"] in ("protein", "main")]
        dinner_main = [i["food_name"] for i in meals["dinner"]["items"] if i["role"] in ("protein", "main")]
        assert set(lunch_main).isdisjoint(dinner_main)
        assert abs(day["totals"]["calories"] - plan["target_calories"]) < plan["target_calories"] * 0.25
    assert len(set(breakfasts)) == 3  # mỗi ngày một món sáng khác nhau


def test_replace_disliked_item_and_remember(client: TestClient, db: Session):
    user = _login(client, db)
    plan = client.post("/api/v1/meal-plan/generate", json={"days": 1}, headers=ORIGIN).json()
    lunch = next(m for m in plan["plan"][0]["meals"] if m["meal_type"] == "lunch")
    target = next(i for i in lunch["items"] if i["role"] != "rice")
    res = client.post("/api/v1/meal-plan/replace", json={"plan": plan, "day_index": 0, "meal_type": "lunch", "food_id": target["food_id"]}, headers=ORIGIN)
    assert res.status_code == 200
    new_lunch = next(m for m in res.json()["plan"][0]["meals"] if m["meal_type"] == "lunch")
    assert target["food_id"] not in {i["food_id"] for i in new_lunch["items"]}
    assert db.exec(select(FoodDislike).where(FoodDislike.user_id == user.id, FoodDislike.food_id == target["food_id"])).first()
    again = client.post("/api/v1/meal-plan/generate", json={"days": 3}, headers=ORIGIN).json()
    assert target["food_id"] not in {i["food_id"] for d in again["plan"] for m in d["meals"] for i in m["items"]}


def test_accept_and_current(client: TestClient, db: Session):
    _login(client, db)
    assert client.get("/api/v1/meal-plan/current").json()["plan"] is None
    plan = client.post("/api/v1/meal-plan/generate", json={"days": 1}, headers=ORIGIN).json()
    assert client.post("/api/v1/meal-plan/accept", json={"plan": plan}, headers=ORIGIN).status_code == 201
    assert db.exec(select(MealPlan)).first() is not None
    assert client.get("/api/v1/meal-plan/current").json()["plan"]["start_date"] == plan["start_date"]


def test_requires_login(client: TestClient):
    assert client.post("/api/v1/meal-plan/generate", json={"days": 1}, headers=ORIGIN).status_code == 401


def test_reason_too_heavy_picks_lighter_and_week_has_no_repeats(client: TestClient, db: Session):
    _login(client, db)
    plan = client.post("/api/v1/meal-plan/generate", json={"days": 7}, headers=ORIGIN).json()
    ids = [i["food_id"] for d in plan["plan"] for m in d["meals"] for i in m["items"] if i["role"] != "rice"]
    assert len(ids) == len(set(ids))  # không trùng món trong tuần
    plan = client.post("/api/v1/meal-plan/generate", json={"days": 1}, headers=ORIGIN).json()
    di, mt, prot = next((k, m["meal_type"], i) for k, d in enumerate(plan["plan"]) for m in d["meals"] for i in m["items"] if i["role"] == "protein")
    res = client.post("/api/v1/meal-plan/replace", headers=ORIGIN, json={
        "plan": plan, "day_index": di, "meal_type": mt, "food_id": prot["food_id"], "reason": "allergy"}).json()
    assert "replace_message" in res and "Đã đổi" in res["replace_message"]
    row = db.exec(select(FoodDislike).where(FoodDislike.food_id == prot["food_id"])).first()
    assert row.reason == "allergy" and row.avoid_group


def test_recipe_is_cached(client: TestClient, db: Session, monkeypatch):
    _login(client, db)
    import src.backend.services.recipe_service as rs

    calls = []
    monkeypatch.setattr(rs, "_generate", lambda name, g: calls.append(name) or {"servings": 1, "time_minutes": 20, "difficulty": "Dễ",
                        "ingredients": [{"name": "Thịt bò", "amount": "120 g"}], "steps": ["Thái thịt", "Xào nhanh"]})
    food = db.exec(select(FoodReference).where(FoodReference.food_name == "Bò xào cần tây")).first()
    a = client.get(f"/api/v1/meal-plan/recipe/{food.id}").json()
    b = client.get(f"/api/v1/meal-plan/recipe/{food.id}").json()
    assert a["ingredients"][0]["name"] == "Thịt bò" and b["steps"] == ["Thái thịt", "Xào nhanh"]
    assert calls == ["Bò xào cần tây"]


def test_regenerate_one_day_keeps_other_days(client: TestClient, db: Session):
    _login(client, db)
    plan = client.post("/api/v1/meal-plan/generate", json={"days": 3}, headers=ORIGIN).json()
    ids = lambda d: [i["food_id"] for m in d["meals"] for i in m["items"]]
    res = client.post("/api/v1/meal-plan/regenerate-days", json={"plan": plan, "day_indexes": [1]}, headers=ORIGIN)
    assert res.status_code == 200
    new = res.json()
    assert new["plan"][0] == plan["plan"][0] and new["plan"][2] == plan["plan"][2]
    assert new["plan"][1]["date"] == plan["plan"][1]["date"]
    assert ids(new["plan"][1]) != ids(plan["plan"][1])
    bad = client.post("/api/v1/meal-plan/regenerate-days", json={"plan": plan, "day_indexes": [5]}, headers=ORIGIN)
    assert bad.status_code == 422
