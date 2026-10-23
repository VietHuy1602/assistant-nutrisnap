"""
src/ai/fuzzy_matcher.py
Module ánh xạ mờ (Fuzzy Matching) tên món ăn từ AI Vision vào CSDL chuẩn food_references / vn_foods.csv.
Chuyên trách: Lê Hoàng Phú Hiếu (MSSV: 25127049 - Cặp 3: AI Intelligence & QA/Benchmarking).

Nhiệm vụ trọng tâm Tuần 3 (W3 - Dòng 37 & 38):
1. Chuẩn hóa tên món tiếng Việt (loại bỏ dấu, ký tự đặc biệt, xử lý đ/Đ, chuyển chữ thường).
2. Tính toán độ tương đồng kết hợp giữa n-gram sequence matching và token-overlap.
3. Đối chiếu dish_name từ Vision API với danh mục 500 món ăn chuẩn trong CSDL/CSV.
4. Trả về món ăn khớp nhất kèm food_id, match_score, và thông tin dinh dưỡng cơ sở trên 100g.
5. Kiểm soát ngưỡng tin cậy (threshold, mặc định 0.5):
   - match_score >= threshold: Đánh dấu is_matched=True, lấy food_id và dinh dưỡng chuẩn.
   - match_score < threshold: Giữ nguyên tên gốc, is_matched=False, food_id=None để người dùng sửa trên UI.
6. Tính toán dinh dưỡng tất định (Zero-Hallucination Math):
   Calo = (estimated_gram / 100.0) * calories_per_100g.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Optional

import pandas as pd
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("nutrisnap.ai.fuzzy")

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_CSV_PATH = ROOT_DIR / "data" / "vn_foods.csv"


# ==============================================================================
# 1. PYDANTIC SCHEMAS CHO FUZZY MATCHING
# ==============================================================================


class MatchedFood(BaseModel):
    """Kết quả ánh xạ của một món ăn vào CSDL tham chiếu."""

    original_query: str = Field(..., description="Tên món ăn gốc do Vision API nhận diện")
    food_id: Optional[int] = Field(default=None, description="ID trong CSDL food_references nếu khớp")
    matched_food_name: Optional[str] = Field(
        default=None, description="Tên món ăn chuẩn trong CSDL nếu khớp"
    )
    match_score: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Độ tương đồng từ 0.0 đến 1.0"
    )
    is_matched: bool = Field(
        default=False, description="Cờ xác định có vượt qua ngưỡng tương đồng (threshold) hay không"
    )
    calories_per_100g: float = Field(default=0.0, description="Calo trên 100g món chuẩn")
    protein_per_100g: float = Field(default=0.0, description="Protein (g) trên 100g món chuẩn")
    carbs_per_100g: float = Field(default=0.0, description="Carbs (g) trên 100g món chuẩn")
    fat_per_100g: float = Field(default=0.0, description="Fat (g) trên 100g món chuẩn")
    avg_price_vnd: int = Field(default=0, description="Giá trung bình (VNĐ)")

    model_config = ConfigDict(extra="ignore")


class DishNutritionCalculated(BaseModel):
    """Thông tin dinh dưỡng tính toán tất định theo khối lượng gam thực tế."""

    food_id: Optional[int]
    food_name: str
    matched_food_name: Optional[str]
    match_score: float
    is_matched: bool
    estimated_gram: float
    estimated_calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    confidence: float = 1.0

    model_config = ConfigDict(extra="ignore")


# ==============================================================================
# 2. HÀM CHUẨN HÓA TIẾNG VIỆT & TÍNH ĐIỂM TƯƠNG ĐỒNG (STRING SIMILARITY)
# ==============================================================================


def strip_vietnamese_accents(text: str) -> str:
    """
    Chuẩn hóa chuỗi tiếng Việt:
    - Chuyển chữ 'đ', 'Đ' thành 'd', 'D'.
    - Bóc tách toàn bộ dấu thanh/mũ theo bảng mã Unicode NFD.
    - Loại bỏ ký tự đặc biệt, dấu câu và đưa về chữ thường.
    """
    if not text:
        return ""
    s = text.replace("đ", "d").replace("Đ", "D")
    normalized = unicodedata.normalize("NFD", s)
    no_marks = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    cleaned = re.sub(r"[^\w\s]", " ", no_marks.lower())
    return " ".join(cleaned.split())


def calculate_string_similarity(query: str, candidate: str) -> float:
    """
    Thuật toán tính điểm tương đồng chuyên biệt cho món ăn Việt Nam:
    1. Khớp nguyên bản tuyệt đối (case-insensitive) -> 1.0.
    2. Khớp chuỗi không dấu tuyệt đối -> 0.98.
    3. Đánh giá độ phủ từ khóa (Token coverage):
       - Nếu toàn bộ từ khóa của query xuất hiện trong candidate -> Điểm tối thiểu 0.85 + tỉ lệ độ dài.
       - Nếu có từ khóa trùng lặp một phần -> Kết hợp giữa SequenceMatcher và Token Coverage.
       - Nếu không có từ nào trùng lặp (khác biệt hoàn toàn) -> Phạt nặng điểm để tránh match nhầm.
    """
    q_norm = query.strip().lower()
    c_norm = candidate.strip().lower()

    if q_norm == c_norm:
        return 1.0

    q_unacc = strip_vietnamese_accents(q_norm)
    c_unacc = strip_vietnamese_accents(c_norm)

    if q_unacc == c_unacc:
        return 0.98

    q_words = [w for w in q_unacc.split() if w]
    c_words = [w for w in c_unacc.split() if w]

    if not q_words or not c_words:
        return 0.0

    matched_word_count = sum(1 for w in q_words if w in c_words)
    word_coverage = matched_word_count / len(q_words)
    seq_ratio = SequenceMatcher(None, q_unacc, c_unacc).ratio()

    # Trường hợp 1: Tất cả từ của query đều nằm trong candidate (ví dụ: 'pho bo' nằm trong 'pho bo tai')
    if word_coverage == 1.0:
        length_ratio = len(q_words) / len(c_words)
        return round(max(0.85, 0.85 + 0.14 * length_ratio), 4)

    # Trường hợp 2: Có giao thoa một số từ quan trọng
    if word_coverage > 0:
        combined = 0.6 * word_coverage + 0.4 * seq_ratio
        return round(max(seq_ratio * 0.8, combined), 4)

    # Trường hợp 3: Không có từ nào trùng lặp -> Phạt nặng
    return round(seq_ratio * 0.3, 4)


# ==============================================================================
# 3. CLASS QUẢN LÝ DANH MỤC THỰC PHẨM & MATCHING ENGINE
# ==============================================================================


class FuzzyFoodMatcher:
    """
    Bộ ánh xạ món ăn mờ (Fuzzy Matcher) với bộ nhớ đệm (In-Memory Cache).
    Hỗ trợ nạp dữ liệu từ:
    - Bảng food_references trong SQLite database
    - Hoặc file tham chiếu data/vn_foods.csv (fallback offline/test)
    """

    def __init__(self, csv_path: Optional[Path] = None):
        self.csv_path = csv_path or DEFAULT_CSV_PATH
        self._catalog: list[dict[str, Any]] = []
        self._is_loaded = False
        self._load_catalog()

    def _load_catalog(self) -> None:
        """Nạp danh mục 500 món ăn Việt vào bộ nhớ đệm."""
        # 1. Thử nạp từ SQLite database trước
        try:
            from sqlmodel import Session, select

            from src.backend.models.database import engine
            from src.backend.models.schema import FoodReference

            with Session(engine) as session:
                foods = session.exec(select(FoodReference)).all()
                if foods and len(foods) > 0:
                    self._catalog = [
                        {
                            "id": f.id,
                            "food_name": f.food_name,
                            "calories_per_100g": float(f.calories_per_100g),
                            "protein_per_100g": float(f.protein_per_100g),
                            "carbs_per_100g": float(f.carbs_per_100g),
                            "fat_per_100g": float(f.fat_per_100g),
                            "avg_price_vnd": int(f.avg_price_vnd),
                        }
                        for f in foods
                    ]
                    self._is_loaded = True
                    logger.info(f"Đã nạp {len(self._catalog)} món từ CSDL food_references.")
                    return
        except Exception as e:
            logger.debug(f"Không thể nạp trực tiếp từ SQLite (sẽ dùng CSV): {e}")

        # 2. Nạp từ data/vn_foods.csv
        if self.csv_path.exists():
            try:
                df = pd.read_csv(self.csv_path, encoding="utf-8-sig")
                self._catalog = []
                for idx, row in df.iterrows():
                    self._catalog.append(
                        {
                            "id": int(idx + 1),  # ID giả lập theo dòng bắt đầu từ 1
                            "food_name": str(row["food_name"]).strip(),
                            "calories_per_100g": float(row["calories_per_100g"]),
                            "protein_per_100g": float(row["protein_per_100g"]),
                            "carbs_per_100g": float(row["carbs_per_100g"]),
                            "fat_per_100g": float(row["fat_per_100g"]),
                            "avg_price_vnd": int(row.get("avg_price_vnd", 0)),
                        }
                    )
                self._is_loaded = True
                logger.info(f"Đã nạp {len(self._catalog)} món từ CSV {self.csv_path.name}.")
                return
            except Exception as e:
                logger.error(f"Lỗi khi đọc file CSV tham chiếu {self.csv_path}: {e}")

        logger.warning("FuzzyFoodMatcher khởi tạo với danh mục rỗng.")

    @property
    def catalog_size(self) -> int:
        return len(self._catalog)

    def match_dish(self, dish_name: str, threshold: float = 0.5) -> MatchedFood:
        """
        Tìm món ăn khớp nhất trong danh mục cho tên món đầu vào.

        Tham số:
            dish_name: Tên món ăn do AI Vision nhận diện.
            threshold: Ngưỡng tương đồng tối thiểu (mặc định 0.5).

        Trả về:
            MatchedFood chứa thông tin món khớp, điểm tương đồng và dinh dưỡng per 100g.
        """
        clean_query = dish_name.strip()
        if not clean_query:
            return MatchedFood(original_query=dish_name, is_matched=False, match_score=0.0)

        best_score = -1.0
        best_item: Optional[dict[str, Any]] = None

        for item in self._catalog:
            score = calculate_string_similarity(clean_query, item["food_name"])
            if score > best_score:
                best_score = score
                best_item = item
                if best_score == 1.0:
                    break

        if best_item and best_score >= threshold:
            return MatchedFood(
                original_query=dish_name,
                food_id=best_item["id"],
                matched_food_name=best_item["food_name"],
                match_score=round(best_score, 4),
                is_matched=True,
                calories_per_100g=best_item["calories_per_100g"],
                protein_per_100g=best_item["protein_per_100g"],
                carbs_per_100g=best_item["carbs_per_100g"],
                fat_per_100g=best_item["fat_per_100g"],
                avg_price_vnd=best_item["avg_price_vnd"],
            )

        # Không vượt qua ngưỡng tin cậy
        return MatchedFood(
            original_query=dish_name,
            food_id=None,
            matched_food_name=None,
            match_score=round(max(0.0, best_score), 4),
            is_matched=False,
            calories_per_100g=0.0,
            protein_per_100g=0.0,
            carbs_per_100g=0.0,
            fat_per_100g=0.0,
            avg_price_vnd=0,
        )

    def calculate_nutrition(
        self,
        dish_name: str,
        estimated_weight_gram: float,
        confidence_score: float = 1.0,
        threshold: float = 0.5,
    ) -> DishNutritionCalculated:
        """
        Thực hiện ánh xạ và tính toán dinh dưỡng tất định (Zero-Hallucination Math):
        - Tra cứu chỉ số trên 100g từ món ăn khớp nhất.
        - Nhân theo tỷ lệ khối lượng: gram / 100.
        """
        matched = self.match_dish(dish_name, threshold=threshold)
        gram = max(1.0, float(estimated_weight_gram))
        factor = gram / 100.0

        if matched.is_matched:
            calories = round(factor * matched.calories_per_100g, 1)
            protein = round(factor * matched.protein_per_100g, 1)
            carbs = round(factor * matched.carbs_per_100g, 1)
            fat = round(factor * matched.fat_per_100g, 1)
            final_name = matched.matched_food_name or dish_name
        else:
            calories = 0.0
            protein = 0.0
            carbs = 0.0
            fat = 0.0
            final_name = dish_name

        return DishNutritionCalculated(
            food_id=matched.food_id,
            food_name=final_name,
            matched_food_name=matched.matched_food_name,
            match_score=matched.match_score,
            is_matched=matched.is_matched,
            estimated_gram=gram,
            estimated_calories=calories,
            protein_g=protein,
            carbs_g=carbs,
            fat_g=fat,
            confidence=round(confidence_score, 4),
        )


# Singleton instance toàn cục để tái sử dụng cache
fuzzy_food_matcher = FuzzyFoodMatcher()
