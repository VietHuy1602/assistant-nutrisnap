"""
src/ai/voice_modifier.py
Module phân tích giọng nói và văn bản bổ sung (Voice/Text Modifier) cho ảnh đĩa ăn 2D.
Phân hệ phụ trách: Cặp 3 – AI Intelligence & QA/Benchmarking (Tuần 5).

Chức năng cốt lõi:
1. Giải quyết góc khuất thị giác máy tính: Nhận diện dầu ăn, nước sốt ẩn, mỡ hành, bơ.
2. Điều chỉnh tỷ lệ ăn thực tế / thức ăn thừa (eaten_ratio, leftover deduction).
3. Loại bỏ thành phần không tiêu thụ (bỏ da gà, không húp nước béo/nước lèo).
4. Hệ thống Parser 2 tầng (Two-Tier Parser):
   - LLM Structured Parser qua Gemini API khi có kết nối mạng và API Key.
   - Deterministic Rule/Regex Fallback tất định 100% offline, chuẩn định lượng tiếng Việt.
5. Bảo mật & Zero-Hallucination: Đầu ra chuẩn Pydantic schema, dễ dàng nạp vào
   Deterministic Nutrition Engine (calculate_meal_nutrition / exec_log_meal).
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from src.ai.config import get_gemini_api_key

logger = logging.getLogger("nutrisnap.ai.voice_modifier")

# ==============================================================================
# 1. PYDANTIC SCHEMAS (DATA CONTRACTS)
# ==============================================================================


class DishModifierItem(BaseModel):
    """Thông tin món ăn sau khi đã điều chỉnh khối lượng hoặc tỷ lệ ăn."""

    dish_name: str = Field(..., description="Tên món ăn")
    original_weight_gram: float = Field(..., gt=0, description="Khối lượng gốc từ Vision (gam)")
    adjusted_weight_gram: float = Field(..., gt=0, description="Khối lượng thực tế sau điều chỉnh (gam)")
    eaten_ratio: float = Field(default=1.0, gt=0, le=1.0, description="Tỷ lệ tiêu thụ thực tế (0 < ratio <= 1.0)")
    reason: Optional[str] = Field(default=None, description="Lý do điều chỉnh")

    model_config = ConfigDict(extra="ignore")


class AddedModifier(BaseModel):
    """Thành phần gia vị, dầu ăn hoặc nước sốt ẩn được bổ sung từ ghi chú giọng nói."""

    name: str = Field(..., description="Tên nguyên liệu bổ sung (Dầu ô-liu, Sốt mè rang, Mỡ hành,...)")
    quantity_description: str = Field(..., description="Mô tả định lượng (1 muỗng canh, 2 thìa,...)")
    weight_gram: float = Field(..., gt=0, description="Khối lượng quy đổi ước tính (gam)")
    category: str = Field(default="oil_or_sauce", description="Phân loại (oil, sauce, butter, condiment, topping)")
    estimated_calories: float = Field(default=0.0, ge=0, description="Năng lượng ước tính bổ sung (kcal)")
    estimated_fat_g: float = Field(default=0.0, ge=0, description="Lượng chất béo ước tính bổ sung (gam)")
    estimated_protein_g: float = Field(default=0.0, ge=0, description="Lượng đạm ước tính bổ sung (gam)")
    estimated_carbs_g: float = Field(default=0.0, ge=0, description="Lượng tinh bột/đường ước tính bổ sung (gam)")

    model_config = ConfigDict(extra="ignore")


class RemovedModifier(BaseModel):
    """Thành phần được loại bỏ khỏi món ăn theo ghi chú của người dùng."""

    target_dish: str = Field(..., description="Món ăn bị loại bỏ thành phần")
    removed_component: str = Field(..., description="Tên thành phần loại bỏ (da gà, nước béo, nước lèo,...)")
    weight_reduction_gram: float = Field(default=0.0, ge=0, description="Khối lượng ước tính giảm trừ (gam)")
    calories_reduction: float = Field(default=0.0, ge=0, description="Calo ước tính giảm trừ (kcal)")
    fat_reduction_g: float = Field(default=0.0, ge=0, description="Chất béo ước tính giảm trừ (gam)")
    reason: Optional[str] = Field(default=None, description="Ghi chú lý do loại bỏ")

    model_config = ConfigDict(extra="ignore")


class VoiceModifierResult(BaseModel):
    """Kết quả hoàn chỉnh từ bộ phân tích ghi chú giọng nói/văn bản."""

    transcript: str = Field(..., description="Câu ghi chú gốc từ người dùng")
    original_dishes: list[dict[str, Any]] = Field(default_factory=list, description="Danh sách món ban đầu")
    adjusted_dishes: list[dict[str, Any]] = Field(default_factory=list, description="Danh sách món sau điều chỉnh")
    added_modifiers: list[AddedModifier] = Field(default_factory=list, description="Gia vị/dầu/sốt ẩn thêm vào")
    removed_modifiers: list[RemovedModifier] = Field(default_factory=list, description="Thành phần loại bỏ")
    applied_modifications: list[str] = Field(default_factory=list, description="Tóm tắt các thay đổi đã áp dụng")
    confidence_score: float = Field(default=1.0, ge=0.0, le=1.0, description="Độ tin cậy của phân tích")
    is_fallback: bool = Field(default=True, description="True nếu dùng Deterministic Fallback, False nếu dùng LLM")

    model_config = ConfigDict(extra="ignore")

    def to_meal_items(self) -> list[dict[str, Any]]:
        """Chuyển đổi kết quả sang danh sách MealItemInput chuẩn để truyền vào CSDL hoặc Nutrition Engine."""
        items: list[dict[str, Any]] = []

        # 1. Các món ăn chính đã điều chỉnh
        for d in self.adjusted_dishes:
            items.append({
                "food_name": d.get("dish_name", "Món ăn"),
                "estimated_gram": float(d.get("adjusted_weight_gram", d.get("estimated_weight_gram", 100.0))),
                "eaten_ratio": float(d.get("eaten_ratio", 1.0)),
            })

        # 2. Các gia vị/dầu/sốt ẩn thêm vào
        for a in self.added_modifiers:
            items.append({
                "food_name": a.name,
                "estimated_gram": float(a.weight_gram),
                "eaten_ratio": 1.0,
            })

        return items


# ==============================================================================
# 2. TỪ ĐIỂN ĐỊNH LƯỢNG TIẾNG VIỆT TẤT ĐỊNH (DETERMINISTIC VIETNAMESE RULES)
# ==============================================================================

SEASONING_SPECS: dict[str, dict[str, Any]] = {
    "dau_oliu": {
        "keywords": ["dầu ô-liu", "dầu olive", "dau o liu", "dau olive", "dầu oliu"],
        "standard_name": "Dầu ô-liu",
        "category": "oil",
        "gram_per_tablespoon": 14.0,
        "gram_per_teaspoon": 5.0,
        "calories_per_100g": 884.0,
        "fat_per_100g": 100.0,
        "protein_per_100g": 0.0,
        "carbs_per_100g": 0.0,
    },
    "dau_an": {
        "keywords": ["dầu ăn", "dau an", "dầu chiên", "dầu rán"],
        "standard_name": "Dầu ăn",
        "category": "oil",
        "gram_per_tablespoon": 14.0,
        "gram_per_teaspoon": 5.0,
        "calories_per_100g": 884.0,
        "fat_per_100g": 100.0,
        "protein_per_100g": 0.0,
        "carbs_per_100g": 0.0,
    },
    "bo": {
        "keywords": ["áp chảo bơ", "ap chao bo", "chiên bơ", "xào bơ", "bơ lạt", "bơ thực vật", "thêm bơ", "quẹt bơ"],
        "standard_name": "Bơ",
        "category": "butter",
        "gram_per_tablespoon": 14.0,
        "gram_per_teaspoon": 5.0,
        "calories_per_100g": 717.0,
        "fat_per_100g": 81.0,
        "protein_per_100g": 0.9,
        "carbs_per_100g": 0.1,
    },
    "sot_me_rang": {
        "keywords": ["sốt mè rang", "sot me rang", "nước sốt mè rang", "mè rang"],
        "standard_name": "Sốt mè rang",
        "category": "sauce",
        "gram_per_tablespoon": 15.0,
        "gram_per_teaspoon": 5.0,
        "calories_per_100g": 387.0,
        "fat_per_100g": 36.0,
        "protein_per_100g": 5.3,
        "carbs_per_100g": 8.0,
    },
    "sot_mayonnaise": {
        "keywords": ["sốt mayonnaise", "sot mayonnaise", "mayonnaise", "mayo"],
        "standard_name": "Sốt mayonnaise",
        "category": "sauce",
        "gram_per_tablespoon": 15.0,
        "gram_per_teaspoon": 5.0,
        "calories_per_100g": 680.0,
        "fat_per_100g": 75.0,
        "protein_per_100g": 1.0,
        "carbs_per_100g": 1.0,
    },
    "mo_hanh": {
        "keywords": ["mỡ hành", "mo hanh", "chan mỡ hành", "chan mo hanh"],
        "standard_name": "Mỡ hành",
        "category": "scallion_oil",
        "gram_per_tablespoon": 15.0,
        "gram_per_teaspoon": 5.0,
        "calories_per_100g": 650.0,
        "fat_per_100g": 70.0,
        "protein_per_100g": 1.5,
        "carbs_per_100g": 3.0,
    },
    "sua_dac": {
        "keywords": ["sữa đặc", "sua dac", "sữa ông thọ"],
        "standard_name": "Sữa đặc",
        "category": "sweetener",
        "gram_per_tablespoon": 15.0,
        "gram_per_teaspoon": 5.0,
        "calories_per_100g": 320.0,
        "fat_per_100g": 8.0,
        "protein_per_100g": 8.0,
        "carbs_per_100g": 55.0,
    },
    "duong": {
        "keywords": ["thêm đường", "cho đường", "đường cát", "duong"],
        "standard_name": "Đường cát",
        "category": "sweetener",
        "gram_per_tablespoon": 10.0,
        "gram_per_teaspoon": 5.0,
        "calories_per_100g": 387.0,
        "fat_per_100g": 0.0,
        "protein_per_100g": 0.0,
        "carbs_per_100g": 100.0,
    },
}

FRACTION_MAP: list[tuple[list[str], float]] = [
    (["một nửa", "1/2", "nửa", "nua", "mot nua"], 0.5),
    (["1/3", "một phần ba", "mot phan ba"], 1.0 / 3.0),
    (["2/3", "hai phần ba", "hai phan ba"], 2.0 / 3.0),
    (["1/4", "một phần tư", "mot phan tu"], 0.25),
    (["3/4", "ba phần tư", "ba phan tu"], 0.75),
]


# ==============================================================================
# 3. THUẬT TOÁN BÓC TÁCH TẤT ĐỊNH (DETERMINISTIC RULE PARSER)
# ==============================================================================


def _extract_spoon_count(text: str, keyword: str) -> tuple[float, str, str]:
    """Trích xuất số lượng thìa/muỗng canh hoặc muỗng cà phê đi kèm trực tiếp với gia vị."""
    text_lower = text.lower()
    kw_pos = text_lower.find(keyword)
    if kw_pos == -1:
        return 1.0, "muỗng canh (~14-15g)", "tablespoon"

    # Chỉ tìm trong khoảng văn bản ngay trước keyword, ngắt tại dấu phẩy hoặc liên từ
    before_text = text_lower[max(0, kw_pos - 35) : kw_pos]
    for sep in [",", ";", " và ", " nhưng ", " kèm ", " với ", " tráng miệng "]:
        if sep in before_text:
            before_text = before_text.split(sep)[-1]

    sub = before_text + text_lower[kw_pos : min(len(text_lower), kw_pos + len(keyword) + 20)]

    is_teaspoon = any(t in sub for t in ["cà phê", "ca phe", "nhỏ", "nho", "tsp"])

    num = 1.0
    count_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:thìa|muỗng|muong|thia)", sub)
    if count_match:
        try:
            num = float(count_match.group(1))
        except ValueError:
            num = 1.0
    elif any(w in sub for w in ["hai thìa", "hai muỗng", "2 thìa", "2 muỗng"]):
        num = 2.0
    elif any(w in sub for w in ["ba thìa", "ba muỗng", "3 thìa", "3 muỗng"]):
        num = 3.0
    elif any(w in sub for w in ["nửa thìa", "nửa muỗng", "1/2 thìa"]):
        num = 0.5

    unit_name = "muỗng cà phê (~5g)" if is_teaspoon else "muỗng canh (~14-15g)"
    unit_type = "teaspoon" if is_teaspoon else "tablespoon"
    desc = unit_name if num == 1.0 else f"{num:g} {unit_name}"

    return num, desc, unit_type


def _normalize_dishes_input(dishes: list[Any]) -> list[dict[str, Any]]:
    """Chuẩn hóa danh sách món ăn đầu vào từ Pydantic model hoặc dict."""
    normalized: list[dict[str, Any]] = []
    for d in dishes:
        if hasattr(d, "model_dump"):
            d_dict = d.model_dump()
        elif hasattr(d, "dict"):
            d_dict = d.dict()
        elif isinstance(d, dict):
            d_dict = dict(d)
        else:
            d_dict = {
                "dish_name": getattr(d, "dish_name", str(d)),
                "estimated_weight_gram": getattr(d, "estimated_weight_gram", 100.0),
            }

        name = d_dict.get("dish_name") or d_dict.get("name") or "Món ăn"
        weight = float(d_dict.get("estimated_weight_gram") or d_dict.get("estimated_gram") or 100.0)
        normalized.append({
            "dish_name": name,
            "estimated_weight_gram": max(1.0, weight),
            "confidence_score": float(d_dict.get("confidence_score", 0.95)),
        })
    return normalized


def parse_voice_modifier_rules(
    dishes: list[dict[str, Any]],
    transcript: str,
) -> VoiceModifierResult:
    """Bộ phân tích cú pháp quy tắc tất định (Deterministic Rule Parser):

    Hoạt động 100% offline, không phụ thuộc mạng, nhận diện chính xác 3 nhóm:
    1. Tỷ lệ ăn thực tế / Ăn thừa (consumed_ratio / leftovers).
    2. Gia vị, dầu, nước sốt ẩn được bổ sung (added_modifiers).
    3. Loại bỏ thành phần không ăn (removed_modifiers).
    """
    t_clean = transcript.strip()
    t_lower = t_clean.lower()

    applied_mods: list[str] = []
    added_modifiers: list[AddedModifier] = []
    removed_modifiers: list[RemovedModifier] = []
    adjusted_dishes: list[dict[str, Any]] = [dict(d) for d in dishes]

    # --------------------------------------------------------------------------
    # 1. BÓC TÁCH GIA VỊ ẨN / DẦU / NƯỚC SỐT THÊM VÀO (ADDED MODIFIERS)
    # --------------------------------------------------------------------------
    for _key, spec in SEASONING_SPECS.items():
        matched_kw: Optional[str] = None
        for kw in spec["keywords"]:
            if kw in t_lower:
                matched_kw = kw
                break

        if matched_kw:
            count, desc, unit_type = _extract_spoon_count(t_lower, matched_kw)
            gram_per_unit = spec["gram_per_teaspoon"] if unit_type == "teaspoon" else spec["gram_per_tablespoon"]
            total_gram = round(count * gram_per_unit, 1)

            cal = round((total_gram / 100.0) * spec["calories_per_100g"], 1)
            fat = round((total_gram / 100.0) * spec["fat_per_100g"], 1)
            protein = round((total_gram / 100.0) * spec["protein_per_100g"], 1)
            carbs = round((total_gram / 100.0) * spec["carbs_per_100g"], 1)

            mod_item = AddedModifier(
                name=spec["standard_name"],
                quantity_description=desc,
                weight_gram=total_gram,
                category=spec["category"],
                estimated_calories=cal,
                estimated_fat_g=fat,
                estimated_protein_g=protein,
                estimated_carbs_g=carbs,
            )
            added_modifiers.append(mod_item)
            applied_mods.append(
                f"Thêm gia vị ẩn: {spec['standard_name']} ({desc} ~ {total_gram}g, +{cal:.0f} kcal)"
            )

    # --------------------------------------------------------------------------
    # 2. BÓC TÁCH LOẠI BỎ THÀNH PHẦN (REMOVED MODIFIERS)
    # --------------------------------------------------------------------------
    if any(k in t_lower for k in ["bỏ da gà", "bo da ga", "bỏ da", "không ăn da gà", "lột da"]):
        target_dish = "Món gà"
        for d in adjusted_dishes:
            if any(w in d["dish_name"].lower() for w in ["gà", "ga", "ức gà", "canh gà"]):
                target_dish = d["dish_name"]
                break
        removed_modifiers.append(
            RemovedModifier(
                target_dish=target_dish,
                removed_component="da gà",
                weight_reduction_gram=25.0,
                calories_reduction=95.0,
                fat_reduction_g=9.0,
                reason="Bỏ da gà để giảm chất béo bão hòa",
            )
        )
        applied_mods.append(f"Loại bỏ thành phần: da gà từ {target_dish} (-25g, -95 kcal)")

    if any(k in t_lower for k in ["không húp nước béo", "khong hup nuoc beo", "bỏ nước béo", "không ăn nước béo"]):
        target_dish = "Phở / Bún nước"
        for d in adjusted_dishes:
            if any(w in d["dish_name"].lower() for w in ["phở", "pho", "bún", "hủ tiếu", "canh"]):
                target_dish = d["dish_name"]
                break
        removed_modifiers.append(
            RemovedModifier(
                target_dish=target_dish,
                removed_component="nước béo",
                weight_reduction_gram=35.0,
                calories_reduction=120.0,
                fat_reduction_g=13.0,
                reason="Không húp nước béo giảm đáng kể calo và lipid",
            )
        )
        applied_mods.append(f"Loại bỏ thành phần: nước béo từ {target_dish} (-35g, -120 kcal)")

    elif any(k in t_lower for k in ["không húp nước lèo", "bỏ nước lèo", "không ăn nước lèo", "không húp nước"]):
        target_dish = "Món nước"
        for d in adjusted_dishes:
            if any(w in d["dish_name"].lower() for w in ["phở", "pho", "bún", "hủ tiếu", "mì"]):
                target_dish = d["dish_name"]
                break
        removed_modifiers.append(
            RemovedModifier(
                target_dish=target_dish,
                removed_component="nước lèo",
                weight_reduction_gram=150.0,
                calories_reduction=60.0,
                fat_reduction_g=3.0,
                reason="Không húp nước lèo giảm natri và calo",
            )
        )
        applied_mods.append(f"Loại bỏ thành phần: nước lèo từ {target_dish} (-150g, -60 kcal)")

    if any(k in t_lower for k in ["không ăn mỡ hành", "bỏ mỡ hành", "không ăn hành mỡ", "không mỡ"]):
        target_dish = "Món chính"
        for d in adjusted_dishes:
            if any(w in d["dish_name"].lower() for w in ["cơm tấm", "cơm sườn", "cà tím", "hàu"]):
                target_dish = d["dish_name"]
                break
        removed_modifiers.append(
            RemovedModifier(
                target_dish=target_dish,
                removed_component="mỡ hành",
                weight_reduction_gram=15.0,
                calories_reduction=98.0,
                fat_reduction_g=10.5,
                reason="Không ăn mỡ hành",
            )
        )
        applied_mods.append(f"Loại bỏ thành phần: mỡ hành từ {target_dish} (-15g, -98 kcal)")

    # --------------------------------------------------------------------------
    # 3. BÓC TÁCH TỶ LỆ ĂN THỰC TẾ & THỨC ĂN THỪA (PORTION / LEFTOVER ADJUSTMENT)
    # --------------------------------------------------------------------------

    def find_target_dish_index(start_idx: int, end_idx: int) -> Optional[int]:
        """Tìm chỉ số món ăn liên kết với đoạn điều chỉnh khẩu phần."""
        # 1. Ưu tiên tìm trong phạm vi ngay sau match
        after_text = t_lower[end_idx : min(len(t_lower), end_idx + 35)]
        for sep in [",", ";", " nhưng ", " mà ", " và ăn "]:
            if sep in after_text:
                after_text = after_text.split(sep)[0]

        for idx, d in enumerate(adjusted_dishes):
            d_name = d["dish_name"].lower()
            tokens = [t for t in d_name.split() if len(t) >= 2]
            for tok in tokens:
                if tok in after_text and tok not in ["món", "phần", "chén", "đĩa", "thịt", "canh"]:
                    return idx
            if any(w in after_text for w in ["cơm", "com"]) and ("cơm" in d_name or "com" in d_name):
                return idx
            if any(w in after_text for w in ["phở", "pho", "bánh phở"]) and ("phở" in d_name or "pho" in d_name):
                return idx
            if any(w in after_text for w in ["thịt", "gà", "bò", "heo"]) and any(w in d_name for w in ["thịt", "gà", "bò", "heo"]):
                return idx

        # 2. Nếu sau match không có tên món, tìm trong phạm vi ngay trước match
        before_text = t_lower[max(0, start_idx - 35) : start_idx]
        for sep in [",", ";", " nhưng ", " mà ", " còn "]:
            if sep in before_text:
                before_text = before_text.split(sep)[-1]

        for idx, d in enumerate(adjusted_dishes):
            d_name = d["dish_name"].lower()
            tokens = [t for t in d_name.split() if len(t) >= 2]
            for tok in tokens:
                if tok in before_text and tok not in ["món", "phần", "chén", "đĩa", "thịt", "canh"]:
                    return idx
            if any(w in before_text for w in ["cơm", "com"]) and ("cơm" in d_name or "com" in d_name):
                return idx
            if any(w in before_text for w in ["phở", "pho", "bánh phở"]) and ("phở" in d_name or "pho" in d_name):
                return idx
            if any(w in before_text for w in ["thịt", "gà", "bò", "heo"]) and any(w in d_name for w in ["thịt", "gà", "bò", "heo"]):
                return idx

        return None

    # 3a. Khẩu phần cố định tính theo gam: ví dụ "chỉ ăn 150g"
    gram_matches = list(re.finditer(r"(?:chỉ\s+)?ăn\s+(?:khoảng\s+)?(\d+(?:\.\d+)?)\s*(?:g|gram|gam)", t_lower))
    for gm in gram_matches:
        target_gram = float(gm.group(1))
        dish_idx = find_target_dish_index(gm.start(), gm.end())
        if dish_idx is not None:
            orig = adjusted_dishes[dish_idx]["estimated_weight_gram"]
            new_gram = max(5.0, target_gram)
            ratio = min(1.0, round(new_gram / orig, 2)) if orig > 0 else 1.0
            adjusted_dishes[dish_idx]["adjusted_weight_gram"] = new_gram
            adjusted_dishes[dish_idx]["eaten_ratio"] = ratio
            d_title = adjusted_dishes[dish_idx]["dish_name"]
            applied_mods.append(
                f"Điều chỉnh khẩu phần '{d_title}': ăn {new_gram:.0f}g (từ {orig:.0f}g gốc, tỷ lệ {ratio:.0%})"
            )
        elif len(adjusted_dishes) == 1:
            orig = adjusted_dishes[0]["estimated_weight_gram"]
            new_gram = max(5.0, target_gram)
            ratio = min(1.0, round(new_gram / orig, 2)) if orig > 0 else 1.0
            adjusted_dishes[0]["adjusted_weight_gram"] = new_gram
            adjusted_dishes[0]["eaten_ratio"] = ratio
            d_title = adjusted_dishes[0]["dish_name"]
            applied_mods.append(
                f"Điều chỉnh khẩu phần '{d_title}': ăn {new_gram:.0f}g (từ {orig:.0f}g gốc, tỷ lệ {ratio:.0%})"
            )

    # 3b. Khẩu phần trừ hao thức ăn thừa: ví dụ "bỏ lại 1/3 bánh phở", "bớt nửa chén", "chừa 1/4"
    leftover_patterns = [
        r"(?:bỏ\s+lại|chừa\s+lại|bỏ|chừa|để\s+lại|dư|bớt)\s*(?:lại\s*)?(?:khoảng\s+)?(một\s+nửa|1/2|1/3|2/3|1/4|3/4|nửa)",
    ]
    for pat in leftover_patterns:
        for lm in re.finditer(pat, t_lower):
            raw_frac = lm.group(1)
            frac_val = 0.5
            for kws, val in FRACTION_MAP:
                if any(k == raw_frac or k in raw_frac for k in kws):
                    frac_val = val
                    break

            eaten_val = round(1.0 - frac_val, 2)
            dish_idx = find_target_dish_index(lm.start(), lm.end())

            if dish_idx is not None:
                orig = adjusted_dishes[dish_idx]["estimated_weight_gram"]
                new_gram = max(5.0, round(orig * eaten_val, 1))
                adjusted_dishes[dish_idx]["adjusted_weight_gram"] = new_gram
                adjusted_dishes[dish_idx]["eaten_ratio"] = eaten_val
                d_title = adjusted_dishes[dish_idx]["dish_name"]
                applied_mods.append(
                    f"Điều chỉnh thức ăn thừa '{d_title}': bỏ {frac_val:.0%}, ăn {new_gram:.0f}g (còn {eaten_val:.0%})"
                )
            else:
                for d in adjusted_dishes:
                    orig = d["estimated_weight_gram"]
                    new_gram = max(5.0, round(orig * eaten_val, 1))
                    d["adjusted_weight_gram"] = new_gram
                    d["eaten_ratio"] = eaten_val
                    applied_mods.append(
                        f"Điều chỉnh thức ăn thừa '{d['dish_name']}': bỏ {frac_val:.0%}, ăn {new_gram:.0f}g (còn {eaten_val:.0%})"
                    )

    # 3c. Tỷ lệ ăn thực tế trực tiếp: ví dụ "chỉ ăn nửa phần cơm", "ăn một nửa", "ăn 2/3"
    consumed_patterns = [
        r"(?:chỉ\s+)?ăn\s+(?:được\s+)?(?:khoảng\s+)?(một\s+nửa|1/2|1/3|2/3|1/4|3/4|nửa)(?:\s+phần|\s+chén|\s+đĩa|\s+tô|\s+bát)?",
    ]
    for pat in consumed_patterns:
        for cm in re.finditer(pat, t_lower):
            raw_frac = cm.group(1)
            eaten_val = 0.5
            for kws, val in FRACTION_MAP:
                if any(k == raw_frac or k in raw_frac for k in kws):
                    eaten_val = val
                    break

            dish_idx = find_target_dish_index(cm.start(), cm.end())

            if dish_idx is not None:
                if "adjusted_weight_gram" not in adjusted_dishes[dish_idx]:
                    orig = adjusted_dishes[dish_idx]["estimated_weight_gram"]
                    new_gram = max(5.0, round(orig * eaten_val, 1))
                    adjusted_dishes[dish_idx]["adjusted_weight_gram"] = new_gram
                    adjusted_dishes[dish_idx]["eaten_ratio"] = eaten_val
                    d_title = adjusted_dishes[dish_idx]["dish_name"]
                    applied_mods.append(
                        f"Điều chỉnh khẩu phần '{d_title}': chỉ ăn {eaten_val:.0%}, thực tế {new_gram:.0f}g (từ {orig:.0f}g gốc)"
                    )
            else:
                for d in adjusted_dishes:
                    if "adjusted_weight_gram" not in d:
                        orig = d["estimated_weight_gram"]
                        new_gram = max(5.0, round(orig * eaten_val, 1))
                        d["adjusted_weight_gram"] = new_gram
                        d["eaten_ratio"] = eaten_val
                        applied_mods.append(
                            f"Điều chỉnh khẩu phần '{d['dish_name']}': chỉ ăn {eaten_val:.0%}, thực tế {new_gram:.0f}g (từ {orig:.0f}g gốc)"
                        )

    # Đảm bảo tất cả các món đều có adjusted_weight_gram (mặc định bằng gốc nếu không điều chỉnh)
    for d in adjusted_dishes:
        if "adjusted_weight_gram" not in d:
            d["adjusted_weight_gram"] = d["estimated_weight_gram"]
        if "eaten_ratio" not in d:
            d["eaten_ratio"] = 1.0

    return VoiceModifierResult(
        transcript=transcript,
        original_dishes=dishes,
        adjusted_dishes=adjusted_dishes,
        added_modifiers=added_modifiers,
        removed_modifiers=removed_modifiers,
        applied_modifications=applied_mods,
        confidence_score=1.0,
        is_fallback=True,
    )


# ==============================================================================
# 4. LLM PARSER KẾT HỢP GEMINI API VÀ TOP-LEVEL HANDLER
# ==============================================================================


class VoiceModifier:
    """Lớp điều phối xử lý ghi chú giọng nói/văn bản với cơ chế Two-Tier."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        use_mock_fallback: bool = True,
    ):
        if api_key is not None:
            self.api_key = api_key.strip()
        else:
            self.api_key = (get_gemini_api_key() or os.getenv("GEMINI_API_KEY", "")).strip()
        self.model_name = (
            model_name or os.getenv("GEMINI_MODEL") or os.getenv("GEMINI_MODEL_NAME") or "gemini-1.5-flash"
        ).strip()
        self.use_mock_fallback = use_mock_fallback

    def _is_api_key_valid(self) -> bool:
        if not self.api_key:
            return False
        clean = self.api_key.strip()
        invalid_keys = {
            "YOUR_GEMINI_API_KEY_HERE",
            "your_actual_api_key_here",
            "dummy_api_key_for_testing",
            "mock",
            "change-me",
            "your_api_key_here",
        }
        return bool(clean and clean not in invalid_keys and len(clean) >= 15)

    def process(
        self,
        dishes: list[Any],
        transcript: str,
        force_fallback: bool = False,
    ) -> VoiceModifierResult:
        """Xử lý danh sách món ăn kèm transcript ghi chú giọng nói."""
        norm_dishes = _normalize_dishes_input(dishes)

        if not transcript or not transcript.strip():
            adjusted = [
                {
                    "dish_name": d["dish_name"],
                    "estimated_weight_gram": d["estimated_weight_gram"],
                    "adjusted_weight_gram": d["estimated_weight_gram"],
                    "eaten_ratio": 1.0,
                    "confidence_score": d.get("confidence_score", 0.95),
                }
                for d in norm_dishes
            ]
            return VoiceModifierResult(
                transcript=transcript,
                original_dishes=norm_dishes,
                adjusted_dishes=adjusted,
                added_modifiers=[],
                removed_modifiers=[],
                applied_modifications=[],
                confidence_score=1.0,
                is_fallback=True,
            )

        # 1. Thử gọi LLM nếu có API Key và không ép Fallback
        if not force_fallback and self._is_api_key_valid():
            try:
                import google.generativeai as genai

                genai.configure(api_key=self.api_key)
                model = genai.GenerativeModel(self.model_name)

                prompt = (
                    "Bạn là chuyên gia phân tích khẩu phần dinh dưỡng Việt Nam.\n"
                    "Dưới đây là danh sách món ăn nhận diện từ ảnh đĩa ăn:\n"
                    f"{json.dumps(norm_dishes, ensure_ascii=False, indent=2)}\n\n"
                    f"Người dùng bổ sung ghi chú giọng nói:\n\"{transcript}\"\n\n"
                    "Hãy bóc tách chính xác:\n"
                    "1. adjusted_dishes: danh sách món gốc sau khi cập nhật adjusted_weight_gram (gam > 0) và eaten_ratio (0 < ratio <= 1.0).\n"
                    "2. added_modifiers: danh sách gia vị/dầu/sốt ẩn thêm vào (name, quantity_description, weight_gram, category, estimated_calories, estimated_fat_g).\n"
                    "3. removed_modifiers: thành phần bị bỏ đi (target_dish, removed_component, weight_reduction_gram, calories_reduction, fat_reduction_g).\n"
                    "4. applied_modifications: danh sách chuỗi tóm tắt thay đổi tiếng Việt.\n\n"
                    "Chỉ trả về JSON thuần túy."
                )
                response = model.generate_content(prompt)
                raw_text = response.text.strip()
                if raw_text.startswith("```"):
                    raw_text = re.sub(r"^```[a-zA-Z]*\n", "", raw_text)
                    raw_text = re.sub(r"\n```$", "", raw_text)

                parsed_json = json.loads(raw_text)
                return VoiceModifierResult(
                    transcript=transcript,
                    original_dishes=norm_dishes,
                    adjusted_dishes=parsed_json.get("adjusted_dishes", norm_dishes),
                    added_modifiers=parsed_json.get("added_modifiers", []),
                    removed_modifiers=parsed_json.get("removed_modifiers", []),
                    applied_modifications=parsed_json.get("applied_modifications", []),
                    confidence_score=0.95,
                    is_fallback=False,
                )
            except Exception as exc:
                logger.warning("Lỗi phân tích LLM Voice Modifier: %s. Chuyển sang Fallback tất định.", exc)
                if not self.use_mock_fallback:
                    raise

        # 2. Chạy qua Deterministic Rule Fallback (100% Zero-Crash & Offline)
        return parse_voice_modifier_rules(norm_dishes, transcript)


def parse_voice_modifier(
    dishes: list[Any],
    transcript: str,
    api_key: Optional[str] = None,
    force_fallback: bool = False,
) -> VoiceModifierResult:
    """Hàm tiện ích (Convenience Function) phân tích giọng nói điều chỉnh đĩa ăn."""
    vm = VoiceModifier(api_key=api_key)
    return vm.process(dishes=dishes, transcript=transcript, force_fallback=force_fallback)


def modify_dishes_with_voice(
    dishes: list[Any],
    transcript: str,
    api_key: Optional[str] = None,
    force_fallback: bool = False,
) -> VoiceModifierResult:
    """Alias chuẩn cho parse_voice_modifier theo tài liệu kỹ thuật Tuần 5."""
    return parse_voice_modifier(
        dishes=dishes,
        transcript=transcript,
        api_key=api_key,
        force_fallback=force_fallback,
    )


__all__ = [
    "AddedModifier",
    "DishModifierItem",
    "RemovedModifier",
    "VoiceModifier",
    "VoiceModifierResult",
    "modify_dishes_with_voice",
    "parse_voice_modifier",
    "parse_voice_modifier_rules",
]
