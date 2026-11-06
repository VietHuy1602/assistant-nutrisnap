"""
src/backend/services/meal_plan_service.py
Generate Meal Plan – thực đơn gợi ý theo kiểu bữa ăn Việt, cá nhân hoá theo mục tiêu và thói quen.

Nguyên tắc:
- Số liệu dinh dưỡng luôn tính từ bảng food_references (không để AI tự đoán).
- Bữa sáng: một món (phở, bún, bánh mì, xôi, cháo...). Bữa trưa/tối: cơm + món mặn + rau + canh
  (đôi khi là món một đĩa như cơm tấm, bún chả). Bữa phụ: món nhẹ, lành mạnh.
- Mỗi bữa, mỗi ngày khác nhau: không lặp món trong cùng thực đơn khi còn lựa chọn,
  nguồn đạm của trưa và tối trong cùng một ngày khác nhau.
- Cá nhân hoá: bỏ món người dùng không thích, ưu tiên món họ hay ăn, mục tiêu giảm cân tránh món
  chiên/rán, mục tiêu tăng cơ ưu tiên món giàu đạm, tôn trọng ngân sách mỗi ngày.
"""

from __future__ import annotations

import random
import unicodedata
from collections import Counter
from datetime import date, timedelta
from typing import Any

from sqlmodel import Session, col, select

import json

from src.backend.models.schema import FoodDislike, FoodReference, Goal, Meal, MealItem, MealPlan

# ---------------------------------------------------------------------------
# Phân loại món theo tên (bảng món Việt không có cột danh mục)
# ---------------------------------------------------------------------------


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower()).replace("đ", "d")
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


BREAKFAST_PREFIX = ("pho ", "bun ", "hu tieu", "mi quang", "mien ", "banh canh", "chao ", "banh mi ", "xoi ",
                    "banh cuon", "banh bao", "banh uot", "banh gio", "banh hoi", "banh beo", "banh duc")
BREAKFAST_SKIP = ("pho cuon", "pho ap chao", "bun dau", "bun gao xao", "chao trang", "chao dau xanh", "banh mi bo duong",
                  "banh mi que", "xoi sau rieng", "xoi dua", "xoi vo", "bun mam", "banh mi chao", "bun tuoi", "banh mi sandwich", "banh mi trang",
                  "banh pho", "bun kho", "mien kho", "banh canh tuoi")
ONE_PLATE_PREFIX = ("com tam", "com ga", "com suon", "com thit", "com bo", "com ca", "com tom", "com chien", "com rang",
                    "bun cha", "bun thit nuong", "banh xeo", "mi quang", "hu tieu", "com hen", "com vit")
PROTEIN_PREFIX = ("ga ", "uc ga", "canh ga", "dui ga", "vit ", "thit ", "suon ", "bo ", "ca ", "tom ", "muc ", "dau hu",
                  "trung ", "cha ca", "nghe", "so ", "cua ", "ghe ")
PROTEIN_SKIP = ("ca phe", "ca vien", "bo vien", "suon ram", "tai heo", "long ", "doi ", "bao tu", "ga vien", "thit dong",
                "ca kho chien", "ca com chien", "bo dau", "bo sap", "bot ", "ca tim", "ca rot", "ca chua")
VEG_PREFIX = ("rau ", "bi do xao", "bi xanh xao", "ca tim", "dau bap", "dau que", "gia do", "nam ", "su su", "bap cai",
              "sup lo", "rau cu hap", "bong cai", "bi ngoi", "mang xao", "salad rau cu", "salad xa lach")
SOUP_PREFIX = ("canh ",)
SNACK_NAMES = ("sua chua", "yaourt", "trai cay to", "sua dau nanh", "khoai lang luoc", "bap luoc", "sua tuoi khong duong",
               "sinh to bo", "sinh to xoai", "sinh to chuoi", "nuoc dua tuoi", "khoai lang nuong", "sua chua uong")
