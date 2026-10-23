"""
tests/test_assistant_tools.py
W4: 30-question heuristic router accuracy + calorie DB verification.

DATABASE ISOLATION POLICY:
  - Uses SQLite :memory: engine completely separate from nutrisnap.db.
  - NEVER reads, writes, or deletes any data in nutrisnap.db.
  - Fixture creates test user only in :memory: (not in production DB).
  - If existing user found in :memory: (re-run), reuses it without deletion.

SCOPE:
  - Q01-Q30: measure router/heuristic accuracy (NOT Gemini LLM Tool Calling).
  - C01-C11: calorie DB verification against in-memory food_references.
  - Summary: reports accuracy; FAIL if below 95% (need >= 29/30).

KEY NOTES:
  - _heuristic_tool_name() is a faithful copy of the if-elif logic in
    assistant_router.py lines 149-189 (white-box test).
  - To test the real router HTTP path, use TestClient POST /api/v1/assistant/chat
    (see proposal at the end of this file; needs approval before implementation).
  - Threshold: math.ceil(30 * 0.95) = 29, NOT int(30 * 0.95) = 28.
"""

from __future__ import annotations

import difflib
import math
import os
import sqlite3
from pathlib import Path

import pandas as pd
import pytest
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine, select

# --- Set env BEFORE any src imports so database.py reads the right URL ---
os.environ["JWT_SECRET_KEY"] = "test_nutrisnap_secure_jwt_secret_key_min32chars_w4_testonly!"
os.environ["APP_ENV"] = "testing"
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"

from sqlalchemy.pool import StaticPool

# --- Create isolated :memory: engine BEFORE importing src modules ---
_TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

@event.listens_for(_TEST_ENGINE, "connect")
def _set_fk_pragma(dbapi_conn, _):
    if isinstance(dbapi_conn, sqlite3.Connection):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON;")
        cur.close()

# Override default engine in models.database so nutrisnap.db is NEVER accessed
import src.backend.models.database as _db_mod
_db_mod.engine = _TEST_ENGINE

# Now import schema (registers metadata) and create all tables in :memory:
import src.backend.models.schema as _schema  # noqa: F401
SQLModel.metadata.create_all(_TEST_ENGINE)

from src.backend.models.schema import FoodReference, Meal, MealItem, User
from src.backend.services.assistant_tools import dispatch_tool_call, exec_log_meal
from src.backend.services.auth_service import register_with_initial_goal
from src.backend.services.goal_service import GoalPlanInput

# Path to CSV for seeding (read-only, never written)
_CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "vn_foods.csv"


def _safe_print(msg: str) -> None:
    """In log an toàn trên mọi hệ điều hành (tránh UnicodeEncodeError trên cp1252 Windows)."""
    import sys
    try:
        sys.stdout.write(msg + "\n")
        sys.stdout.flush()
    except Exception:
        try:
            sys.stdout.buffer.write(msg.encode("utf-8", errors="replace") + b"\n")
            sys.stdout.buffer.flush()
        except Exception:
            pass


def _seed_food_references_to_engine(engine) -> int:
    """
    Seed food_references from data/vn_foods.csv into the given engine.
    Uses SQLModel Session (not sqlite3.connect) so it works with :memory:.
    Returns number of records inserted.
    """
    if not _CSV_PATH.exists():
        return 0
    df = pd.read_csv(_CSV_PATH, encoding="utf-8-sig")
    with Session(engine) as session:
        for _, row in df.iterrows():
            existing = session.exec(
                select(FoodReference).where(FoodReference.food_name == row["food_name"])
            ).first()
            if existing:
                # Update existing (UPSERT behaviour)
                existing.calories_per_100g = float(row["calories_per_100g"])
                existing.protein_per_100g = float(row["protein_per_100g"])
                existing.carbs_per_100g = float(row["carbs_per_100g"])
                existing.fat_per_100g = float(row["fat_per_100g"])
                existing.avg_price_vnd = int(row["avg_price_vnd"])
                session.add(existing)
            else:
                ref = FoodReference(
                    food_name=row["food_name"],
                    calories_per_100g=float(row["calories_per_100g"]),
                    protein_per_100g=float(row["protein_per_100g"]),
                    carbs_per_100g=float(row["carbs_per_100g"]),
                    fat_per_100g=float(row["fat_per_100g"]),
                    avg_price_vnd=int(row["avg_price_vnd"]),
                )
                session.add(ref)
        session.commit()
        count = len(session.exec(select(FoodReference)).all())
    return count


