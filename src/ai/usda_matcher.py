"""
src/ai/usda_matcher.py
Tra cứu dinh dưỡng chuẩn USDA (bảng usda_foods) theo tên món tiếng Anh do AI Vision trả về.

Tên USDA có dạng "Pizza, cheese, from frozen, thin crust": danh từ chính đứng đầu, sau đó là mô tả.
Bộ so khớp dùng chỉ mục từ khóa (inverted index) và chấm điểm theo mức độ phủ từ khóa hai chiều,
ưu tiên món đã chế biến (FNDDS) và mô tả ngắn gọn (dạng phổ biến nhất).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger("nutrisnap.ai.usda")

_STOPWORDS = {
    "a", "an", "and", "as", "for", "from", "in", "made", "nfs", "ns", "of", "on", "or", "the", "to",
    "type", "with", "without", "style", "food", "dish", "plain", "regular",
}
# Từ làm đổi bản chất món (dạng khô, chay, nước sốt, bột pha, đồ ăn trẻ em...). Nếu mô tả USDA có
# mà tên cần tìm không có thì trừ điểm, để "Apple" không ghép thành "Apple, dried".
_MODIFIER_PENALTY = 0.15
_MODIFIERS = {
    "dried", "dry", "dehydrated", "meatless", "imitation", "substitute", "dressing", "sauce", "gravy",
    "powder", "mix", "flour", "baby", "toddler", "formula", "canned", "frozen", "concentrate", "syrup",
    "low", "reduced", "free", "diet", "light", "fat", "sodium", "sugar", "unprepared", "raw",
    "seasoning", "flavor", "flavored", "topping", "filling", "batter", "dough",
}
MIN_QUERY_COVERAGE = 0.6
MIN_SCORE = 0.55


@dataclass(frozen=True)
class UsdaMatch:
    fdc_id: int
    description: str
    source: str
    score: float
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float


def _tokens(text: str) -> list[str]:
    words = re.findall(r"[a-z]+", text.lower())
    out = []
    negated = False
    for w in words:
        # "no dressing", "without salt": từ bị phủ định không phải thành phần của món
        if w in ("no", "without"):
            negated = True
            continue
        if negated:
            negated = False
            continue
        if w in _STOPWORDS or len(w) < 2:
            continue
        # Số nhiều đơn giản: noodles -> noodle, tomatoes -> tomato
        if len(w) > 4 and w.endswith("es") and not w.endswith("ses"):
            w = w[:-2]
        elif len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        out.append(w)
    return out


class UsdaMatcher:
    """Bộ nhớ đệm bảng usda_foods và chỉ mục từ khóa; nạp lười ở lần tra cứu đầu tiên."""

    def __init__(self) -> None:
        self._rows: list[dict] = []
        self._token_sets: list[set[str]] = []
        self._index: dict[str, list[int]] = {}
        self._loaded = False

    def _load(self) -> None:
        self._loaded = True
        try:
            from sqlmodel import Session, select

            from src.backend.models import database
            from src.backend.models.schema import UsdaFood

            with Session(database.engine) as session:
                foods = session.exec(select(UsdaFood)).all()
        except Exception as exc:
            logger.warning("Không nạp được bảng usda_foods: %s", exc)
            return
        for i, f in enumerate(foods):
            toks = _tokens(f.description)
            self._rows.append(
                {
                    "fdc_id": f.fdc_id,
                    "description": f.description,
                    "source": f.source,
                    "head": toks[0] if toks else "",
                    "kcal": f.calories_per_100g,
                    "protein": f.protein_per_100g,
                    "carbs": f.carbs_per_100g,
                    "fat": f.fat_per_100g,
                }
            )
            self._token_sets.append(set(toks))
            for t in set(toks):
                self._index.setdefault(t, []).append(i)
        if not foods:
            logger.info("Bảng usda_foods trống. Chạy: python scripts/import_usda.py")

    @property
    def size(self) -> int:
        if not self._loaded:
            self._load()
        return len(self._rows)

    def reload(self) -> None:
        self.__init__()

    def match(self, name_en: Optional[str]) -> Optional[UsdaMatch]:
        """Trả về món USDA phù hợp nhất cho tên tiếng Anh, hoặc None nếu không đủ tin cậy."""
        if not name_en or not name_en.strip():
            return None
        if not self._loaded:
            self._load()
        query = set(_tokens(name_en))
        if not query:
            return None

        candidates: set[int] = set()
        for t in query:
            candidates.update(self._index.get(t, ()))

        best: Optional[tuple[float, int]] = None
        for i in candidates:
            desc = self._token_sets[i]
            common = len(query & desc)
            cov_q = common / len(query)
            if cov_q < MIN_QUERY_COVERAGE:
                continue
            cov_d = common / len(desc)
            row = self._rows[i]
            score = 0.7 * cov_q + 0.3 * cov_d
            if row["head"] in query:
                score += 0.1  # danh từ chính trùng (Pizza, Sushi, Rice...)
            if row["source"] == "fndds":
                score += 0.03  # ưu tiên món đã chế biến
            score -= _MODIFIER_PENALTY * len((desc & _MODIFIERS) - query)
            if best is None or score > best[0] or (score == best[0] and len(desc) < len(self._token_sets[best[1]])):
                best = (score, i)

        if best is None or best[0] < MIN_SCORE:
            return None
        row = self._rows[best[1]]
        return UsdaMatch(
            fdc_id=row["fdc_id"],
            description=row["description"],
            source=row["source"],
            score=round(min(best[0], 1.0), 4),
            calories_per_100g=row["kcal"],
            protein_per_100g=row["protein"],
            carbs_per_100g=row["carbs"],
            fat_per_100g=row["fat"],
        )


usda_matcher = UsdaMatcher()