FRIED_WORDS = ("chien", "ran", "quay", "xoi mo", "gion", "lap xuong", "chay canh")

# Nguồn đạm – dùng để trưa/tối khác nhau và luân phiên giữa các ngày
PROTEIN_GROUPS = [("ga", ("ga ", "uc ga", "canh ga", "dui ga")), ("vit", ("vit ",)), ("heo", ("thit ", "suon ")),
                  ("bo", ("bo ",)), ("ca", ("ca ", "cha ca")), ("hai_san", ("tom ", "muc ", "cua ", "ghe ", "nghe", "so ")),
                  ("dau_hu", ("dau hu",)), ("trung", ("trung ",))]

MEAL_SPLIT = {"breakfast": 0.25, "lunch": 0.35, "dinner": 0.30, "snack": 0.10}
MEAL_LABEL = {"breakfast": "Bữa sáng", "lunch": "Bữa trưa", "dinner": "Bữa tối", "snack": "Bữa phụ"}


def _starts(name: str, prefixes: tuple[str, ...]) -> bool:
    return any(name.startswith(p) for p in prefixes)


def protein_group(food: FoodReference) -> str:
    n = _norm(food.food_name) + " "
    for key, prefixes in PROTEIN_GROUPS:
        if _starts(n, prefixes):
            return key
    return "khac"


def classify(food: FoodReference) -> set[str]:
    n = _norm(food.food_name) + " "
    roles: set[str] = set()
    if n.startswith("com trang"):
        roles.add("rice")
    if _starts(n, BREAKFAST_PREFIX) and not _starts(n, BREAKFAST_SKIP) and not n.startswith("bun bo") or n.startswith("bun bo hue"):
        if not n.startswith(("bun cha", "bun thit nuong")):
            roles.add("breakfast")
    if _starts(n, ONE_PLATE_PREFIX) and not n.startswith(("com trang", "com chien", "com rang", "com chay")):
        roles.add("one_plate")
    if _starts(n, PROTEIN_PREFIX) and not _starts(n, PROTEIN_SKIP) and "salad" not in n:
        roles.add("protein")
    if _starts(n, VEG_PREFIX) and not n.startswith("rau cau"):
        roles.add("veg")
    if _starts(n, SOUP_PREFIX) and "canh ga" not in n and "canh bun" not in n:
        roles.add("soup")
    if _starts(n, SNACK_NAMES):
        roles.add("snack")
    return roles


def is_fried(food: FoodReference) -> bool:
    n = _norm(food.food_name)
    return any(w in n for w in FRIED_WORDS)


# ---------------------------------------------------------------------------
# Hồ sơ người dùng
# ---------------------------------------------------------------------------


def user_profile(session: Session, user_id: int) -> dict[str, Any]:
    goal = session.exec(select(Goal).where(Goal.user_id == user_id)).first()
    rows_d = session.exec(select(FoodDislike).where(FoodDislike.user_id == user_id)).all()
    # "Đã ăn gần đây" chỉ là tạm thời, không chặn món vĩnh viễn
    disliked = {d.food_id for d in rows_d if (d.reason or "") != "ate_recently"}
    avoid_groups = {d.avoid_group for d in rows_d if d.avoid_group}
    rows = session.exec(
        select(MealItem.food_id).join(Meal, Meal.id == MealItem.meal_id).where(Meal.user_id == user_id)
    ).all()
    favourites = Counter(rows)
    return {
        "target_calories": float(goal.target_calories) if goal else 2000.0,
        "target_protein_g": float(goal.target_protein_g) if goal else 100.0,
        "goal_type": goal.goal_type if goal else "maintain",
        "daily_budget_vnd": int(goal.daily_budget_vnd) if goal else 0,
        "disliked": disliked,
        "avoid_groups": avoid_groups,
        "favourites": favourites,
    }