# ==============================================================================
# FIXTURES - Isolated :memory: DB; NEVER touches nutrisnap.db
# ==============================================================================


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """
    Override root tests/conftest.py setup_test_database fixture.
    Guarantees 100% isolation: ZERO calls to init_db() or seed_foods() on nutrisnap.db.
    """
    yield


@pytest.fixture(scope="module", autouse=True)
def setup_inmemory_database():
    """Seed food_references into :memory: DB (read-only CSV, write-only :memory:)."""
    with Session(_TEST_ENGINE) as session:
        count = len(session.exec(select(FoodReference)).all())
    if count < 30:
        seeded = _seed_food_references_to_engine(_TEST_ENGINE)
        _safe_print(f"\n  [setup] Seeded {seeded} food_references into :memory: DB")
    else:
        _safe_print(f"\n  [setup] food_references already present: {count} rows")


@pytest.fixture(scope="module")
def test_user() -> User:
    """
    Create test user in :memory: DB only.
    POLICY: Does NOT delete any user. If user exists in :memory:, reuses it.
    nutrisnap.db is never accessed by this fixture.
    """
    username = "w4_tester_inmem"
    email = "w4_tester_inmem@test.local"
    with Session(_TEST_ENGINE) as session:
        existing = session.exec(
            select(User).where((User.username == username) | (User.email == email))
        ).first()
        if existing:
            return existing

        user, _ = register_with_initial_goal(
            session=session,
            username=username,
            email=email,
            password="Password123!",
            initial_goal=GoalPlanInput(
                target_weight_kg=65.0,
                current_weight_kg=70.0,
                height_cm=170.0,
                age=28,
                gender="male",
                activity_level="moderate",
                goal_type="lose_weight",
                weekly_pace_kg=0.5,
                daily_budget_vnd=60000,
            ),
        )
        return user


@pytest.fixture(scope="module")
def db_session():
    """Session on :memory: DB - NOT nutrisnap.db."""
    with Session(_TEST_ENGINE) as session:
        yield session


@pytest.fixture(scope="module")
def api_client(test_user: User):
    """
    FastAPI TestClient calling the REAL assistant router endpoint: POST /api/v1/assistant/chat.
    Guarantees isolation:
      - Uses dependency override to ensure get_session provides Session(_TEST_ENGINE) (:memory:).
      - Authenticates via JWT cookie using test_user in :memory:.
      - Origin and CSRF headers set to pass security guards.
      - NEVER accesses or modifies nutrisnap.db.
    """
    from fastapi.testclient import TestClient
    from src.backend.main import app
    from src.backend.models.database import get_session
    from src.backend.services.auth_service import create_access_token

    def _override_get_session():
        with Session(_TEST_ENGINE) as session:
            yield session

    app.dependency_overrides[get_session] = _override_get_session

    token = create_access_token(data={"sub": str(test_user.id), "username": test_user.username})
    client = TestClient(app)
    client.cookies.set("access_token", token)
    client.headers["Origin"] = "http://testserver"
    client.headers["X-CSRF-Token"] = "w4-test-csrf-token"

    yield client

    app.dependency_overrides.clear()


# ==============================================================================
# 30 TEST QUESTIONS (Latin-ASCII to avoid encoding issues in parametrize)
# ==============================================================================

QUESTIONS_GROUP_A = [
    ("Q01", "Hom nay toi da nap bao nhieu calo roi?", "get_daily_nutrition"),
    ("Q02", "Kiem tra luong calo con lai trong ngay hom nay giup toi.", "get_daily_nutrition"),
    ("Q03", "Hom nay toi an du chat dam (protein) theo muc tieu chua?", "get_daily_nutrition"),
    ("Q04", "Hom qua toi da an nhung gi va tong bao nhieu calo?", "get_daily_nutrition"),
    ("Q05", "Xem nhat ky dinh duong ngay 2026-10-20.", "get_daily_nutrition"),
    ("Q06", "Han muc calo cua toi hom nay con duoc an them bao nhieu nua?", "get_daily_nutrition"),
]

