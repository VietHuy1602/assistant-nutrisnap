"""
scripts/import_usda.py
Nạp dữ liệu dinh dưỡng chuẩn USDA FoodData Central vào bảng usda_foods để nhận diện món quốc tế.

Nguồn (tải miễn phí tại https://fdc.nal.usda.gov/download-datasets):
- FNDDS 2021-2023 (JSON): ~5.400 món đã chế biến (pizza, sushi, cà ri, bánh ngọt...).
- SR Legacy (CSV): ~7.800 thực phẩm cơ bản (thịt, cá, rau, trái cây...).

Đặt file .zip đã tải (không cần giải nén) vào:
    data/usda/fndds/FoodData_Central_survey_food_json_*.zip
    data/usda/sr_legacy/FoodData_Central_sr_legacy_food_csv_*.zip

Chạy:
    python scripts/import_usda.py
Có thể chạy lại nhiều lần: bảng usda_foods được làm mới mỗi lần.
"""

from __future__ import annotations

import csv
import io
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlmodel import Session, delete  # noqa: E402

from src.backend.models.database import engine, init_db  # noqa: E402
from src.backend.models.schema import UsdaFood  # noqa: E402

USDA_DIR = ROOT / "data" / "usda"
# Mã chất dinh dưỡng chuẩn USDA: năng lượng, đạm, chất béo, carbohydrate
NUTRIENT_NUMBERS = {"208": "kcal", "203": "protein", "204": "fat", "205": "carbs"}
SR_NUTRIENT_IDS = {"1008": "kcal", "1003": "protein", "1004": "fat", "1005": "carbs"}


def _find_zip(subdir: str, pattern: str) -> Path | None:
    matches = sorted((USDA_DIR / subdir).glob(pattern))
    return matches[-1] if matches else None


def load_fndds(path: Path) -> list[UsdaFood]:
    with zipfile.ZipFile(path) as zf:
        json_name = next(n for n in zf.namelist() if n.endswith(".json"))
        foods = json.load(zf.open(json_name))["SurveyFoods"]

    rows: list[UsdaFood] = []
    for food in foods:
        values: dict[str, float] = {}
        for item in food.get("foodNutrients", []):
            key = NUTRIENT_NUMBERS.get(str(item.get("nutrient", {}).get("number")))
            if key and item.get("amount") is not None:
                values[key] = float(item["amount"])
        if not values.get("kcal"):
            continue  # Bỏ các mục không có năng lượng (ví dụ "Milk, human")
        rows.append(
            UsdaFood(
                fdc_id=int(food["fdcId"]),
                description=food["description"].strip(),
                source="fndds",
                category=(food.get("wweiaFoodCategory") or {}).get("wweiaFoodCategoryDescription", ""),
                calories_per_100g=round(values["kcal"], 1),
                protein_per_100g=round(values.get("protein", 0.0), 2),
                carbs_per_100g=round(values.get("carbs", 0.0), 2),
                fat_per_100g=round(values.get("fat", 0.0), 2),
            )
        )
    return rows


def load_sr_legacy(path: Path) -> list[UsdaFood]:
    with zipfile.ZipFile(path) as zf:
        names = zf.namelist()

        def read(file_name: str) -> csv.DictReader:
            member = next(n for n in names if n.endswith("/" + file_name) or n == file_name)
            return csv.DictReader(io.TextIOWrapper(zf.open(member), encoding="utf-8"))

        categories = {row["id"]: row["description"] for row in read("food_category.csv")}
        foods = {row["fdc_id"]: row for row in read("food.csv")}
        values: dict[str, dict[str, float]] = {}
        for row in read("food_nutrient.csv"):
            key = SR_NUTRIENT_IDS.get(row["nutrient_id"])
            if key and row["amount"]:
                values.setdefault(row["fdc_id"], {})[key] = float(row["amount"])

    rows: list[UsdaFood] = []
    for fdc_id, food in foods.items():
        v = values.get(fdc_id, {})
        if not v.get("kcal"):
            continue
        rows.append(
            UsdaFood(
                fdc_id=int(fdc_id),
                description=food["description"].strip(),
                source="sr_legacy",
                category=categories.get(food.get("food_category_id", ""), ""),
                calories_per_100g=round(v["kcal"], 1),
                protein_per_100g=round(v.get("protein", 0.0), 2),
                carbs_per_100g=round(v.get("carbs", 0.0), 2),
                fat_per_100g=round(v.get("fat", 0.0), 2),
            )
        )
    return rows


def main() -> int:
    fndds_zip = _find_zip("fndds", "*survey_food_json*.zip")
    sr_zip = _find_zip("sr_legacy", "*sr_legacy_food_csv*.zip")
    if not fndds_zip and not sr_zip:
        print(f"Không tìm thấy file USDA trong {USDA_DIR}. Xem hướng dẫn ở đầu file này.")
        return 1

    rows: list[UsdaFood] = []
    if fndds_zip:
        fndds = load_fndds(fndds_zip)
        print(f"FNDDS: {len(fndds)} món ({fndds_zip.name})")
        rows.extend(fndds)
    if sr_zip:
        sr = load_sr_legacy(sr_zip)
        print(f"SR Legacy: {len(sr)} thực phẩm ({sr_zip.name})")
        rows.extend(sr)

    init_db()
    with Session(engine) as session:
        session.exec(delete(UsdaFood))
        session.add_all(rows)
        session.commit()
    print(f"Đã nạp {len(rows)} mục vào bảng usda_foods.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