def _has_tokens(name: str, keyword: str) -> bool:
    tokens, kw = _norm(name).split(), keyword.split()
    return any(tokens[i:i + len(kw)] == kw for i in range(len(tokens) - len(kw) + 1)) if kw else False


SPICY_WORDS = ("cay", "sa ot", "ot ", "kim chi")
SWEET_WORDS = ("ham", "rim", "sot", "tron", "chua ngot")
SIMPLE_COOK = ("luoc", "hap", "ap chao", "nuong", "salad", "tron")


# ---------------------------------------------------------------------------
# Tạo thực đơn
# ---------------------------------------------------------------------------


def _item(food: FoodReference, gram: float, role: str) -> dict[str, Any]:
    g = round(max(30.0, min(gram, 600.0)) / 5) * 5
    f = g / 100.0
    return {
        "food_id": food.id,
        "food_name": food.food_name,
        "role": role,
        "grams": g,
        "calories": round(food.calories_per_100g * f, 1),
        "protein_g": round(food.protein_per_100g * f, 1),
        "carbs_g": round(food.carbs_per_100g * f, 1),
        "fat_g": round(food.fat_per_100g * f, 1),
        # Giá trong bảng là giá một suất (khẩu phần mặc định)
        "price_vnd": int(round(food.avg_price_vnd * g / max(food.default_serving_g, 1) / 1000) * 1000),
    }


def _totals(items: list[dict[str, Any]]) -> dict[str, float]:
    return {k: round(sum(i[k] for i in items), 1) for k in ("calories", "protein_g", "carbs_g", "fat_g", "price_vnd")}