QUESTIONS_GROUP_B = [
    ("Q07", "Trua nay toi nen an mon gi duoi 500 calo?", "recommend_meals"),
    ("Q08", "Goi y cho toi bua toi thanh dam duoi 40000 dong.", "recommend_meals"),
    ("Q09", "Toi con 350 kcal, hay goi y mon an phu hop voi ngan sach 30k.", "recommend_meals"),
    ("Q10", "Co mon nao nhieu protein cho bua phu sau tap gym khong?", "recommend_meals"),
    ("Q11", "Tu van mon an trua phu hop voi luong calo con lai cua toi hom nay.", "recommend_meals"),
    ("Q12", "Goi y mon an it calo cho nguoi dang giam can.", "recommend_meals"),
]

QUESTIONS_GROUP_C = [
    ("Q13", "Toi vua an mot to pho bo tai khoang 400 g cho bua sang.", "log_meal"),
    ("Q14", "Ghi nhan giup toi bua trua: 1 dia com tam suon nuong 300 g.", "log_meal"),
    ("Q15", "Toi nay toi an 200 g uc ga ap chao va 150 g bong cai xanh luoc.", "log_meal"),
    ("Q16", "Bua phu chieu toi uong 1 ly sua tuoi khong duong 200 ml.", "log_meal"),
    ("Q17", "Toi vua an 1 o banh mi trung op la 150 g.", "log_meal"),
    ("Q18", "Ghi nhat ky bua trua: 1 bat bun bo Hue 450 g.", "log_meal"),
]

QUESTIONS_GROUP_D = [
    ("Q19", "Xem tom tat tien do can nang cua toi trong 7 ngay qua.", "get_progress_summary"),
    ("Q20", "Xu huong can nang EMA cua toi 2 tuan gan day the nao?", "get_progress_summary"),
    ("Q21", "Toi da duy tri ghi nhat ky an uong lien tuc duoc bao nhieu ngay roi?", "get_progress_summary"),
    ("Q22", "Tong hop calo trung binh moi ngay trong 30 ngay qua.", "get_progress_summary"),
    ("Q23", "Can nang cua toi thay doi ra sao so voi tuan truoc?", "get_progress_summary"),
    ("Q24", "Bao cao tien do giam can trong thang nay.", "get_progress_summary"),
]

QUESTIONS_GROUP_E = [
    ("Q25", "Xin chao ban! Ban co the giup gi cho toi?", None),
    ("Q26", "Chi so BMR va TDEE khac nhau nhu the nao?", None),
    ("Q27", "Moi ngay mot nguoi truong thanh nen uong bao nhieu lit nuoc?", None),
    ("Q28", "Lam the nao de phan biet chat beo tot va chat beo xau?", None),
    ("Q29", "Cam on tro ly nhe, thong tin rat huu ich!", None),
    ("Q30", "Hom nay thoi tiet o TP.HCM the nao?", None),
]

ALL_QUESTIONS = (
    QUESTIONS_GROUP_A + QUESTIONS_GROUP_B + QUESTIONS_GROUP_C
    + QUESTIONS_GROUP_D + QUESTIONS_GROUP_E
)

# Correct threshold: math.ceil(30 * 0.95) = 29, NOT int(30 * 0.95) = 28
THRESHOLD_CORRECT = math.ceil(len(ALL_QUESTIONS) * 0.95)  # 29


# ==============================================================================
# TEST CLASS 1: REAL ROUTER ACCURACY (FASTAPI TESTCLIENT POST /api/v1/assistant/chat)
# ==============================================================================


