"""Ảnh mờ bị chặn trước khi gọi AI; ảnh rõ nét đi tiếp."""

from io import BytesIO
from unittest.mock import patch

from PIL import Image, ImageDraw, ImageFilter

from src.backend.services.food_recognition import BLURRY_MESSAGE, image_sharpness, recognize_food_pipeline


def _photo(blur: float = 0) -> bytes:
    img = Image.new("RGB", (800, 600), "white")
    d = ImageDraw.Draw(img)
    for i in range(0, 800, 16):  # nhiều chi tiết như sợi bún, rau, hạt cơm
        d.line([(i, 0), (800 - i, 600)], fill=(40 + i % 200, 120, 60), width=3)
        d.ellipse([i % 700, (i * 7) % 500, i % 700 + 30, (i * 7) % 500 + 30], outline=(200, 80, 20), width=2)
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    out = BytesIO()
    img.save(out, format="JPEG", quality=90)
    return out.getvalue()


def test_sharp_image_scores_high_and_blurred_low():
    assert image_sharpness(_photo()) > 100
    assert image_sharpness(_photo(6)) < 25


def test_blurry_photo_returns_retake_message_without_calling_ai():
    with patch("src.backend.services.food_recognition.recognize_dishes_from_image") as ai:
        res = recognize_food_pipeline(_photo(6), use_mock_fallback=True)
    ai.assert_not_called()
    assert res.status == "unrecognized"
    assert res.reason == "blurry"
    assert res.message == BLURRY_MESSAGE == "Ảnh này bị mờ, xin vui lòng chụp lại!"


def test_ai_blurry_flag_is_respected():
    from src.ai.vision_recognition import parse_and_validate_vision_json

    r = parse_and_validate_vision_json('{"is_food": true, "is_blurry": true, "dishes": []}')
    assert r.is_blurry is True and r.dishes == []


def test_cross_check_uses_judge_when_models_disagree():
    from concurrent.futures import Future
    from unittest.mock import patch as _patch

    import src.ai.vision_recognition as v

    def res(name, conf):
        return v.VisionRecognitionResult(dishes=[v.DishItem(dish_name=name, estimated_weight_gram=200, confidence_score=conf)])

    first, second = res("Tôm xào rau củ", 0.9), res("Mực xào cần tây", 0.9)
    fut: Future = Future(); fut.set_result(second)
    with _patch.object(v, "_ask_model", return_value=res("Mực xào cần tây", 0.97)) as judge:
        out = v._cross_check(first, "k", "p", "image/jpeg", b"x", fut)
    judge.assert_called_once()
    assert out.dishes[0].dish_name == "Mực xào cần tây"

    fut2: Future = Future(); fut2.set_result(res("Phở bò tái", 0.95))
    with _patch.object(v, "_ask_model") as judge2:
        out2 = v._cross_check(res("Phở bò tái", 0.9), "k", "p", "image/jpeg", b"x", fut2)
    judge2.assert_not_called()
    assert out2.dishes[0].dish_name == "Phở bò tái"


def test_variant_words_do_not_change_dish():
    from src.ai.fuzzy_matcher import calculate_string_similarity as sim

    assert sim("Bún chả", "Bún chả Hà Nội") > sim("Bún chả", "Bún chả cá")
    assert sim("Gỏi cuốn", "Gỏi cuốn chay") < 0.75
    assert sim("Phở bò", "Phở bò tái") >= 0.9


def test_catalog_name_from_ai_maps_exactly():
    from src.ai.vision_recognition import DishItem, catalog_names, catalog_prompt
    from src.backend.services.food_recognition import _map_dish_to_item

    assert len(catalog_names()) >= 500 and "Bún sứa" in catalog_prompt()
    item = _map_dish_to_item(DishItem(dish_name="Bún chả", catalog_name="Bún chả Hà Nội", estimated_weight_gram=350, confidence_score=0.9))
    assert item.food_name == "Bún chả Hà Nội" and item.nutrition_source == "database"