class Planner:
    def __init__(self, session: Session, user_id: int, seed: int | None = None):
        self.p = user_profile(session, user_id)
        from src.backend.services.preference_service import GROUP_WORDS, get_preferences, planner_rules

        # Hồ sơ từ bộ câu hỏi khi tạo tài khoản (do AI tổng hợp)
        self.pref = planner_rules(get_preferences(session, user_id))
        self.p["avoid_groups"] = set(self.p["avoid_groups"]) | self.pref.get("avoid_groups", set())
        group_words = {w for ws in GROUP_WORDS.values() for w in ws}
        avoid_kw = [k for k in self.pref.get("avoid_keywords", []) if k not in group_words]  # nhóm đạm đã lọc theo avoid_groups
        if self.pref.get("budget"):
            self.p["daily_budget_vnd"] = int(self.pref["budget"])
        foods = session.exec(select(FoodReference)).all()
        self.by_id = {f.id: f for f in foods}
        self.pools: dict[str, list[FoodReference]] = {k: [] for k in ("rice", "breakfast", "one_plate", "protein", "veg", "soup", "snack")}
        for f in foods:
            if f.id in self.p["disliked"] or f.calories_per_100g <= 0:
                continue
            if protein_group(f) in self.p["avoid_groups"]:
                continue
            if any(_has_tokens(f.food_name, k) for k in avoid_kw):  # dị ứng / không ăn được
                continue
            for r in classify(f):
                self.pools[r].append(f)
        self.rng = random.Random(seed)
        self.used: Counter = Counter()
        # Món đã có trong thực đơn đã đồng ý 7 ngày gần nhất: không lặp lại trong tuần
        self.recent: set[int] = recent_plan_food_ids(session, user_id)

    # Điểm ưu tiên: hay ăn +, đã dùng trong thực đơn −, chiên/rán − khi giảm cân, giàu đạm + khi tăng cơ
    def _score(self, f: FoodReference) -> float:
        s = self.rng.random()
        s += min(self.p["favourites"].get(f.id, 0), 5) * 0.15
        s -= self.used[f.id] * 3.0
        goal = self.p["goal_type"]
        if goal == "lose_weight":
            s -= 0.8 if is_fried(f) else 0
            s -= 0.3 if f.calories_per_100g > 220 else 0
        if goal == "gain_muscle":
            s += min(f.protein_per_100g, 30) / 30 * 0.6
        pref = self.pref
        n = _norm(f.food_name)
        if pref.get("diet") == "B":  # Eat Clean
            s -= 1.2 if is_fried(f) else 0
            s += 0.4 if any(w in n for w in SIMPLE_COOK) else 0
        if pref.get("diet") == "C":  # Low-Carb
            s -= min(f.carbs_per_100g, 40) / 40 * 0.8
        taste = pref.get("taste")
        if taste == "A":
            s -= 0.6 if any(w in n for w in SPICY_WORDS) else 0
        elif taste == "B":
            s += 0.4 if any(w in n for w in SPICY_WORDS) or "kho" in n or "xao" in n else 0
        elif taste == "C":
            s += 0.3 if any(w in n for w in SWEET_WORDS) else 0
        if protein_group(f) in pref.get("protein_groups", set()):
            s += 0.6
        if pref.get("cooking") in ("A", "C") and any(w in n for w in SIMPLE_COOK):
            s += 0.15  # tự nấu: ưu tiên món dễ nấu
        budget = self.p["daily_budget_vnd"]
        if budget and f.avg_price_vnd > budget * 0.4:
            s -= 0.6  # quá đắt so với ngân sách một ngày
        if budget:
            # Giá trên mỗi kcal so với mức ngân sách cả ngày cho phép: món "đắt so với năng lượng" bị trừ điểm
            kcal_serving = f.calories_per_100g * max(f.default_serving_g, 1) / 100
            allowed = budget / max(self.p["target_calories"], 1)
            if kcal_serving > 0:
                s -= min(max(f.avg_price_vnd / kcal_serving / allowed - 1, 0), 3) * 0.7
        return s

    def _pick(self, role: str, exclude: set[int] = frozenset(), avoid_groups: set[str] = frozenset(),
              accept=None) -> FoodReference | None:
        """Chọn món chưa dùng trong tuần. Cơm trắng là món nền nên được lặp lại."""
        base = [f for f in self.pools[role] if f.id not in exclude and (accept is None or accept(f))]
        fresh = base if role == "rice" else [f for f in base if not self.used[f.id] and f.id not in self.recent]
        pool = [f for f in fresh if role != "protein" or protein_group(f) not in avoid_groups] or fresh
        if not pool and role in ("snack",):
            pool = [f for f in base if not self.used[f.id]]  # món phụ ít lựa chọn: cho phép trùng tuần trước
        if not pool:
            return None
        best = max(pool, key=self._score)
        self.used[best.id] += 1
        return best

    def breakfast(self, kcal: float, exclude: set[int] = frozenset()) -> list[dict[str, Any]]:
        f = self._pick("breakfast", exclude)
        if not f:
            return []
        # Khẩu phần thật (1 tô / 1 ổ / 1 đĩa), không phóng to vô lý; thiếu năng lượng thì thêm món kèm
        gram = min(kcal / f.calories_per_100g * 100, max(f.default_serving_g, 150) * 1.3)
        items = [_item(f, gram, "main")]
        missing = kcal - items[0]["calories"]
        if missing > 150:
            side = self._pick("snack", exclude)
            if side:
                items.append(_item(side, max(100.0, min(300.0, missing / max(side.calories_per_100g, 1) * 100)), "side"))
        return items

    def main_meal(self, kcal: float, avoid_groups: set[str], one_plate_ok: bool, exclude: set[int] = frozenset()) -> list[dict[str, Any]]:
        if one_plate_ok and self.pools["one_plate"] and self.rng.random() < 0.25:
            f = self._pick("one_plate", exclude)
            if f:
                veg = self._pick("veg", exclude)
                items = [_item(f, (kcal * 0.85) / f.calories_per_100g * 100, "main")]
                if veg:
                    items.append(_item(veg, 120, "veg"))
                return self._fit(items, kcal)
        items = self._family_meal(kcal, avoid_groups, exclude)
        return self._fit(items, kcal)

    def _fit(self, items: list[dict[str, Any]], kcal: float) -> list[dict[str, Any]]:
        """Co giãn cơm và món mặn (giới hạn khẩu phần hợp lý) để tổng calo bữa sát mục tiêu."""
        limits = {"rice": (60.0, 100.0 if self.pref.get("diet") == "C" else 300.0), "protein": (60.0, 250.0), "main": (150.0, 550.0)}
        for _ in range(3):
            adj = [i for i in items if i["role"] in limits]
            fixed = sum(i["calories"] for i in items if i["role"] not in limits)
            cur = sum(i["calories"] for i in adj)
            if not adj or cur <= 0:
                break
            factor = max(kcal - fixed, cur * 0.4) / cur
            if abs(factor - 1) < 0.04:
                break
            for k, it in enumerate(items):
                if it["role"] in limits:
                    lo, hi = limits[it["role"]]
                    if it["role"] == "protein" and "trung" in _norm(it["food_name"]):
                        hi = 120.0
                    items[k] = _item(self.by_id[it["food_id"]], max(lo, min(hi, it["grams"] * factor)), it["role"])
        return items

    def _family_meal(self, kcal: float, avoid_groups: set[str], exclude: set[int]) -> list[dict[str, Any]]:
        rice = self.pools["rice"][0] if self.pools["rice"] else None
        # Bữa chính nhiều năng lượng: không dùng trứng làm món mặn duy nhất (khẩu phần bị giới hạn 2 quả)
        prot_exclude = set(exclude) | ({f.id for f in self.pools["protein"] if "trung" in _norm(f.food_name)} if kcal > 800 else set())
        prot = self._pick("protein", prot_exclude, avoid_groups)
        veg = self._pick("veg", exclude)
        soup = self._pick("soup", exclude)
        items: list[dict[str, Any]] = []
        fixed = 0.0
        small = kcal < 550
        if veg:
            items.append(_item(veg, 120 if small else 150, "veg")); fixed += items[-1]["calories"]
        if soup:
            items.append(_item(soup, 200 if small else 250, "soup")); fixed += items[-1]["calories"]
        rest = max(kcal - fixed, kcal * 0.5)
        if prot:
            cap = max(prot.default_serving_g, 100) * 1.6
            if "trung" in _norm(prot.food_name):
                cap = 120.0  # tối đa 2 quả trứng
            pg = max(min(100.0, cap), min(cap, 220.0, rest * 0.45 / prot.calories_per_100g * 100))
            if self.p["goal_type"] == "gain_muscle":
                pg = min(cap * 1.2, 250.0, pg * 1.2)
            items.insert(0, _item(prot, pg, "protein"))
            rest -= items[0]["calories"]
        if rice:
            rg = max(100.0, min(300.0, rest / rice.calories_per_100g * 100))
            if self.pref.get("diet") == "C":  # Low-Carb: tối đa nửa chén cơm, bù bằng món mặn
                rg = 80.0
            items.insert(0, _item(rice, rg, "rice"))
        return items

    def snack(self, kcal: float, exclude: set[int] = frozenset()) -> list[dict[str, Any]]:
        f = self._pick("snack", exclude)
        if not f:
            return []
        return [_item(f, max(100.0, min(300.0, kcal / max(f.calories_per_100g, 1) * 100)), "snack")]

    def split(self) -> dict[str, float]:
        """Tỷ lệ calo theo thói quen số bữa trong ngày (câu 10)."""
        pattern = self.pref.get("meals")
        if pattern == "A":
            return {"breakfast": 0.28, "lunch": 0.38, "dinner": 0.34}
        if pattern == "C":
            return {"lunch": 0.5, "dinner": 0.5}
        if pattern == "D":
            return {"breakfast": 0.22, "lunch": 0.30, "snack": 0.18, "dinner": 0.30}
        return MEAL_SPLIT

    def _fit_budget(self, got: dict[str, list[dict[str, Any]]]) -> None:
        """Ngân sách là cho CẢ NGÀY (câu 11): tổng chi phí các bữa không vượt quá. Nếu vượt, đổi dần món
        đắt nhất sang món cùng vai trò rẻ hơn (giữ năng lượng tương đương) cho tới khi vừa ngân sách."""
        budget = self.p["daily_budget_vnd"]
        if not budget:
            return
        pool_of = {"protein": "protein", "veg": "veg", "soup": "soup", "snack": "snack", "side": "snack"}
        allow_repeat = False
        for _ in range(24):
            total = sum(i["price_vnd"] for items in got.values() for i in items)
            if total <= budget:
                return
            cands = [(i["price_vnd"], k, n) for k, items in got.items() for n, i in enumerate(items) if i["role"] != "rice"]
            swapped = False
            for price, key, n in sorted(cands, reverse=True):
                it = got[key][n]
                role = it["role"]
                pool = pool_of.get(role) or ("breakfast" if key == "breakfast" else "one_plate")
                in_day = {i["food_id"] for items in got.values() for i in items}
                options = []
                for f in self.pools[pool]:
                    if f.id in in_day or f.calories_per_100g <= 0:
                        continue
                    # Ưu tiên món chưa dùng trong tuần; chỉ khi hết cách mới lặp lại món rẻ của ngày khác
                    if not allow_repeat and (self.used[f.id] or f.id in self.recent):
                        continue
                    if role == "protein" and protein_group(f) in self.p["avoid_groups"]:
                        continue
                    gram = it["calories"] / f.calories_per_100g * 100
                    cap = 350.0 if role in ("veg", "soup", "snack", "side") else max(f.default_serving_g, 100) * 1.6
                    new = _item(f, min(gram, cap), role)
                    if new["price_vnd"] < price and new["calories"] >= it["calories"] * 0.8:  # giữ năng lượng bữa
                        options.append(new)
                if options:
                    best = max(options, key=lambda o: self._score(self.by_id[o["food_id"]]) - o["price_vnd"] / max(budget, 1) * 3)
                    self.used[it["food_id"]] -= 1
                    self.used[best["food_id"]] += 1
                    got[key][n] = best
                    swapped = True
                    break
            if not swapped:
                if allow_repeat:
                    return  # không còn món rẻ hơn: giữ thực đơn gần ngân sách nhất có thể
                allow_repeat = True

    def day(self, d: date) -> dict[str, Any]:
        target = self.p["target_calories"]
        split = self.split()
        meals = []
        got: dict[str, list[dict[str, Any]]] = {}
        if "breakfast" in split:
            got["breakfast"] = self.breakfast(target * split["breakfast"])
        got["lunch"] = self.main_meal(target * split["lunch"], set(), one_plate_ok=True)
        lunch_groups = {protein_group(self.by_id[i["food_id"]]) for i in got["lunch"] if i["role"] in ("protein", "main")}
        got["dinner"] = self.main_meal(target * split["dinner"], lunch_groups, one_plate_ok=False)
        if "snack" in split:
            got["snack"] = self.snack(target * split["snack"])
        self._fit_budget(got)
        for key in ("breakfast", "lunch", "snack", "dinner"):
            if key not in got:
                continue
            items = got[key]
            meals.append({"meal_type": key, "label": MEAL_LABEL[key], "items": items, "totals": _totals(items),
                          "target_calories": round(target * split[key])})
        all_items = [i for m in meals for i in m["items"]]
        return {"date": d.isoformat(), "meals": meals, "totals": _totals(all_items)}