class TestRealRouterAccuracy:
    """
    Kiểm thử ROUTER THẬT qua FastAPI TestClient: POST /api/v1/assistant/chat.
    Đánh giá độ chính xác phân loại ý định (intent recognition) trên toàn bộ 30 câu hỏi Q01-Q30.
    Chạy trong môi trường SQLite :memory: hoàn toàn cô lập, không dùng mock hay hàm sao chép.
    Target: >= 95.00% = ít nhất 29/30 câu đúng.
    """
    RESULTS: list = []

    @pytest.mark.parametrize("qid,message,expected_tool", ALL_QUESTIONS, ids=[q[0] for q in ALL_QUESTIONS])
    def test_real_router_chat_endpoint(self, api_client, qid, message, expected_tool):
        """Gửi request thật đến POST /api/v1/assistant/chat và kiểm tra tool_result."""
        resp = api_client.post("/api/v1/assistant/chat", json={"message": message})
        assert resp.status_code == 200, f"[{qid}] Endpoint trả về lỗi HTTP {resp.status_code}: {resp.text}"
        data = resp.json()
        tool_res = data.get("tool_result")
        actual_tool = tool_res.get("tool_name") if tool_res else None

        correct = (actual_tool == expected_tool)
        TestRealRouterAccuracy.RESULTS.append({
            "id": qid,
            "msg": message,
            "expected": expected_tool,
            "actual": actual_tool,
            "correct": correct,
        })
        assert actual_tool == expected_tool, (
            f"[{qid}] Real router chose wrong tool.\n"
            f"  Question: '{message}'\n"
            f"  Expected: {expected_tool!r}\n"
            f"  Actual:   {actual_tool!r}"
        )


# ==============================================================================
# TEST CLASS 2: CALORIE DB VERIFICATION
# ==============================================================================