def generate_plan(session: Session, user_id: int, start: date, days: int, seed: int | None = None) -> dict[str, Any]:
    days = max(1, min(days, 7))
    pl = Planner(session, user_id, seed)
    plan_days = [pl.day(start + timedelta(days=i)) for i in range(days)]
    return {
        "start_date": start.isoformat(),
        "days": days,
        "target_calories": round(pl.p["target_calories"]),
        "target_protein_g": round(pl.p["target_protein_g"]),
        "goal_type": pl.p["goal_type"],
        "daily_budget_vnd": pl.p["daily_budget_vnd"],
        "plan": plan_days,
        "disclaimer": "Thực đơn và số liệu chỉ mang tính tham khảo, không thay thế tư vấn của chuyên gia dinh dưỡng.",
    }



def regenerate_days(session: Session, user_id: int, plan: dict[str, Any], day_indexes: list[int]) -> dict[str, Any]:
    """Tạo lại chỉ những ngày được chọn; các ngày khác (ví dụ hôm nay đã ăn theo) giữ nguyên.
    Món mới không trùng với món của các ngày còn lại trong thực đơn, cũng không trùng món cũ của ngày bị đổi."""
    days = plan["plan"]
    targets = sorted({i for i in day_indexes if 0 <= i < len(days)})
    if not targets:
        raise IndexError("day_indexes")
    pl = Planner(session, user_id)
    for d in days:  # mọi món hiện có (kể cả ngày sắp đổi) đều tính là đã dùng
        for m in d["meals"]:
            for it in m["items"]:
                pl.used[it["food_id"]] += 1
    new_plan = dict(plan)
    new_plan["plan"] = list(days)
    for i in targets:
        new_plan["plan"][i] = pl.day(date.fromisoformat(days[i]["date"]))
    new_plan.pop("replace_message", None)
    return new_plan