class TestCalorieMatchDB:
    """
    Verify calorie calculations match food_references data in :memory: DB.
    Formula (nutrition_service.py):
      effective_gram = round(gram * eaten_ratio, 2)
      expected_calories = round(effective_gram / 100.0 * calories_per_100g, 2)

    DB POLICY: All reads/writes go to _TEST_ENGINE (:memory:). nutrisnap.db is untouched.
    SKIP POLICY: If a food item is not found in :memory: food_references, test is SKIPPED
                 (marked BLOCKED), NOT passed. Accuracy excludes skipped cases.
    """

    def _get_food_ref(self, session: Session, food_name: str) -> "FoodReference | None":
        """Look up food_references by name: exact -> ILIKE -> difflib fuzzy."""
        from sqlmodel import func
        ref = session.exec(
            select(FoodReference).where(func.lower(FoodReference.food_name) == food_name.lower())
        ).first()
        if ref:
            return ref
        ref = session.exec(
            select(FoodReference).where(FoodReference.food_name.ilike(f"%{food_name}%"))
        ).first()
        if ref:
            return ref
        all_refs = session.exec(select(FoodReference)).all()
        matches = difflib.get_close_matches(food_name, [r.food_name for r in all_refs], n=1, cutoff=0.6)
        if matches:
            return session.exec(
                select(FoodReference).where(FoodReference.food_name == matches[0])
            ).first()
        return None

    def _expected_cal(self, ref: FoodReference, gram: float, ratio: float = 1.0) -> float:
        """Calculate expected calories independently from DB using product formula."""
        effective = round(gram * ratio, 2)
        return round(effective / 100.0 * ref.calories_per_100g, 2)

    def test_C01_preview_not_saved_to_db(self, test_user: User, db_session: Session):
        """
        C01: is_confirmed=False -> no DB write (preview only).
        Verify Meal count unchanged in :memory: DB.
        """
        before = len(db_session.exec(select(Meal).where(Meal.user_id == test_user.id)).all())
        result = exec_log_meal(
            session=db_session, authenticated_user_id=test_user.id,
            meal_type="lunch",
            items_list=[{"food_name": "Pho bo tai", "estimated_gram": 400.0}],
            is_confirmed=False,
        )
        after = len(db_session.exec(select(Meal).where(Meal.user_id == test_user.id)).all())
        assert result["requires_confirmation"] is True
        assert result["meal_id"] is None, "Preview must not return a meal_id"
        assert before == after, (
            f"is_confirmed=False must not write to DB (before={before}, after={after})"
        )

    def test_C02_calorie_preview_matches_db_formula(self, test_user: User, db_session: Session):
        """
        C02: Preview calories match formula computed independently from food_references.
        Input: 'Pho bo tai' 400g.
        Verifies:
          - Food item resolved from food_references
          - Matched food name in action_card matches ref.food_name
          - Portion gram in action_card matches input gram
          - Calories in action_card matches independent DB formula: round(gram / 100 * calories_per_100g, 2)
        """
        food_name_input = "Pho bo tai"
        gram = 400.0
        ref = self._get_food_ref(db_session, food_name_input)
        if ref is None:
            pytest.skip(f"'{food_name_input}' not found in food_references (:memory:) — BLOCKED")
        expected_cal = self._expected_cal(ref, gram)
        result = exec_log_meal(
            session=db_session, authenticated_user_id=test_user.id,
            meal_type="lunch",
            items_list=[{"food_name": food_name_input, "estimated_gram": gram}],
            is_confirmed=False,
        )
        items = result["action_card"]["data"]["items"]
        assert items, "action_card must contain at least one item"
        matched_name = items[0].get("food_name", "?")
        actual_cal = items[0]["calories"]
        actual_gram = items[0].get("estimated_gram", gram)

        _safe_print(f"\n  [C02] Input='{food_name_input}' -> Matched='{matched_name}' | "
                    f"gram={actual_gram} | expected_cal={expected_cal} actual_cal={actual_cal}")

        # 1. Kiểm tra món được nhận diện
        assert matched_name == ref.food_name, (
            f"Món được nhận diện không khớp: mong đợi {ref.food_name!r}, nhận được {matched_name!r}"
        )
        # 2. Kiểm tra gram
        assert abs(actual_gram - gram) < 0.01, (
            f"Khối lượng gram không khớp: mong đợi {gram}, nhận được {actual_gram}"
        )
        # 3. Kiểm tra calo tính độc lập từ DB
        assert abs(actual_cal - expected_cal) < 0.01, (
            f"Preview calories mismatch:\n"
            f"  Matched food: {matched_name!r} (food_references.id={ref.id})\n"
            f"  calories_per_100g: {ref.calories_per_100g}\n"
            f"  effective_gram: {gram}\n"
            f"  expected: {expected_cal}  actual: {actual_cal}"
        )

    def test_C03_confirmed_persists_calories_match_db(self, test_user: User, db_session: Session):
        """
        C03: is_confirmed=True -> writes to :memory: DB.
        Verifies:
          - meal_id returned and stored in meals table
          - meal_items record created in :memory: DB
          - Món được nhận diện: food_id points to correct FoodReference in DB
          - Gram lưu trong DB: meal_items.estimated_gram == input gram
          - Calo lưu trong DB: meal_items.estimated_calories == expected_cal
        """
        food_name_input = "Com tam suon nuong"
        gram = 300.0
        ref = self._get_food_ref(db_session, food_name_input)
        if ref is None:
            pytest.skip(f"'{food_name_input}' not found in food_references — BLOCKED")
        expected_cal = self._expected_cal(ref, gram)
        result = exec_log_meal(
            session=db_session, authenticated_user_id=test_user.id,
            meal_type="lunch",
            items_list=[{"food_name": food_name_input, "estimated_gram": gram}],
            is_confirmed=True,
        )
        assert result["requires_confirmation"] is False
        assert result["meal_id"] is not None, "is_confirmed=True must return a meal_id"
        db_session.expire_all()
        db_items = db_session.exec(
            select(MealItem).where(MealItem.meal_id == result["meal_id"])
        ).all()
        assert db_items, "meal_items must exist in DB after confirmation"

        db_item = db_items[0]
        db_cal = db_item.estimated_calories
        db_gram = db_item.estimated_gram

        # Tra cứu lại món từ food_id lưu trong meal_items
        stored_food_ref = db_session.get(FoodReference, db_item.food_id)
        assert stored_food_ref is not None, f"food_id {db_item.food_id} not found in FoodReference"
        stored_food_name = stored_food_ref.food_name

        _safe_print(f"\n  [C03] Stored food='{stored_food_name}' | gram={db_gram} | "
                    f"expected_cal={expected_cal} db_cal={db_cal}")

        # 1. Kiểm tra món được nhận diện lưu trong DB
        assert stored_food_name == ref.food_name, (
            f"Món lưu trong DB không khớp: mong đợi {ref.food_name!r}, DB có {stored_food_name!r}"
        )
        assert db_item.food_id == ref.id, (
            f"food_id lưu trong DB không khớp: mong đợi {ref.id}, DB có {db_item.food_id}"
        )
        # 2. Kiểm tra gram lưu trong DB
        assert abs(db_gram - gram) < 0.01, (
            f"Gram lưu trong DB không khớp: mong đợi {gram}, DB có {db_gram}"
        )
        # 3. Kiểm tra calo lưu trong DB
        assert abs(db_cal - expected_cal) < 0.01, (
            f"meal_items.estimated_calories mismatch:\n"
            f"  expected (from DB formula): {expected_cal}\n"
            f"  DB value:                   {db_cal}"
        )

    def test_C04_multi_item_total_calories_match_db(self, test_user: User, db_session: Session):
        """
        C04: Multi-item meal; total calories = sum(item_calories) computed from DB.
        Items: Pho bo tai 400g + Com tam suon nuong 300g.
        """
        inputs = [
            {"food_name": "Pho bo tai", "estimated_gram": 400.0},
            {"food_name": "Com tam suon nuong", "estimated_gram": 300.0},
        ]
        expected_total = 0.0
        blocked = []
        resolved = []
        for it in inputs:
            ref = self._get_food_ref(db_session, it["food_name"])
            if ref is None:
                blocked.append(it["food_name"])
                continue
            cal = self._expected_cal(ref, it["estimated_gram"])
            expected_total += cal
            resolved.append((it["food_name"], ref.food_name, cal))
        if blocked:
            pytest.skip(f"Not found in food_references: {blocked} — BLOCKED")
        expected_total = round(expected_total, 2)
        result = exec_log_meal(
            session=db_session, authenticated_user_id=test_user.id,
            meal_type="lunch", items_list=inputs, is_confirmed=False,
        )
        actual_total = result["action_card"]["data"]["total_calories"]
        _safe_print(f"\n  [C04] Resolved: {resolved} | expected={expected_total} actual={actual_total}")
        assert abs(actual_total - expected_total) < 0.05, (
            f"Total calories mismatch: expected={expected_total} actual={actual_total}"
        )

    def test_C05_eaten_ratio_half_calories(self, test_user: User, db_session: Session):
        """
        C05: eaten_ratio=0.5 -> effective_gram halved -> calories halved.
        Verifies the eaten_ratio formula path.
        """
        food_name_input = "Pho bo tai"
        gram = 400.0
        ratio = 0.5
        ref = self._get_food_ref(db_session, food_name_input)
        if ref is None:
            pytest.skip(f"'{food_name_input}' not found — BLOCKED")
        expected_cal = self._expected_cal(ref, gram, ratio)
        result = exec_log_meal(
            session=db_session, authenticated_user_id=test_user.id,
            meal_type="breakfast",
            items_list=[{"food_name": food_name_input, "estimated_gram": gram, "eaten_ratio": ratio}],
            is_confirmed=False,
        )
        actual_cal = result["action_card"]["data"]["items"][0]["calories"]
        effective = round(gram * ratio, 2)
        _safe_print(f"\n  [C05] effective_gram={effective} expected={expected_cal} actual={actual_cal}")
        assert abs(actual_cal - expected_cal) < 0.01, (
            f"eaten_ratio=0.5 calories mismatch:\n"
            f"  effective_gram={effective} expected={expected_cal} actual={actual_cal}"
        )

    def test_C06_confirmed_user_isolation(self, test_user: User, db_session: Session):
        """
        C06: After is_confirmed=True, verify meal.user_id == test_user.id (data isolation).
        Also verifies meal_items.estimated_gram matches input.
        All checks in :memory: DB only.
        """
        food_name_input = "Pho bo tai"
        gram = 200.0
        ref = self._get_food_ref(db_session, food_name_input)
        if ref is None:
            pytest.skip(f"'{food_name_input}' not found — BLOCKED")
        result = exec_log_meal(
            session=db_session, authenticated_user_id=test_user.id,
            meal_type="dinner",
            items_list=[{"food_name": food_name_input, "estimated_gram": gram}],
            is_confirmed=True,
        )
        assert result["meal_id"] is not None
        db_session.expire_all()
        meal = db_session.get(Meal, result["meal_id"])
        assert meal is not None
        assert meal.user_id == test_user.id, (
            f"Data isolation violation: meal.user_id={meal.user_id} != test_user.id={test_user.id}"
        )
        db_items = db_session.exec(select(MealItem).where(MealItem.meal_id == result["meal_id"])).all()
        assert db_items, "MealItems must exist in DB"
        # 1. Kiểm tra món được nhận diện
        assert db_items[0].food_id == ref.id, f"food_id mismatch: {db_items[0].food_id} != {ref.id}"
        # 2. Kiểm tra gram lưu trong DB
        assert abs(db_items[0].estimated_gram - gram) < 0.01, f"gram mismatch: {db_items[0].estimated_gram} != {gram}"
        # 3. Kiểm tra calo lưu trong DB
        expected_cal = self._expected_cal(ref, gram)
        assert abs(db_items[0].estimated_calories - expected_cal) < 0.01, (
            f"calories mismatch: {db_items[0].estimated_calories} != {expected_cal}"
        )

    def test_C07_zero_trust_strips_injected_user_id(self, test_user: User, db_session: Session):
        """
        C07: dispatch_tool_call strips injected user_id / authenticated_user_id (Zero-Trust).
        Request with forged user_id=99999 must still use test_user.id internally.
        """
        result = dispatch_tool_call(
            session=db_session, authenticated_user_id=test_user.id,
            tool_name="log_meal",
            tool_args={
                "meal_type": "lunch",
                "items": [{"food_name": "Pho bo tai", "estimated_gram": 400.0}],
                "is_confirmed": False,
                "user_id": 99999,              # injected - must be stripped
                "authenticated_user_id": 99999, # injected - must be stripped
            },
        )
        assert result["tool_name"] == "log_meal"
        assert result["requires_confirmation"] is True
        assert result.get("meal_id") is None, "Preview must not persist"

    def test_C08_get_daily_nutrition_schema(self, test_user: User, db_session: Session):
        """C08: get_daily_nutrition returns all required schema fields."""
        result = dispatch_tool_call(
            session=db_session, authenticated_user_id=test_user.id,
            tool_name="get_daily_nutrition",
            tool_args={"date_str": "today"},
        )
        for key in ("tool_name", "consumed", "remaining", "targets", "meals"):
            assert key in result, f"Missing field '{key}' in get_daily_nutrition result"
        assert result["tool_name"] == "get_daily_nutrition"
        assert isinstance(result["consumed"]["calories"], (int, float))

    def test_C09_recommend_meals_schema(self, test_user: User, db_session: Session):
        """C09: recommend_meals returns list with food_name and estimated_calories per item."""
        result = dispatch_tool_call(
            session=db_session, authenticated_user_id=test_user.id,
            tool_name="recommend_meals", tool_args={},
        )
        assert result["tool_name"] == "recommend_meals"
        assert "recommendations" in result
        recs = result["recommendations"]
        if recs:
            assert "food_name" in recs[0], "Each recommendation must have food_name"
            assert "estimated_calories" in recs[0], "Each recommendation must have estimated_calories"
            assert isinstance(recs[0]["estimated_calories"], (int, float))
            _safe_print(f"\n  [C09] {len(recs)} recommendations, first: {recs[0]['food_name']} ({recs[0]['estimated_calories']} kcal)")

    def test_C10_progress_summary_avg_daily_calories_q22(self, test_user: User, db_session: Session):
        """
        C10: Verify get_progress_summary(days_range=30) supports avg_daily_calories.
        This is the capability check for Q22 ('avg daily calories over 30 days').
        If avg_daily_calories is missing, marks as xfail (not a hard failure).
        """
        result = dispatch_tool_call(
            session=db_session, authenticated_user_id=test_user.id,
            tool_name="get_progress_summary", tool_args={"days_range": 30},
        )
        assert result["tool_name"] == "get_progress_summary"
        for key in ("logged_days_count", "weight_logs"):
            assert key in result, f"Required field '{key}' missing from get_progress_summary"
        if "avg_daily_calories" not in result:
            pytest.xfail("avg_daily_calories not in get_progress_summary - Q22 partially unsupported")
        assert isinstance(result["avg_daily_calories"], (int, float))
        _safe_print(f"\n  [C10] Q22 supported: avg_daily_calories={result['avg_daily_calories']}")

    def test_C11_invalid_tool_name_raises(self, test_user: User, db_session: Session):
        """C11: Unknown tool name must raise ValueError (prevents tool injection)."""
        with pytest.raises(ValueError):
            dispatch_tool_call(
                session=db_session, authenticated_user_id=test_user.id,
                tool_name="nonexistent_tool_xyz_w4", tool_args={},
            )


# ==============================================================================
# TEST CLASS 3: ACCURACY SUMMARY
# ==============================================================================


class TestAccuracySummary:
    """Print and assert real router accuracy after all Q01-Q30 have run."""

    def test_real_router_accuracy_summary(self, api_client):
        """
        Compute and assert accuracy >= 95% on REAL router endpoint.
        Threshold: math.ceil(30 * 0.95) = 29 (not int(30*0.95) = 28).
        """
        results = list(TestRealRouterAccuracy.RESULTS)
        if not results:
            for qid, msg, expected in ALL_QUESTIONS:
                resp = api_client.post("/api/v1/assistant/chat", json={"message": msg})
                if resp.status_code == 200:
                    tool_res = resp.json().get("tool_result")
                    actual = tool_res.get("tool_name") if tool_res else None
                else:
                    actual = None
                results.append({
                    "id": qid,
                    "msg": msg,
                    "expected": expected,
                    "actual": actual,
                    "correct": actual == expected,
                })

        total = len(results)
        correct_count = sum(1 for r in results if r["correct"])
        accuracy = (correct_count / total * 100.0) if total else 0.0

        # Phép tính hiển thị ngưỡng 95%:
        # Với 30 câu hỏi:
        #   28 / 30 = 93.33% (< 95.00%)
        #   29 / 30 = 96.67% (>= 95.00%)
        #   30 / 30 = 100.00%
        # Do đó, math.ceil(total * 0.95) = 29. Cần ÍT NHẤT 29 câu đúng để vượt ngưỡng 95%.
        threshold_n = math.ceil(total * 0.95) if total else 0
        min_pct_needed = (threshold_n / total * 100.0) if total else 95.0

        sep = "=" * 65
        lines = [
            "", sep,
            "REAL ROUTER (FASTAPI TESTCLIENT) ACCURACY REPORT",
            "Endpoint: POST /api/v1/assistant/chat (SQLite :memory: isolated)",
            sep,
            f"{'ID':<6} {'Expected':<24} {'Actual':<24} {'OK':<5}",
            "-" * 65,
        ]
        for r in results:
            ok = "PASS" if r["correct"] else "FAIL"
            lines.append(f"{r['id']:<6} {str(r['expected']):<24} {str(r['actual']):<24} {ok:<5}")
        lines += [
            "-" * 65,
            f"Total={total}  Correct={correct_count}  Failed={total-correct_count}",
            f"Accuracy: {accuracy:.2f}%",
            f"Target: >= 95.00% (cần ít nhất {threshold_n}/{total} câu đúng = {min_pct_needed:.2f}%)",
            f"Status: {'PASS' if correct_count >= threshold_n else 'FAIL - dưới ngưỡng 95%'}",
            sep,
        ]
        import sys
        report = "\n".join(lines)
        try:
            sys.stdout.write(report + "\n")
            sys.stdout.flush()
        except Exception:
            pass

        assert correct_count >= threshold_n, (
            f"Real router accuracy = {accuracy:.2f}% ({correct_count}/{total}) < ngưỡng 95.00%.\n"
            f"Với {total} câu, cần ít nhất {threshold_n}/{total} câu đúng ({min_pct_needed:.2f}%) để đạt ngưỡng >= 95%.\n"
            f"Thực tế chỉ đạt: {correct_count}/{total} ({accuracy:.2f}%).\n"
            f"LƯU Ý: Tuyệt đối không sửa expected result để làm đẹp tỷ lệ.\n"
            f"\nDanh sách {total - correct_count} câu thất bại:\n" + "\n".join(
                f"  [{r['id']}] Mong đợi: {r['expected']!r} | Thực tế: {r['actual']!r} | Câu: '{r.get('msg', '')}'"
                for r in results if not r["correct"]
            )
        )