REPLACE_REASONS = {
    "taste": "Không hợp khẩu vị",
    "ingredient": "Không thích nguyên liệu chính",
    "allergy": "Dị ứng / không ăn được",
    "too_heavy": "Nhiều calo, nhiều dầu mỡ",
    "too_expensive": "Giá quá cao",
    "hard_to_cook": "Khó nấu, mất thời gian",
    "ate_recently": "Mới ăn gần đây",
    "other": "Lý do khác",
}
SIMPLE_WORDS = ("luoc", "hap", "ap chao", "xao", "nuong", "tron", "salad", "canh", "chien trung", "op la", "kho")
GROUP_LABEL = {"ga": "gà", "vit": "vịt", "heo": "thịt heo", "bo": "thịt bò", "ca": "cá", "hai_san": "hải sản",
               "dau_hu": "đậu hũ", "trung": "trứng"}


def replace_item(session: Session, user_id: int, plan: dict[str, Any], day_index: int, meal_type: str, food_id: int,
                 remember_dislike: bool = True, reason: str = "taste", note: str | None = None) -> dict[str, Any]:
    """Đổi món theo phản hồi của người dùng, giữ calo bữa tương đương và không trùng món trong tuần.

    - too_heavy: món nhẹ hơn, không chiên rán · too_expensive: món rẻ hơn · hard_to_cook: món chế biến đơn giản
    - ingredient / allergy: tránh hẳn nguồn đạm đó (ghi nhớ cho các thực đơn sau)
    - taste / other: không gợi ý lại món này · ate_recently: chỉ đổi lần này, không chặn món
    """
    reason = reason if reason in REPLACE_REASONS else "other"
    day = plan["plan"][day_index]
    meal = next(m for m in day["meals"] if m["meal_type"] == meal_type)
    idx = next(i for i, it in enumerate(meal["items"]) if it["food_id"] == food_id)
    old = meal["items"][idx]
    old_food = session.get(FoodReference, food_id)
    group = protein_group(old_food) if old_food else "khac"
    avoid_group = group if reason in ("ingredient", "allergy") and group != "khac" else None

    if remember_dislike and old_food:
        row = session.exec(select(FoodDislike).where(FoodDislike.user_id == user_id, FoodDislike.food_id == food_id)).first()
        if row is None:
            row = FoodDislike(user_id=user_id, food_id=food_id)
        row.reason, row.note, row.avoid_group = reason, (note or None) and note[:200], avoid_group
        session.add(row)
        session.commit()

    pl = Planner(session, user_id)
    for d in plan["plan"]:
        for m in d["meals"]:
            for it in m["items"]:
                pl.used[it["food_id"]] += 1
    role = old["role"]
    pool_role = {"main": "breakfast" if meal_type == "breakfast" else "one_plate", "protein": "protein", "veg": "veg",
                 "soup": "soup", "snack": "snack", "side": "snack", "rice": "rice"}[role]
    avoid: set[str] = set(pl.p["avoid_groups"])
    if role == "protein":
        other = "dinner" if meal_type == "lunch" else "lunch"
        om = next((m for m in day["meals"] if m["meal_type"] == other), None)
        if om:
            avoid |= {protein_group(pl.by_id[i["food_id"]]) for i in om["items"] if i["role"] in ("protein", "main") and i["food_id"] in pl.by_id}

    old_kcal_serv = (old_food.calories_per_100g * old_food.default_serving_g / 100) if old_food else 0
    old_price = old_food.avg_price_vnd if old_food else 0
    accept = None
    if reason == "too_heavy":
        accept = lambda f: not is_fried(f) and f.calories_per_100g * f.default_serving_g / 100 < old_kcal_serv * 0.85  # noqa: E731
    elif reason == "too_expensive":
        accept = lambda f: 0 < f.avg_price_vnd < old_price * 0.8 or f.avg_price_vnd == 0  # noqa: E731
    elif reason == "hard_to_cook":
        accept = lambda f: any(w in _norm(f.food_name) for w in SIMPLE_WORDS)  # noqa: E731
    elif avoid_group:
        accept = lambda f: protein_group(f) != avoid_group  # noqa: E731

    new = pl._pick(pool_role, {food_id}, avoid, accept) or pl._pick(pool_role, {food_id}, avoid)
    if not new:
        plan["replace_message"] = "Chưa tìm được món khác phù hợp cho bữa này."
        return plan
    gram = old["calories"] / new.calories_per_100g * 100 if new.calories_per_100g else old["grams"]
    if role in ("veg", "soup"):
        gram = old["grams"]
    if reason == "too_heavy":
        gram = min(gram, max(new.default_serving_g, 100))
    meal["items"][idx] = _item(new, gram, role)
    meal["totals"] = _totals(meal["items"])
    day["totals"] = _totals([i for m in day["meals"] for i in m["items"]])

    why = {
        "too_heavy": f"nhẹ hơn ({meal['items'][idx]['calories']:.0f} kcal), không chiên rán",
        "too_expensive": "giá mềm hơn",
        "hard_to_cook": "cách làm đơn giản, nhanh",
        "ate_recently": "để đổi vị",
        "ingredient": f"không có {GROUP_LABEL.get(group, 'nguyên liệu đó')}",
        "allergy": f"không có {GROUP_LABEL.get(group, 'nguyên liệu đó')} – NutriSnap sẽ tránh nguyên liệu này",
    }.get(reason, "hợp khẩu vị hơn")
    plan["replace_message"] = f"Đã đổi “{old['food_name']}” thành “{new.food_name}”: {why}."
    return plan


def recent_plan_food_ids(session: Session, user_id: int, days: int = 7) -> set[int]:
    since = (date.today() - timedelta(days=days)).isoformat()
    ids: set[int] = set()
    for row in session.exec(select(MealPlan).where(MealPlan.user_id == user_id, MealPlan.start_date >= since)).all():
        try:
            plan = json.loads(row.plan_json)
            ids |= {it["food_id"] for d in plan.get("plan", []) for m in d.get("meals", []) for it in m.get("items", []) if it.get("role") != "rice"}
        except (ValueError, TypeError, KeyError):
            continue
    return ids
